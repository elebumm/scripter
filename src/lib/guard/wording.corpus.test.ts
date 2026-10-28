// Realistic model output run through the "your words only" guard: lens notes,
// summaries, synthesis overviews, beat purposes and fact explanations. The
// diagnoses must come through untouched (finally and while streaming); the
// supplied lines must be removed, and must never show while they stream in.

import { describe, expect, it } from "vitest";
import { matchKey } from "@/lib/text/anchor";
import { stripSuppliedWording } from "./wording";

const SCRIPT = `# The Invisible Workforce

Her name is **Fei-Fei Li**. She didn’t build it alone.

By 2009, 49,000 workers in 167 countries labelled the images. Nobody remembers… nobody even asked.

She walked into the lab. [CUT TO: lab] The machines hummed through the night.

> [!note] Research
> Check the Mechanical Turk pay rates.

## The Reckoning

Nobody put their names in the paper. *Not one.*

- They were paid pennies per image.
- They never saw the finished dataset.

| Shot | Line |
| --- | --- |
| Wide of city | The city never sleeps at all |
`;
const key = matchKey(SCRIPT);

/** Diagnoses: must pass unchanged. */
const KEEP: string[] = [
  "The cold open explains the dataset before we know why it matters, so the stakes arrive late.",
  "The line “She didn’t build it alone” lands before we know who “she” is.",
  [
    "## Where the lenses agree",
    "",
    "All five lenses say the hook is slow.",
    "",
    "- **Story Architect:** the promise is late.",
    "- **Skeptical Viewer:** would leave at 0:40.",
    "  - The stat in the second paragraph has no source.",
    "",
    "## Work on first",
    "",
    "The cold open.",
  ].join("\n"),
  "Open with the reveal, then explain how the dataset was built.",
  "Consider moving the stat earlier so the scale lands before the story.",
  "Try cutting the second example; it repeats the first.",
  'Sources confirm "49,000 workers in 167 countries."',
  "The phrase 'Nobody remembers... nobody even asked' is strong, but it arrives after the viewer has lost the thread.",
  "A viewer might say this is the third time the point is made.",
  "This reads something like a Wikipedia summary of her career.",
  "The script should say who the workers were and what they were paid.",
  "Cut the list of awards and replace it with one specific human moment.",
  "Give the pay a reference point, e.g., compare it to a minimum wage so the number means something.",
  "The transition into The Reckoning skips why the dataset mattered (for example, which moment from their research shows this?).",
  "Details such as dates and places would ground the second act.",
  "The word *alone* is doing a lot of work here.",
  "The section headed *The Reckoning* never pays off the promise.",
  "Nothing in the draft says what “pennies per image” meant in dollars.",
  "The [CUT TO: lab] cue comes before we know why the lab matters.",
  "Jargon goes unexplained, e.g. Mechanical Turk is never defined.",
  "Hook: 6/10. The opening line is clear but the promise is vague.",
  "**Suggested focus:** tighten the middle section so the reveal lands.",
  'The table row "Wide of city" has no matching narration.',
  "It's the '90s all over again: the hook doesn't land until 0:40.",
  "The closing line, *Not one.*, is the strongest moment in the draft.",
  'Swap the order: "They never saw the finished dataset." should come before "They were paid pennies per image."',
  "Start with: the reveal.",
  "Try: moving the stat into the first ten seconds.",
  "The ending repeats the hook. Viewers need a reason to keep watching after the dataset is explained.",
  "Who were the 49,000? The draft never says, and the fact check can't confirm the 167 countries.",
  "The beat “She walked into the lab. The machines hummed through the night.” needs a reason to be here.",
  "Quote the paper directly or say where the numbers come from.",
  "Several terms go unexplained, e.g. RLHF, ImageNet and Mechanical Turk.",
  "> [!tip] **The cold open works.** The montage lands before the first question.",
  "Try: what if the cold open started with the dataset?",
  "For example, you mention Mechanical Turk but never explain what it paid.",
  "Rewrite it to be shorter, then let the stakes land.",
  "Open with *the reveal*, then the stakes.",
  "**Suggestion:**\n- Highlight what the workers were paid before the dataset.\n- Move the stat into the cold open.",
  "Better: The hook now lands in the first ten seconds.",
];

