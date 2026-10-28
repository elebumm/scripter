import { describe, expect, it } from "vitest";
import {
  buildCritiquePrompt,
  buildSynthesisPrompt,
  CHANNEL_CONTEXT,
  CRITIQUE_OUTPUT_BUDGET,
  formatBrief,
  toPreviousNotes,
  YOUR_WORDS_ONLY,
  type PreviousNote,
} from "./prompts";
import { SCORE_ANCHORS } from "./rubric";
import { PERSONA_SEEDS } from "./personas";
import { isAllowedModelSlug } from "./models";
import type { PersonaCritique } from "./schemas";

const today = new Date("2026-10-27T12:00:00Z");
const content = "# The Dataset\n\nHer name is Fei-Fei Li. She didn't build it alone. 49,000 workers in 167 countries.";
const brief = { title: "The Invisible Workers", context: "Concept: who labelled ImageNet", targetLength: 3900 };
const storyArchitect = PERSONA_SEEDS.find((p) => p.slug === "story-architect")!;

function occurrences(hay: string, needle: string): number {
  return hay.split(needle).length - 1;
}

describe("buildCritiquePrompt", () => {
  const { system, prompt } = buildCritiquePrompt({ persona: storyArchitect, brief, content, today });

  it("puts persona, channel context, rubric anchors, rules, output budget and today's date in the system prompt", () => {
    expect(system.startsWith("You are the Story Architect")).toBe(true);
    expect(system).toContain(CHANNEL_CONTEXT);
    expect(system).toContain(SCORE_ANCHORS);
    expect(system).toContain(CRITIQUE_OUTPUT_BUDGET);
    expect(system).toContain("Today's date is 2026-10-27");
    expect(system).toContain("NOT an average");
  });

  it("includes the your-words-only rules exactly once", () => {
    expect(occurrences(system, YOUR_WORDS_ONLY)).toBe(1);
    expect(system).toContain("Never supply wording");
  });

  it("re-appends the rules when an edited persona prompt dropped them", () => {
    const edited = { name: "Tester", systemPrompt: "You are a tester with opinions.", criteriaWeights: {} };
    const out = buildCritiquePrompt({ persona: edited, brief, content, today });
    expect(occurrences(out.system, YOUR_WORDS_ONLY)).toBe(1);
  });

  it("marks the persona's heavier and lighter criteria in the rubric", () => {
    expect(system).toMatch(/\*\*hook\*\* — Hook & Opening \(weigh this heavily\)/);
    expect(system).toMatch(/\*\*visuals\*\* — Visual Direction \(lighter weight for you\)/);
  });

  it("gives the brief and the script in the user message", () => {
    expect(prompt).toContain("Title: The Invisible Workers");
    expect(prompt).toContain("about 3900 spoken words");
    expect(prompt).toContain("Concept: who labelled ImageNet");
    expect(prompt).toContain(`<script>\n${content}\n</script>`);
    expect(prompt).not.toContain("# Issues raised last time");
    expect(prompt).not.toContain("<section>");
  });

  it("lists issues raised last time with their statuses and no prior scores", () => {
    const previousNotes: PreviousNote[] = [
      { anchorText: "She didn't build it alone.", issue: "The reveal lands before the viewer knows the stakes.", status: "open", priority: "high", category: "hook" },
      { anchorText: "Her name is Fei-Fei Li.", issue: "The introduction is a job title, not a person.", status: "dismissed" },
      { anchorText: "49,000 workers in 167 countries.", issue: "The number has no human scale.", status: "addressed" },
    ];
    const out = buildCritiquePrompt({ persona: storyArchitect, brief, content, previousNotes, today });
    expect(out.prompt).toContain("# Issues raised last time");
    for (const n of previousNotes) expect(out.prompt).toContain(n.issue);
    expect(out.prompt).toContain("still open");
    expect(out.prompt).toContain("DISMISSED");
    expect(out.prompt).toContain("marked it addressed");
    expect(out.prompt).toContain("(high, hook)");
    // Stateless scoring: nothing that looks like a previous score.
    expect(out.prompt).not.toMatch(/\d+(\.\d+)?\s*\/\s*10/);
    expect(out.prompt.toLowerCase()).not.toContain("score");
  });

  it("adds a section block for section reviews", () => {
    const out = buildCritiquePrompt({ persona: storyArchitect, brief, content, sectionOnly: "She didn't build it alone.", today });
    expect(out.prompt).toContain("<section>\nShe didn't build it alone.\n</section>");
    expect(out.prompt).toContain("Every anchor must come from this section");
  });

  it("tells a section review only what the writer dismissed", () => {
    const previousNotes: PreviousNote[] = [
      { anchorText: "She didn't build it alone.", issue: "The reveal lands before the viewer knows the stakes.", status: "open" },
      { anchorText: "Her name is Fei-Fei Li.", issue: "The introduction is a job title, not a person.", status: "dismissed" },
    ];
    const out = buildCritiquePrompt({ persona: storyArchitect, brief, content, sectionOnly: "She didn't build it alone.", previousNotes, today });
    expect(out.prompt).toContain("# Issues the writer dismissed");
    expect(out.prompt).toContain("The introduction is a job title, not a person.");
    expect(out.prompt).not.toContain("# Issues raised last time");
    expect(out.prompt).not.toContain("The reveal lands before the viewer knows the stakes.");
  });
});

