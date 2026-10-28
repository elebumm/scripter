import { describe, expect, it } from "vitest";
import { countDropReasons, planNoteCarryOver, validateSynthesisNotes, type CarryOverNote } from "./synthesize";
import type { SynthesisOutput } from "./schemas";
import { markdownToPlain } from "@/lib/text/anchor";

const content = `# The Dataset

Her name is **Fei-Fei Li**. She didn't build it alone.

49,000 workers in 167 countries labelled fourteen million images for a few cents each.

## The Reckoning

Nobody put their names in the paper.`;

type SynthNote = SynthesisOutput["notes"][number];

function note(p: Partial<SynthNote>): SynthNote {
  return {
    anchorText: "She didn't build it alone.",
    issue: "The reveal arrives before the viewer knows why the workers matter to the story.",
    why: "The twist is spent before it can land.",
    category: "hook",
    priority: "high",
    personaSlugs: ["story-architect"],
    ...p,
  };
}

const ctx = {
  content,
  runSlugs: ["story-architect", "skeptical-viewer"],
  modelBySlug: { "story-architect": "Claude Sonnet 5.5", "skeptical-viewer": "GPT-6.1 Terra" },
};

describe("validateSynthesisNotes", () => {
  it("keeps a valid note, filters persona slugs to the run and fills source models", () => {
    const { kept, dropped } = validateSynthesisNotes(
      [note({ personaSlugs: ["story-architect", "skeptical-viewer", "made-up-lens", "story-architect"], question: "What should the viewer believe first?" })],
      ctx
    );
    expect(dropped).toBe(0);
    expect(kept).toEqual([
      {
        anchorText: "She didn't build it alone.",
        issue: "The reveal arrives before the viewer knows why the workers matter to the story.",
        why: "The twist is spent before it can land.",
        question: "What should the viewer believe first?",
        category: "hook",
        priority: "high",
        personaSlugs: ["story-architect", "skeptical-viewer"],
        sourceModels: ["Claude Sonnet 5.5", "GPT-6.1 Terra"],
      },
    ]);
  });

  it("accepts anchors copied from rendered text (markdown stripped, curly quotes) and stores the writer's text", () => {
    const { kept } = validateSynthesisNotes([note({ anchorText: "Her name is Fei-Fei Li. She didn’t build it alone." })], ctx);
    expect(kept.map((n) => n.anchorText)).toEqual(["Her name is Fei-Fei Li. She didn't build it alone."]);
  });

  it("stores the writer's own text, never wording the model hid inside an anchor", () => {
    const { kept } = validateSynthesisNotes(
      [
        note({ anchorText: "Her name is **Fei-Fei Li**." }),
        note({ anchorText: "She didn't build it alone.<!-- Open instead with the line Forty nine thousand strangers built the future -->", category: "pacing" }),
        note({ anchorText: "[Nobody put their names in the paper.](Say instead: history forgot every one of them)", category: "ending" }),
      ],
      ctx
    );
    expect(kept[0].anchorText).toBe("Her name is Fei-Fei Li.");
    const plain = markdownToPlain(content);
    for (const n of kept) {
      expect(plain).toContain(n.anchorText);
      expect(n.anchorText).not.toMatch(/Forty nine|history forgot/);
    }
  });

  it("drops anchors too short to point at one place", () => {
    const { kept, reasons } = validateSynthesisNotes([note({ anchorText: "Li" }), note({ anchorText: "a", category: "pacing" })], ctx);
    expect(kept).toHaveLength(0);
    expect(reasons).toEqual(["anchor", "anchor"]);
  });

  it("drops notes outside a reviewed section", () => {
    const { kept, reasons } = validateSynthesisNotes(
      [note({}), note({ anchorText: "Nobody put their names in the paper.", category: "ending" })],
      { ...ctx, section: "## The Reckoning\n\nNobody put their names in the paper." }
    );
    expect(reasons).toEqual(["section"]);
    expect(kept.map((n) => n.anchorText)).toEqual(["Nobody put their names in the paper."]);
  });

  it("keeps one source model per lens, even when two lenses ran the same model", () => {
    const { kept } = validateSynthesisNotes([note({ personaSlugs: ["story-architect", "script-doctor"] })], {
      ...ctx,
      runSlugs: ["story-architect", "script-doctor"],
      modelBySlug: { "story-architect": "Claude Sonnet 5.5", "script-doctor": "Claude Sonnet 5.5" },
    });
    expect(kept[0].personaSlugs).toEqual(["story-architect", "script-doctor"]);
    expect(kept[0].sourceModels).toEqual(["Claude Sonnet 5.5", "Claude Sonnet 5.5"]);
  });

  it("drops hallucinated anchors", () => {
    const { kept, reasons } = validateSynthesisNotes(
      [note({ anchorText: "They were never thanked for building the future." })],
      ctx
    );
    expect(kept).toHaveLength(0);
    expect(reasons).toEqual(["anchor"]);
  });

  it("strips supplied wording and drops notes left too thin", () => {
    const { kept, reasons } = validateSynthesisNotes(
      [
        note({ anchorText: "Nobody put their names in the paper.", issue: 'Try "history forgot every one of them" instead.', category: "ending" }),
        note({
          anchorText: "49,000 workers in 167 countries",
          issue: 'The number lands without scale; something like "a stadium full of people" would help the viewer picture it.',
          question: 'Could you say "a city of labellers" here?',
          category: "clarity",
        }),
      ],
      ctx
    );
    expect(reasons).toEqual(["wording"]);
    expect(kept).toHaveLength(1);
    expect(kept[0].issue).not.toContain("stadium");
    expect(kept[0].issue).toContain("The number lands without scale");
    expect(kept[0].question).toBeNull();
  });

  it("allows quotes of the writer's own text", () => {
    const { kept } = validateSynthesisNotes(
      [note({ issue: 'The line "Nobody put their names in the paper" is the real ending and arrives too late.', anchorText: "Nobody put their names in the paper." })],
      ctx
    );
    expect(kept[0].issue).toContain('"Nobody put their names in the paper"');
  });

  it("never resurfaces a dismissed issue and drops duplicates", () => {
    const { kept, reasons } = validateSynthesisNotes(
      [note({}), note({ issue: "Same anchor and category, said differently by another lens here." }), note({ category: "pacing" })],
      { ...ctx, dismissed: [{ anchorText: "Her name is Fei-Fei Li. She didn't build it alone.", category: "pacing" }] }
    );
    expect(reasons).toEqual(["duplicate", "dismissed"]);
    expect(kept).toHaveLength(1);
    expect(kept[0].category).toBe("hook");
  });

  it("ignores short dismissed anchors and only matches dismissals on whole words", () => {
    const longAnchor = "49,000 workers in 167 countries labelled fourteen million images for a few cents each.";
    const { kept, reasons } = validateSynthesisNotes(
      [note({ anchorText: longAnchor, category: "clarity" }), note({ anchorText: "She didn't build it alone.", category: "clarity" })],
      {
        ...ctx,
        dismissed: [
          { anchorText: "Li", category: "clarity" },
          { anchorText: "illion images for a few cents", category: "clarity" },
        ],
      }
    );
    expect(reasons).toEqual([]);
    expect(kept).toHaveLength(2);

    const { reasons: suppressed } = validateSynthesisNotes([note({ anchorText: longAnchor, category: "clarity" })], {
      ...ctx,
      dismissed: [{ anchorText: "fourteen million images", category: "clarity" }],
    });
    expect(suppressed).toEqual(["dismissed"]);
  });

  it("counts drop reasons", () => {
    expect(countDropReasons(["anchor", "anchor", "dismissed"])).toEqual({ anchor: 2, dismissed: 1 });
  });
});

