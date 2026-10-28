import { describe, expect, it } from "vitest";
import {
  buildBeatCheckPrompt,
  buildBeatCheckSystemPrompt,
  buildBeatSuggestPrompt,
  buildBeatSuggestSystemPrompt,
  clampTargetSeconds,
  guardAiBeat,
  guardBeatCheckPartial,
  guardBeatSuggestionPartial,
  planBeatCheck,
  sanitizeBeatSuggestion,
  targetSecondsForWords,
  writerBeatMaterial,
  writerMaterialKey,
} from "./beats";
import type { Beat } from "@/types/review";

const draft = `## Cold open

Nobody remembers the people who labelled the photos. **49,000 of them**, in 167 countries.

## The lab

Fei-Fei Li had a problem: her models could not see.`;

function beat(overrides: Partial<Beat>): Beat {
  return {
    id: 1,
    scriptId: 7,
    position: 0,
    title: "Hook",
    purpose: "Make the viewer wonder who did the invisible work.",
    writerNotes: "",
    targetSeconds: 60,
    status: "planned",
    source: "ai",
    anchorText: null,
    createdAt: "2026-10-27 10:00:00",
    updatedAt: "2026-10-27 10:00:00",
    ...overrides,
  };
}

describe("targetSecondsForWords", () => {
  it("converts a word target to seconds at 155 wpm", () => {
    expect(targetSecondsForWords(1550)).toBe(600);
    expect(targetSecondsForWords(3900)).toBe(1510);
    expect(targetSecondsForWords(null)).toBeNull();
    expect(targetSecondsForWords(0)).toBeNull();
  });
});

describe("beat suggestion prompts", () => {
  it("carries the documentary structure rules", () => {
    const system = buildBeatSuggestSystemPrompt();
    for (const rule of ["Hook", "Setup", "Escalation", "Payoff", "CTA", "recontextualises"]) {
      expect(system).toContain(rule);
    }
  });

  it("forbids writing lines", () => {
    const system = buildBeatSuggestSystemPrompt();
    expect(system).toMatch(/never write narration, dialogue/i);
    expect(system).toMatch(/must DO for the viewer/);
    expect(system).toMatch(/Never the lines to say/);
    expect(buildBeatSuggestPrompt({ title: "", context: "", targetLength: null, draft: "", keptBeats: [] })).toMatch(
      /never write lines/i
    );
  });

  it("includes the brief, target runtime, kept beats and the draft", () => {
    const prompt = buildBeatSuggestPrompt({
      title: "The Hidden Workforce",
      context: "Concept: who labelled ImageNet",
      targetLength: 3100,
      draft,
      keptBeats: [{ title: "Cold open", purpose: "Hook on the invisible workers", status: "drafted" }, { title: "Tangent", purpose: "", status: "cut" }],
    });
    expect(prompt).toContain("Concept: who labelled ImageNet");
    expect(prompt).toContain("1200 seconds");
    expect(prompt).toContain("20:00");
    expect(prompt).toContain("Cold open - Hook on the invisible workers (already drafted)");
    expect(prompt).toContain("don't bring it back");
    expect(prompt).toContain("Fei-Fei Li had a problem");
  });

  it("doesn't teach the model a lead-in for sample lines", () => {
    expect(buildBeatSuggestSystemPrompt()).not.toMatch(/for example|e\.g\./i);
    expect(buildBeatCheckSystemPrompt()).not.toMatch(/for example|e\.g\./i);
    expect(buildBeatSuggestSystemPrompt()).toContain("whole seconds, 5-900");
  });

  it("says when there is no draft or target", () => {
    const prompt = buildBeatSuggestPrompt({ title: "T", context: "Concept: x", targetLength: null, draft: "  ", keptBeats: [] });
    expect(prompt).toContain("None yet. Plan from the brief alone.");
    expect(prompt).toContain("Not set.");
  });
});

