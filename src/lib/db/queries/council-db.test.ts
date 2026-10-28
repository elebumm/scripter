// Council queries against a real, freshly migrated SQLite file in a temp dir
// (never data/scripter.db). No network.

import fs from "fs";
import os from "os";
import path from "path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq, isNull } from "drizzle-orm";
import { closeDb, db, getDbPath } from "../index";
import { runMigrations, seedDefaults } from "../migrate";
import { evaluationProfiles, evaluations, notes, scripts, scriptVersions } from "../schema";
import { listPersonas, updatePersona } from "./profiles";
import {
  createEvaluation,
  getLatestSummaryRow,
  getPreviousWholeRunId,
  getScriptEvaluations,
  getScriptVersionPair,
  updateEvaluation,
} from "./evaluations";
import {
  applySynthesisNotes,
  getCarryOverCandidates,
  getIssuesRaisedLastTime,
  listNotesForLatestVersion,
  updateNoteStatus,
  type NewNote,
} from "./notes";
import { planNoteCarryOver } from "@/lib/llm/synthesize";
import { groupRuns } from "@/lib/llm/council";
import { PERSONA_SEEDS } from "@/lib/llm/personas";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "scripter-council-"));
const dbFile = path.join(dir, "council.db");
const previousEnv = process.env.SCRIPTER_DB_PATH;

beforeAll(() => {
  process.env.SCRIPTER_DB_PATH = dbFile;
  // Refuse to touch anything but the temp file.
  if (getDbPath() !== path.resolve(dbFile)) throw new Error(`DB path override not honoured: ${getDbPath()}`);
  runMigrations();
});

afterAll(() => {
  closeDb();
  if (previousEnv === undefined) delete process.env.SCRIPTER_DB_PATH;
  else process.env.SCRIPTER_DB_PATH = previousEnv;
  fs.rmSync(dir, { recursive: true, force: true });
});

function newNote(anchorText: string, issue = "This passage loses the thread the opening set up for the viewer."): NewNote {
  return { anchorText, issue, why: "", question: null, category: "structure", priority: "medium", personaSlugs: ["story-architect"], sourceModels: ["Claude Sonnet 5.5"] };
}

describe("persona seeding", () => {
  it("seeds the five personas idempotently and switches legacy profiles off untouched", () => {
    db.insert(evaluationProfiles)
      .values([
        { name: "Default Profile", systemPrompt: "legacy prompt", criteriaWeights: '{"Hook & Opening":9}', isDefault: true },
        { name: "Final Polish", systemPrompt: "polish" },
      ])
      .run();

    seedDefaults();
    seedDefaults();

    const personas = listPersonas();
    expect(personas.map((p) => p.slug)).toEqual(PERSONA_SEEDS.map((p) => p.slug));
    expect(personas.every((p) => p.isActive)).toBe(true);
    expect(personas.map((p) => p.modelSlug)).toEqual(["claude-sonnet-5.5", "gpt-6.1-terra", "gemini-3.8-flash", "grok-4.7", "deepseek-v4-pro"]);
    expect(personas[0].criteriaWeights.hook).toBe(1.5);

    const legacy = db.select().from(evaluationProfiles).where(isNull(evaluationProfiles.slug)).all();
    expect(legacy.map((l) => [l.name, l.systemPrompt, l.isActive, l.isDefault])).toEqual([
      ["Default Profile", "legacy prompt", false, true],
      ["Final Polish", "polish", false, false],
    ]);

    expect(db.select().from(scripts).where(eq(scripts.isTemplate, true)).all()).toHaveLength(4);
  });

  it("updates personas but never legacy profiles, and keeps edits across re-seeding", () => {
    const [first] = listPersonas();
    const updated = updatePersona(first.id, { modelSlug: "claude-opus-5.5", isActive: false, criteriaWeights: { hook: 2 } });
    expect(updated).toMatchObject({ modelSlug: "claude-opus-5.5", modelName: "Claude Opus 5.5", isActive: false, criteriaWeights: { hook: 2 } });

    const legacyId = db.select().from(evaluationProfiles).where(isNull(evaluationProfiles.slug)).get()!.id;
    expect(updatePersona(legacyId, { name: "nope" })).toBeNull();

    seedDefaults();
    expect(listPersonas()[0]).toMatchObject({ modelSlug: "claude-opus-5.5", isActive: false });
  });
});

