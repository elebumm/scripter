// Smoke tests: the panel and its views render real data without throwing and
// show what the writer needs (versions, scores, models, failures). Rendered to
// static markup in node; interaction is covered by browser verification.

import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { ReactElement } from "react";
import { TooltipProvider } from "@/components/ui/tooltip";
import type { LensState, Synthesis } from "@/types/review";
import type { PersonaCritique } from "@/lib/llm/schemas";
import { SynthesisPanel, type SynthesisPanelCouncil } from "./SynthesisPanel";
import { SynthesisView } from "./SynthesisView";
import { LiveProgress } from "./LiveProgress";
import { RunHistory } from "./RunHistory";
import { TrendsChart } from "./TrendsChart";
import { VersionDiff } from "@/components/diff/VersionDiff";

const render = (el: ReactElement) => renderToStaticMarkup(<TooltipProvider>{el}</TooltipProvider>);
const NOW = new Date("2026-10-27T12:00:00Z");

const critique: PersonaCritique = {
  summary: "The **cold open** works; the middle sags.",
  criteria: [
    { id: "hook", score: 8, observation: "Cold open lands." },
    { id: "pacing", score: 5, observation: "Middle drags." },
  ],
  overallScore: 7,
  notes: [{ anchorText: "and then it crashed", issue: "Payoff is rushed.", why: "Viewers lose the thread.", question: "What did it cost them?", category: "pacing", priority: "high" }],
  landed: [{ anchorText: "the server room was silent", why: "Concrete and eerie." }],
};

const synthesis: Synthesis = {
  summaryId: 9,
  scriptId: 1,
  versionId: 40,
  versionNumber: 4,
  runId: "run-1",
  overview: "## Consensus\nThe hook works.",
  scoreTable: [
    { criterionId: "hook", label: "Hook & Opening", scores: { "story-architect": 8 }, average: 8 },
    { criterionId: "pacing", label: "Pacing & Rhythm", scores: { "story-architect": 5 }, average: 5 },
  ],
  overall: { scores: { "story-architect": 7 }, average: 7 },
  lenses: [
    { personaSlug: "story-architect", personaName: "Story Architect", modelName: "Claude Sonnet 5.5", evaluationId: 1, critique, status: "complete" },
    { personaSlug: "clarity-editor", personaName: "Clarity Editor", modelName: "Gemini 3.8 Flash", evaluationId: 2, critique: null, status: "error", error: "Timed out after 240 s" },
  ],
  failedLenses: ["clarity-editor"],
  costUsd: 0.31,
  createdAt: "2026-10-24 12:00:00",
};

const lenses: LensState[] = [
  { personaId: 1, personaSlug: "story-architect", personaName: "Story Architect", modelName: "Claude Sonnet 5.5", status: "complete", critique, durationMs: 40_000 },
  { personaId: 2, personaSlug: "skeptical-viewer", personaName: "Skeptical Viewer", modelName: "GPT-6.1 Terra", status: "streaming", critique: null },
  { personaId: 3, personaSlug: "clarity-editor", personaName: "Clarity Editor", modelName: "Gemini 3.8 Flash", status: "error", critique: null, error: "Rate limited" },
];

function council(overrides: Partial<SynthesisPanelCouncil> = {}): SynthesisPanelCouncil {
  return {
    personas: [],
    lenses: [],
    phase: "idle",
    isRunning: false,
    runId: null,
    synthesis: null,
    partialSynthesis: null,
    error: null,
    lastNotes: null,
    canRetrySynthesis: false,
    hasUnseen: false,
    markSeen: () => {},
    start: async () => {},
    stop: () => {},
    retryLens: async () => {},
    retrySynthesis: async () => {},
    ...overrides,
  };
}

describe("SynthesisView", () => {
  it("shows version, cost, scores, lens cards with models and failures", () => {
    const html = render(<SynthesisView synthesis={synthesis} now={NOW} />);
    expect(html).toContain("v4 · 3 days ago");
    expect(html).toContain("$0.31");
    expect(html).toContain("Consensus");
    expect(html).toContain("Hook &amp; Opening");
    expect(html).toContain("Story Architect");
    expect(html).toContain("Claude Sonnet 5.5");
    expect(html).toContain("What landed");
    expect(html).toContain("the server room was silent");
    expect(html).toContain("Timed out after 240 s");
    expect(html).toContain("How scores work");
    // Retry only appears when offered
    expect(html).not.toContain("Retry");
    const withRetry = render(
      <SynthesisView synthesis={synthesis} now={NOW} retry={{ slugs: new Set(["clarity-editor"]), onRetry: () => {} }} />
    );
    expect(withRetry).toContain("Retry");
  });
});