describe("sanitizeBeatSuggestion", () => {
  const key = writerMaterialKey([draft, "Concept: who labelled ImageNet"]);

  it("strips supplied lines and drops beats left without substance", () => {
    const { suggestion, dropped, guardTripped } = sanitizeBeatSuggestion(
      {
        beats: [
          { title: "Hook", purpose: "Make the viewer wonder who did the invisible work behind every photo.", targetSeconds: 60 },
          { title: "Open on a line", purpose: 'Try "what if I told you a million strangers taught your phone to see".' },
          {
            title: "Stakes",
            purpose: 'Show why it matters, for example "this is the moment the whole industry changed" right before the reveal.',
          },
          { title: "Lab", purpose: "Intro." },
        ],
        rationale: "Front-load the mystery, then escalate through the lab's problems.",
      },
      key
    );
    expect(guardTripped).toBe(true);
    expect(dropped).toBe(2);
    expect(suggestion.beats.map((b) => b.title)).toEqual(["Hook", "Stakes"]);
    expect(suggestion.beats[0].targetSeconds).toBe(60);
    expect(suggestion.beats[1].purpose).not.toContain("the whole industry changed");
  });

  it("clamps out-of-range targets instead of failing the proposal", () => {
    const { suggestion, dropped } = sanitizeBeatSuggestion(
      {
        beats: [
          { title: "Hook", purpose: "Make the viewer wonder who did the invisible work.", targetSeconds: 4 },
          { title: "Escalation", purpose: "Each decision at the lab creates a new problem for the team.", targetSeconds: 960 },
          { title: "Turn", purpose: "The story stops going to plan when the funding runs out.", targetSeconds: 92.6 },
          { title: "Payoff", purpose: "Recontextualise the hook so the workers finally have faces.", targetSeconds: Number.NaN },
        ],
        rationale: "Short hook, long escalation.",
      },
      key
    );
    expect(dropped).toBe(0);
    expect(suggestion.beats.map((b) => b.targetSeconds)).toEqual([5, 900, 93, undefined]);
    expect(suggestion.beats[3]).not.toHaveProperty("targetSeconds");
  });

  it("keeps quotes of the writer's own draft", () => {
    const { suggestion, guardTripped } = sanitizeBeatSuggestion(
      {
        beats: [{ title: "Hook", purpose: 'Build on "Nobody remembers the people who labelled the photos" so the viewer wants names.' }],
        rationale: "",
      },
      key
    );
    expect(guardTripped).toBe(false);
    expect(suggestion.beats[0].purpose).toContain("Nobody remembers the people");
  });
});

describe("planBeatCheck", () => {
  const key = writerMaterialKey([draft]);
  const beats = [
    beat({ id: 1, status: "planned" }),
    beat({ id: 2, title: "The lab", status: "drafted", anchorText: "old anchor text here" }),
    beat({ id: 3, title: "Cut tangent", status: "cut" }),
    beat({ id: 4, title: "Payoff", status: "planned" }),
  ];

  it("accepts only anchors that quote the draft and never touches cut beats", () => {
    const plan = planBeatCheck({
      beats,
      content: draft,
      writerKey: key,
      check: {
        coverage: [
          { beatId: 1, covered: true, anchorText: "Nobody remembers the people who labelled the photos.", comment: "The open raises the question quickly and plainly." },
          { beatId: 2, covered: false, comment: "The lab section doesn't yet show what was at stake for her." },
          { beatId: 3, covered: true, anchorText: "Fei-Fei Li had a problem", comment: "Covered." },
          { beatId: 4, covered: true, anchorText: "And that is why the workers matter to all of us.", comment: "The ending lands the theme." },
          { beatId: 99, covered: true, anchorText: "Fei-Fei Li had a problem", comment: "Unknown beat." },
        ],
        missing: [],
      },
    });

    expect(plan.updates).toEqual([
      { id: 1, status: "drafted", anchorText: "Nobody remembers the people who labelled the photos." },
      { id: 2, status: "planned", anchorText: null },
    ]);
    expect(plan.anchorsAccepted).toBe(1);
    expect(plan.anchorsRejected).toBe(1);
    expect(plan.check.coverage.map((c) => c.beatId)).toEqual([1, 2, 4]);
    expect(plan.check.coverage[2]).toEqual({ beatId: 4, covered: true, comment: "The ending lands the theme." });
  });

  it("stores the draft's own text, not the model's copy of it", () => {
    const plan = planBeatCheck({
      beats,
      content: "Her name is “Fei-Fei Li” and she had a problem.",
      writerKey: key,
      check: { coverage: [{ beatId: 1, covered: true, anchorText: 'her name is "fei-fei li" and she', comment: "Clear." }], missing: [] },
    });
    expect(plan.updates).toEqual([{ id: 1, status: "drafted", anchorText: "Her name is “Fei-Fei Li” and she" }]);
    expect(plan.check.coverage[0].anchorText).toBe("Her name is “Fei-Fei Li” and she");
  });

  it("rejects anchors too short to point at one place", () => {
    const plan = planBeatCheck({
      beats,
      content: draft,
      writerKey: key,
      check: { coverage: [{ beatId: 1, covered: true, anchorText: "photos", comment: "Clear." }], missing: [] },
    });
    expect(plan.updates).toEqual([]);
    expect(plan.anchorsRejected).toBe(1);
  });

  it("accepts anchors copied across markdown emphasis", () => {
    const plan = planBeatCheck({
      beats,
      content: draft,
      writerKey: key,
      check: { coverage: [{ beatId: 1, covered: true, anchorText: "49,000 of them, in 167 countries.", comment: "Specific and strong." }], missing: [] },
    });
    expect(plan.updates).toEqual([{ id: 1, status: "drafted", anchorText: "49,000 of them, in 167 countries." }]);
  });

  it("guards comments and missing-beat proposals", () => {
    const plan = planBeatCheck({
      beats,
      content: draft,
      writerKey: key,
      check: {
        coverage: [{ beatId: 4, covered: false, comment: 'Try "and that is why we should remember them".' }],
        missing: [
          { title: "Who were the workers?", purpose: "Give the viewer one worker's life so the number becomes a person they care about." },
          { title: "Closing line", purpose: 'Something like "remember the hands behind the machine".' },
        ],
      },
    });
    expect(plan.check.coverage[0].comment).toBe("");
    expect(plan.check.missing.map((m) => m.title)).toEqual(["Who were the workers?"]);
    expect(plan.missingDropped).toBe(1);
  });
});

