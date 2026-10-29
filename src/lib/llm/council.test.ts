import { describe, expect, it } from "vitest";
import { NoObjectGeneratedError } from "ai";
import {
  buildTrendPoints,
  computeScoreTable,
  describeFailure,
  dropLegacyRewrites,
  failureUsage,
  groupRuns,
  guardCritique,
  guardPartial,
  legacyRunId,
  legacyToCritique,
  modelDisplayName,
  parseId,
  parseLegacyRunId,
  parseStoredCritique,
  parseStoredSynthesis,
  resolveLenses,
  samePassage,
  summarizeRun,
  synthesisForGroup,
  type PersonaLabel,
} from "./council";
import { CRITERIA, type CriterionId } from "./rubric";
import type { PersonaCritique } from "./schemas";
import { matchKey } from "@/lib/text/anchor";
import type { EvaluationWithVersion } from "@/lib/db/queries/evaluations";

const content = `# The Dataset

Her name is **Fei-Fei Li**. She didn't build it alone.

49,000 workers in 167 countries labelled fourteen million images for a few cents each.`;

function critique(overall: number, scores: Partial<Record<CriterionId, number>> = {}, extra: Partial<PersonaCritique> = {}): PersonaCritique {
  return {
    summary: "A read.",
    criteria: CRITERIA.map((c) => ({ id: c.id, score: scores[c.id] ?? 7, observation: "fine" })),
    overallScore: overall,
    notes: [],
    landed: [],
    ...extra,
  };
}

let nextId = 1;
function row(p: Partial<EvaluationWithVersion>): EvaluationWithVersion {
  return {
    id: nextId++,
    scriptId: 1,
    versionId: 10,
    versionNumber: 1,
    profileId: null,
    modelId: "claude-sonnet-5.5",
    modelProvider: "openrouter",
    result: "",
    isMasterSummary: false,
    sectionOnly: null,
    status: "complete",
    structuredResult: null,
    errorMessage: null,
    durationMs: null,
    runId: null,
    personaId: null,
    tokensIn: null,
    tokensOut: null,
    costUsd: null,
    createdAt: "2026-10-27 10:00:00",
    ...p,
  };
}

function legacyRow(p: Partial<EvaluationWithVersion> & { overall: number; hook?: number }): EvaluationWithVersion {
  const { overall, hook = 7, ...rest } = p;
  return row({
    structuredResult: JSON.stringify({
      criteria: [
        { name: "Hook & Opening", score: hook, explanation: "Opens well" },
        { name: "Pacing & Rhythm", score: 6, explanation: "Sags" },
      ],
      overallScore: overall,
      topPriorities: [{ rank: 1, description: "Tighten act two", impact: "retention" }],
    }),
    ...rest,
  });
}

const personas = new Map<number, PersonaLabel>([
  [1, { slug: "story-architect", name: "Story Architect" }],
  [2, { slug: "skeptical-viewer", name: "Skeptical Viewer" }],
]);

describe("computeScoreTable", () => {
  it("averages each criterion across lenses in rubric order and averages overall scores", () => {
    const { scoreTable, overall } = computeScoreTable([
      { slug: "a", criteria: [{ id: "hook", score: 8 }, { id: "pacing", score: 5 }], overallScore: 7 },
      { slug: "b", criteria: [{ id: "hook", score: 5 }], overallScore: 6 },
    ]);
    expect(scoreTable.map((r) => r.criterionId)).toEqual(["hook", "pacing"]);
    expect(scoreTable[0]).toEqual({ criterionId: "hook", label: "Hook & Opening", scores: { a: 8, b: 5 }, average: 6.5 });
    expect(scoreTable[1]).toEqual({ criterionId: "pacing", label: "Pacing & Rhythm", scores: { a: 5 }, average: 5 });
    expect(overall).toEqual({ scores: { a: 7, b: 6 }, average: 6.5 });
  });

  it("skips lenses without an overall score and rounds to one decimal", () => {
    const { overall } = computeScoreTable([
      { slug: "a", criteria: [], overallScore: 7 },
      { slug: "b", criteria: [], overallScore: 8 },
      { slug: "c", criteria: [], overallScore: 8 },
      { slug: "d", criteria: [], overallScore: null },
    ]);
    expect(overall.average).toBe(7.7);
    expect(Object.keys(overall.scores)).toEqual(["a", "b", "c"]);
  });

  it("returns an empty table and null average with no lenses", () => {
    expect(computeScoreTable([])).toEqual({ scoreTable: [], overall: { scores: {}, average: null } });
  });
});