describe("LiveProgress", () => {
  it("lists each lens with persona, model chip and status", () => {
    const html = render(
      <LiveProgress lenses={lenses} phase="critiquing" isRunning partialOverview={null} onStop={() => {}} onRetry={() => {}} />
    );
    expect(html).toContain("2 of 3 done");
    expect(html).toContain("GPT-6.1 Terra");
    expect(html).toContain("Reading the script");
    expect(html).toContain("Done in 40s");
    expect(html).toContain("Rate limited");
    expect(html).toContain("Stop");
  });

  it("shows the partial overview while synthesizing", () => {
    const html = render(
      <LiveProgress lenses={lenses} phase="synthesizing" isRunning partialOverview="The lenses agree on the hook" onStop={() => {}} onRetry={() => {}} />
    );
    expect(html).toContain("Synthesizing");
    expect(html).toContain("The lenses agree on the hook");
  });
});

describe("RunHistory", () => {
  it("lists runs by version number with score, lenses and section badge", () => {
    const html = render(
      <RunHistory
        runs={[
          { runId: "a", versionId: 40, versionNumber: 4, createdAt: "2026-10-27 10:00:00", overallAverage: 7.2, costUsd: 0.3, lensCount: 5, failedLenses: 1, sectionOnly: false },
          { runId: "b", versionId: 39, versionNumber: 3, createdAt: "2026-10-20 10:00:00", overallAverage: null, costUsd: null, lensCount: 2, failedLenses: 0, sectionOnly: true },
        ]}
        loading={false}
        error={null}
        onReload={() => {}}
        selectedRunId={null}
        onSelect={() => {}}
        selectedRun={null}
        runLoading={false}
        runError={null}
        latestRunId="a"
        now={NOW}
      />
    );
    expect(html).toContain("v4");
    expect(html).toContain("4 of 5 lenses");
    expect(html).toContain("Latest");
    expect(html).toContain("Section");
    expect(html).toContain("7.2");
  });
});

describe("TrendsChart", () => {
  it("explains empty and single-point states", () => {
    expect(render(<TrendsChart points={[]} loading={false} error={null} onReload={() => {}} />)).toContain(
      "No whole-script reviews yet"
    );
    expect(
      render(
        <TrendsChart
          points={[{ versionNumber: 2, createdAt: "2026-10-01 10:00:00", overall: 6.5, criteria: {} }]}
          loading={false}
          error={null}
          onReload={() => {}}
        />
      )
    ).toContain("v2 scored 6.5 overall");
  });

  it("renders the criteria table for two or more points", () => {
    const html = render(
      <TrendsChart
        points={[
          { versionNumber: 1, createdAt: "2026-10-01 10:00:00", overall: 6, criteria: { hook: 6 } },
          { versionNumber: 2, createdAt: "2026-10-02 10:00:00", overall: 7, criteria: { hook: 7.5 } },
        ]}
        loading={false}
        error={null}
        onReload={() => {}}
      />
    );
    expect(html).toContain("Hook &amp; Opening");
    expect(html).toContain("+1.5");
  });
});

describe("VersionDiff", () => {
  it("renders inline word changes and stats", () => {
    const html = render(<VersionDiff before={"Hello world.\n"} after={"Hello brave world.\n"} beforeLabel="v1" afterLabel="v2" />);
    expect(html).toContain("<ins");
    expect(html).toContain("brave");
    expect(html).toContain("+1 words");
  });
});

