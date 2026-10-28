import { describe, expect, it } from "vitest";
import type { Synthesis } from "@/types/review";
import type { PersonaCritique } from "@/lib/llm/schemas";
import type { RunSummary, TrendPoint } from "@/lib/api/council";
import {
  SCORE_BANDS,
  buildFailedLenses,
  buildLensCards,
  buildRunListItem,
  buildScoreTable,
  buildSynthesisHeader,
  buildTrendView,
  canSynthesizeRun,
  droppedNotesNotice,
  formatCost,
  formatDelta,
  formatScore,
  latestScoreByVersion,
  lensProgress,
  lensStatusLabel,
  personaInitials,
  scoreBand,
  scoreToneClass,
  toggleSeries,
} from "./view-model";

const NOW = new Date("2026-10-27T12:00:00Z");

function critique(overall: number, extra: Partial<PersonaCritique> = {}): PersonaCritique {
  return {
    summary: "Strong opening, the middle sags.",
    criteria: [
      { id: "pacing", score: 5, observation: "Middle drags." },
      { id: "hook", score: 8, observation: "Cold open lands." },
    ],
    overallScore: overall,
    notes: [
      { anchorText: "and then it crashed", issue: "Payoff is rushed.", why: "Viewers lose the thread.", category: "pacing", priority: "high" },
    ],
    landed: [{ anchorText: "the server room was silent", why: "Concrete and eerie." }],
    ...extra,
  };
}

function synthesis(overrides: Partial<Synthesis> = {}): Synthesis {
  return {
    summaryId: 9,
    scriptId: 1,
    versionId: 40,
    versionNumber: 4,
    runId: "run-1",
    overview: "## Consensus\nThe hook works.",
    scoreTable: [
      { criterionId: "pacing", label: "Pacing & Rhythm", scores: { "story-architect": 5, "skeptical-viewer": 8 }, average: 6.5 },
      { criterionId: "hook", label: "Hook & Opening", scores: { "story-architect": 8, "skeptical-viewer": 7 }, average: null },
    ],
    overall: { scores: { "story-architect": 7, "skeptical-viewer": 6 }, average: 6.5 },
    lenses: [
      { personaSlug: "story-architect", personaName: "Story Architect", modelName: "Claude Sonnet 5.5", evaluationId: 1, critique: critique(7), status: "complete" },
      { personaSlug: "skeptical-viewer", personaName: "Skeptical Viewer", modelName: "GPT-6.1 Terra", evaluationId: 2, critique: critique(6), status: "complete" },
      { personaSlug: "clarity-editor", personaName: "Clarity Editor", modelName: "Gemini 3.8 Flash", evaluationId: 3, critique: null, status: "error", error: "Timed out after 240 s" },
    ],
    failedLenses: ["clarity-editor"],
    costUsd: 0.314,
    createdAt: "2026-10-24 12:00:00",
    ...overrides,
  };
}

describe("formatting", () => {
  it("formats scores, costs and deltas", () => {
    expect(formatScore(7)).toBe("7");
    expect(formatScore(7.25)).toBe("7.3");
    expect(formatScore(null)).toBe("–");
    expect(formatCost(null)).toBeNull();
    expect(formatCost(0.004)).toBe("<$0.01");
    expect(formatCost(0)).toBe("$0.00");
    expect(formatCost(0.314)).toBe("$0.31");
    expect(formatDelta(0.5)).toBe("+0.5");
    expect(formatDelta(-1)).toBe("−1");
    expect(formatDelta(0.04)).toBe("±0");
    expect(formatDelta(null)).toBe("");
  });
});

describe("score anchors", () => {
  it("parses every band from the rubric table", () => {
    expect(SCORE_BANDS.map((b) => `${b.min}-${b.max}`)).toEqual(["9-10", "7-8", "5-6", "3-4", "1-2"]);
    expect(SCORE_BANDS[1].label).toBe("Strong");
    expect(SCORE_BANDS[1].meaning).toContain("A 7 is a good score.");
  });

  it("maps scores (including averages) onto bands and tones", () => {
    expect(scoreBand(7)?.label).toBe("Strong");
    expect(scoreBand(8.6)?.label).toBe("Exceptional");
    expect(scoreBand(6.4)?.label).toBe("Average");
    expect(scoreBand(1)?.tone).toBe("low");
    expect(scoreBand(null)).toBeNull();
    expect(scoreToneClass(9)).toContain("emerald");
    expect(scoreToneClass(5)).toContain("amber");
    expect(scoreToneClass(3)).toContain("red");
  });
});

describe("personaInitials", () => {
  it("abbreviates names and disambiguates collisions", () => {
    expect(personaInitials(["Story Architect", "Skeptical Viewer", "The Cynic", "Script Doctor", "Story Arc"])).toEqual([
      "SA",
      "SV",
      "CY",
      "SD",
      "SA2",
    ]);
  });
});

