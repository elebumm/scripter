// Query tests against a fresh in-memory database migrated with the real
// drizzle migrations (foreign keys on, as in src/lib/db/index.ts).

import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../index", async () => {
  const { default: Database } = await import("better-sqlite3");
  const { drizzle } = await import("drizzle-orm/better-sqlite3");
  const { migrate } = await import("drizzle-orm/better-sqlite3/migrator");
  const schema = await import("../schema");
  const sqlite = new Database(":memory:");
  sqlite.pragma("foreign_keys = ON");
  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: path.join(process.cwd(), "drizzle") });
  return { db, getDb: () => db };
});

const { db } = await import("../index");
const { scripts, scriptVersions, factChecks, factIssues } = await import("../schema");
const beatsQ = await import("./beats");
const checksQ = await import("./fact-checks");
const issuesQ = await import("./fact-issues");

let scriptId = 0;
let versionId = 0;

beforeEach(() => {
  const script = db.insert(scripts).values({ title: "Test script" }).returning().get();
  scriptId = script.id;
  versionId = db.insert(scriptVersions).values({ scriptId, version: 1, content: "Draft text." }).returning().get().id;
});

const titles = () => beatsQ.listBeats(scriptId).map((b) => `${b.position}:${b.title}`);

describe("beats queries", () => {
  it("appends, inserts at a position and keeps positions 0..n-1", () => {
    beatsQ.createBeat(scriptId, { title: "A" });
    beatsQ.createBeat(scriptId, { title: "B" });
    const c = beatsQ.createBeat(scriptId, { title: "C", position: 1 });
    expect(c.position).toBe(1);
    beatsQ.createBeat(scriptId, { title: "Z", position: 99 });
    expect(titles()).toEqual(["0:A", "1:C", "2:B", "3:Z"]);
  });

  it("closes the gap on delete and reorders in one go", () => {
    const a = beatsQ.createBeat(scriptId, { title: "A" });
    const b = beatsQ.createBeat(scriptId, { title: "B" });
    const c = beatsQ.createBeat(scriptId, { title: "C" });
    expect(beatsQ.deleteBeat(b.id)).toBe(true);
    expect(beatsQ.deleteBeat(b.id)).toBe(false);
    expect(titles()).toEqual(["0:A", "1:C"]);
    beatsQ.reorderBeats(scriptId, [c.id, a.id]);
    expect(titles()).toEqual(["0:C", "1:A"]);
  });

  it("replaces only planned AI beats and appends the new ones", () => {
    beatsQ.createBeat(scriptId, { title: "Writer", source: "writer" });
    beatsQ.createBeat(scriptId, { title: "Old AI planned", source: "ai" });
    const drafted = beatsQ.createBeat(scriptId, { title: "Old AI drafted", source: "ai" });
    beatsQ.updateBeat(drafted.id, { status: "drafted" });
    const result = beatsQ.replaceAiBeats(scriptId, [{ title: "New 1", purpose: "p" }, { title: "New 2", targetSeconds: 30 }]);
    expect(result.map((b) => `${b.position}:${b.title}:${b.source}`)).toEqual([
      "0:Writer:writer",
      "1:Old AI drafted:ai",
      "2:New 1:ai",
      "3:New 2:ai",
    ]);
    expect(result[3].targetSeconds).toBe(30);
  });

  it("makes an AI beat the writer's own when its wording changes, not on status changes", () => {
    const beat = beatsQ.createBeat(scriptId, { title: "AI beat", purpose: "Job", source: "ai" });
    expect(beatsQ.updateBeat(beat.id, { status: "drafted", title: "AI beat" })?.source).toBe("ai");
    expect(beatsQ.updateBeat(beat.id, { purpose: "My own job" })?.source).toBe("writer");
    expect(beatsQ.updateBeat(999_999, { title: "x" })).toBeUndefined();
  });

  it("makes an AI beat the writer's own when its target time changes, so a new proposal keeps it", () => {
    const retimed = beatsQ.createBeat(scriptId, { title: "Hook", purpose: "Job", targetSeconds: 90, source: "ai" });
    beatsQ.createBeat(scriptId, { title: "Old AI planned", source: "ai" });
    expect(beatsQ.updateBeat(retimed.id, { targetSeconds: 90 })?.source).toBe("ai");
    expect(beatsQ.updateBeat(retimed.id, { targetSeconds: 45 })).toMatchObject({ source: "writer", targetSeconds: 45 });
    const result = beatsQ.replaceAiBeats(scriptId, [{ title: "New hook" }]);
    expect(result.map((b) => `${b.title}:${b.source}:${b.targetSeconds}`)).toEqual(["Hook:writer:45", "New hook:ai:null"]);
  });

  it("applies coverage without touching cut beats", () => {
    const a = beatsQ.createBeat(scriptId, { title: "A" });
    const cut = beatsQ.createBeat(scriptId, { title: "Cut" });
    beatsQ.updateBeat(cut.id, { status: "cut" });
    const result = beatsQ.applyCoverageUpdates(scriptId, [
      { id: a.id, status: "drafted", anchorText: "Draft text." },
      { id: cut.id, status: "drafted", anchorText: "Draft text." },
    ]);
    expect(result.find((b) => b.id === a.id)).toMatchObject({ status: "drafted", anchorText: "Draft text." });
    expect(result.find((b) => b.id === cut.id)).toMatchObject({ status: "cut", anchorText: null });
  });
});