describe("planNoteCarryOver", () => {
  const n = (id: number, p: Partial<CarryOverNote>): CarryOverNote => ({ id, runId: "run-prev", anchorText: "She didn't build it alone.", status: "open", ...p });

  it("addresses open notes whose anchor is gone and replaces the ones still present", () => {
    const plan = planNoteCarryOver({
      candidates: [
        n(1, { anchorText: "A sentence the writer has since cut." }),
        n(2, {}),
        n(3, { status: "dismissed", anchorText: "Gone too, but dismissed." }),
        n(4, { status: "addressed" }),
        n(5, { status: "addressed", runId: "run-older" }),
        n(6, { runId: "run-now" }),
        n(6, {}),
      ],
      runId: "run-now",
      previousRunId: "run-prev",
      content,
    });
    expect(plan).toEqual({ address: [1], move: [3, 4], remove: [2, 6], kept: [] });
  });

  it("keeps open notes outside a reviewed section and replaces those inside it", () => {
    const plan = planNoteCarryOver({
      candidates: [n(1, {}), n(2, { anchorText: "Nobody put their names in the paper." })],
      runId: "run-now",
      previousRunId: "run-prev",
      content,
      sectionOnly: "## The Reckoning\n\nNobody put their names in the paper.",
    });
    expect(plan).toEqual({ address: [], move: [1], remove: [2], kept: [] });
  });

  it("keeps the writer's open notes when this pass's notes were dropped and none replaced them", () => {
    const candidates = [
      n(1, {}),
      n(2, { anchorText: "Nobody put their names in the paper." }),
      n(3, { runId: "run-now", anchorText: "49,000 workers in 167 countries" }),
      n(4, { status: "dismissed" }),
    ];
    const base = { candidates, runId: "run-now", previousRunId: "run-prev", content };

    // Every note of the pass was dropped: nothing is replaced.
    expect(planNoteCarryOver({ ...base, replacedBy: [] })).toEqual({ address: [], move: [1, 2, 3, 4], remove: [], kept: [1, 2, 3] });
    // Some survived: only notes on the same passage as a saved note are replaced.
    expect(planNoteCarryOver({ ...base, replacedBy: ["Her name is Fei-Fei Li. She didn't build it alone."] })).toEqual({
      address: [],
      move: [2, 3, 4],
      remove: [1],
      kept: [2, 3],
    });
  });
});
