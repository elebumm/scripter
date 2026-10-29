// useTargetLength under a minimal hook runtime (the test environment is Node):
// a new target shows at once, and only the newest failed write brings back the
// last saved value, so the status line never claims a target that wasn't kept.

import { beforeEach, describe, expect, it, vi } from "vitest";

const rt = vi.hoisted(() => {
  let slots: unknown[] = [];
  let cursor = 0;
  let component: (() => void) | null = null;

  function render() {
    cursor = 0;
    component?.();
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
    useCallback<T>(fn: T) {
      const i = cursor++;
      if (!(i in slots)) slots[i] = fn;
      return slots[i] as T;
    },
  };

  function mount<T>(hook: () => T): () => T {
    slots = [];
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
const toast = vi.hoisted(() => ({ error: vi.fn() }));
vi.mock("sonner", () => ({ toast }));
const api = vi.hoisted(() => ({ updateScript: vi.fn() }));
vi.mock("@/lib/api", () => api);

const { useTargetLength } = await import("./useTargetLength");

function deferred() {
  let resolve!: () => void;
  let reject!: (err: Error) => void;
  const promise = new Promise<void>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

beforeEach(() => {
  api.updateScript.mockReset();
  toast.error.mockReset();
});

describe("useTargetLength", () => {
  it("shows the stored target until the writer picks one, then saves the pick", async () => {
    api.updateScript.mockResolvedValue({});
    const hook = rt.mount(() => useTargetLength(7, 1600));
    expect(hook().targetWords).toBe(1600);

    await hook().setTargetWords(2400);
    expect(hook().targetWords).toBe(2400);
    expect(api.updateScript).toHaveBeenCalledWith(7, { targetLength: 2400 });

    await hook().setTargetWords(null);
    expect(hook().targetWords).toBeNull();
    expect(api.updateScript).toHaveBeenLastCalledWith(7, { targetLength: null });
    expect(toast.error).not.toHaveBeenCalled();
  });

  it("brings back the stored target when the only write fails", async () => {
    api.updateScript.mockRejectedValueOnce(new Error("Failed to fetch"));
    const hook = rt.mount(() => useTargetLength(7, 1600));

    const write = hook().setTargetWords(3900);
    expect(hook().targetWords).toBe(3900);
    await write;
    expect(hook().targetWords).toBe(1600);
    expect(toast.error).toHaveBeenCalledWith("Couldn't save the target length: Failed to fetch");
  });

  it("brings back the last saved pick, not the stored one, when a later write fails", async () => {
    api.updateScript.mockResolvedValueOnce({}).mockRejectedValueOnce(new Error("Server error"));
    const hook = rt.mount(() => useTargetLength(7, 1600));

    await hook().setTargetWords(2400);
    await hook().setTargetWords(3900);
    expect(hook().targetWords).toBe(2400);
  });

  it("writes one after another and ignores a failure a newer pick replaced", async () => {
    const first = deferred();
    api.updateScript.mockReturnValueOnce(first.promise).mockResolvedValueOnce({});
    const hook = rt.mount(() => useTargetLength(7, null));

    void hook().setTargetWords(1000);
    const second = hook().setTargetWords(2400);
    await new Promise((resolve) => setTimeout(resolve, 0));
    // The second write waits for the first.
    expect(api.updateScript).toHaveBeenCalledTimes(1);

    first.reject(new Error("Server error"));
    await second;
    expect(api.updateScript).toHaveBeenCalledTimes(2);
    expect(api.updateScript).toHaveBeenLastCalledWith(7, { targetLength: 2400 });
    expect(hook().targetWords).toBe(2400);
    expect(toast.error).not.toHaveBeenCalled();
  });
});