describe("fact-check queries", () => {
  it("reads only the latest completed grounded run and never legacy rows", () => {
    // Legacy run and issue (no fact_check_id), as written by the old flow.
    db.insert(factChecks)
      .values({ scriptId, versionId, modelId: "x", modelProvider: "openrouter", status: "complete" })
      .run();
    db.insert(factIssues)
      .values({ scriptId, versionId, claimText: "old", verdict: "verified", reasoning: "from memory" })
      .run();
    expect(checksQ.getLatestGroundedFactCheck(scriptId)).toBeUndefined();

    const run = checksQ.createFactCheck({ scriptId, versionId, modelId: "claude-sonnet-5.5" });
    const notes = issuesQ.insertFactNotes({ factCheckId: run.id, scriptId, versionId, modelName: "Claude Sonnet 5.5" }, [
      {
        claimText: "Draft text.",
        verdict: "verified",
        explanation: "Sources agree.",
        sources: [{ url: "https://example.org", title: "Example" }],
        category: "general",
      },
    ]);
    // Still streaming: not readable yet.
    expect(checksQ.getLatestGroundedFactCheck(scriptId)).toBeUndefined();
    checksQ.finishFactCheck(run.id, { status: "complete", searchCount: 1, durationMs: 10 });

    const failed = checksQ.createFactCheck({ scriptId, versionId, modelId: "claude-sonnet-5.5" });
    checksQ.finishFactCheck(failed.id, { status: "error", errorMessage: "boom", durationMs: 5 });

    expect(checksQ.getLatestGroundedFactCheck(scriptId)?.id).toBe(run.id);
    const listed = issuesQ.listFactNotesForCheck(run.id);
    expect(listed).toEqual(notes);
    expect(listed[0]).toMatchObject({
      factCheckId: run.id,
      verdict: "verified",
      explanation: "Sources agree.",
      sources: [{ url: "https://example.org", title: "Example" }],
      status: "pending",
    });
    const row = db.select().from(factIssues).all().find((r) => r.id === listed[0].id);
    expect(row?.correction).toBeNull();
  });

  it("updates status only on grounded notes", () => {
    const legacyId = db
      .insert(factIssues)
      .values({ scriptId, versionId, claimText: "old", verdict: "verified", reasoning: "from memory" })
      .returning()
      .get().id;
    expect(issuesQ.setFactNoteStatus(legacyId, "dismissed")).toBeUndefined();

    const run = checksQ.createFactCheck({ scriptId, versionId, modelId: "claude-sonnet-5.5" });
    const [note] = issuesQ.insertFactNotes({ factCheckId: run.id, scriptId, versionId, modelName: "m" }, [
      { claimText: "Draft text.", verdict: "unverifiable", explanation: "No source.", sources: [], category: "general" },
    ]);
    expect(issuesQ.setFactNoteStatus(note.id, "acknowledged")?.status).toBe("acknowledged");
  });

  it("saves a carried status and lists a script's grounded notes oldest first", () => {
    db.insert(factIssues)
      .values({ scriptId, versionId, claimText: "legacy", verdict: "verified", reasoning: "from memory", status: "dismissed" })
      .run();
    const first = checksQ.createFactCheck({ scriptId, versionId, modelId: "claude-sonnet-5.5" });
    const [a] = issuesQ.insertFactNotes({ factCheckId: first.id, scriptId, versionId, modelName: "m" }, [
      { claimText: "Draft text.", verdict: "unverifiable", explanation: "No source.", sources: [], category: "general" },
    ]);
    const second = checksQ.createFactCheck({ scriptId, versionId, modelId: "claude-sonnet-5.5" });
    const [b] = issuesQ.insertFactNotes({ factCheckId: second.id, scriptId, versionId, modelName: "m" }, [
      { claimText: "Draft text.", verdict: "unverifiable", explanation: "No source.", sources: [], category: "general", status: "dismissed" },
    ]);
    expect(a.status).toBe("pending");
    expect(b.status).toBe("dismissed");
    expect(issuesQ.listGroundedFactNotes(scriptId).map((n) => n.id)).toEqual([a.id, b.id]);
  });

  it("deletes a run's notes before the run (no DB cascade on fact_check_id)", () => {
    const run = checksQ.createFactCheck({ scriptId, versionId, modelId: "claude-sonnet-5.5" });
    issuesQ.insertFactNotes({ factCheckId: run.id, scriptId, versionId, modelName: "m" }, [
      { claimText: "Draft text.", verdict: "verified", explanation: "x", sources: [], category: "general" },
    ]);
    checksQ.deleteFactCheck(run.id);
    expect(issuesQ.listFactNotesForCheck(run.id)).toEqual([]);
    expect(db.select().from(factChecks).all().some((r) => r.id === run.id)).toBe(false);
  });
});