describe("formatBrief", () => {
  it("falls back for an empty title and missing notes", () => {
    const text = formatBrief({ title: "", context: "", targetLength: null });
    expect(text).toContain("Title: Untitled script");
    expect(text).toContain("(none given)");
    expect(text).not.toContain("Target length");
  });
});

describe("toPreviousNotes", () => {
  it("keeps issue and status only and treats unknown statuses as open", () => {
    expect(toPreviousNotes([{ anchorText: "a b c d", issue: "x", status: "weird", priority: "low", category: "other" }])).toEqual([
      { anchorText: "a b c d", issue: "x", status: "open", priority: "low", category: "other" },
    ]);
  });
});

describe("buildSynthesisPrompt", () => {
  const critique: PersonaCritique = {
    summary: "Strong premise, slow middle.",
    criteria: [{ id: "hook", score: 8, observation: "Opens on a question." }],
    overallScore: 7,
    notes: [
      {
        anchorText: "She didn't build it alone.",
        issue: "The reveal arrives before the viewer has a reason to care about it.",
        why: "It spends the twist early.",
        question: "What does the viewer need to believe first?",
        category: "hook",
        priority: "high",
      },
    ],
    landed: [{ anchorText: "Her name is Fei-Fei Li.", why: "Direct and human." }],
  };

  const { system, prompt } = buildSynthesisPrompt({
    brief,
    content,
    lenses: [{ slug: "story-architect", name: "Story Architect", modelName: "Claude Sonnet 5.5", critique }],
    failedLenses: ["Skeptical Viewer"],
    scoreTable: [{ criterionId: "hook", scores: { "story-architect": 8 }, average: 8 }],
    overall: { scores: { "story-architect": 7 }, average: 7 },
    previousNotes: [{ anchorText: "Her name is Fei-Fei Li.", issue: "Old dismissed issue about naming.", status: "dismissed" }],
    today,
  });

  it("carries the rules, the channel and the date, and tells the model not to score", () => {
    expect(system).toContain(YOUR_WORDS_ONLY);
    expect(system).toContain(CHANNEL_CONTEXT);
    expect(system).toContain("never produce scores");
    expect(system).toContain("Today's date is 2026-10-27");
  });

  it("tags every lens note with its slug and lists failed lenses, the score table and previous notes", () => {
    expect(prompt).toContain("## Lens story-architect: Story Architect (Claude Sonnet 5.5)");
    expect(prompt).toContain("Notes (slug story-architect)");
    expect(prompt).toContain("The reveal arrives before the viewer has a reason to care about it.");
    expect(prompt).toContain("These lenses failed and are not part of this pass: Skeptical Viewer.");
    expect(prompt).toContain("| Hook & Opening | 8 | 8 |");
    expect(prompt).toContain("Old dismissed issue about naming.");
    expect(prompt).toContain(`<script>\n${content}\n</script>`);
  });

  it("shows a section pass only the previous issues inside the section, plus dismissals", () => {
    const out = buildSynthesisPrompt({
      brief,
      content,
      sectionOnly: "49,000 workers in 167 countries.",
      lenses: [{ slug: "story-architect", name: "Story Architect", modelName: "Claude Sonnet 5.5", critique }],
      failedLenses: [],
      scoreTable: [],
      overall: { scores: {}, average: null },
      previousNotes: [
        { anchorText: "She didn't build it alone.", issue: "Outside the section, still open.", status: "open" },
        { anchorText: "49,000 workers in 167 countries.", issue: "Inside the section, still open.", status: "open" },
        { anchorText: "Her name is Fei-Fei Li.", issue: "Dismissed elsewhere.", status: "dismissed" },
      ],
      today,
    });
    expect(out.prompt).not.toContain("Outside the section, still open.");
    expect(out.prompt).toContain("Inside the section, still open.");
    expect(out.prompt).toContain("Dismissed elsewhere.");
    expect(out.prompt).toContain("Every anchor must come from this section");
  });
});

describe("PERSONA_SEEDS", () => {
  it("seeds the five lenses with the rules in every prompt and registry models", () => {
    expect(PERSONA_SEEDS.map((p) => p.slug)).toEqual([
      "story-architect",
      "skeptical-viewer",
      "clarity-editor",
      "creative-director",
      "script-doctor",
    ]);
    for (const p of PERSONA_SEEDS) {
      expect(p.systemPrompt).toContain(YOUR_WORDS_ONLY);
      expect(Object.keys(p.criteriaWeights)).toHaveLength(10);
      expect(isAllowedModelSlug(p.modelSlug)).toBe(true);
    }
    expect(Object.values(PERSONA_SEEDS.find((p) => p.slug === "script-doctor")!.criteriaWeights).every((w) => w === 1)).toBe(true);
  });
});