describe("SynthesisPanel", () => {
  it("is inert and hidden when closed", () => {
    const html = render(<SynthesisPanel open={false} onOpenChange={() => {}} scriptId={1} council={council()} />);
    expect(html).toMatch(/<aside[^>]*inert=""/);
    expect(html).toMatch(/<aside[^>]*aria-hidden="true"/);
  });

  it("shows the empty state with a call to action", () => {
    const html = render(<SynthesisPanel open onOpenChange={() => {}} scriptId={1} council={council()} />);
    expect(html).toContain("hasn&#x27;t read this script yet");
    expect(html).toContain("Consult the council");
    expect(html).not.toMatch(/<aside[^>]*inert/);
  });

  it("shows live progress while running and the saved synthesis otherwise", () => {
    const running = render(
      <SynthesisPanel open onOpenChange={() => {}} scriptId={1} council={council({ lenses, phase: "critiquing", isRunning: true })} />
    );
    expect(running).toContain("Skeptical Viewer");
    expect(running).toContain("The council is reading");

    const done = render(<SynthesisPanel open onOpenChange={() => {}} scriptId={1} council={council({ synthesis, phase: "done" })} />);
    expect(done).toContain("Consult again");
    expect(done).toContain("Lens critiques");
  });
});

describe("retry controls", () => {
  const failedRunLenses: LensState[] = [
    { personaId: 1, personaSlug: "story-architect", personaName: "Story Architect", modelName: "Claude Sonnet 5.5", status: "complete", critique },
    { personaId: 3, personaSlug: "clarity-editor", personaName: "Clarity Editor", modelName: "Gemini 3.8 Flash", status: "error", critique: null, error: "Stopped" },
  ];
  const personas = [
    { id: 1, slug: "story-architect" },
    { id: 3, slug: "clarity-editor" },
  ] as SynthesisPanelCouncil["personas"];

  it("offers lens retry on the shown synthesis only when it is this session's current run", () => {
    // Synthesis A (run-1) is shown; the session's current run B was stopped.
    const otherRun = render(
      <SynthesisPanel
        open
        onOpenChange={() => {}}
        scriptId={1}
        council={council({ synthesis, personas, lenses: failedRunLenses, runId: "run-b", phase: "idle" })}
      />
    );
    expect(otherRun).toContain("Timed out after 240 s");
    expect(otherRun).not.toContain("Retry Clarity Editor");

    const sameRun = render(
      <SynthesisPanel
        open
        onOpenChange={() => {}}
        scriptId={1}
        council={council({ synthesis, personas, lenses: failedRunLenses, runId: "run-1", phase: "done" })}
      />
    );
    expect(sameRun).toContain('aria-label="Retry Clarity Editor"');
  });

  it("offers no Retry for a lens whose persona is gone (a run restored from History)", () => {
    const restored: LensState[] = [
      failedRunLenses[0],
      { ...failedRunLenses[1], personaId: -2 },
    ];
    const html = render(
      <SynthesisPanel
        open
        onOpenChange={() => {}}
        scriptId={1}
        council={council({ synthesis, personas: [personas[0]], lenses: restored, runId: "run-1", phase: "done" })}
      />
    );
    expect(html).toContain("Timed out after 240 s");
    expect(html).not.toContain("Retry Clarity Editor");
  });

  it("offers Retry synthesis for a run with finished lenses and no saved synthesis", () => {
    const html = render(
      <SynthesisPanel
        open
        onOpenChange={() => {}}
        scriptId={1}
        council={council({
          synthesis,
          personas,
          lenses: failedRunLenses,
          runId: "run-b",
          phase: "error",
          error: "The synthesis failed: Timed out",
          canRetrySynthesis: true,
        })}
      />
    );
    expect(html).toContain("Retry synthesis");
    expect(html).toContain("uses the 1 lens that finished");
    expect(html).toContain("Last saved synthesis");

    // After Stop (phase idle) the run is still offered, not hidden behind the old synthesis.
    const stopped = render(
      <SynthesisPanel
        open
        onOpenChange={() => {}}
        scriptId={1}
        council={council({ synthesis, personas, lenses: failedRunLenses, runId: "run-b", phase: "idle", canRetrySynthesis: true })}
      />
    );
    expect(stopped).toContain("Retry synthesis");
  });

  it("names the lens on every Retry and Stop button", () => {
    const failed: LensState[] = [
      { ...lenses[2] },
      { personaId: 4, personaSlug: "skeptic", personaName: "Skeptic", modelName: "Grok", status: "error", critique: null, error: "Rate limited" },
    ];
    const settled = render(<LiveProgress lenses={failed} phase="error" isRunning={false} partialOverview={null} onStop={() => {}} onRetry={() => {}} />);
    expect(settled).toContain('aria-label="Retry Clarity Editor"');
    expect(settled).toContain('aria-label="Retry Skeptic"');
    const running = render(<LiveProgress lenses={lenses} phase="critiquing" isRunning partialOverview={null} onStop={() => {}} onRetry={() => {}} />);
    expect(running).toContain('aria-label="Stop the council"');
    const view = render(<SynthesisView synthesis={synthesis} now={NOW} retry={{ slugs: new Set(["clarity-editor"]), onRetry: () => {} }} />);
    expect(view).toContain('aria-label="Retry Clarity Editor"');
  });
});

