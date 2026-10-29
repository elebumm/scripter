// useFactCheck under a minimal hook runtime (the test environment is Node, so
// React effects don't run there): a failed load is a load error the sidebar
// can show and retry, never an empty list or a failed run, and a finished run
// reports its counts even when it kept no claims.

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FactNote } from "@/types/review";

const rt = vi.hoisted(() => {
  let slots: unknown[] = [];
  let cursor = 0;
  let queued: Array<() => void> = [];
  let component: (() => void) | null = null;
  let rendering = false;
  let dirty = false;

  const same = (a: unknown[] | undefined, b: unknown[] | undefined) =>
    !!a && !!b && a.length === b.length && a.every((v, i) => Object.is(v, b[i]));

  function render() {
    if (rendering) {
      dirty = true;
      return;
    }
    rendering = true;
    do {
      dirty = false;
      cursor = 0;
      component?.();
      const effects = queued;
      queued = [];
      for (const run of effects) run();
    } while (dirty);
    rendering = false;
  }

  const react = {
    useState<T>(init: T | (() => T)) {
      const i = cursor++;
      if (!(i in slots)) slots[i] = typeof init === "function" ? (init as () => T)() : init;
      const set = (next: T | ((prev: T) => T)) => {
        slots[i] = typeof next === "function" ? (next as (prev: T) => T)(slots[i] as T) : next;
        render();
      };
      return [slots[i] as T, set] as const;
    },
    useRef<T>(init: T) {
      const i = cursor++;
      if (!(i in slots)) slots[i] = { current: init };
      return slots[i] as { current: T };
    },
    useCallback<T>(fn: T, deps: unknown[]) {
      const i = cursor++;
      const prev = slots[i] as { fn: T; deps: unknown[] } | undefined;
      if (prev && same(prev.deps, deps)) return prev.fn;
      slots[i] = { fn, deps };
      return fn;
    },
    useEffect(fn: () => void | (() => void), deps?: unknown[]) {
      const i = cursor++;
      const prev = slots[i] as { deps?: unknown[]; cleanup?: void | (() => void) } | undefined;
      if (prev && same(prev.deps, deps)) return;
      queued.push(() => {
        if (typeof prev?.cleanup === "function") prev.cleanup();
        slots[i] = { deps, cleanup: fn() };
      });
    },
  };

  function mount<T>(hook: () => T): () => T {
    slots = [];
    queued = [];
    let result: T | undefined;
    component = () => {
      result = hook();
    };
    render();
    return () => result as T;
  }

  return { react, mount };
});

vi.mock("react", () => rt.react);
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

const api = vi.hoisted(() => ({
  listFactNotes: vi.fn(),
  runFactCheck: vi.fn(),
  setFactNoteStatus: vi.fn(),
}));
vi.mock("@/lib/api", () => api);

const { useFactCheck } = await import("./useFactCheck");

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

function fact(id: number): FactNote {
  return {
    id,
    factCheckId: 1,
    scriptId: 7,
    versionId: 3,
    claimText: `Claim ${id}`,
    verdict: "inaccurate",
    explanation: "Sources disagree.",
    sources: [],
    category: "statistic",
    status: "pending",
    createdAt: "2026-10-27 10:00:00",
  };
}

beforeEach(() => {
  api.listFactNotes.mockReset();
  api.runFactCheck.mockReset();
  api.setFactNoteStatus.mockReset();
});

describe("useFactCheck", () => {
  it("reports a failed load as a load error, not as no notes or a failed run", async () => {
    api.listFactNotes.mockRejectedValueOnce(new Error("Failed to fetch"));
    const fc = rt.mount(() => useFactCheck(7));
    expect(fc().loading).toBe(true);
    await settle();
    expect(fc().loading).toBe(false);
    expect(fc().loadError).toBe("Failed to fetch");
    expect(fc().error).toBeNull();
    expect(fc().status).toBe("idle");
    expect(fc().notes).toEqual([]);
  });

  it("refresh() retries and clears the load error", async () => {
    api.listFactNotes.mockRejectedValueOnce(new Error("Failed to fetch")).mockResolvedValueOnce([fact(1), fact(2)]);
    const fc = rt.mount(() => useFactCheck(7));
    await settle();
    expect(fc().loadError).toBe("Failed to fetch");

    await fc().refresh();
    expect(fc().loadError).toBeNull();
    expect(fc().loading).toBe(false);
    expect(fc().notes.map((n) => n.id)).toEqual([1, 2]);
  });

  it("returns a finished run's counts, even when it kept no claims", async () => {
    api.listFactNotes.mockRejectedValueOnce(new Error("Failed to fetch"));
    const meta = { factCheckId: 9, searchCount: 6, claimsSaved: 0, claimsDropped: 3, costUsd: null };
    api.runFactCheck.mockResolvedValueOnce({ notes: [], meta });
    const fc = rt.mount(() => useFactCheck(7));
    await settle();

    const result = await fc().run(3);
    expect(result).toEqual(meta);
    expect(fc().status).toBe("complete");
    expect(fc().lastRun).toEqual(meta);
    // The run's notes are the latest ones now; the old load failure no longer applies.
    expect(fc().loadError).toBeNull();
  });

  it("keeps a failed run's error apart from loading", async () => {
    api.listFactNotes.mockResolvedValueOnce([fact(1)]);
    api.runFactCheck.mockRejectedValueOnce(new Error("Model timed out"));
    const fc = rt.mount(() => useFactCheck(7));
    await settle();

    expect(await fc().run(3)).toBeNull();
    expect(fc().status).toBe("error");
    expect(fc().error).toBe("Model timed out");
    expect(fc().loadError).toBeNull();
    expect(fc().notes.map((n) => n.id)).toEqual([1]);
  });
});