describe("guardCritique", () => {
  const input = critique(6, {}, {
    summary: 'Solid. Try something like "imagine fourteen million images and nobody to thank".',
    notes: [
      {
        anchorText: "She didn't build it alone.",
        issue: "The reveal arrives before the viewer knows why the workers matter to the story.",
        why: "The twist is spent early.",
        question: 'Could you open with "every image you have ever tagged online"?',
        category: "hook",
        priority: "high",
      },
      {
        anchorText: "Nobody ever thanked the workers who built it.",
        issue: "This line claims more than the script shows about the workers.",
        why: "Hallucinated anchor.",
        category: "accuracy",
        priority: "medium",
      },
      {
        anchorText: "49,000 workers in 167 countries",
        issue: 'Rewrite it as "an army the size of a small city".',
        why: "Supplied wording only.",
        category: "clarity",
        priority: "low",
      },
    ],
    landed: [
      { anchorText: "Her name is Fei-Fei Li.", why: "A person before a title." },
      { anchorText: "A line the writer never wrote at all.", why: "Made up." },
    ],
  });

  const { critique: out, notesDropped } = guardCritique(input, content, matchKey(content));

  it("drops notes with hallucinated anchors or nothing left after stripping wording", () => {
    expect(notesDropped).toBe(2);
    expect(out.notes).toHaveLength(1);
    expect(out.notes[0].anchorText).toBe("She didn't build it alone.");
  });

  it("strips supplied wording from summary and drops a gutted question", () => {
    expect(out.summary).not.toContain("imagine fourteen million");
    expect(out.notes[0].question).toBeUndefined();
  });

  it("keeps only landed passages that quote the script (markdown emphasis ignored)", () => {
    expect(out.landed.map((l) => l.anchorText)).toEqual(["Her name is Fei-Fei Li."]);
  });

  it("guards streamed partials without dropping anything", () => {
    const partial = guardPartial({ notes: [{ issue: 'Say "the biggest unpaid workforce in history" instead.', anchorText: "x" }] }, matchKey(content));
    expect(partial.notes[0].issue).not.toContain("unpaid workforce");
    expect(partial.notes[0].anchorText).toBe("x");
  });

  it("hides a supplied line in the growing field before its closing quote arrives", () => {
    const key = matchKey(content);
    const open = guardPartial({ overview: 'The lenses agree the hook is slow. Open stronger, e.g. "Imagine a world where nobody saw the workers who' }, key);
    expect(open.overview).not.toContain("Imagine a world");
    expect(open.overview).toContain("The lenses agree the hook is slow.");
    // Settled fields (everything before the last value) are guarded as final text.
    const settled = guardPartial({ overview: 'A 27" monitor is the only prop the hook needs.', notes: [{ issue: "The reveal" }] }, key);
    expect(settled.overview).toBe('A 27" monitor is the only prop the hook needs.');
    const started = guardPartial({ overview: 'A 27" monitor is the only prop the hook needs.', notes: [] as Array<{ issue: string }> }, key);
    expect(started.overview).toBe('A 27" monitor is the only prop the hook needs.');
  });

  it("drops anchors too short to point at one place and stores the writer's own text", () => {
    const { critique: c, notesDropped: dropped } = guardCritique(
      critique(6, {}, {
        notes: [
          { anchorText: "it", issue: "The pronoun has no clear referent for a viewer who just arrived.", why: "Confusing.", category: "clarity", priority: "low" },
          { anchorText: "Her name is **Fei-Fei Li**.", issue: "The introduction names her before the viewer has a reason to care.", why: "Flat.", category: "hook", priority: "medium" },
        ],
        landed: [
          { anchorText: "a", why: "Short." },
          { anchorText: "She didn’t build it alone.", why: "A turn." },
        ],
      }),
      content
    );
    expect(dropped).toBe(1);
    expect(c.notes.map((n) => n.anchorText)).toEqual(["Her name is Fei-Fei Li."]);
    expect(c.landed.map((l) => l.anchorText)).toEqual(["She didn't build it alone."]);
  });

  it("keeps a section review's anchors inside the section and drops dismissed issues", () => {
    const notes: PersonaCritique["notes"] = [
      { anchorText: "She didn't build it alone.", issue: "The reveal arrives before the viewer knows why it matters to them.", why: "Early.", category: "hook", priority: "high" },
      { anchorText: "labelled fourteen million images for a few cents each", issue: "The pay detail is buried at the end of a long sentence here.", why: "Lost.", category: "clarity", priority: "medium" },
    ];
    const section = guardCritique(critique(6, {}, { notes }), content, matchKey(content), {
      section: "49,000 workers in 167 countries labelled fourteen million images for a few cents each.",
    });
    expect(section.notesDropped).toBe(1);
    expect(section.critique.notes.map((n) => n.category)).toEqual(["clarity"]);

    const dismissed = guardCritique(critique(6, {}, { notes }), content, matchKey(content), {
      dismissed: [
        { anchorText: "Her name is Fei-Fei Li. She didn't build it alone.", category: "hook" },
        { anchorText: "AI", category: "clarity" },
      ],
    });
    expect(dismissed.critique.notes.map((n) => n.category)).toEqual(["clarity"]);
  });

  it("keeps one score per criterion in rubric order and reports the missing ones", () => {
    const { critique: c, criteriaMissing } = guardCritique(
      critique(6, {}, {
        criteria: [
          { id: "pacing", score: 5, observation: "Sags." },
          { id: "hook", score: 4, observation: "First." },
          { id: "hook", score: 8, observation: "Second." },
        ],
      }),
      content
    );
    expect(c.criteria.map((x) => [x.id, x.score])).toEqual([
      ["hook", 4],
      ["pacing", 5],
    ]);
    expect(criteriaMissing).toHaveLength(CRITERIA.length - 2);
    expect(criteriaMissing).not.toContain("hook");

    const duplicated = critique(6, {}, { criteria: [{ id: "hook", score: 3, observation: "a" }, { id: "hook", score: 9, observation: "b" }] });
    const stored = parseStoredCritique({ runId: "run-x", result: "", structuredResult: JSON.stringify(duplicated) });
    expect(stored!.criteria).toEqual([{ id: "hook", score: 3, observation: "a" }]);
  });

  it("matches passages on whole words only", () => {
    expect(samePassage("put their names in the paper", "Nobody put their names in the paper.")).toBe(true);
    expect(samePassage("ames in the pape", "Nobody put their names in the paper.")).toBe(false);
    expect(samePassage("She didn’t build it alone.", "Her name is Fei-Fei Li. She didn't build it alone.")).toBe(true);
  });
});

