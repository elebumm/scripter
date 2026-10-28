import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api";
import { autosaveRetryDelay, DRAFT_SAVE_DELAY_MS, DraftSaver, draftSaverFor, type DraftSaverDeps } from "./useScript";

/** Deps whose writes fail until `server.up` is true; records every write. */
function fakeServer() {
  const server = {
    up: true,
    error: new TypeError("Failed to fetch") as Error,
    writes: [] as string[],
    stored: null as string | null,
    keepalive: [] as string[],
    keepaliveFits: true,
    failures: [] as { first: boolean; retrying: boolean }[],
    recovered: 0,
  };
  const deps: DraftSaverDeps = {
    write: async (markdown) => {
      server.writes.push(markdown);
      if (!server.up) throw server.error;
      server.stored = markdown;
    },
    writeOnUnload: (markdown) => {
      if (!server.keepaliveFits) return false;
      server.keepalive.push(markdown);
      return true;
    },
    onFailure: (_err, first, retrying) => server.failures.push({ first, retrying }),
    onRecovered: () => server.recovered++,
  };
  return { server, deps };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("DraftSaver", () => {
  it("writes the latest text once the writer pauses", async () => {
    const { server, deps } = fakeServer();
    const saver = new DraftSaver("v1", deps);
    saver.change("v1 a");
    saver.change("v1 ab");
    expect(saver.state).toBe("unsaved");
    await vi.advanceTimersByTimeAsync(DRAFT_SAVE_DELAY_MS);
    expect(server.writes).toEqual(["v1 ab"]);
    expect(saver.state).toBe("saved");
    expect(saver.hasUnsaved).toBe(false);
  });

  it("keeps a failed autosave and retries it with backoff until it lands", async () => {
    const { server, deps } = fakeServer();
    server.up = false;
    const saver = new DraftSaver("old", deps);
    saver.change("new paragraph");
    await vi.advanceTimersByTimeAsync(DRAFT_SAVE_DELAY_MS);
    expect(saver.state).toBe("error");
    expect(server.failures).toEqual([{ first: true, retrying: true }]);

    await vi.advanceTimersByTimeAsync(autosaveRetryDelay(1));
    expect(server.writes).toEqual(["new paragraph", "new paragraph"]);
    expect(server.failures.map((f) => f.first)).toEqual([true, false]);

    server.up = true;
    await vi.advanceTimersByTimeAsync(autosaveRetryDelay(2));
    expect(server.stored).toBe("new paragraph");
    expect(saver.state).toBe("saved");
    expect(server.recovered).toBe(1);

    await vi.advanceTimersByTimeAsync(60_000);
    expect(server.writes).toHaveLength(3);
  });

  it("retries with the newest text, never an older one", async () => {
    const { server, deps } = fakeServer();
    server.up = false;
    const saver = new DraftSaver("a", deps);
    saver.change("ab");
    await vi.advanceTimersByTimeAsync(DRAFT_SAVE_DELAY_MS);
    saver.change("abc");
    server.up = true;
    await vi.advanceTimersByTimeAsync(30_000);
    expect(server.stored).toBe("abc");
    expect(server.writes.at(-1)).toBe("abc");
  });

  it("writes text the writer undid back to while an older write was in flight", async () => {
    const { server, deps } = fakeServer();
    let release: () => void = () => {};
    deps.write = (markdown) => {
      server.writes.push(markdown);
      return new Promise<void>((resolve) => {
        release = () => {
          server.stored = markdown;
          resolve();
        };
      });
    };
    const saver = new DraftSaver("A", deps);
    saver.change("B");
    await vi.advanceTimersByTimeAsync(DRAFT_SAVE_DELAY_MS); // "B" in flight
    saver.change("A");
    await vi.advanceTimersByTimeAsync(DRAFT_SAVE_DELAY_MS); // "A" queued behind it
    release();
    await vi.advanceTimersByTimeAsync(0);
    release();
    await vi.advanceTimersByTimeAsync(0);
    expect(server.writes).toEqual(["B", "A"]);
    expect(server.stored).toBe("A");
    expect(saver.state).toBe("saved");
  });

  it("ends the failure streak when a write lands, even with newer text waiting", async () => {
    const { server, deps } = fakeServer();
    server.up = false;
    const saver = new DraftSaver("old", deps);
    saver.change("x");
    await vi.advanceTimersByTimeAsync(DRAFT_SAVE_DELAY_MS);
    expect(saver.state).toBe("error");

    let release: () => void = () => {};
    deps.write = (markdown) =>
      new Promise<void>((resolve) => {
        release = () => {
          server.stored = markdown;
          resolve();
        };
      });
    await vi.advanceTimersByTimeAsync(autosaveRetryDelay(1)); // the retry is in flight
    saver.change("xy");
    release();
    await vi.advanceTimersByTimeAsync(0);
    expect(server.recovered).toBe(1);
    expect(saver.state).toBe("unsaved");
    // The server answers again: closing sends the newer text without asking.
    expect(saver.unload()).toBe(false);
    expect(server.keepalive).toEqual(["xy"]);
  });

  it("still sends the stored text when the writer undoes back to it while a write is in flight", async () => {
    const { server, deps } = fakeServer();
    let release: () => void = () => {};
    deps.write = (markdown) =>
      new Promise<void>((resolve) => {
        release = () => {
          server.stored = markdown;
          resolve();
        };
      });
    const saver = new DraftSaver("A", deps);
    saver.change("B");
    await vi.advanceTimersByTimeAsync(DRAFT_SAVE_DELAY_MS); // "B" in flight
    saver.change("A");
    expect(saver.hasUnsaved).toBe(true);
    // Closing now: "B" may still land, so "A" goes out after it.
    expect(saver.unload()).toBe(false);
    expect(server.keepalive).toEqual(["A"]);

    // Staying: "A" is written once "B" has landed.
    release();
    await vi.advanceTimersByTimeAsync(DRAFT_SAVE_DELAY_MS);
    release();
    await vi.advanceTimersByTimeAsync(0);
    expect(server.stored).toBe("A");
    expect(saver.hasUnsaved).toBe(false);
    expect(saver.state).toBe("saved");
  });

  it("doesn't retry a 4xx by itself, but the next change tries again", async () => {
    const { server, deps } = fakeServer();
    server.up = false;
    server.error = new ApiError("Draft too long", 400);
    const saver = new DraftSaver("", deps);
    saver.change("x");
    await vi.advanceTimersByTimeAsync(60_000);
    expect(server.writes).toEqual(["x"]);
    expect(server.failures).toEqual([{ first: true, retrying: false }]);
    expect(saver.hasUnsaved).toBe(true);

    server.up = true;
    saver.change("xy");
    await vi.advanceTimersByTimeAsync(DRAFT_SAVE_DELAY_MS);
    expect(server.stored).toBe("xy");
  });

  it("writes at once when the page is left", async () => {
    const { server, deps } = fakeServer();
    const saver = new DraftSaver("", deps);
    saver.change("typed just before leaving");
    await saver.flush();
    expect(server.stored).toBe("typed just before leaving");
  });

  describe("unload", () => {
    it("has nothing to do when everything is saved", () => {
      const { server, deps } = fakeServer();
      const saver = new DraftSaver("saved text", deps);
      expect(saver.unload()).toBe(false);
      expect(server.keepalive).toEqual([]);
    });

    it("sends unsaved text with keepalive and lets the tab close", () => {
      const { server, deps } = fakeServer();
      const saver = new DraftSaver("", deps);
      saver.change("pending");
      expect(saver.unload()).toBe(false);
      expect(server.keepalive).toEqual(["pending"]);
    });

    it("still sends, but asks before closing, after a failed autosave", async () => {
      const { server, deps } = fakeServer();
      server.up = false;
      const saver = new DraftSaver("", deps);
      saver.change("lost if the tab closes");
      await vi.advanceTimersByTimeAsync(DRAFT_SAVE_DELAY_MS);
      expect(saver.unload()).toBe(true);
      expect(server.keepalive).toEqual(["lost if the tab closes"]);
    });

    it("asks before closing when keepalive can't carry the text", () => {
      const { server, deps } = fakeServer();
      server.keepaliveFits = false;
      const saver = new DraftSaver("", deps);
      saver.change("a very long script");
      expect(saver.unload()).toBe(true);
    });
  });
});

describe("draftSaverFor", () => {
  it("hands a reopened script the text a previous visit couldn't save", async () => {
    const { server, deps } = fakeServer();
    server.up = false;
    const first = draftSaverFor(9101, "stored draft", deps);
    first.change("newer words");
    await first.flush(); // leaving the page while the server is down

    const reopened = draftSaverFor(9101, "stored draft", fakeServer().deps);
    expect(reopened).toBe(first);
    expect(reopened.latest).toBe("newer words");

    server.up = true;
    await vi.advanceTimersByTimeAsync(30_000);
    expect(server.stored).toBe("newer words");
  });

  it("keeps the saver while an undone write is still on its way", async () => {
    const { server, deps } = fakeServer();
    let release: () => void = () => {};
    deps.write = (markdown) =>
      new Promise<void>((resolve) => {
        release = () => {
          server.stored = markdown;
          resolve();
        };
      });
    const first = draftSaverFor(9103, "A", deps);
    first.change("B");
    await vi.advanceTimersByTimeAsync(DRAFT_SAVE_DELAY_MS); // "B" in flight
    first.change("A");
    void first.flush(); // leaving the page

    const reopened = draftSaverFor(9103, "B from the server", deps);
    expect(reopened).toBe(first);
    expect(reopened.latest).toBe("A");
    release();
    await vi.advanceTimersByTimeAsync(0);
    release();
    await vi.advanceTimersByTimeAsync(DRAFT_SAVE_DELAY_MS);
    expect(server.stored).toBe("A");
  });

  it("starts from the loaded text once everything was saved", async () => {
    const { deps } = fakeServer();
    const first = draftSaverFor(9102, "v1", deps);
    first.change("v2");
    await first.flush();
    const reopened = draftSaverFor(9102, "v2 from the server", deps);
    expect(reopened).not.toBe(first);
    expect(reopened.latest).toBe("v2 from the server");
  });
});

describe("autosaveRetryDelay", () => {
  it("backs off to every 30 seconds", () => {
    expect([1, 2, 3, 4, 5, 10].map(autosaveRetryDelay)).toEqual([3_000, 6_000, 12_000, 24_000, 30_000, 30_000]);
  });
});