/** Supplied wording: `gone` must be removed, `kept` must survive. */
const STRIP: Array<{ text: string; gone: string; kept?: string }> = [
  { text: "Strong story. Open with: Imagine a world where nobody saw the workers.", gone: "Imagine a world", kept: "Strong story." },
  { text: "The turn lands flat. Try ‘It wasn’t the genius, it was the workers’ here.", gone: "the genius", kept: "The turn lands flat." },
  { text: "Open on the human cost, e.g. Somewhere in Nairobi a woman is clicking her ten-thousandth image of a cat tonight.", gone: "Nairobi", kept: "Open on the human cost" },
  { text: "For example, nobody knew their names and nobody thought to ask them.", gone: "nobody thought to ask" },
  { text: "Try: Nobody saw them. But they built everything.", gone: "they built everything" },
  { text: "Try 'Stop. Look closer.'", gone: "Look closer" },
  { text: "The opening is flat. Open with `Forty nine thousand strangers built the future for pennies` instead.", gone: "thousand strangers", kept: "The opening is flat." },
  { text: "A stronger first line:\n\n> Forty nine thousand strangers built the future for pennies.", gone: "thousand strangers", kept: "A stronger first line:" },
  { text: 'Swap "alone" for "single-handedly".', gone: "single-handedly", kept: '"alone"' },
  { text: "The hook needs a promise. *Nobody knew their names, but everyone used their work.*", gone: "everyone used their work", kept: "The hook needs a promise." },
  { text: "Rewrite it as nobody knew their names but everyone used their work.", gone: "everyone used their work" },
  { text: "Something like: nobody knew their names…", gone: "knew their names" },
  { text: "Open with a line such as: Every AI you use was taught by someone you will never meet.", gone: "taught by someone" },
  { text: "The ending fizzles. Close with “Every photo you tag trains a machine you'll never see.\"", gone: "Every photo", kept: "The ending fizzles." },
  { text: "You could say the workers were the real inventors of modern AI.", gone: "real inventors" },
  {
    text: "## Work on first\n\nThe cold open drags. A better opening line would be: By the end of this video you'll know who really built ImageNet.\n\n- Fix the pacing.",
    gone: "who really built ImageNet",
    kept: "## Work on first\n\nThe cold open drags. A better opening line would be: …\n\n- Fix the pacing.",
  },
  { text: "Hit the reveal, e.g. It wasn't one genius, it was forty-nine thousand strangers.", gone: "forty-nine thousand strangers", kept: "Hit the reveal" },
  { text: 'Sources put the figure at 49,000. Try "Almost fifty thousand people in 167 countries did the work" for accuracy.', gone: "Almost fifty thousand", kept: "for accuracy." },
  { text: "*[B-ROLL: Screen recording of the labelling interface with a timer running]*", gone: "labelling interface" },
  { text: "Add a cue like `[TEXT ON SCREEN: 49,000 workers. 167 countries. $0.02 an image.]`", gone: "$0.02", kept: "Add a cue like" },
  { text: "Show the code instead:\n\n```js\nconst workers = await turk.hire(49000);\n```", gone: "turk.hire", kept: "Show the code instead:" },
  { text: "The middle sags. Change it to: She kept going because nobody else would.", gone: "nobody else would", kept: "The middle sags." },
  { text: "Maybe 'this is where it all went wrong' instead.", gone: "went wrong", kept: "instead." },
  { text: 'Open stronger, e.g. "Imagine a world where\nnobody saw the workers."', gone: "nobody saw the workers" },
  { text: "The cold open is slow. Something punchier like: Every AI has a ghost in it.", gone: "ghost in it", kept: "The cold open is slow." },
  { text: "Lead with “Nobody asked.” instead.", gone: "Nobody asked", kept: "instead." },
  { text: "Instead of explaining the dataset, say: nobody knew who built it.", gone: "who built it", kept: "Instead of explaining the dataset" },
  { text: "The hook is slow. Open with a question: Who built ImageNet?", gone: "Who built ImageNet", kept: "The hook is slow." },
  { text: "Hit the reveal, e.g. Nobody saw them, nobody asked, nobody cared.", gone: "nobody cared", kept: "Hit the reveal" },
  { text: "The open is flat. Try **Every AI has a ghost in it**.", gone: "ghost in it", kept: "The open is flat." },
  { text: "Something like *nobody knew their names or asked them*.", gone: "their names" },
  { text: "- **Better:** Every AI you use was taught by someone you will never meet.", gone: "taught by someone", kept: "**Better:**" },
  { text: "Rephrase it as every AI you use was taught by someone you will never meet.", gone: "taught by someone" },
  // Reads as a list of things until the sentence arrives.
  { text: "Hit the reveal, e.g. Forty nine thousand strangers, one dataset, and then they built everything.", gone: "one dataset", kept: "Hit the reveal" },
  { text: "Suggestion: Let that sink in, because nobody else will.", gone: "sink in" },
  { text: "> [!example] **Suggested Rewrite**\n> Every AI you use was taught by someone you will never meet.", gone: "taught by someone", kept: "Suggested Rewrite" },
];

const strip = (text: string) => stripSuppliedWording(text, key);
const partial = (text: string) => stripSuppliedWording(text, key, { partial: true });

describe("wording guard corpus", () => {
  it("has a realistic spread", () => {
    expect(KEEP.length + STRIP.length).toBeGreaterThanOrEqual(25);
  });

  it.each(KEEP.map((text) => [text.split("\n")[0], text]))("keeps: %s", (_label, text) => {
    expect(strip(text)).toEqual({ text, tripped: false });
    expect(partial(text)).toEqual({ text, tripped: false });
  });

  it.each(STRIP.map((c) => [c.text.split("\n")[0], c] as const))("strips: %s", (_label, c) => {
    const r = strip(c.text);
    expect(r.tripped).toBe(true);
    expect(r.text).not.toContain(c.gone);
    if (c.kept) expect(r.text).toContain(c.kept);
    expect(r.text).toContain("…");
  });

  it.each(STRIP.map((c) => [c.text.split("\n")[0], c] as const))("never streams: %s", (_label, c) => {
    for (let n = 1; n <= c.text.length; n++) {
      const shown = partial(c.text.slice(0, n)).text;
      expect(shown, `after ${n} characters`).not.toContain(c.gone);
    }
  });

  it("streams diagnoses without changing settled text", () => {
    for (const text of KEEP) {
      for (let n = 1; n <= text.length; n++) {
        const shown = partial(text.slice(0, n)).text;
        // Whatever is shown is the start of the final text (or a hidden tail).
        expect(text.startsWith(shown.replace(/…$/, "").trimEnd()), `after ${n} characters of ${text}`).toBe(true);
      }
    }
  });
});