describe("failed calls", () => {
  const usage = {
    inputTokens: 1000,
    inputTokenDetails: { noCacheTokens: 1000, cacheReadTokens: 0, cacheWriteTokens: 0 },
    outputTokens: 10200,
    outputTokenDetails: { textTokens: 200, reasoningTokens: 10000 },
    totalTokens: 11200,
  };
  const truncated = new NoObjectGeneratedError({
    message: "No object generated: could not parse the response.",
    text: '{"summary":"cut',
    response: { id: "r", timestamp: new Date(0), modelId: "m" },
    usage,
    finishReason: "length",
  });

  it("reads the usage of a call that produced no valid object", () => {
    expect(failureUsage(truncated)?.outputTokens).toBe(10200);
    expect(failureUsage(new Error("boom"))).toBeUndefined();
  });

  it("says when the model ran out of output room", () => {
    expect(describeFailure(undefined, truncated)).toMatch(/ran out of output room/);
    expect(describeFailure(undefined, new Error("Upstream model is overloaded"))).toBe("Upstream model is overloaded");
  });
});

describe("legacy critiques on read", () => {
  const summary = [
    "## Hook & Opening",
    "**Score: 6/10**",
    "",
    "The opening is relatable.",
    "",
    "> [!example] **Suggested Rewrite:** Add bracketed visual cues.",
    "> *[TEXT ON SCREEN: Rule #2: Version Your Endpoints]*",
    "> *[B-ROLL: Screen recording of Postman changing a URL]*",
    "",
    "**Suggested Rewrites:**",
    "1. End with: Check out the archive for your next project",
    "2. Add a subscribe line that sounds like the narrator",
    "",
    "- Refined hook: Forty nine thousand strangers built the future",
    "- Keep the personal tone.",
    "",
    "> [!tip] **Strong Points:**",
    "> - Personal tone",
    "",
    "## Suggested Rewrites",
    "Here are three alternatives:",
    "",
    "1. The Invisible Girl Who Taught Machines to See",
    "",
    "## Pacing",
    "Steady.",
  ].join("\n");

  it("drops rewrite callouts and labelled rewrite blocks, keeping the rest of the markdown", () => {
    const out = dropLegacyRewrites(summary);
    expect(out).not.toMatch(/TEXT ON SCREEN|B-ROLL|Suggested Rewrite|archive for your next project|subscribe line|Forty nine thousand|Invisible Girl/);
    expect(out).toContain("The opening is relatable.");
    expect(out).toContain("- Keep the personal tone.");
    expect(out).toContain("> [!tip] **Strong Points:**\n> - Personal tone");
    expect(out).toContain("## Pacing\nSteady.");
  });

  it("guards legacy summaries and criterion observations", () => {
    nextId = 600;
    const legacy = row({
      result: summary,
      structuredResult: JSON.stringify({
        criteria: [{ name: "Story Engine", score: 6, explanation: "Consider a clearer question spine per act (e.g., 'How does the dataset survive its own success?')." }],
        overallScore: 6,
      }),
    });
    const [group] = groupRuns([legacy]);
    const [lens] = resolveLenses(group, personas, content);
    expect(lens.critique!.summary).not.toMatch(/TEXT ON SCREEN|Forty nine thousand/);
    expect(lens.critique!.summary).toContain("The opening is relatable.");
    expect(lens.critique!.criteria[0].observation).not.toContain("How does the dataset survive");
    // Without guard content (score-only views) nothing is rewritten.
    expect(resolveLenses(group, personas)[0].critique!.summary).toBe(summary);
  });
});

