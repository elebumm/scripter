// useBeats against a mocked client API: a draft check or beat suggestion keeps
// running when the Beat Sheet unmounts (switching to Revision), and its result
// is there when the sheet comes back.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Beat } from "@/types/review";
import type { BeatCheck, BeatSuggestion } from "@/lib/llm/schemas";
import { renderHook, settle, type HookHandle } from "./render-hook.test-helper";
import { useBeats, type BeatsController } from "./useBeats";

const api = vi.hoisted(() => ({
  listBeats: vi.fn(),
  getScript: vi.fn(),
  checkBeats: vi.fn(),
  suggestBeats: vi.fn(),
}));
vi.mock("@/lib/api", () => api);

function beat(id: number, scriptId: number, overrides: Partial<Beat> = {}): Beat {
  return {
    id,
    scriptId,
    position: id,
    title: `Beat ${id}`,
    purpose: "",
    writerNotes: "",
    targetSeconds: null,
    status: "planned",
    source: "writer",
    anchorText: null,
    createdAt: "2026-10-27 10:00:00",
    updatedAt: "2026-10-27 10:00:00",
    ...overrides,
  };
}

const CHECK: BeatCheck = { coverage: [{ beatId: 1, covered: true, anchorText: "the reveal", comment: "It lands." }], missing: [] } as BeatCheck;

/** A pending stream call the test settles by hand; it also rejects when aborted. */
function deferredStream<T>() {
  let resolve: (value: T) => void = () => {};
  let signal: AbortSignal | undefined;
  const impl = (...args: unknown[]) =>
    new Promise<T>((res, reject) => {
      resolve = res;
      signal = args[args.length - 1] as AbortSignal | undefined;
      signal?.addEventListener("abort", () => reject(new DOMException("Stopped", "AbortError")));
    });
  return { impl, resolve: (value: T) => resolve(value), aborted: () => signal?.aborted ?? false };
}

const mounted: HookHandle<BeatsController>[] = [];
async function mount(scriptId: number) {
  const h = await renderHook(() => useBeats(scriptId));
  mounted.push(h);
  await settle();
  return h;
}

beforeEach(() => {
  vi.clearAllMocks();
  api.listBeats.mockImplementation(async (scriptId: number) => [beat(1, scriptId)]);
  api.getScript.mockImplementation(async (scriptId: number) => ({ script: { id: scriptId, targetLength: null, context: "" } }));
});

afterEach(async () => {
  for (const h of mounted.splice(0)) await h.unmount();
});

describe("draft check across a mode switch", () => {
  it("keeps running when the sheet unmounts and shows its result when it comes back", async () => {
    const stream = deferredStream<{ beats: Beat[]; check: BeatCheck }>();
    api.checkBeats.mockImplementation(stream.impl);
    const sheet = await mount(101);

    await settle(() => {
      void sheet.current.runCheck(async () => ({ id: 7 }));
    });
    expect(sheet.current.check.status).toBe("checking");

    await sheet.unmount(); // switch to Revision
    expect(stream.aborted()).toBe(false);

    await settle(() => stream.resolve({ beats: [beat(1, 101, { status: "drafted", anchorText: "the reveal" })], check: CHECK }));

    const back = await mount(101);
    expect(back.current.check.status).toBe("done");
    expect(back.current.check.result).toEqual(CHECK);
  });

  it("updates the open sheet's beats when a check finishes after it came back", async () => {
    const stream = deferredStream<{ beats: Beat[]; check: BeatCheck }>();
    api.checkBeats.mockImplementation(stream.impl);
    const sheet = await mount(102);
    await settle(() => {
      void sheet.current.runCheck(async () => ({ id: 7 }));
    });
    await sheet.unmount();

    const back = await mount(102);
    expect(back.current.check.status).toBe("checking");
    expect(back.current.beats[0].status).toBe("planned");

    await settle(() => stream.resolve({ beats: [beat(1, 102, { status: "drafted", anchorText: "the reveal" })], check: CHECK }));
    expect(back.current.check.status).toBe("done");
    expect(back.current.beats[0]).toMatchObject({ status: "drafted", anchorText: "the reveal" });
  });

  it("Stop still stops it, and the stopped state survives a remount", async () => {
    const stream = deferredStream<{ beats: Beat[]; check: BeatCheck }>();
    api.checkBeats.mockImplementation(stream.impl);
    const sheet = await mount(103);
    await settle(() => {
      void sheet.current.runCheck(async () => ({ id: 7 }));
    });
    await settle(() => sheet.current.stopCheck());
    expect(stream.aborted()).toBe(true);
    expect(sheet.current.check.status).toBe("stopped");

    await sheet.unmount();
    const back = await mount(103);
    expect(back.current.check.status).toBe("stopped");

    await settle(() => back.current.dismissCheck());
    expect(back.current.check.status).toBe("idle");
  });
});

describe("beat suggestion across a mode switch", () => {
  it("finishes in the background and is shown on return", async () => {
    const stream = deferredStream<BeatSuggestion>();
    api.suggestBeats.mockImplementation(stream.impl);
    const sheet = await mount(104);
    await settle(() => {
      void sheet.current.suggest();
    });
    expect(sheet.current.suggestion.status).toBe("streaming");
    await sheet.unmount();

    const proposal = { beats: [{ title: "Cold open", purpose: "Drop the viewer into the failure." }], rationale: "Failure first." } as BeatSuggestion;
    await settle(() => stream.resolve(proposal));
    expect(stream.aborted()).toBe(false);

    const back = await mount(104);
    expect(back.current.suggestion).toEqual({ status: "done", proposal, error: null });
  });
});