describe("buildScoreTable", () => {
  it("makes criteria rows by lens columns in rubric order with averages", () => {
    const table = buildScoreTable(synthesis());
    expect(table.columns.map((c) => [c.slug, c.short, c.modelName])).toEqual([
      ["story-architect", "SA", "Claude Sonnet 5.5"],
      ["skeptical-viewer", "SV", "GPT-6.1 Terra"],
    ]);
    // hook comes before pacing in the rubric
    expect(table.rows.map((r) => r.id)).toEqual(["hook", "pacing"]);
    expect(table.rows[0].cells).toEqual([8, 7]);
    // missing server average is computed
    expect(table.rows[0].average).toBe(7.5);
    expect(table.rows[1].average).toBe(6.5);
    expect(table.rows[1].spread).toBe(3);
    expect(table.rows[1].split).toBe(true);
    expect(table.rows[0].split).toBe(false);
    expect(table.overall).toEqual({ cells: [7, 6], average: 6.5, spread: 1, split: false });
    expect(table.isEmpty).toBe(false);
  });

  it("is empty when no lens completed", () => {
    const table = buildScoreTable(synthesis({ lenses: [], scoreTable: [], overall: { scores: {}, average: null } }));
    expect(table.isEmpty).toBe(true);
  });
});

describe("lens cards and failures", () => {
  it("maps complete lenses to cards with sorted criteria", () => {
    const cards = buildLensCards(synthesis());
    expect(cards).toHaveLength(2);
    expect(cards[0]).toMatchObject({ slug: "story-architect", name: "Story Architect", modelName: "Claude Sonnet 5.5", overall: 7 });
    expect(cards[0].criteria.map((c) => [c.id, c.label, c.score])).toEqual([
      ["hook", "Hook & Opening", 8],
      ["pacing", "Pacing & Rhythm", 5],
    ]);
    expect(cards[0].landed[0].anchorText).toBe("the server room was silent");
  });

  it("lists errored lenses with their message, without duplicates", () => {
    expect(buildFailedLenses(synthesis())).toEqual([
      { slug: "clarity-editor", name: "Clarity Editor", modelName: "Gemini 3.8 Flash", error: "Timed out after 240 s" },
    ]);
    expect(buildFailedLenses(synthesis({ lenses: [], failedLenses: ["Creative Director"] }))).toEqual([
      { slug: "Creative Director", name: "Creative Director", modelName: "", error: null },
    ]);
  });

  it("builds the header line with version number and relative date", () => {
    const header = buildSynthesisHeader(synthesis(), NOW);
    expect(header).toEqual({
      versionLabel: "v4",
      relative: "3 days ago",
      line: "v4 · 3 days ago",
      cost: "$0.31",
      lensCount: 2,
      failedCount: 1,
    });
  });
});

describe("live lens progress", () => {
  it("counts finished and failed lenses", () => {
    expect(lensProgress([{ status: "complete" }, { status: "error" }, { status: "streaming" }, { status: "pending" }])).toEqual({
      total: 4,
      done: 2,
      failed: 1,
      percent: 50,
    });
    expect(lensProgress([])).toEqual({ total: 0, done: 0, failed: 0, percent: 0 });
  });

  it("describes what a streaming lens is doing", () => {
    expect(lensStatusLabel({ status: "streaming", critique: null })).toBe("Reading the script");
    expect(lensStatusLabel({ status: "streaming", critique: { criteria: [{ id: "hook", score: 7, observation: "" }] } })).toBe(
      "Scoring (1/10)"
    );
    expect(lensStatusLabel({ status: "complete", critique: null, durationMs: 41_600 })).toBe("Done in 42s");
    expect(lensStatusLabel({ status: "complete", critique: null, durationMs: -5 })).toBe("Done");
    expect(lensStatusLabel({ status: "error", critique: null })).toBe("Failed");
  });
});

function run(overrides: Partial<RunSummary>): RunSummary {
  return {
    runId: "r",
    versionId: 1,
    versionNumber: 1,
    createdAt: "2026-10-27 10:00:00",
    overallAverage: 7,
    costUsd: 0.2,
    lensCount: 5,
    failedLenses: 0,
    sectionOnly: false,
    ...overrides,
  };
}

describe("run history", () => {
  it("formats a run row", () => {
    expect(buildRunListItem(run({ runId: "a", versionNumber: 6, overallAverage: 7.24, failedLenses: 1 }), NOW)).toEqual({
      runId: "a",
      versionLabel: "v6",
      relative: "2 hours ago",
      overall: "7.2",
      overallValue: 7.24,
      cost: "$0.20",
      lenses: "4 of 5 lenses",
      failed: 1,
      section: false,
    });
    expect(buildRunListItem(run({ lensCount: 1, costUsd: null, sectionOnly: true }), NOW)).toMatchObject({
      lenses: "1 lens",
      cost: null,
      section: true,
    });
  });

  it("scores each version by its latest whole-script run", () => {
    const map = latestScoreByVersion([
      run({ runId: "old", versionId: 10, overallAverage: 6, createdAt: "2026-10-01 10:00:00" }),
      run({ runId: "section", versionId: 10, overallAverage: 9, sectionOnly: true, createdAt: "2026-10-03 10:00:00" }),
      run({ runId: "new", versionId: 10, overallAverage: 7.5, createdAt: "2026-10-02 10:00:00" }),
      run({ runId: "none", versionId: 11, overallAverage: null }),
    ]);
    expect(map.get(10)).toBe(7.5);
    expect(map.has(11)).toBe(false);
  });
});