describe("council runs and notes", () => {
  const v1Text = "# Draft\n\nShe didn't build it alone.\n\nThe second act explains the dataset at length before anything happens.\n\nNobody put their names in the paper.";
  const v2Text = "# Draft\n\nShe didn't build it alone.\n\nNobody put their names in the paper.";
  let scriptId = 0;
  let v1 = 0;
  let v2 = 0;

  beforeAll(() => {
    scriptId = db.insert(scripts).values({ title: "Council test" }).returning().get().id;
    v1 = db.insert(scriptVersions).values({ scriptId, version: 1, content: v1Text }).returning().get().id;
    v2 = db.insert(scriptVersions).values({ scriptId, version: 2, content: v2Text }).returning().get().id;
  });

  it("only pairs a version with its own script", () => {
    expect(getScriptVersionPair(scriptId, v1)?.version.content).toBe(v1Text);
    expect(getScriptVersionPair(scriptId + 999, v1)).toBeNull();
  });

  it("carries notes forward: addressed when the anchor is gone, replaced when still open, dismissals kept", () => {
    // Pass 1 on v1.
    const persona = listPersonas()[1];
    const critique = createEvaluation({ scriptId, versionId: v1, runId: "run-1", personaId: persona.id, modelId: persona.modelSlug, status: "streaming" });
    updateEvaluation(critique.id, { status: "complete", costUsd: 0.01 });
    const summary1 = createEvaluation({ scriptId, versionId: v1, runId: "run-1", modelId: "claude-sonnet-5.5", isMasterSummary: true, status: "complete" });
    const plan1 = planNoteCarryOver({ candidates: getCarryOverCandidates(scriptId, v1, "run-1"), runId: "run-1", previousRunId: null, content: v1Text });
    const pass1 = applySynthesisNotes({
      scriptId,
      versionId: v1,
      runId: "run-1",
      plan: plan1,
      newNotes: [
        newNote("She didn't build it alone."),
        newNote("The second act explains the dataset at length before anything happens."),
        newNote("Nobody put their names in the paper.", "The ending states its point instead of letting the viewer feel it."),
      ],
    });
    expect(pass1).toHaveLength(3);
    const dismissed = updateNoteStatus(pass1[2].id, "dismissed")!;
    expect(dismissed.status).toBe("dismissed");
    expect(dismissed.statusChangedAt).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);

    expect(getPreviousWholeRunId(scriptId, "run-2")).toBe("run-1");
    expect(getLatestSummaryRow(scriptId)?.id).toBe(summary1.id);
    const lastTime = getIssuesRaisedLastTime(scriptId, "run-1");
    expect(lastTime.map((n) => n.status)).toEqual(["open", "open", "dismissed"]);

    // Pass 2 on v2 (the second-act passage was cut).
    const plan2 = planNoteCarryOver({ candidates: getCarryOverCandidates(scriptId, v2, "run-2"), runId: "run-2", previousRunId: "run-1", content: v2Text });
    applySynthesisNotes({ scriptId, versionId: v2, runId: "run-2", plan: plan2, newNotes: [newNote("She didn't build it alone.", "The reveal still lands before the stakes are clear to the viewer.")] });

    const visible = listNotesForLatestVersion(scriptId);
    expect(visible.every((n) => n.versionId === v2)).toBe(true);
    expect(visible.map((n) => [n.runId, n.status, n.anchorText])).toEqual([
      ["run-1", "addressed", "The second act explains the dataset at length before anything happens."],
      ["run-1", "dismissed", "Nobody put their names in the paper."],
      ["run-2", "open", "She didn't build it alone."],
    ]);
    expect(visible[2].personaSlugs).toEqual(["story-architect"]);
  });

  it("joins version numbers and groups the run", () => {
    const rows = getScriptEvaluations(scriptId);
    expect(rows.every((r) => r.versionNumber === 1)).toBe(true);
    const [group] = groupRuns(rows);
    expect(group).toMatchObject({ runId: "run-1", versionNumber: 1, costUsd: 0.01 });
    expect(group.critiques).toHaveLength(1);
    expect(getScriptEvaluations(scriptId, ["nope"])).toEqual([]);
  });
});