describe("beat check prompts", () => {
  it("lists active beats by id and excludes cut beats", () => {
    const prompt = buildBeatCheckPrompt({
      title: "The Hidden Workforce",
      context: "",
      content: draft,
      versionNumber: 3,
      beats: [beat({ id: 11, writerNotes: "Use the Kenya interview" }), beat({ id: 12, title: "Dropped idea", status: "cut" })],
    });
    expect(prompt).toContain("id 11: Hook (target 1:00)");
    expect(prompt).toContain("Writer's notes: Use the Kenya interview");
    expect(prompt).not.toContain("Dropped idea");
    expect(prompt).toContain("(version 3)");
    expect(buildBeatCheckSystemPrompt()).toMatch(/VERBATIM/);
  });

  it("withholds unverified anchors from partials", () => {
    const partial = guardBeatCheckPartial({ coverage: [{ beatId: 1, covered: true, anchorText: "made up", comment: "ok" }] }, key());
    expect(partial.coverage?.[0]).not.toHaveProperty("anchorText");
  });

  it("hides a supplied line in a comment whose quote hasn't closed yet", () => {
    const partial = guardBeatCheckPartial(
      {
        coverage: [
          { beatId: 1, covered: true, comment: "The open raises the question quickly." },
          { beatId: 2, covered: false, comment: 'The lab never lands. Open on "Every photo you have ever tagged trained a mach' },
        ],
        missing: [{ title: "Payoff", purpose: 'Close on "remember the hands behind the' }],
      },
      key()
    );
    expect(partial.coverage?.[0]?.comment).toBe("The open raises the question quickly.");
    expect(partial.coverage?.[1]?.comment).not.toContain("Every photo");
    expect(partial.missing?.[0]?.purpose).not.toContain("remember the hands");
  });
});

describe("guardBeatSuggestionPartial", () => {
  it("hides an open quote in the streaming beat and the rationale", () => {
    const partial = guardBeatSuggestionPartial(
      {
        beats: [
          { title: "Hook", purpose: "Make the viewer wonder who did the invisible work.", targetSeconds: 60 },
          { title: "Open", purpose: 'Open on "Every photo you have ever tagged trained a machine' },
        ],
        rationale: 'Start with "a million strangers taught your phone',
      },
      key()
    );
    expect(partial.beats?.[0]?.purpose).toBe("Make the viewer wonder who did the invisible work.");
    expect(partial.beats?.[1]?.purpose).not.toContain("Every photo");
    expect(partial.rationale).not.toContain("a million strangers");
  });

  it("sends only known fields and clamps targets", () => {
    const partial = guardBeatSuggestionPartial(
      { beats: [{ title: "Hook", purpose: "Make the viewer curious.", targetSeconds: 2, line: "Say this." } as never] },
      key()
    );
    expect(partial.beats?.[0]).toEqual({ title: "Hook", purpose: "Make the viewer curious.", targetSeconds: 5 });
  });
});

describe("clampTargetSeconds", () => {
  it("rounds into 5..900 and drops non-numbers", () => {
    expect(clampTargetSeconds(0)).toBe(5);
    expect(clampTargetSeconds(1510)).toBe(900);
    expect(clampTargetSeconds(59.5)).toBe(60);
    expect(clampTargetSeconds(Number.POSITIVE_INFINITY)).toBeUndefined();
    expect(clampTargetSeconds("90")).toBeUndefined();
    expect(clampTargetSeconds(undefined)).toBeUndefined();
  });
});

describe("guardAiBeat / writerBeatMaterial", () => {
  it("strips supplied wording before an AI beat is saved and refuses an empty one", () => {
    expect(guardAiBeat({ title: "Hook", purpose: "Make the viewer wonder who did the invisible work." }, key())).toEqual({
      title: "Hook",
      purpose: "Make the viewer wonder who did the invisible work.",
    });
    expect(guardAiBeat({ title: "Open", purpose: 'Try "what if I told you a million strangers taught your phone to see".' }, key())).toBeNull();
    expect(guardAiBeat({ title: '"Every photo you have ever tagged"', purpose: "Raise the stakes for the viewer early." }, key())).toBeNull();
    expect(guardAiBeat({ title: "Payoff", purpose: "" }, key())).toEqual({ title: "Payoff", purpose: "" });
  });

  it("counts only the writer's own beats and notes as their material", () => {
    expect(
      writerBeatMaterial([
        { title: "AI title", purpose: "AI purpose", writerNotes: "my note", source: "ai" },
        { title: "My beat", purpose: "My job", writerNotes: "", source: "writer" },
      ])
    ).toEqual(["my note", "My beat", "My job", ""]);
  });
});

function key() {
  return writerMaterialKey([draft]);
}
