// useCouncil against a mocked client API (no server, no model): retrying only
// the synthesis, the run's scope label, persona loading, section limits and
// the dropped-notes warning.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Persona, Synthesis } from "@/types";
import type { PersonaCritique } from "@/lib/llm/schemas";
import { renderHook, settle, type HookHandle } from "./render-hook.test-helper";
import { MAX_SECTION_CHARS, useCouncil, type CouncilController } from "./useCouncil";

const api = vi.hoisted(() => ({
  listPersonas: vi.fn(),
  getLatestSynthesis: vi.fn(),
  streamCritique: vi.fn(),
  streamSynthesis: vi.fn(),
  updatePersona: vi.fn(),
}));
vi.mock("@/lib/api", () => api);

const toast = vi.hoisted(() => ({ error: vi.fn(), warning: vi.fn(), success: vi.fn() }));
vi.mock("sonner", () => ({ toast }));

function persona(id: number, slug: string, isActive = true): Persona {
  return {
    id,
    slug,
    name: slug.replace(/-/g, " "),
    description: "",
    systemPrompt: "A lens prompt long enough to be valid.",
    criteriaWeights: {},
    modelSlug: "model",
    modelName: `Model ${id}`,
    icon: null,
    color: null,
    isActive,
    position: id,
  };
}

const PERSONAS = [persona(1, "story-architect"), persona(2, "skeptical-viewer")];
const critique = { summary: "Fine.", criteria: [], overallScore: 7, notes: [], landed: [] } as unknown as PersonaCritique;

function synthesisFor(runId: string, versionId = 10): Synthesis {
  return {
    summaryId: 5,
    scriptId: 1,
    versionId,
    versionNumber: 1,
    runId,
    overview: "Overview.",
    scoreTable: [],
    overall: { scores: {}, average: 7 },
    lenses: [],
    failedLenses: [],
    costUsd: null,
    createdAt: "2026-10-27 10:00:00",
  };
}

/** A synthesis call that waits until its signal aborts. */
function hangsUntilAborted(_body: unknown, _onEvent: unknown, signal?: AbortSignal) {
  return new Promise((_resolve, reject) => {
    signal?.addEventListener("abort", () => reject(new DOMException("Stopped", "AbortError")));
  });
}

let saveVersion: ReturnType<typeof vi.fn<() => Promise<{ id: number } | null>>>;
let onNotesChanged: ReturnType<typeof vi.fn<() => void>>;
let hook: HookHandle<CouncilController> | null = null;

async function mount() {
  hook = await renderHook(() => useCouncil(1, { saveVersion, onNotesChanged }));
  await settle();
  return hook;
}

beforeEach(() => {
  vi.clearAllMocks();
  saveVersion = vi.fn(async (): Promise<{ id: number } | null> => ({ id: 10 }));
  onNotesChanged = vi.fn<() => void>();
  api.listPersonas.mockResolvedValue(PERSONAS);
  api.getLatestSynthesis.mockResolvedValue(null);
  api.streamCritique.mockResolvedValue({ critique, meta: { evaluationId: 1, costUsd: 0.01, durationMs: 1000 } });
  api.streamSynthesis.mockImplementation(async (body: { runId: string; versionId: number }) => ({
    synthesis: synthesisFor(body.runId, body.versionId),
    meta: { summaryId: 5, notesSaved: 2, notesDropped: 0, costUsd: 0.02 },
  }));
});

afterEach(async () => {
  await hook?.unmount();
  hook = null;
});