describe("visible notes", () => {
  const v1Text = "# Draft\n\nShe didn't build it alone.\n\nThe second act explains the dataset at length before anything happens.";
  const v2Text = "# Draft\n\nShe didn't build it alone.\n\nNobody put their names in the paper.";
  let scriptId = 0;
  let v1 = 0;
  let v2 = 0;
  let v3 = 0;
  let v4 = 0;

  /** One completed pass (a critique and its summary) that started at `startedAt`. */
  function pass(runId: string, versionId: number, content: string, previousRunId: string | null, startedAt: string, newNotes: NewNote[]) {
    const rows = [
      createEvaluation({ scriptId, versionId, runId, modelId: "claude-sonnet-5.5", status: "complete" }),
      createEvaluation({ scriptId, versionId, runId, modelId: "claude-sonnet-5.5", isMasterSummary: true, status: "streaming" }),
    ];
    for (const r of rows) db.update(evaluations).set({ createdAt: startedAt }).where(eq(evaluations.id, r.id)).run();
    const plan = planNoteCarryOver({ candidates: getCarryOverCandidates(scriptId, versionId, runId), runId, previousRunId, content });
    const saved = applySynthesisNotes({ scriptId, versionId, runId, plan, newNotes });
    updateEvaluation(rows[1].id, { status: "complete" });
    return saved;
  }

  function setStatus(id: number, status: "addressed" | "dismissed", at: string) {
    updateNoteStatus(id, status);
    db.update(notes).set({ statusChangedAt: at }).where(eq(notes.id, id)).run();
  }

  const visible = () => listNotesForLatestVersion(scriptId).map((n) => `${n.runId}|${n.status}|${n.anchorText}`);

  beforeAll(() => {
    scriptId = db.insert(scripts).values({ title: "Visible notes" }).returning().get().id;
    v1 = db.insert(scriptVersions).values({ scriptId, version: 1, content: v1Text }).returning().get().id;
    v2 = db.insert(scriptVersions).values({ scriptId, version: 2, content: v2Text }).returning().get().id;
    v3 = db.insert(scriptVersions).values({ scriptId, version: 3, content: v2Text }).returning().get().id;
    v4 = db.insert(scriptVersions).values({ scriptId, version: 4, content: v2Text }).returning().get().id;
  });

  it("shows addressed notes only while they are news, even when the same version is reviewed again", () => {
    pass("run-w0", v1, v1Text, null, "2026-01-01 10:00:00", [newNote("The second act explains the dataset at length before anything happens.")]);

    // W1 on v2: the second act was cut, so its note is addressed.
    const [w1Note] = pass("run-w1", v2, v2Text, "run-w0", "2026-01-02 10:00:00", [newNote("She didn't build it alone.")]);
    const [cut] = listNotesForLatestVersion(scriptId).filter((n) => n.status === "addressed");
    db.update(notes).set({ statusChangedAt: "2026-01-02 10:05:00" }).where(eq(notes.id, cut.id)).run();
    expect(visible()).toEqual([
      "run-w0|addressed|The second act explains the dataset at length before anything happens.",
      "run-w1|open|She didn't build it alone.",
    ]);

    // The writer marks W1's note addressed, then consults again on the same version.
    setStatus(w1Note.id, "addressed", "2026-01-02 12:00:00");
    const [w2Note] = pass("run-w2", v2, v2Text, "run-w1", "2026-01-03 10:00:00", [newNote("Nobody put their names in the paper.")]);
    expect(visible()).toEqual([
      "run-w1|addressed|She didn't build it alone.",
      "run-w2|open|Nobody put their names in the paper.",
    ]);

    // Addressed after the latest pass started: shown.
    setStatus(w2Note.id, "addressed", "2026-01-03 11:00:00");
    expect(visible()).toContain("run-w2|addressed|Nobody put their names in the paper.");
  });

  it("shows nothing after a pass that left no notes, not an older version's leftovers", () => {
    // W3 carries the note W2 raised and the writer addressed; W4 leaves it behind.
    pass("run-w3", v3, v2Text, "run-w2", "2026-01-04 10:00:00", []);
    expect(visible()).toEqual(["run-w2|addressed|Nobody put their names in the paper."]);
    pass("run-w4", v4, v2Text, "run-w3", "2026-01-05 10:00:00", []);
    expect(listNotesForLatestVersion(scriptId)).toEqual([]);
    expect(getCarryOverCandidates(scriptId, v4, "run-w5")).toEqual([]);
  });
});