describe("dropped notes notice", () => {
  it("says why a run saved no notes, for the session's run only", () => {
    const shown = render(
      <SynthesisPanel
        open
        onOpenChange={() => {}}
        scriptId={1}
        council={council({ synthesis, runId: "run-1", phase: "done", lastNotes: { runId: "run-1", saved: 0, dropped: 4 } })}
      />
    );
    expect(shown).toContain("No new notes from this run");
    expect(shown).toContain("4 notes");

    const otherRun = render(
      <SynthesisPanel
        open
        onOpenChange={() => {}}
        scriptId={1}
        council={council({ synthesis, runId: "run-2", phase: "idle", lastNotes: { runId: "run-2", saved: 0, dropped: 4 } })}
      />
    );
    expect(otherRun).not.toContain("No new notes from this run");
  });

  it("reads the saved synthesis's note report, also after a reload (findings 11, 28)", () => {
    const reported = {
      ...synthesis,
      noteReport: { saved: 1, dropped: 3, dropReasons: { anchor: 2, duplicate: 1 }, previousKept: 2 },
    };
    const html = render(<SynthesisPanel open onOpenChange={() => {}} scriptId={1} council={council({ synthesis: reported })} />);
    expect(html).toContain("2 notes were left out");
    expect(html).toContain("2 earlier open notes were kept.");

    // Repeats merged and notes outside a reviewed section are expected.
    const expected = { ...synthesis, noteReport: { saved: 2, dropped: 3, dropReasons: { duplicate: 1, section: 2 }, previousKept: 4 } };
    const quiet = render(<SynthesisPanel open onOpenChange={() => {}} scriptId={1} council={council({ synthesis: expected })} />);
    expect(quiet).not.toContain("left out");
  });
});

describe("panel focus and score help", () => {
  it("has a focus target for opening", () => {
    const html = render(<SynthesisPanel open onOpenChange={() => {}} scriptId={1} council={council()} />);
    expect(html).toMatch(/<h2[^>]*tabindex="-1"[^>]*>Synthesis<\/h2>/);
  });

  it("spells out what each criterion looks for, not only in hover tooltips", () => {
    const html = render(<SynthesisView synthesis={synthesis} now={NOW} />);
    expect(html).toContain("What each criterion looks for");
    expect(html).toMatch(/<dt[^>]*>Hook &amp; Opening: <\/dt><dd[^>]*>[^<]+<\/dd>/);
  });
});

describe("RunHistory selected run", () => {
  const base = {
    runs: [{ runId: "a", versionId: 40, versionNumber: 4, createdAt: "2026-10-27 10:00:00", overallAverage: 7, costUsd: 0.3, lensCount: 2, failedLenses: 1, sectionOnly: false }],
    loading: false,
    error: null,
    onReload: () => {},
    selectedRunId: "a",
    onSelect: () => {},
    runLoading: false,
    runError: null,
    latestRunId: null,
    now: NOW,
  };

  it("uses plain words for a run without a synthesis", () => {
    const html = render(<RunHistory {...base} selectedRun={null} />);
    expect(html).toContain("Older runs only kept their scores.");
    expect(html).not.toContain("council refresh");
  });

  it("offers to synthesize a run whose synthesis didn't finish", () => {
    const unsynthesized = { ...synthesis, summaryId: 0, overview: "", runId: "a" };
    const html = render(<RunHistory {...base} selectedRun={unsynthesized} synthesize={{ onSynthesize: () => {} }} />);
    expect(html).toContain("Synthesize this run");
    expect(render(<RunHistory {...base} selectedRun={unsynthesized} />)).not.toContain("Synthesize this run");
  });
});