describe("retrying only the synthesis", () => {
  it("re-synthesizes a run whose synthesis failed without re-running any lens", async () => {
    const h = await mount();
    api.streamSynthesis.mockRejectedValueOnce(new Error("Timed out after 240 s"));
    await settle(() => h.current.start());

    expect(h.current.phase).toBe("error");
    expect(h.current.canRetrySynthesis).toBe(true);
    const runId = h.current.runId;
    expect(runId).toBeTruthy();
    expect(api.streamCritique).toHaveBeenCalledTimes(2);

    await settle(() => h.current.retrySynthesis());

    expect(api.streamCritique).toHaveBeenCalledTimes(2);
    expect(api.streamSynthesis).toHaveBeenCalledTimes(2);
    expect(api.streamSynthesis.mock.calls[1][0]).toEqual({ scriptId: 1, versionId: 10, runId });
    expect(h.current.synthesis?.runId).toBe(runId);
    expect(h.current.phase).toBe("done");
    expect(h.current.canRetrySynthesis).toBe(false);
    expect(onNotesChanged).toHaveBeenCalledTimes(1);
  });

  it("offers the synthesis again after Stop while it was being written", async () => {
    const h = await mount();
    api.streamSynthesis.mockImplementationOnce(hangsUntilAborted);
    let started: Promise<void> = Promise.resolve();
    await settle(() => {
      started = h.current.start();
    });
    expect(h.current.phase).toBe("synthesizing");

    await settle(async () => {
      h.current.stop();
      await started;
    });
    expect(h.current.phase).toBe("idle");
    expect(h.current.canRetrySynthesis).toBe(true);

    await settle(() => h.current.retrySynthesis());
    expect(api.streamCritique).toHaveBeenCalledTimes(2);
    expect(h.current.synthesis?.runId).toBe(h.current.runId);
  });

  it("synthesizes a run picked from History after a reload, using its saved lenses", async () => {
    const h = await mount();
    expect(h.current.runId).toBeNull();
    const target = {
      runId: "run-from-history",
      versionId: 22,
      lenses: [
        { personaSlug: "story-architect", personaName: "Story Architect", modelName: "M1", evaluationId: 1, critique: critique, status: "complete" as const },
        { personaSlug: "skeptical-viewer", personaName: "Skeptical Viewer", modelName: "M2", evaluationId: 2, critique: null, status: "error" as const, error: "Timed out" },
      ],
    };

    await settle(() => h.current.retrySynthesis(target));

    expect(api.streamCritique).not.toHaveBeenCalled();
    expect(api.streamSynthesis).toHaveBeenCalledWith({ scriptId: 1, versionId: 22, runId: "run-from-history" }, expect.any(Function), expect.anything());
    expect(h.current.runId).toBe("run-from-history");
    expect(h.current.lenses.map((l) => [l.personaId, l.status])).toEqual([
      [1, "complete"],
      [2, "error"],
    ]);
    expect(h.current.synthesis?.runId).toBe("run-from-history");
  });

  it("does nothing when no lens of the run finished", async () => {
    const h = await mount();
    api.streamCritique.mockRejectedValue(new Error("Rate limited"));
    await settle(() => h.current.start());
    expect(h.current.canRetrySynthesis).toBe(false);
    await settle(() => h.current.retrySynthesis());
    expect(api.streamSynthesis).not.toHaveBeenCalled();
  });
});

describe("the run's scope label", () => {
  it("follows the run actually started, whoever started it", async () => {
    const h = await mount();
    const section = "The fab was silent at 3 a.m. and nobody on the floor said a word.";
    await settle(() => h.current.start({ sectionOnly: section, scopeLabel: "Section: “The fab was silent…”" }));
    expect(h.current.runScopeLabel).toBe("Section: “The fab was silent…”");
    expect(api.streamCritique.mock.calls[0][0]).toMatchObject({ sectionOnly: section });

    // e.g. "Consult again" in the synthesis panel
    await settle(() => h.current.start());
    expect(h.current.runScopeLabel).toBe("Whole script");
    expect(api.streamCritique.mock.calls.at(-1)?.[0]).toMatchObject({ sectionOnly: undefined });

    // A caller that sends no label still gets one that names the section.
    await settle(() => h.current.start({ sectionOnly: section }));
    expect(h.current.runScopeLabel).toBe("Section: “The fab was silent at 3 a.m.…”");
  });

  it("refuses a section longer than the critique route accepts, before saving or calling anything", async () => {
    const h = await mount();
    await settle(() => h.current.start({ sectionOnly: "x".repeat(MAX_SECTION_CHARS + 1) }));
    expect(toast.error).toHaveBeenCalledWith(expect.stringContaining("too long"));
    expect(saveVersion).not.toHaveBeenCalled();
    expect(api.streamCritique).not.toHaveBeenCalled();
  });
});

