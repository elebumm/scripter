// Beats routes with a mock model (no network) against a temp SQLite file:
// proposals, the draft check, and the write-time guard on AI beats.

import fs from "fs";
import os from "os";
import path from "path";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { MockLanguageModelV3, simulateReadableStream } from "ai/test";
import { NextRequest } from "next/server";
import { readNdjson, type StreamEvent } from "@/lib/stream/ndjson";
import type { BeatCheck, BeatSuggestion } from "@/lib/llm/schemas";
import type { Beat } from "@/types/review";

type Chunk = { type: string; [k: string]: unknown };
type StreamResult = Awaited<ReturnType<MockLanguageModelV3["doStream"]>>;

const mock = vi.hoisted(() => ({ respond: null as null | (() => ReadableStream<unknown>) }));

vi.mock("@/lib/llm/providers", () => ({
  hasApiKey: () => true,
  callSettingsFor: () => ({ maxOutputTokens: 2000 }),
  getModel: () =>
    new MockLanguageModelV3({
      doStream: async () => {
        if (!mock.respond) throw new Error("no mock response");
        return { stream: mock.respond() as StreamResult["stream"] };
      },
    }),
}));

const usage = {
  inputTokens: { total: 1000, noCache: 1000, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 500, text: 500, reasoning: 0 },
};

/** Stream the JSON in small chunks, so partials catch quotes mid-way. */
function jsonStream(value: unknown): ReadableStream<Chunk> {
  return simulateReadableStream<Chunk>({
    chunks: [
      { type: "stream-start", warnings: [] },
      { type: "text-start", id: "t" },
      ...(JSON.stringify(value).match(/[\s\S]{1,12}/g) ?? []).map((delta) => ({ type: "text-delta", id: "t", delta })),
      { type: "text-end", id: "t" },
      { type: "finish", finishReason: { unified: "stop", raw: "stop" }, usage },
    ],
  });
}

const SUPPLIED = "Every photo you have ever tagged trained a machine";
const draft = `# Cold open

Nobody remembers the people who labelled the photos. **49,000 of them**, in 167 countries.

Fei-Fei Li had a problem: her models could not see.`;

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "scripter-beats-"));
let scriptId = 0;
let versionId = 0;