describe("legacyToCritique", () => {
  it("normalises free-text criterion names and averages duplicates", () => {
    const c = legacyToCritique(
      JSON.stringify({
        criteria: [
          { name: "Hook & Opening", score: 8, explanation: "a" },
          { name: "Hook", score: 6, explanation: "b" },
          { name: "Something Unknown", score: 2 },
          { name: "Story Engine", score: "not a number" },
        ],
        overallScore: 7,
      }),
      "markdown"
    )!;
    expect(c.criteria).toEqual([{ id: "hook", score: 7, observation: "a" }]);
    expect(c.overallScore).toBe(7);
    expect(c.summary).toBe("markdown");
  });

  it("builds a summary from topPriorities when the model returned no text", () => {
    const c = legacyToCritique(JSON.stringify({ criteria: [], overallScore: 8, topPriorities: [{ description: "Cut the recap" }] }), "")!;
    expect(c.summary).toContain("1. Cut the recap");
  });

  it("falls back to the markdown overall score for text-only rows and null when nothing is usable", () => {
    expect(legacyToCritique("{not json", "### Overall: 6/10\nFine.")!.overallScore).toBe(6);
    expect(legacyToCritique(null, "no scores here")).toBeNull();
  });
});

describe("groupRuns", () => {
  it("groups legacy rows by version, skipping summaries, section reviews and failures", () => {
    nextId = 100;
    const rows = [
      legacyRow({ versionId: 10, versionNumber: 1, modelId: "openai/gpt-5.2", overall: 6 }),
      legacyRow({ versionId: 10, versionNumber: 1, modelId: "x-ai/grok-4", overall: 8 }),
      legacyRow({ versionId: 11, versionNumber: 2, modelId: "openai/gpt-5.2", overall: 7 }),
      legacyRow({ versionId: 11, versionNumber: 2, modelId: "x-ai/grok-4", overall: 9, sectionOnly: "A section" }),
      legacyRow({ versionId: 11, versionNumber: 2, modelId: "x-ai/grok-4", overall: 9, status: "error" }),
      row({ versionId: 11, versionNumber: 2, isMasterSummary: true }),
    ];
    const groups = groupRuns(rows);
    expect(groups.map((g) => g.runId)).toEqual([legacyRunId(11), legacyRunId(10)]);
    expect(groups.every((g) => g.legacy)).toBe(true);
    expect(groups[0].critiques).toHaveLength(1);
    expect(groups[1].critiques).toHaveLength(2);

    const summaries = groups.map((g) => summarizeRun(g, resolveLenses(g, personas)));
    expect(summaries[1]).toMatchObject({ versionNumber: 1, overallAverage: 7, lensCount: 2, failedLenses: 0, sectionOnly: false, costUsd: null });
    expect(summaries[0].overallAverage).toBe(7);
  });

  it("dedupes overlapping legacy runs on one version to the latest row per model", () => {
    nextId = 200;
    const rows = [
      legacyRow({ modelId: "openai/gpt-5.2", overall: 4 }),
      legacyRow({ modelId: "openai/gpt-5.2", overall: 8 }),
    ];
    const [group] = groupRuns(rows);
    const lenses = resolveLenses(group, personas);
    expect(lenses).toHaveLength(1);
    expect(lenses[0]).toMatchObject({ personaSlug: "openai/gpt-5.2", personaName: "GPT 5.2", status: "complete" });
    expect(lenses[0].critique!.overallScore).toBe(8);
  });

  it("groups new rows by run id, keeps a retried lens once and reads the saved synthesis", () => {
    nextId = 300;
    const rows = [
      row({ runId: "run-aaaa", personaId: 1, structuredResult: JSON.stringify(critique(8)), costUsd: 0.01 }),
      row({ runId: "run-aaaa", personaId: 2, status: "error", errorMessage: "Provider returned 500" }),
      row({ runId: "run-aaaa", personaId: 2, modelId: "gpt-6.1-terra", structuredResult: JSON.stringify(critique(6)), costUsd: 0.02 }),
      row({ runId: "run-aaaa", isMasterSummary: true, structuredResult: JSON.stringify({ overview: "Merged.", scoreTable: [], overall: { scores: {}, average: 7.5 } }), costUsd: 0.03 }),
    ];
    const [group] = groupRuns(rows);
    expect(group.legacy).toBe(false);
    expect(group.costUsd).toBeCloseTo(0.06);
    expect(group.summary?.id).toBe(303);

    const lenses = resolveLenses(group, personas);
    expect(lenses.map((l) => [l.personaSlug, l.status, l.modelName])).toEqual([
      ["story-architect", "complete", "Claude Sonnet 5.5"],
      ["skeptical-viewer", "complete", "GPT-6.1 Terra"],
    ]);
    expect(summarizeRun(group, lenses)).toMatchObject({ runId: "run-aaaa", overallAverage: 7.5, lensCount: 2, failedLenses: 0 });
    expect(synthesisForGroup(group, lenses, 1)).toMatchObject({ summaryId: 303, overview: "Merged." });
  });

  it("rebuilds a synthesis without an overview when the run has no saved summary", () => {
    nextId = 400;
    const rows = [
      row({ runId: "run-bbbb", personaId: 1, structuredResult: JSON.stringify(critique(8, { hook: 9 })) }),
      row({ runId: "run-bbbb", personaId: 2, status: "error", errorMessage: "Stopped" }),
    ];
    const [group] = groupRuns(rows);
    const lenses = resolveLenses(group, personas);
    const syn = synthesisForGroup(group, lenses, 1);
    expect(syn).toMatchObject({ summaryId: 0, overview: "", failedLenses: ["Skeptical Viewer"], overall: { average: 8 } });
    expect(syn.scoreTable.find((r) => r.criterionId === "hook")?.scores).toEqual({ "story-architect": 9 });
    expect(syn.lenses[1]).toMatchObject({ status: "error", error: "Stopped", critique: null });
  });
});

