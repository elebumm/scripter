// The grounded fact-check route with a mock model (no network) against a temp
// SQLite file: carried statuses, a search that returns nothing, a cut-off answer.

import fs from "fs";
import os from "os";
import path from "path";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { MockLanguageModelV3, simulateReadableStream } from "ai/test";
import { NextRequest } from "next/server";
import { readNdjson, type StreamEvent } from "@/lib/stream/ndjson";
import type { FactCheckOutput } from "@/lib/llm/schemas";
import type { FactNote } from "@/types/review";

type Chunk = { type: string; [k: string]: unknown };
type StreamResult = Awaited<ReturnType<MockLanguageModelV3["doStream"]>>;

const mock = vi.hoisted(() => ({
  respond: null as null | (() => ReadableStream<unknown>),
  maxOutputTokens: [] as Array<number | undefined>,
}));

vi.mock("@/lib/llm/providers", () => ({
  hasApiKey: () => true,
  callSettingsFor: () => ({ maxOutputTokens: 10_000, timeout: { totalMs: 240_000 } }),
  getModel: () =>
    new MockLanguageModelV3({
      doStream: async (options) => {
        mock.maxOutputTokens.push(options.maxOutputTokens);
        if (!mock.respond) throw new Error("no mock response");
        return { stream: mock.respond() as StreamResult["stream"] };
      },
    }),
}));

const usage = {
  inputTokens: { total: 1000, noCache: 1000, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 500, text: 500, reasoning: 0 },
};

const SOURCE = "https://example.org/imagenet-history";

/** A model answer: optional search sources, then the JSON (cut off at 70% when `cut`). */
function answer(value: FactCheckOutput, options: { sources?: string[]; cut?: boolean } = {}): ReadableStream<Chunk> {
  const json = JSON.stringify(value);
  const text = options.cut ? json.slice(0, Math.floor(json.length * 0.7)) : json;
  const finish = options.cut ? "length" : "stop";
  return simulateReadableStream<Chunk>({
    chunks: [
      { type: "stream-start", warnings: [] },
      ...(options.sources ?? []).map((url, i) => ({ type: "source", sourceType: "url", id: `s${i}`, url, title: `Source ${i}` })),
      { type: "text-start", id: "t" },
      ...(text.match(/[\s\S]{1,40}/g) ?? []).map((delta) => ({ type: "text-delta", id: "t", delta })),
      { type: "text-end", id: "t" },
      { type: "finish", finishReason: { unified: finish, raw: finish }, usage },
    ],
  });
}

const v1 = `# The Hidden Workforce

ImageNet was labelled by **49,000 workers** in 167 countries.

It launched in 2009 and changed computer vision forever.`;
const v2 = `${v1}\n\nFei-Fei Li started the project at Princeton.`;

function output(firstVerdict: FactCheckOutput["claims"][number]["verdict"] = "verified"): FactCheckOutput {
  return {
    claims: [
      {
        claimText: "ImageNet was labelled by 49,000 workers in 167 countries.",
        verdict: firstVerdict,
        explanation: "The project's history page reports roughly 49,000 workers from 167 countries.",
        sources: [{ url: SOURCE }],
        category: "statistic",
      },
      {
        claimText: "It launched in 2009 and changed computer vision forever.",
        verdict: "unverifiable",
        explanation: "None of the search results date the launch or describe what it changed.",
        sources: [],
        category: "date",
      },
    ],
  };
}

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "scripter-fact-check-"));
let scriptId = 0;
let version1 = 0;
let version2 = 0;