describe("buildTrendView", () => {
  const points: TrendPoint[] = [
    { versionNumber: 3, createdAt: "2026-10-03 10:00:00", overall: 6.8, criteria: { hook: 7.2, pacing: 6 } },
    { versionNumber: 1, createdAt: "2026-10-01 10:00:00", overall: 6, criteria: { hook: 6, pacing: 5.55 } },
    { versionNumber: 3, createdAt: "2026-10-04 10:00:00", overall: 7.1, criteria: { hook: 8, pacing: 5.8 } },
  ];

  it("orders points, keeps x labels unique and computes latest deltas", () => {
    const view = buildTrendView(points);
    expect(view.rows.map((r) => r.label)).toEqual(["v1", "v3", "v3 #2"]);
    expect(view.rows[0].pacing).toBe(5.6);
    expect(view.overall).toEqual({ latest: 7.1, delta: 0.3 });
    expect(view.criteria).toEqual([
      { id: "hook", label: "Hook & Opening", latest: 8, delta: 0.8 },
      { id: "pacing", label: "Pacing & Rhythm", latest: 5.8, delta: -0.2 },
    ]);
    expect(view.enough).toBe(true);
  });

  it("flags insufficient data", () => {
    const view = buildTrendView([points[0]]);
    expect(view.enough).toBe(false);
    expect(view.overall).toEqual({ latest: 6.8, delta: null });
    expect(buildTrendView([]).rows).toEqual([]);
  });
});

describe("toggleSeries", () => {
  it("keeps each selected series on its colour slot and caps at three", () => {
    let sel = toggleSeries([], "hook");
    sel = toggleSeries(sel, "pacing");
    sel = toggleSeries(sel, "voice");
    expect(sel).toEqual([
      { id: "hook", slot: 0 },
      { id: "pacing", slot: 1 },
      { id: "voice", slot: 2 },
    ]);
    // removing one doesn't repaint the others
    sel = toggleSeries(sel, "pacing");
    expect(sel).toEqual([
      { id: "hook", slot: 0 },
      { id: "voice", slot: 2 },
    ]);
    // the freed slot is reused
    sel = toggleSeries(sel, "ending");
    expect(sel).toContainEqual({ id: "ending", slot: 1 });
    // a fourth drops the oldest
    sel = toggleSeries(sel, "clarity");
    expect(sel.map((s) => s.id)).toEqual(["voice", "ending", "clarity"]);
    expect(sel.find((s) => s.id === "clarity")?.slot).toBe(0);
  });
});

describe("droppedNotesNotice", () => {
  it("explains a run that saved nothing, and partial drops, and stays quiet otherwise", () => {
    expect(droppedNotesNotice({ saved: 0, dropped: 3 })).toEqual({
      title: "No new notes from this run",
      detail: "The synthesis wrote 3 notes, but none passed the checks. A note has to quote your script and can't repeat one you dismissed.",
    });
    expect(droppedNotesNotice({ saved: 2, dropped: 1 })?.title).toBe("1 note was left out");
    expect(droppedNotesNotice({ saved: 4, dropped: 0 })).toBeNull();
    expect(droppedNotesNotice({ saved: 0, dropped: 0 })).toBeNull();
  });
});

describe("canSynthesizeRun", () => {
  const unsynthesized = synthesis({ runId: "run-new", summaryId: 0, overview: "" });
  const newest = run({ runId: "run-new" });

  it("offers the newest whole-script run that has finished lenses and no saved synthesis", () => {
    expect(canSynthesizeRun(unsynthesized, newest, "run-old")).toBe(true);
    expect(canSynthesizeRun(unsynthesized, newest, null)).toBe(true);
  });

  it("never offers an older run, a section review, a legacy run or one that is already synthesized", () => {
    expect(canSynthesizeRun(unsynthesized, run({ runId: "run-newer" }), null)).toBe(false);
    expect(canSynthesizeRun(unsynthesized, { ...newest, sectionOnly: true }, null)).toBe(false);
    const legacy = synthesis({ runId: "legacy-40", summaryId: 0 });
    expect(canSynthesizeRun(legacy, run({ runId: "legacy-40" }), null)).toBe(false);
    expect(canSynthesizeRun(synthesis({ runId: "run-new" }), newest, null)).toBe(false);
    expect(canSynthesizeRun(unsynthesized, newest, "run-new")).toBe(false);
    expect(canSynthesizeRun(null, newest, null)).toBe(false);
    expect(canSynthesizeRun(unsynthesized, undefined, null)).toBe(false);
  });

  it("needs at least one finished lens", () => {
    const allFailed = synthesis({
      runId: "run-new",
      summaryId: 0,
      lenses: synthesis().lenses.map((l) => ({ ...l, status: "error" as const, critique: null })),
    });
    expect(canSynthesizeRun(allFailed, newest, null)).toBe(false);
  });
});