describe("buildTrendPoints", () => {
  it("uses each version's latest whole-script run and ignores section reviews", () => {
    nextId = 500;
    const rows = [
      legacyRow({ versionId: 10, versionNumber: 1, overall: 6, hook: 5 }),
      row({ versionId: 11, versionNumber: 2, runId: "run-old", personaId: 1, structuredResult: JSON.stringify(critique(5)) }),
      row({ versionId: 11, versionNumber: 2, runId: "run-new", personaId: 1, structuredResult: JSON.stringify(critique(8, { hook: 9 })) }),
      row({ versionId: 11, versionNumber: 2, runId: "run-sec", personaId: 1, sectionOnly: "A section", structuredResult: JSON.stringify(critique(2)) }),
      row({ versionId: 12, versionNumber: 3, runId: "run-fail", personaId: 1, status: "error" }),
    ];
    const groups = groupRuns(rows);
    const points = buildTrendPoints(groups, (g) => resolveLenses(g, personas));
    expect(points.map((p) => [p.versionNumber, p.overall])).toEqual([
      [1, 6],
      [2, 8],
    ]);
    expect(points[0].criteria).toEqual({ hook: 5, pacing: 6 });
    expect(points[1].criteria.hook).toBe(9);
  });
});

describe("helpers", () => {
  it("names stored model ids for display", () => {
    expect(modelDisplayName("claude-sonnet-5.5")).toBe("Claude Sonnet 5.5");
    expect(modelDisplayName("x-ai/grok-4.7")).toBe("Grok 4.7");
    expect(modelDisplayName("deepseek/deepseek-v3.2")).toBe("DeepSeek V3.2");
    expect(modelDisplayName("google/gemini-3.1-pro-preview")).toBe("Gemini 3.1 Pro Preview");
  });

  it("parses ids and legacy run ids strictly", () => {
    expect(parseId("12")).toBe(12);
    expect(parseId("0")).toBeNull();
    expect(parseId("1e3")).toBeNull();
    expect(parseId(null)).toBeNull();
    expect(parseLegacyRunId(legacyRunId(47))).toBe(47);
    expect(parseLegacyRunId("2f0c-uuid")).toBeNull();
  });

  it("ignores unusable stored syntheses", () => {
    expect(parseStoredSynthesis({ id: 1, structuredResult: "{}", createdAt: "" })).toBeNull();
    expect(parseStoredSynthesis(null)).toBeNull();
  });
});