function post(body: unknown) {
  return new NextRequest("http://localhost/api/fact-check", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function listNotes(): Promise<FactNote[]> {
  const { GET } = await import("@/app/api/fact-issues/route");
  return (await GET(new NextRequest(`http://localhost/api/fact-issues?scriptId=${scriptId}`))).json();
}

async function setStatus(id: number, status: FactNote["status"]) {
  const { PATCH } = await import("@/app/api/fact-issues/[id]/route");
  const req = new NextRequest(`http://localhost/api/fact-issues/${id}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ status }),
  });
  expect((await PATCH(req, { params: Promise.resolve({ id: String(id) }) })).status).toBe(200);
}

async function latestRun() {
  const { db } = await import("@/lib/db/index");
  const { factChecks } = await import("@/lib/db/schema");
  const rows = db.select().from(factChecks).all();
  return rows[rows.length - 1];
}

beforeAll(async () => {
  process.env.SCRIPTER_DB_PATH = path.join(dir, "data", "scripter.db");
  process.env.SCRIPTER_BACKUP_DIR = path.join(dir, "backups");
  const { getDbPath, db } = await import("@/lib/db/index");
  if (getDbPath() !== path.resolve(dir, "data", "scripter.db")) throw new Error("DB path override not honoured");
  const { ensureDb } = await import("@/lib/db/init");
  ensureDb();
  const { scripts, scriptVersions } = await import("@/lib/db/schema");
  scriptId = db.insert(scripts).values({ title: "Facts", context: "Concept: ImageNet's workers" }).returning().get().id;
  version1 = db.insert(scriptVersions).values({ scriptId, version: 1, content: v1 }).returning().get().id;
  version2 = db.insert(scriptVersions).values({ scriptId, version: 2, content: v2 }).returning().get().id;
});

afterAll(async () => {
  const { closeDb } = await import("@/lib/db/index");
  closeDb();
  delete process.env.SCRIPTER_DB_PATH;
  delete process.env.SCRIPTER_BACKUP_DIR;
  fs.rmSync(dir, { recursive: true, force: true });
});

beforeEach(() => {
  mock.respond = null;
  mock.maxOutputTokens = [];
});

describe("/api/fact-check", () => {
  it("saves validated notes as pending, with room for a long answer", async () => {
    const { POST } = await import("./route");
    mock.respond = () => answer(output(), { sources: [SOURCE] });
    const events: StreamEvent<FactNote[], unknown>[] = [];
    const { data, meta } = await readNdjson<FactNote[]>(await POST(post({ scriptId, versionId: version1 })), (e) => events.push(e));

    expect(events.some((e) => e.t === "partial")).toBe(true);
    expect(data.map((n) => [n.verdict, n.status])).toEqual([
      ["verified", "pending"],
      ["unverifiable", "pending"],
    ]);
    expect(meta).toMatchObject({ searchCount: 1, claimsSaved: 2, claimsCarried: 0, claimsDroppedBy: { notInScript: 0, duplicate: 0, tooThin: 0, overLimit: 0 } });
    expect(mock.maxOutputTokens).toEqual([32_000]);
  });

  it("carries acknowledged and dismissed statuses to the same claim and verdict on a re-run", async () => {
    const { POST } = await import("./route");
    const [first, second] = await listNotes();
    await setStatus(first.id, "acknowledged");
    await setStatus(second.id, "dismissed");

    mock.respond = () => answer(output(), { sources: [SOURCE] });
    const { data, meta } = await readNdjson<FactNote[]>(await POST(post({ scriptId, versionId: version2 })));
    expect(data.map((n) => [n.versionId, n.status])).toEqual([
      [version2, "acknowledged"],
      [version2, "dismissed"],
    ]);
    expect(meta).toMatchObject({ claimsCarried: 2 });

    // A changed verdict is news: it comes back as pending.
    mock.respond = () => answer(output("misleading"), { sources: [SOURCE] });
    const rerun = await readNdjson<FactNote[]>(await POST(post({ scriptId, versionId: version2 })));
    expect(rerun.data.map((n) => [n.verdict, n.status])).toEqual([
      ["misleading", "pending"],
      ["unverifiable", "dismissed"],
    ]);
    expect((await listNotes()).map((n) => n.id)).toEqual(rerun.data.map((n) => n.id));
  });

  it("fails instead of saving every claim as unverifiable when search returned nothing", async () => {
    const { POST } = await import("./route");
    const before = await listNotes();
    mock.respond = () => answer(output());
    const { NO_SEARCH_RESULTS_MESSAGE } = await import("@/lib/llm/fact-check");
    await expect(readNdjson(await POST(post({ scriptId, versionId: version2 })))).rejects.toThrow(NO_SEARCH_RESULTS_MESSAGE);

    const run = await latestRun();
    expect(run).toMatchObject({ status: "error", errorMessage: NO_SEARCH_RESULTS_MESSAGE, searchCount: 0 });
    expect(JSON.parse(run.structuredResult!)).toMatchObject({ tokensIn: 1000, tokensOut: 500, claimsReturned: 2 });
    expect(await listNotes()).toEqual(before);
  });

  it("says the model ran out of room when the answer is cut off", async () => {
    const { POST } = await import("./route");
    mock.respond = () => answer(output(), { sources: [SOURCE], cut: true });
    const { OUT_OF_ROOM_MESSAGE } = await import("@/lib/llm/fact-check");
    await expect(readNdjson(await POST(post({ scriptId, versionId: version1 })))).rejects.toThrow(OUT_OF_ROOM_MESSAGE);
    const run = await latestRun();
    expect(run).toMatchObject({ status: "error", errorMessage: OUT_OF_ROOM_MESSAGE });
    // The cut-off call was still paid for.
    expect(JSON.parse(run.structuredResult!)).toMatchObject({ tokensIn: 1000, tokensOut: 500 });
  });
});