describe("consulting before the council has loaded", () => {
  it("waits for the persona list instead of saying no member is on", async () => {
    let resolve: (list: Persona[]) => void = () => {};
    api.listPersonas.mockReturnValueOnce(new Promise<Persona[]>((r) => (resolve = r)));
    const h = await mount();
    expect(h.current.personas).toEqual([]);

    let started: Promise<void> = Promise.resolve();
    await settle(() => {
      started = h.current.start();
    });
    await settle(async () => {
      resolve(PERSONAS);
      await started;
    });

    expect(toast.error).not.toHaveBeenCalledWith("Turn on at least one council member first.");
    expect(saveVersion).toHaveBeenCalledTimes(1);
    expect(api.streamCritique).toHaveBeenCalledTimes(2);
  });

  it("tries the load again, and shows the real error when it still fails", async () => {
    api.listPersonas.mockRejectedValueOnce(new Error("HTTP 500"));
    const h = await mount();
    expect(h.current.error).toContain("Couldn't load the council");

    // Second load works: the consult goes ahead.
    await settle(() => h.current.start());
    expect(saveVersion).toHaveBeenCalledTimes(1);

    // A fresh page whose loads all fail: the toast names the failure.
    await hook?.unmount();
    vi.clearAllMocks();
    api.listPersonas.mockRejectedValue(new Error("HTTP 503"));
    api.getLatestSynthesis.mockResolvedValue(null);
    const failing = await mount();
    await settle(() => failing.current.start());
    expect(toast.error).toHaveBeenCalledWith("Couldn't load the council: HTTP 503");
    expect(toast.error).not.toHaveBeenCalledWith("Turn on at least one council member first.");
    expect(saveVersion).not.toHaveBeenCalled();
  });

  it("drops the first load's error once the council loads on retry", async () => {
    api.listPersonas.mockRejectedValueOnce(new Error("HTTP 500")).mockResolvedValue([persona(1, "story-architect", false)]);
    const h = await mount();
    expect(h.current.error).toContain("Couldn't load the council");

    await settle(() => h.current.start());
    expect(toast.error).toHaveBeenCalledWith("Turn on at least one council member first.");
    expect(h.current.personas).toHaveLength(1);
    expect(h.current.error).toBeNull();
  });

  it("still says to turn a member on when every persona is off", async () => {
    api.listPersonas.mockResolvedValue([persona(1, "story-architect", false)]);
    const h = await mount();
    await settle(() => h.current.start());
    expect(toast.error).toHaveBeenCalledWith("Turn on at least one council member first.");
    expect(saveVersion).not.toHaveBeenCalled();
  });
});

describe("dropped synthesis notes", () => {
  it("tells the writer when a synthesis saved no notes because every note was dropped", async () => {
    api.streamSynthesis.mockImplementation(async (body: { runId: string }) => ({
      synthesis: synthesisFor(body.runId),
      meta: { summaryId: 5, notesSaved: 0, notesDropped: 3, costUsd: null },
    }));
    const h = await mount();
    await settle(() => h.current.start());

    expect(h.current.lastNotes).toEqual({ runId: h.current.runId, saved: 0, dropped: 3 });
    expect(toast.warning).toHaveBeenCalledWith("No new notes from this run", expect.objectContaining({ description: expect.stringContaining("3 notes") }));
  });

  it("stays quiet when notes were saved", async () => {
    const h = await mount();
    await settle(() => h.current.start());
    expect(h.current.lastNotes).toEqual({ runId: h.current.runId, saved: 2, dropped: 0 });
    expect(toast.warning).not.toHaveBeenCalled();
  });
});
