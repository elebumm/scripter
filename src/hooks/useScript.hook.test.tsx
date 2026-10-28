// useScript against a mocked client API: a version save lands the waiting
// draft first, so the server can clear it (PR #2 review: a stale draft must
// not outlive the version just saved).

import { afterEach, describe, expect, it, vi } from "vitest";
import { renderHook, settle } from "./render-hook.test-helper";
import { useScript } from "./useScript";

const api = vi.hoisted(() => {
  class ApiError extends Error {
    constructor(
      message: string,
      readonly status: number
    ) {
      super(message);
    }
  }
  return {
    ApiError,
    getScript: vi.fn(),
    updateScript: vi.fn(),
    saveVersion: vi.fn(),
    saveDraftOnUnload: vi.fn(() => true),
  };
});
vi.mock("@/lib/api", () => api);

const toast = vi.hoisted(() => Object.assign(vi.fn(), { error: vi.fn(), dismiss: vi.fn() }));
vi.mock("sonner", () => ({ toast }));

// draftSaverFor registers a beforeunload guard on window (globalThis here).
const g = globalThis as unknown as { addEventListener?: () => void };
g.addEventListener ??= () => {};

afterEach(() => vi.clearAllMocks());

describe("useScript saveVersion", () => {
  it("writes the waiting draft before posting the version", async () => {
    const calls: string[] = [];
    const version = { id: 7, version: 2, content: "Hello there." };
    api.getScript.mockResolvedValue({
      script: { id: 41, title: "T", context: "", currentVersion: 1 },
      latestVersion: { id: 6, version: 1, content: "Hello." },
      content: "Hello.",
    });
    api.updateScript.mockImplementation(async (_id: number, data: { draftContent?: string }) => {
      calls.push(`draft ${data.draftContent}`);
      return {};
    });
    api.saveVersion.mockImplementation(async (_id: number, content: string) => {
      calls.push(`version ${content}`);
      return { version, created: true };
    });

    const hook = await renderHook(() => useScript(41));
    await settle();
    await settle(() => hook.current.setContent("Hello there."));
    let saved: Awaited<ReturnType<typeof hook.current.saveVersion>> = null;
    await settle(async () => {
      saved = await hook.current.saveVersion(); // before the 2 s autosave
    });

    expect(calls).toEqual(["draft Hello there.", "version Hello there."]);
    expect(saved).toEqual({ id: 7, version: 2, created: true });
    expect(hook.current.latestVersion).toEqual(version);
    await hook.unmount();
  });

  it("returns null without saving when there's nothing written", async () => {
    api.getScript.mockResolvedValue({
      script: { id: 42, title: "T", context: "", currentVersion: 0 },
      latestVersion: null,
      content: "",
    });
    const hook = await renderHook(() => useScript(42));
    await settle();
    let saved: unknown = "unset";
    await settle(async () => {
      saved = await hook.current.saveVersion({ quiet: true });
    });
    expect(saved).toBeNull();
    expect(api.saveVersion).not.toHaveBeenCalled();
    expect(toast).not.toHaveBeenCalled();
    await hook.unmount();
  });
});
