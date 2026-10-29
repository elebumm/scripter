// End-to-end council routes with a mock model (no network) against a temp
// SQLite file: critique -> synthesize -> latest / runs / trends / notes.

import fs from "fs";
import os from "os";
import path from "path";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { MockLanguageModelV3, simulateReadableStream } from "ai/test";
import { NextRequest } from "next/server";
import { readNdjson, type StreamEvent } from "@/lib/stream/ndjson";
import type { PersonaCritique, SynthesisOutput } from "./schemas";
import type { Note, Synthesis } from "@/types/review";
import type { RunSummary, SynthesisMeta, TrendPoint } from "@/lib/api/council";
import { CRITERIA } from "./rubric";

type Chunk = { type: string; [k: string]: unknown };
type StreamResult = Awaited<ReturnType<MockLanguageModelV3["doStream"]>>;

const mock = vi.hoisted(() => ({
  respond: null as null | ((signal: AbortSignal | undefined) => ReadableStream<unknown>),
  /** Every prompt sent to the model, serialised. */
  prompts: [] as string[],
}));

vi.mock("@/lib/llm/providers", () => ({
  hasApiKey: () => true,
  callSettingsFor: () => ({ maxOutputTokens: 2000 }),
  getModel: () =>
    new MockLanguageModelV3({
      doStream: async (options) => {
        if (!mock.respond) throw new Error("no mock response");
        mock.prompts.push(JSON.stringify(options.prompt));
        return { stream: mock.respond(options.abortSignal) as StreamResult["stream"] };
      },
    }),
}));

const usage = {
  inputTokens: { total: 1000, noCache: 1000, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 500, text: 500, reasoning: 0 },
};

function jsonStream(value: unknown, chunkDelayInMs = 0, finishReason = "stop", cut = 1): ReadableStream<Chunk> {
  const full = JSON.stringify(value);
  const json = full.slice(0, Math.floor(full.length * cut));
  const parts = json.match(/[\s\S]{1,40}/g) ?? [];
  return simulateReadableStream<Chunk>({
    chunkDelayInMs,
    chunks: [
      { type: "stream-start", warnings: [] },
      { type: "text-start", id: "t" },
      ...parts.map((delta) => ({ type: "text-delta", id: "t", delta })),
      { type: "text-end", id: "t" },
      { type: "finish", finishReason: { unified: finishReason, raw: finishReason }, usage },
    ],
  });
}

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "scripter-routes-"));
const content = `# The Dataset

Her name is **Fei-Fei Li**. She didn't build it alone.

49,000 workers in 167 countries labelled fourteen million images for a few cents each.

Nobody put their names in the paper.`;

let scriptId = 0;
let versionId = 0;
let personaIds: number[] = [];

function critique(overall: number, extra: Partial<PersonaCritique> = {}): PersonaCritique {
  return {
    summary: "The premise is strong; the middle explains before it dramatises.",
    criteria: CRITERIA.map((c) => ({ id: c.id, score: overall, observation: "Specific observation." })),
    overallScore: overall,
    notes: [
      {
        anchorText: "She didn't build it alone.",
        issue: "The reveal lands before the viewer knows why the workers matter to the story.",
        why: "The twist is spent before it can pay off.",
        question: "What must the viewer believe before this line?",
        category: "hook",
        priority: "high",
      },
      {
        anchorText: "A sentence that is not in the script at all.",
        issue: "This hallucinated anchor should be dropped by the server guard.",
        why: "Not the writer's text.",
        category: "other",
        priority: "low",
      },
    ],
    landed: [{ anchorText: "Nobody put their names in the paper.", why: "Quiet and devastating." }],
    ...extra,
  };
}