function request(method: string, url: string, body: unknown) {
  return new NextRequest(`http://localhost${url}`, {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function beatsRoute() {
  return import("./route");
}

async function clearBeats() {
  const { db } = await import("@/lib/db/index");
  const { beats } = await import("@/lib/db/schema");
  const { eq } = await import("drizzle-orm");
  db.delete(beats).where(eq(beats.scriptId, scriptId)).run();
}

beforeAll(async () => {
  process.env.SCRIPTER_DB_PATH = path.join(dir, "data", "scripter.db");
  process.env.SCRIPTER_BACKUP_DIR = path.join(dir, "backups");
  const { getDbPath, db } = await import("@/lib/db/index");
  if (getDbPath() !== path.resolve(dir, "data", "scripter.db")) throw new Error("DB path override not honoured");
  const { ensureDb } = await import("@/lib/db/init");
  ensureDb();
  const { scripts, scriptVersions } = await import("@/lib/db/schema");
  scriptId = db
    .insert(scripts)
    .values({ title: "The Hidden Workforce", context: "Concept: who labelled ImageNet", targetLength: 3900 })
    .returning()
    .get().id;
  versionId = db.insert(scriptVersions).values({ scriptId, version: 1, content: draft }).returning().get().id;
});

afterAll(async () => {
  const { closeDb } = await import("@/lib/db/index");
  closeDb();
  delete process.env.SCRIPTER_DB_PATH;
  delete process.env.SCRIPTER_BACKUP_DIR;
  fs.rmSync(dir, { recursive: true, force: true });
});

beforeEach(async () => {
  mock.respond = null;
  await clearBeats();
});

describe("/api/beats/suggest", () => {
  it("clamps out-of-range targets and never streams a supplied line", async () => {
    const { POST } = await import("./suggest/route");
    const proposal: BeatSuggestion = {
      beats: [
        { title: "Hook", purpose: "Make the viewer wonder who did the invisible work behind every photo.", targetSeconds: 4 },
        { title: "Escalation", purpose: "Each decision at the lab creates a new problem for the team to solve.", targetSeconds: 960 },
        {
          title: "Implicate the viewer",
          purpose: `Open on "${SUPPLIED}" so the viewer feels implicated before any of the history arrives.`,
          targetSeconds: 60,
        },
      ],
      rationale: `Short hook, then "${SUPPLIED}" carries the long escalation.`,
    };
    mock.respond = () => jsonStream(proposal);
    const events: StreamEvent<BeatSuggestion, unknown>[] = [];
    const { data, meta } = await readNdjson<BeatSuggestion>(
      await POST(request("POST", "/api/beats/suggest", { scriptId })),
      (e) => events.push(e)
    );

    expect(data.beats.map((b) => b.targetSeconds)).toEqual([5, 900, 60]);
    expect(meta).toMatchObject({ dropped: 0, guardTripped: true });
    const partials = events.filter((e) => e.t === "partial");
    expect(partials.length).toBeGreaterThan(10);
    for (const event of [...partials, ...events.filter((e) => e.t === "final")]) {
      expect(JSON.stringify(event)).not.toMatch(/Every photo you|photo you have ever/);
    }
  });
});

describe("/api/beats/check", () => {
  it("saves the draft's own text as the anchor and guards streamed comments", async () => {
    const { POST: create } = await beatsRoute();
    const hook: Beat = await (await create(request("POST", "/api/beats", { scriptId, title: "Hook", purpose: "Raise the question." }))).json();
    const { POST } = await import("./check/route");
    const check: BeatCheck = {
      coverage: [
        {
          beatId: hook.id,
          covered: true,
          anchorText: "nobody remembers the people who labelled the photos.",
          comment: `The open raises the question quickly. Close it on "${SUPPLIED}" instead of the number.`,
        },
      ],
      missing: [],
    };
    mock.respond = () => jsonStream(check);
    const events: StreamEvent<{ beats: Beat[]; check: BeatCheck }, unknown>[] = [];
    const { data } = await readNdjson<{ beats: Beat[]; check: BeatCheck }>(
      await POST(request("POST", "/api/beats/check", { scriptId, versionId })),
      (e) => events.push(e)
    );

    expect(data.beats[0]).toMatchObject({ status: "drafted", anchorText: "Nobody remembers the people who labelled the photos." });
    for (const event of events) expect(JSON.stringify(event)).not.toMatch(/Every photo you|photo you have ever/);
  });
});

describe("/api/beats write-time guard", () => {
  it("strips supplied wording from an AI beat, refuses an empty one, and leaves writer beats alone", async () => {
    const { POST } = await beatsRoute();
    const ai = await POST(
      request("POST", "/api/beats", {
        scriptId,
        source: "ai",
        title: "Stakes",
        purpose: `Show why it matters with "${SUPPLIED}" right before the numbers land for the viewer.`,
      })
    );
    expect(ai.status).toBe(201);
    const saved: Beat = await ai.json();
    expect(saved).toMatchObject({ source: "ai", title: "Stakes" });
    expect(saved.purpose).toMatch(/^Show why it matters with …/);
    expect(saved.purpose).not.toContain(SUPPLIED);

    const empty = await POST(request("POST", "/api/beats", { scriptId, source: "ai", title: `"${SUPPLIED}"`, purpose: "Raise the stakes." }));
    expect(empty.status).toBe(422);

    const mine = await POST(request("POST", "/api/beats", { scriptId, title: `Open on "${SUPPLIED}"`, purpose: "" }));
    expect((await mine.json()).title).toBe(`Open on "${SUPPLIED}"`);
  });

  it("guards 'Use these beats' and keeps a retimed AI beat as the writer's", async () => {
    const { POST, PUT } = await beatsRoute();
    const { PATCH } = await import("./[id]/route");
    const first: Beat[] = await (
      await PUT(
        request("PUT", "/api/beats", {
          scriptId,
          beats: [
            { title: "Hook", purpose: "Make the viewer wonder who did the work.", targetSeconds: 90 },
            { title: "Setup", purpose: "Introduce the lab and its problem." },
          ],
        })
      )
    ).json();
    const retimed = await PATCH(request("PATCH", `/api/beats/${first[0].id}`, { targetSeconds: 45 }), {
      params: Promise.resolve({ id: String(first[0].id) }),
    });
    expect((await retimed.json()).source).toBe("writer");

    const onlySupplied = await PUT(
      request("PUT", "/api/beats", { scriptId, beats: [{ title: "Open", purpose: `Try "${SUPPLIED} somewhere far away".` }] })
    );
    expect(onlySupplied.status).toBe(422);

    const replaced: Beat[] = await (
      await PUT(
        request("PUT", "/api/beats", {
          scriptId,
          beats: [
            { title: "Escalation", purpose: "Each decision creates a new problem." },
            { title: "Open", purpose: `Try "${SUPPLIED} somewhere far away".` },
          ],
        })
      )
    ).json();
    expect(replaced.map((b) => `${b.title}:${b.source}:${b.targetSeconds}`)).toEqual(["Hook:writer:45", "Escalation:ai:null"]);
    expect(await POST(request("POST", "/api/beats", { scriptId: 999_999, source: "ai", title: "x" }))).toHaveProperty("status", 404);
  });
});