function post(url: string, body: unknown, signal?: AbortSignal) {
  return new Request(`http://localhost${url}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });
}

function get(url: string) {
  return new NextRequest(`http://localhost${url}`);
}

beforeAll(async () => {
  process.env.SCRIPTER_DB_PATH = path.join(dir, "routes.db");
  const { getDbPath, db } = await import("@/lib/db/index");
  if (getDbPath() !== path.resolve(dir, "routes.db")) throw new Error("DB path override not honoured");
  const { ensureDb } = await import("@/lib/db/init");
  ensureDb();
  const { scripts, scriptVersions } = await import("@/lib/db/schema");
  scriptId = db.insert(scripts).values({ title: "Routes", context: "Concept: ImageNet's workers", targetLength: 3900 }).returning().get().id;
  versionId = db.insert(scriptVersions).values({ scriptId, version: 1, content }).returning().get().id;
  const { listPersonas } = await import("@/lib/db/queries/profiles");
  personaIds = listPersonas().map((p) => p.id);
});

afterAll(async () => {
  const { closeDb } = await import("@/lib/db/index");
  closeDb();
  delete process.env.SCRIPTER_DB_PATH;
  fs.rmSync(dir, { recursive: true, force: true });
});

beforeEach(() => {
  mock.respond = null;
  mock.prompts = [];
});

describe("council routes", () => {
  const runId = "run-0001-test";

  it("streams a critique, guards it and persists the evaluation", async () => {
    const { POST } = await import("@/app/api/council/critique/route");
    mock.respond = () => jsonStream(critique(7));
    const events: StreamEvent<PersonaCritique, Partial<PersonaCritique>>[] = [];
    const res = await POST(post("/api/council/critique", { scriptId, versionId, personaId: personaIds[0], runId }));
    const { data, meta } = await readNdjson<PersonaCritique, Partial<PersonaCritique>>(res, (e) => events.push(e));

    expect(events.some((e) => e.t === "partial")).toBe(true);
    expect(data.notes.map((n) => n.anchorText)).toEqual(["She didn't build it alone."]);
    expect(meta).toMatchObject({ evaluationId: expect.any(Number), costUsd: 0.007, notesDropped: 1 });

    const { getRunRows } = await import("@/lib/db/queries/evaluations");
    const [row] = getRunRows(scriptId, runId);
    expect(row).toMatchObject({ status: "complete", modelId: "claude-sonnet-5.5", modelProvider: "openrouter", tokensIn: 1000, tokensOut: 500, personaId: personaIds[0], sectionOnly: null });
    expect(row.durationMs).toBeGreaterThanOrEqual(0);
    expect(JSON.parse(row.structuredResult!).notes).toHaveLength(1);
    expect(row.result).toBe(data.summary);
  });

  it("persists a provider failure with its real message and sends an error event", async () => {
    const { POST } = await import("@/app/api/council/critique/route");
    mock.respond = () =>
      simulateReadableStream<Chunk>({ chunks: [{ type: "stream-start", warnings: [] }, { type: "error", error: new Error("Upstream model is overloaded") }] });
    const res = await POST(post("/api/council/critique", { scriptId, versionId, personaId: personaIds[1], runId }));
    await expect(readNdjson(res)).rejects.toThrow("Upstream model is overloaded");

    const { getRunRows } = await import("@/lib/db/queries/evaluations");
    const failed = getRunRows(scriptId, runId).find((r) => r.personaId === personaIds[1])!;
    expect(failed).toMatchObject({ status: "error", errorMessage: "Upstream model is overloaded" });
  });

  it("records Stopped when the client aborts", async () => {
    const { POST } = await import("@/app/api/council/critique/route");
    const controller = new AbortController();
    mock.respond = () => jsonStream(critique(5), 30);
    const res = await POST(post("/api/council/critique", { scriptId, versionId, personaId: personaIds[2], runId }, controller.signal));
    setTimeout(() => controller.abort(), 60);
    await readNdjson(res).catch(() => undefined);

    const { getRunRows } = await import("@/lib/db/queries/evaluations");
    await vi.waitFor(() => {
      const row = getRunRows(scriptId, runId).find((r) => r.personaId === personaIds[2])!;
      expect(row).toMatchObject({ status: "error", errorMessage: "Stopped" });
    });
  });

  it("rejects bad input before streaming", async () => {
    const { POST } = await import("@/app/api/council/critique/route");
    expect((await POST(post("/api/council/critique", { scriptId, versionId: versionId + 999, personaId: personaIds[0], runId }))).status).toBe(404);
    expect((await POST(post("/api/council/critique", { scriptId, versionId, personaId: 99999, runId }))).status).toBe(404);
    expect((await POST(post("/api/council/critique", { scriptId, versionId, personaId: personaIds[0], runId: "legacy-12345" }))).status).toBe(400);
  });

  it("synthesizes the run: server-side scores, validated notes, saved summary", async () => {
    const { POST } = await import("@/app/api/council/synthesize/route");
    const output: SynthesisOutput = {
      overview: 'The lenses agree the reveal comes early. Try "an army nobody thanked" as the opening line.',
      notes: [
        {
          anchorText: "She didn't build it alone.",
          issue: "The reveal lands before the viewer knows why the workers matter to the story.",
          why: "Raised by the Story Architect.",
          category: "hook",
          priority: "high",
          personaSlugs: ["story-architect", "skeptical-viewer"],
        },
        {
          anchorText: "Made-up text that the writer never wrote.",
          issue: "A merged note with a hallucinated anchor must be dropped.",
          why: "",
          category: "other",
          priority: "low",
          personaSlugs: ["story-architect"],
        },
      ],
    };
    mock.respond = () => jsonStream(output);
    const res = await POST(post("/api/council/synthesize", { scriptId, versionId, runId }));
    const { data, meta } = await readNdjson<Synthesis, Partial<SynthesisOutput>>(res);

    expect(meta).toMatchObject({ notesSaved: 1, notesDropped: 1, costUsd: 0.007 });
    expect(data.overview).not.toContain("an army nobody thanked");
    expect(data.overall).toEqual({ scores: { "story-architect": 7 }, average: 7 });
    expect(data.scoreTable).toHaveLength(10);
    expect(data.failedLenses).toEqual(["Skeptical Viewer", "Clarity Editor"]);
    expect(data.lenses.map((l) => l.status)).toEqual(["complete", "error", "error"]);
    expect(data.costUsd).toBeCloseTo(0.014);

    const { GET: latest } = await import("@/app/api/council/latest/route");
    const saved = (await (await latest(get(`/api/council/latest?scriptId=${scriptId}`))).json()) as Synthesis;
    expect(saved).toEqual(data);

    const { GET: notesGet } = await import("@/app/api/notes/route");
    const notes = (await (await notesGet(get(`/api/notes?scriptId=${scriptId}`))).json()) as Note[];
    expect(notes).toHaveLength(1);
    expect(notes[0]).toMatchObject({ personaSlugs: ["story-architect"], sourceModels: ["Claude Sonnet 5.5"], status: "open", runId });

    const { PATCH } = await import("@/app/api/notes/[id]/route");
    const patched = await PATCH(new Request("http://localhost/api/notes/x", { method: "PATCH", body: JSON.stringify({ status: "dismissed" }) }), {
      params: Promise.resolve({ id: String(notes[0].id) }),
    });
    expect(((await patched.json()) as Note).status).toBe("dismissed");
    const bad = await PATCH(new Request("http://localhost/api/notes/x", { method: "PATCH", body: JSON.stringify({ status: "accepted" }) }), {
      params: Promise.resolve({ id: String(notes[0].id) }),
    });
    expect(bad.status).toBe(400);
  });

  it("lists runs, returns a run's synthesis and trends", async () => {
    const { GET } = await import("@/app/api/council/runs/route");
    const runs = (await (await GET(get(`/api/council/runs?scriptId=${scriptId}`))).json()) as RunSummary[];
    expect(runs).toEqual([
      expect.objectContaining({ runId, versionNumber: 1, overallAverage: 7, lensCount: 3, failedLenses: 2, sectionOnly: false }),
    ]);
    const one = (await (await GET(get(`/api/council/runs?scriptId=${scriptId}&runId=${runId}`))).json()) as Synthesis;
    expect(one.runId).toBe(runId);
    expect(await (await GET(get(`/api/council/runs?scriptId=${scriptId}&runId=nope`))).json()).toBeNull();

    const { GET: trends } = await import("@/app/api/council/trends/route");
    const points = (await (await trends(get(`/api/council/trends?scriptId=${scriptId}`))).json()) as TrendPoint[];
    expect(points).toEqual([expect.objectContaining({ versionNumber: 1, overall: 7 })]);
  });

  it("refuses to synthesize a run with no finished lens", async () => {
    const { POST: critiquePost } = await import("@/app/api/council/critique/route");
    mock.respond = () => simulateReadableStream<Chunk>({ chunks: [{ type: "error", error: new Error("boom") }] });
    await readNdjson(await critiquePost(post("/api/council/critique", { scriptId, versionId, personaId: personaIds[0], runId: "run-0002-fail" }))).catch(() => undefined);
    const { POST } = await import("@/app/api/council/synthesize/route");
    const res = await POST(post("/api/council/synthesize", { scriptId, versionId, runId: "run-0002-fail" }));
    expect(res.status).toBe(409);
  });
});

describe("council runs keep the writer's notes safe", () => {
  type SynthNote = SynthesisOutput["notes"][number];
  const hookNote: SynthNote = {
    anchorText: "She didn't build it alone.",
    issue: "The reveal lands before the viewer knows why the workers matter to the story.",
    why: "The twist is spent early.",
    category: "hook",
    priority: "high",
    personaSlugs: ["story-architect"],
  };
  const endingNote: SynthNote = {
    anchorText: "Nobody put their names in the paper.",
    issue: "The ending states its point instead of letting the viewer feel the loss.",
    why: "It closes on a summary.",
    category: "ending",
    priority: "medium",
    personaSlugs: ["story-architect"],
  };
  const workersSection = "49,000 workers in 167 countries labelled fourteen million images for a few cents each.";
  const workersNote: SynthNote = {
    anchorText: "labelled fourteen million images for a few cents each",
    issue: "The pay detail is buried at the end of a long sentence the viewer can't hold.",
    why: "The injustice gets lost.",
    category: "clarity",
    priority: "medium",
    personaSlugs: ["story-architect"],
  };

  function newScript(title: string) {
    return import("@/lib/db/index").then(async ({ db }) => {
      const { scripts, scriptVersions } = await import("@/lib/db/schema");
      const sid = db.insert(scripts).values({ title }).returning().get().id;
      const vid = db.insert(scriptVersions).values({ scriptId: sid, version: 1, content }).returning().get().id;
      return { sid, vid };
    });
  }

  async function critiqueRun(sid: number, vid: number, runId: string, value: PersonaCritique, sectionOnly?: string) {
    const { POST } = await import("@/app/api/council/critique/route");
    mock.respond = () => jsonStream(value);
    const res = await POST(post("/api/council/critique", { scriptId: sid, versionId: vid, personaId: personaIds[0], runId, ...(sectionOnly ? { sectionOnly } : {}) }));
    return readNdjson<PersonaCritique, Partial<PersonaCritique>>(res);
  }

  async function synthesizeRun(
    sid: number,
    vid: number,
    runId: string,
    value: SynthesisOutput,
    options: { delay?: number; onEvent?: (e: StreamEvent<Synthesis, Partial<SynthesisOutput>>) => void } = {}
  ) {
    const { POST } = await import("@/app/api/council/synthesize/route");
    mock.respond = () => jsonStream(value, options.delay ?? 0);
    const res = await POST(post("/api/council/synthesize", { scriptId: sid, versionId: vid, runId }));
    const out = await readNdjson<Synthesis, Partial<SynthesisOutput>>(res, options.onEvent);
    return { data: out.data, meta: out.meta as unknown as SynthesisMeta };
  }

  async function listNotes(sid: number) {
    const { GET } = await import("@/app/api/notes/route");
    return (await (await GET(get(`/api/notes?scriptId=${sid}`))).json()) as Note[];
  }

  it("keeps the previous open notes when none of the synthesis's notes quote the script", async () => {
    const { sid, vid } = await newScript("Dropped notes");
    await critiqueRun(sid, vid, "run-keep-0001", critique(7));
    await synthesizeRun(sid, vid, "run-keep-0001", { overview: "Two problems.", notes: [hookNote, endingNote] });

    await critiqueRun(sid, vid, "run-keep-0002", critique(7));
    const { data, meta } = await synthesizeRun(sid, vid, "run-keep-0002", {
      overview: "The reveal still comes early and the ending still summarises.",
      notes: [{ ...hookNote, anchorText: "She did not build the dataset by herself." }],
    });

    expect(meta).toMatchObject({ notesSaved: 0, notesDropped: 1, dropReasons: { anchor: 1 }, previousNotesKept: 2 });
    expect(data.noteReport).toEqual({ saved: 0, dropped: 1, dropReasons: { anchor: 1 }, previousKept: 2 });
    const notes = await listNotes(sid);
    expect(notes.map((n) => [n.runId, n.status, n.anchorText])).toEqual([
      ["run-keep-0001", "open", "She didn't build it alone."],
      ["run-keep-0001", "open", "Nobody put their names in the paper."],
    ]);

    // Saved with the synthesis, so the panel can say why after a reload.
    const { GET: latest } = await import("@/app/api/council/latest/route");
    const saved = (await (await latest(get(`/api/council/latest?scriptId=${sid}`))).json()) as Synthesis;
    expect(saved.noteReport).toEqual(data.noteReport);

    // The next pass is told about the kept notes, and one whose notes all survive replaces them.
    await critiqueRun(sid, vid, "run-keep-0003", critique(7));
    expect(mock.prompts.at(-1)).toContain(endingNote.issue);
    const third = await synthesizeRun(sid, vid, "run-keep-0003", { overview: "One problem left.", notes: [hookNote] });
    expect(third.meta).toMatchObject({ notesSaved: 1, notesDropped: 0, previousNotesKept: 0 });
    expect((await listNotes(sid)).map((n) => [n.runId, n.status])).toEqual([["run-keep-0003", "open"]]);
  });

  it("applies a dismissal made while the synthesis is streaming", async () => {
    const { sid, vid } = await newScript("Dismissed mid-stream");
    await critiqueRun(sid, vid, "run-dism-0001", critique(7));
    await synthesizeRun(sid, vid, "run-dism-0001", { overview: "One problem.", notes: [hookNote] });
    const [first] = await listNotes(sid);

    await critiqueRun(sid, vid, "run-dism-0002", critique(7));
    const { PATCH } = await import("@/app/api/notes/[id]/route");
    let dismissal: Promise<Response> | null = null;
    const { meta } = await synthesizeRun(
      sid,
      vid,
      "run-dism-0002",
      { overview: "The reveal still lands early, which every lens raised again this time.", notes: [hookNote] },
      {
        delay: 25,
        onEvent: (e) => {
          if (e.t !== "partial" || dismissal) return;
          dismissal = PATCH(new Request("http://localhost/api/notes/x", { method: "PATCH", body: JSON.stringify({ status: "dismissed" }) }), {
            params: Promise.resolve({ id: String(first.id) }),
          });
        },
      }
    );
    expect((await dismissal!).status).toBe(200);
    expect(meta).toMatchObject({ notesSaved: 0, dropReasons: { dismissed: 1 } });
    expect((await listNotes(sid)).map((n) => [n.id, n.status])).toEqual([[first.id, "dismissed"]]);
  });

  it("keeps a section review to its section: no duplicate of a note outside it", async () => {
    const { sid, vid } = await newScript("Section review");
    await critiqueRun(sid, vid, "run-sect-0001", critique(7));
    await synthesizeRun(sid, vid, "run-sect-0001", { overview: "Two problems.", notes: [hookNote, endingNote] });
    const { PATCH } = await import("@/app/api/notes/[id]/route");
    const ending = (await listNotes(sid)).find((n) => n.category === "ending")!;
    await PATCH(new Request("http://localhost/api/notes/x", { method: "PATCH", body: JSON.stringify({ status: "dismissed" }) }), {
      params: Promise.resolve({ id: String(ending.id) }),
    });

    // The lens anchors one note outside the section; the server drops it.
    const lensNote = (n: SynthNote): PersonaCritique["notes"][number] => ({
      anchorText: n.anchorText,
      issue: n.issue,
      why: n.why,
      category: n.category,
      priority: n.priority,
    });
    const lens = critique(6, { notes: [lensNote(hookNote), lensNote(workersNote)] });
    const { data: lensOut, meta: lensMeta } = await critiqueRun(sid, vid, "run-sect-0002", lens, workersSection);
    expect(lensOut.notes.map((n) => n.category)).toEqual(["clarity"]);
    expect(lensMeta).toMatchObject({ notesDropped: 1 });
    // Section lenses are told what the writer dismissed, and nothing else from last time.
    expect(mock.prompts.at(-1)).toContain("Issues the writer dismissed");
    expect(mock.prompts.at(-1)).toContain(endingNote.issue);
    expect(mock.prompts.at(-1)).not.toContain(hookNote.issue);

    const { meta } = await synthesizeRun(sid, vid, "run-sect-0002", { overview: "The section buries the pay detail.", notes: [hookNote, workersNote] });
    expect(mock.prompts.at(-1)).not.toContain(hookNote.issue);
    expect(meta).toMatchObject({ notesSaved: 1, dropReasons: { section: 1 } });
    const notes = await listNotes(sid);
    expect(notes.filter((n) => n.status === "open").map((n) => [n.runId, n.anchorText])).toEqual([
      ["run-sect-0001", "She didn't build it alone."],
      ["run-sect-0002", "labelled fourteen million images for a few cents each"],
    ]);
  });

  it("enforces every dismissal, not just the newest 40 the prompts list", async () => {
    const lines = Array.from({ length: 45 }, (_, i) => `Point ${i + 1} of the dataset story stands on its own here.`);
    const { db } = await import("@/lib/db/index");
    const { scripts, scriptVersions, notes } = await import("@/lib/db/schema");
    const sid = db.insert(scripts).values({ title: "Many dismissals" }).returning().get().id;
    const vid = db.insert(scriptVersions).values({ scriptId: sid, version: 1, content: lines.join("\n\n") }).returning().get().id;
    const issue = (i: number) => `Dismissed issue number ${i + 1} about how this point is explained to the viewer.`;
    // Oldest first: point 1 is the writer's oldest dismissal.
    db.insert(notes)
      .values(lines.map((anchorText, i) => ({ scriptId: sid, versionId: vid, runId: "run-old", anchorText, issue: issue(i), category: "clarity", status: "dismissed" })))
      .run();
    const oldest = { anchorText: lines[0], issue: "The point is explained before the viewer knows why it matters to the story.", why: "Flat." };

    const lens = critique(7, { notes: [{ ...oldest, category: "clarity", priority: "high" }, { ...oldest, category: "pacing", priority: "low" }] });
    const { data: lensOut } = await critiqueRun(sid, vid, "run-many-0001", lens);
    expect(lensOut.notes.map((n) => n.category)).toEqual(["pacing"]);
    // The prompt stays capped at the newest 40.
    expect(mock.prompts.at(-1)!.split("never raise it again")).toHaveLength(41);
    expect(mock.prompts.at(-1)).not.toContain(issue(0));

    const { meta } = await synthesizeRun(sid, vid, "run-many-0001", {
      overview: "Point one is still explained too early.",
      notes: [
        { ...oldest, category: "clarity", priority: "high", personaSlugs: ["story-architect"] },
        { ...oldest, anchorText: lines[1], category: "pacing", priority: "low", personaSlugs: ["story-architect"] },
      ],
    });
    expect(meta).toMatchObject({ notesSaved: 1, dropReasons: { dismissed: 1 } });
    expect((await listNotes(sid)).filter((n) => n.status === "open").map((n) => [n.category, n.anchorText])).toEqual([["pacing", lines[1]]]);
  });

  it("records tokens and cost for a call that ran out of output room", async () => {
    const { sid, vid } = await newScript("Truncated");
    const { POST } = await import("@/app/api/council/critique/route");
    mock.respond = () => jsonStream(critique(7), 0, "length", 0.6);
    const res = await POST(post("/api/council/critique", { scriptId: sid, versionId: vid, personaId: personaIds[0], runId: "run-trunc-0001" }));
    await expect(readNdjson(res)).rejects.toThrow(/ran out of output room/);

    const { getRunRows } = await import("@/lib/db/queries/evaluations");
    const [row] = getRunRows(sid, "run-trunc-0001");
    expect(row).toMatchObject({ status: "error", tokensIn: 1000, tokensOut: 500, costUsd: 0.007 });
  });

  it("counts every synthesis attempt in the run's cost", async () => {
    const { sid, vid } = await newScript("Re-synthesis");
    await critiqueRun(sid, vid, "run-cost-0001", critique(7));
    const first = await synthesizeRun(sid, vid, "run-cost-0001", { overview: "First pass.", notes: [hookNote] });
    expect(first.data.costUsd).toBeCloseTo(0.014);
    const second = await synthesizeRun(sid, vid, "run-cost-0001", { overview: "Second pass.", notes: [hookNote] });
    expect(second.meta.costUsd).toBeCloseTo(0.007);
    expect(second.data.costUsd).toBeCloseTo(0.021);

    const { getRunRows } = await import("@/lib/db/queries/evaluations");
    const summaries = getRunRows(sid, "run-cost-0001").filter((r) => r.isMasterSummary);
    expect(summaries).toHaveLength(1);
    expect(summaries[0]).toMatchObject({ id: second.data.summaryId, tokensIn: 2000, tokensOut: 1000 });
    const { GET } = await import("@/app/api/council/runs/route");
    const [run] = (await (await GET(get(`/api/council/runs?scriptId=${sid}`))).json()) as RunSummary[];
    expect(run.costUsd).toBeCloseTo(0.021);
  });

  it("prices a call with the cost OpenRouter reports when it sends one", async () => {
    const { sid, vid } = await newScript("Reported cost");
    const { POST } = await import("@/app/api/council/critique/route");
    mock.respond = () => {
      const json = JSON.stringify(critique(7));
      return simulateReadableStream<Chunk>({
        chunks: [
          { type: "stream-start", warnings: [] },
          { type: "text-start", id: "t" },
          { type: "text-delta", id: "t", delta: json },
          { type: "text-end", id: "t" },
          { type: "finish", finishReason: { unified: "stop", raw: "stop" }, usage, providerMetadata: { openrouter: { usage: { cost: 0.0123 } } } },
        ],
      });
    };
    const res = await POST(post("/api/council/critique", { scriptId: sid, versionId: vid, personaId: personaIds[0], runId: "run-cost-0002" }));
    const { meta } = await readNdjson<PersonaCritique>(res);
    expect(meta?.costUsd).toBe(0.0123);
    const { getRunRows } = await import("@/lib/db/queries/evaluations");
    expect(getRunRows(sid, "run-cost-0002")[0]).toMatchObject({ status: "complete", costUsd: 0.0123 });
  });

  it("counts a quote of the writer's brief as the writer's own words", async () => {
    const { sid, vid } = await newScript("Brief quote");
    const { db } = await import("@/lib/db/index");
    const { scripts } = await import("@/lib/db/schema");
    const { eq } = await import("drizzle-orm");
    db.update(scripts).set({ context: "A story about the people nobody credited for the dataset." }).where(eq(scripts.id, sid)).run();
    await critiqueRun(sid, vid, "run-brief-0001", critique(7));
    const quoted = 'The brief promises "a story about the people nobody credited for the dataset" but the ending drifts.';
    const { data } = await synthesizeRun(sid, vid, "run-brief-0001", { overview: `${quoted} Also "Imagine a world built by strangers" is not yours.`, notes: [] });
    expect(data.overview).toContain(quoted);
    expect(data.overview).not.toContain("Imagine a world");
  });

  it("never streams a supplied line before its closing quote arrives", async () => {
    const { sid, vid } = await newScript("Open quote");
    await critiqueRun(sid, vid, "run-quote-0001", critique(7));
    const partials: string[] = [];
    const { data } = await synthesizeRun(
      sid,
      vid,
      "run-quote-0001",
      { overview: 'The hook is slow. Open stronger, e.g. "Imagine a world where nobody saw the workers who built the future for pennies" and then cut.', notes: [] },
      { delay: 130, onEvent: (e) => e.t === "partial" && partials.push(e.data.overview ?? "") }
    );
    expect(partials.length).toBeGreaterThan(2);
    for (const p of partials) expect(p).not.toMatch(/Imagine a world|nobody saw the workers/);
    expect(data.overview).not.toContain("Imagine a world");
  });
});

describe("scripts reviewed only before the refresh", () => {
  it("rebuild the latest synthesis and the Drafts score from legacy critiques", async () => {
    const { db, getSqlite } = await import("@/lib/db/index");
    const { scripts, scriptVersions } = await import("@/lib/db/schema");
    const legacyScript = db.insert(scripts).values({ title: "Legacy only" }).returning().get().id;
    const v1 = db.insert(scriptVersions).values({ scriptId: legacyScript, version: 1, content }).returning().get().id;
    const v2 = db.insert(scriptVersions).values({ scriptId: legacyScript, version: 2, content }).returning().get().id;
    const insert = getSqlite().prepare(
      "INSERT INTO evaluations (script_id, version_id, model_id, model_provider, result, structured_result, status) VALUES (?, ?, ?, 'openrouter', 'Old feedback.', ?, 'complete')"
    );
    const legacyJson = (overall: number) =>
      JSON.stringify({ criteria: [{ name: "Hook & Opening", score: overall, explanation: "Opens well" }], overallScore: overall });
    insert.run(legacyScript, v1, "openai/gpt-5.2", legacyJson(5));
    insert.run(legacyScript, v2, "openai/gpt-5.2", legacyJson(8));
    insert.run(legacyScript, v2, "x-ai/grok-4", legacyJson(9));

    const { GET: latest } = await import("@/app/api/council/latest/route");
    const synthesis = (await (await latest(get(`/api/council/latest?scriptId=${legacyScript}`))).json()) as Synthesis;
    expect(synthesis).toMatchObject({ summaryId: 0, overview: "", runId: `legacy-${v2}`, versionNumber: 2 });
    expect(synthesis.overall.average).toBe(8.5);
    expect(synthesis.lenses).toHaveLength(2);

    const { GET: list } = await import("@/app/api/scripts/route");
    const rows = (await (await list(new Request("http://localhost/api/scripts"))).json()) as Array<{ id: number; lastScore: number | null }>;
    expect(rows.find((r) => r.id === legacyScript)?.lastScore).toBe(8.5);
    // A script with a saved synthesis keeps its saved score.
    expect(rows.find((r) => r.id === scriptId)?.lastScore).toBe(7);
  });
});

describe("profiles and models routes", () => {
  it("lists personas, validates PATCH and serves the registry", async () => {
    const { GET } = await import("@/app/api/profiles/route");
    const personas = await (await GET()).json();
    expect(personas).toHaveLength(5);

    const { PATCH } = await import("@/app/api/profiles/[id]/route");
    const params = { params: Promise.resolve({ id: String(personas[4].id) }) };
    const patch = (body: unknown) => PATCH(new Request("http://localhost/x", { method: "PATCH", body: JSON.stringify(body) }), params);
    expect((await patch({ modelSlug: "openai/gpt-4o" })).status).toBe(400);
    expect((await patch({ criteriaWeights: { "Hook & Opening": 3 } })).status).toBe(400);
    const ok = await (await patch({ modelSlug: "kimi-k3.1-pro", isActive: false, criteriaWeights: { hook: 2 } })).json();
    expect(ok).toMatchObject({ modelSlug: "kimi-k3.1-pro", isActive: false, criteriaWeights: { hook: 2 } });

    const { GET: models } = await import("@/app/api/models/route");
    expect(((await (await models()).json()) as unknown[]).length).toBeGreaterThan(5);
  });
});
