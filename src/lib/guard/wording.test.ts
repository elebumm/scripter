import { describe, expect, it } from "vitest";
import { matchKey } from "@/lib/text/anchor";
import { isTooThin, stripSuppliedWording } from "./wording";

const script = [
  "Her name is Fei-Fei Li. She didn't build it alone. 49,000 workers in 167 countries.",
  "",
  "Nobody remembers... nobody even asked.",
  "",
  "She walked into the lab. [CUT TO: lab] The machines hummed through the night.",
].join("\n");
const key = matchKey(script);
const strip = (text: string) => stripSuppliedWording(text, key);
const partial = (text: string) => stripSuppliedWording(text, key, { partial: true });

describe("stripSuppliedWording", () => {
  it("keeps quotes of the writer's own text", () => {
    const r = strip('The line "She didn’t build it alone" lands too early.');
    expect(r.tripped).toBe(false);
    expect(r.text).toContain("She didn’t build it alone");
  });

  it("strips quoted replacement lines the writer didn't write", () => {
    const r = strip('Open stronger, e.g. "Imagine a world where nobody saw the workers."');
    expect(r.tripped).toBe(true);
    expect(r.text).not.toContain("Imagine a world");
  });

  it("strips curly-quoted and single-quoted suggestions", () => {
    expect(strip("Try “this is the moment everything changed forever”.").tripped).toBe(true);
    expect(strip("Maybe 'this is where it all went wrong' instead.").tripped).toBe(true);
  });

  it("strips explicit rewrite cues without quotes", () => {
    const r = strip("Rewrite it as nobody knew their names but everyone used their work.");
    expect(r.tripped).toBe(true);
    expect(r.text).not.toContain("nobody knew their names");
  });

  it("leaves short quotes, apostrophes and plain diagnosis alone", () => {
    for (const text of [
      'The word "alone" is doing a lot of work.',
      "The writer's framing here is vague about who the workers were.",
      "This transition skips the reason the dataset mattered.",
    ]) {
      expect(strip(text)).toEqual({ text, tripped: false });
    }
  });

  describe("keeps markdown structure (findings 2, 23)", () => {
    const overview = [
      "## Where the lenses agree",
      "",
      "All five say the hook is slow.",
      "",
      "- Story Architect: the promise is late.",
      "- Skeptical Viewer: would leave at 0:40.",
      "  - The stat in line two has no source.",
      "",
      "    indented code stays indented",
      "",
      "## Work on first",
      "",
      "The cold open.  ",
      "A hard break above.",
    ].join("\n");

    it("returns untouched markdown unchanged", () => {
      expect(strip(overview)).toEqual({ text: overview, tripped: false });
      expect(partial(overview)).toEqual({ text: overview, tripped: false });
    });

    it("keeps paragraph breaks and other spacing when something is stripped", () => {
      const text = overview.replace(
        "All five say the hook is slow.",
        'All five say the hook is slow. Open stronger, e.g. "Imagine a world where nobody saw the workers."'
      );
      const r = strip(text);
      expect(r.tripped).toBe(true);
      expect(r.text).toBe(overview.replace("All five say the hook is slow.", "All five say the hook is slow. Open stronger, e.g. …"));
    });

    it("keeps a blank line around a stripped blockquote", () => {
      const r = strip("A stronger first line:\n\n> Forty nine thousand strangers built the future for pennies.\n\nThen the stakes.");
      expect(r).toEqual({ text: "A stronger first line:\n\n…\n\nThen the stakes.", tripped: true });
    });
  });

  describe("catches lead-ins and quoting forms (findings 6, 12, 24)", () => {
    it.each([
      ["Open with:", "Strong story. Open with: Imagine a world where nobody saw the workers.", "Imagine a world", "Strong story. Open with: …"],
      ["unquoted e.g.", "Open on the human cost, e.g. Somewhere in Nairobi a woman is clicking her ten-thousandth image.", "Nairobi", "Open on the human cost, e.g. …"],
      ["for example:", "for example: Every photo you tag trains a machine you'll never see.", "Every photo", "for example: …"],
      ["sentence-initial For example,", "For example, nobody knew their names and nobody thought to ask them.", "nobody thought", "For example, …"],
      ["for instance:", "Make it concrete, for instance: The machines never slept, and neither did they.", "neither did they", "Make it concrete, for instance: …"],
      ["bare Try: with two sentences", "Try: Nobody saw them. But they built everything.", "built everything", "Try: …"],
      ["Try with a short quote", "Try 'Stop. Look closer.'", "Look closer", "Try …"],
      ["such as:", "Open with a line such as: Every AI you use was taught by someone you will never meet.", "taught by", "Open with a line such as: …"],
      ["a line like:", "Open with a line like: Every AI you use was taught by someone you will never meet.", "taught by", "Open with a line like: …"],
      ["curly single quotes with an apostrophe", "The turn lands flat. Try ‘It wasn’t the genius, it was the workers’ here.", "genius", "The turn lands flat. Try … here."],
      ["straight single quotes with an apostrophe", "Consider 'It wasn't the genius, it was the workers' here.", "genius", "Consider … here."],
      ["mixed double quotes", "Close with “Every photo you tag trains a machine you'll never see.\"", "Every photo", "Close with …"],
      ["a quote across a line break", 'Open stronger, e.g. "Imagine a world where\nnobody saw the workers."', "nobody saw", "Open stronger, e.g. …"],
      ["a backtick span", "Open with `Forty nine thousand strangers built the future for pennies` instead.", "strangers", "Open with … instead."],
      ["a blockquote line", "Something sharper:\n> Forty nine thousand strangers built it", "strangers", "Something sharper:\n…"],
      ["a capitalised italic line", "The hook needs a promise. *Nobody knew their names, but everyone used their work.*", "everyone used", "The hook needs a promise. …"],
      ["a one-word swap", 'Swap "alone" for "single-handedly".', "single-handedly", 'Swap "alone" for …'],
      ["Instead of X, say:", "Instead of explaining the dataset, say: nobody knew who built it.", "who built it", "Instead of explaining the dataset, say: …"],
      ["Consider saying", "Consider saying nobody knew who built it.", "who built it", "Consider saying …"],
      ["The line could be:", "The line could be: Nobody knew who built it.", "who built it", "The line could be: …"],
      ["Open with a question:", "Open with a question: Who built it?", "Who built", "Open with a question: …"],
      ["a question as the line", "Try: Who built ImageNet?", "Who built", "Try: …"],
      ["Something like:", "Something like: nobody knew their names…", "nobody knew", "Something like: …"],
      ["a cue bracket", "Add *[B-ROLL: Screen recording of the labelling queue]* here.", "labelling queue", "Add … here."],
      ["fenced code", "Show it like this:\n\n```js\nconst workers = await hire(49000);\n```", "hire(", "Show it like this:\n\n…"],
      ["a better line would be:", "A better opening line would be: Nobody remembers the workers.", "remembers the workers", "A better opening line would be: …"],
      ["a parenthesised e.g. sentence", "Open on the cost (e.g. Somewhere a woman is clicking her ten-thousandth image.)", "ten-thousandth", "Open on the cost (e.g. …)"],
      ["chained swaps", "Balance it (e.g., change 'Woman' to 'Engineer' or 'Architect').", "Architect", "Balance it (e.g., change 'Woman' to … or …)."],
      ["a triplet that reads as a line", "Hit the reveal, e.g. Nobody saw them, nobody asked, nobody cared.", "nobody cared", "Hit the reveal, e.g. …"],
    ])("%s", (_label, text, gone, expected) => {
      const r = strip(text);
      expect(r.tripped).toBe(true);
      expect(r.text).not.toContain(gone);
      expect(r.text).toBe(expected);
    });
  });

  describe("leaves ordinary diagnosis alone (finding 8)", () => {
    it.each([
      "This reads something like a Wikipedia summary of her career.",
      "A viewer might say this is the third time the point is made.",
      "The script should say who the workers were and what they were paid.",
      "Try opening with the moment she first saw the finished dataset.",
      "Cut the list of awards and replace it with one specific human moment.",
      "The writer should write toward the reveal instead of explaining it first.",
      "Could you try opening with the moment she first saw the data?",
      "Open with the reveal, then explain how the dataset was built.",
      "Consider moving the stat earlier so the scale lands first.",
      "Try cutting the second example; it repeats the first.",
      "Give the pay a reference point, e.g., compare it to a minimum wage.",
      "The beat is missing a cost (for example, which moment from their research shows this?).",
      "Details such as dates and places would ground the second act.",
      "Some claims need a source, for example: the 49,000 figure and the 167 countries.",
      "Jargon goes unexplained, e.g. Mechanical Turk is never defined.",
      "Specify exact screen actions (e.g., AOL CD spinning, Motorola flip-phone UI) to guide the editor.",
      "Several terms go unexplained, e.g. RLHF, ImageNet and Mechanical Turk.",
      "Name a real company, e.g. Stripe, Twilio or GitHub, so the stakes feel concrete.",
      "Open with: AOL, Motorola and Symbian.",
      "Try: what if the cold open started with the dataset?",
      "Try: What if you opened on the dataset instead?",
      "The hook promises a mystery: who built ImageNet?",
      "Two problems: the hook is slow and the ending repeats it.",
      "Viewers will say: this is just another AI explainer?",
      "Make the pain point more technical (e.g., distributed tracing or silent failures).",
      "Consider a tighter 'what happens next' prediction to keep the comments going.",
      "The phrase *this one kept breaking* is vague.",
      "Hook: 6/10. The opening line is clear but the promise is vague.",
      "Try: moving the stat into the first ten seconds.",
      "Start with: the reveal.",
      "You could say more about who the workers were.",
    ])("%s", (text) => {
      expect(strip(text)).toEqual({ text, tripped: false });
    });
  });

  describe("re-check: labels, emphasis and diagnosis around cues (findings 6, 8, 12, 24)", () => {
    it.each([
      "For example, you mention ImageNet but never explain what it is.",
      "For example, you never say who the workers were.",
      "E.g. You jump from 2009 to today without a bridge.",
      "For example, we never learn what the workers were paid.",
      "Rewrite it to be shorter and punchier.",
      "Rewrite this to remove the passive voice.",
      "Rephrase it to make the stakes clearer.",
      "Try saying it out loud; it runs long.",
      "Try *moving the stat earlier*.",
      "Open with *the reveal*, then the stakes.",
      "Start with *why*, not *how*.",
      "End on *the workers*.",
      "Close on **her name**.",
      "**Hook:** the cold open lands, but the promise comes late.",
      "Better: The hook now lands in the first ten seconds.",
      "Even better: the hook now lands in the first ten seconds.",
      "The hook is better: It lands faster now.",
      "Suggestion: Move the stat earlier.",
      "**Suggestion:**\n- Highlight a benefit for subscribing, such as continuous learning.",
      "Alternative: Open on the dataset itself.",
      "Example: The second paragraph repeats the hook.",
      "Consider: what if the stat came first?",
      "Consider: the viewer doesn't know who she is yet.",
      "Open with: the moment she first saw the finished dataset, then the stakes.",
      "> [!tip] **New hook works**\n> The cold open now lands the promise in ten seconds.",
    ])("keeps %s", (text) => {
      expect(strip(text)).toEqual({ text, tripped: false });
      expect(partial(text)).toEqual({ text, tripped: false });
    });

    it.each([
      ["Better: Nobody saw them coming, and nobody asked.", "Better: …"],
      ["**Suggestion:** Nobody saw them coming, and nobody asked.", "**Suggestion:** …"],
      ["- **Better:** Nobody saw them coming.", "- **Better:** …"],
      ["Alternative: Nobody saw them coming.", "Alternative: …"],
      ["Example: Nobody saw them coming, and nobody asked.", "Example: …"],
      ["Consider: Nobody saw them coming, and nobody asked.", "Consider: …"],
      ["Here is one way to phrase it: Nobody saw them coming.", "Here is one way to phrase it: …"],
      ["Like this: Nobody saw them coming.", "Like this: …"],
      ["Make it: Nobody saw them coming.", "Make it: …"],
      ["It could read: Nobody saw them coming.", "It could read: …"],
      ["Rephrase it as nobody saw them coming and nobody asked.", "Rephrase it as …"],
      ["Reword it to nobody saw them coming and nobody asked.", "Reword it to …"],
      ["Rewrite it to nobody saw them coming and nobody asked.", "Rewrite it to …"],
      ["Try saying nobody saw them coming and nobody asked.", "Try saying …"],
      ["Try **Nobody saw them coming**.", "Try …"],
      ["Open with ***Nobody saw them coming, and nobody asked.***", "Open with …"],
      ["Something like *nobody knew their names or asked them*.", "Something like …"],
      ["Hit the reveal, e.g. You use it every day and never think about who built it.", "Hit the reveal, e.g. …"],
      ["Suggestion: Let that sink in.", "Suggestion: …"],
      ["Example: Ask yourself who built it.", "Example: …"],
      ["> [!example] **Suggested Rewrite**\n> Nobody saw them coming, and nobody asked.", "> [!example] **Suggested Rewrite**\n> …"],
    ])("strips %s", (text, expected) => {
      expect(strip(text)).toEqual({ text: expected, tripped: true });
    });

    it("keeps a callout whose title only sounds like a rewrite, and the writer's line under a rewrite title", () => {
      for (const text of [
        "> [!tip] **Rewrite the call to action**\n> The ending asks for a subscribe before it earns one.",
        "> [!example] **Suggested rewrite**\n> She didn't build it alone.",
      ]) {
        expect(strip(text)).toEqual({ text, tripped: false });
      }
    });

    it("strips a quote that never closes, as the partial guard hid it (finding 7)", () => {
      const text = 'The hook is slow. Open with "Imagine a world where nobody saw the workers';
      expect(strip(text)).toEqual({ text: "The hook is slow. Open with …", tripped: true });
      expect(partial(text).text).toBe("The hook is slow. Open with …");
      expect(strip('Open with "Imagine a world where nobody saw\n\nThe stakes come late.')).toEqual({
        text: "Open with …\n\nThe stakes come late.",
        tripped: true,
      });
      for (const kept of ['The 27" monitor shot is never set up.', 'The word "alone is doing a lot.', 'The line "She didn’t build it alone lands early']) {
        expect(strip(kept)).toEqual({ text: kept, tripped: false });
      }
    });

    it("strips an uncued line-like quote that never closes", () => {
      expect(strip('The hook is slow. The first line should be "Imagine a world where nobody saw the workers who built it.')).toEqual({
        text: "The hook is slow. The first line should be …",
        tripped: true,
      });
      expect(strip('The hook is slow. “Imagine a world where nobody saw the workers who built it.\n\nThe middle sags.')).toEqual({
        text: "The hook is slow. …\n\nThe middle sags.",
        tripped: true,
      });
      // Short, lowercase or the writer's own opening words: more likely a quote of the writer missing its closer.
      for (const kept of ['The phrase "Nobody cares here.', 'Here "the workers who built it never get a name.', 'The beat "She walked into the lab at night is slow.']) {
        expect(strip(kept)).toEqual({ text: kept, tripped: false });
      }
    });

    it("reads thousands separators as the same number (finding 33)", () => {
      const text = 'Sources say "49000 workers in 167 countries" is right.';
      expect(strip(text)).toEqual({ text, tripped: false });
    });
  });

  describe("tells the model's own asides from supplied lines", () => {
    it.each([
      "> [!tip] **The technical concepts are handled well.** The serverless explanation is clear without being condescending.",
      "> ⚠️ **Key Tension:** Fei-Fei Li didn't accidentally build ImageNet. She built it deliberately, against resistance.",
      "> **Evaluator's Note:** You selected only the title for this focused evaluation.",
      "*Note: Prior version scored 9.5/10. This review tracks changes against that baseline.*",
      "Try: ‘She didn’t build it alone’ earlier in the cold open.",
    ])("keeps %s", (text) => {
      expect(strip(text)).toEqual({ text, tripped: false });
    });

    it.each([
      ["a bold first word", "> **Nobody** knew their names, and nobody thought to ask."],
      ["a narration line with a colon", "> Rule one: never trust what the machine tells you."],
    ])("strips a blockquoted line with %s", (_label, text) => {
      expect(strip(text)).toEqual({ text: "…", tripped: true });
    });
  });

  describe("recognises the writer's words despite drift (finding 33)", () => {
    it.each([
      ["punctuation inside the quotes", 'Sources confirm "49,000 workers in 167 countries."'],
      ["a trailing comma", 'The line "She didn\'t build it alone," arrives before the stakes.'],
      ["case drift", 'The line "SHE DIDN’T BUILD IT ALONE" is shouted.'],
      ["dash and quote drift", "‘Her name is Fei Fei Li’ is a flat way in."],
      ["a quote that skips a cue", '"She walked into the lab. The machines hummed through the night." is one breath too long.'],
      ["an elided quote", 'The line "Her name is Fei-Fei Li … 49,000 workers in 167 countries" packs two ideas.'],
      ["the writer's own ellipsis", 'The beat "Nobody remembers... nobody even asked" is the strongest.'],
    ])("%s", (_label, text) => {
      expect(strip(text)).toEqual({ text, tripped: false });
    });

    it("still strips new wording dressed up with the writer's words", () => {
      expect(strip('"Imagine a world where nobody saw the workers."').tripped).toBe(true);
      // Single words stitched across an elision are not a quote of the writer.
      expect(strip('Try "nobody … workers … lab … night" as the open.').tripped).toBe(true);
    });
  });

  describe("partial mode (findings 7, 39, 57)", () => {
    it.each([
      ["an open straight quote", 'The hook is slow. Open stronger, e.g. "Imagine a world where nobody saw the workers who', "Imagine"],
      ["an open quote with no cue", 'Open with "An army of strangers built the thing that taught machines to', "army of strangers"],
      ["an open curly quote", "Open with “Forty nine thousand strangers built the future for pennies", "strangers"],
      ["an apostrophe inside an open curly single quote", "Consider ‘It wasn’", "It wasn"],
      ["the rest of a curly single quote", "Consider ‘It wasn’t the gen", "wasn’t the"],
      ["an open straight single quote", "Consider 'It wasn't the gen", "wasn't the"],
      ["an open backtick", "Open with `Forty nine thou", "Forty nine"],
      ["an unfinished Try: clause", "The hook is slow. Try: Nob", "Nob"],
      ["an unfinished e.g. clause", "The hook is slow, e.g. Imag", "Imag"],
      ["an unfinished rewrite clause", "Rewrite it as nobody", "nobody"],
      ["an open italic line", "The hook needs a promise. *Nobody knew their", "Nobody knew"],
      ["an open blockquote line", "Something sharper:\n\n> Forty nine", "Forty nine"],
      ["an open code fence", "Show it:\n\n```js\nconst workers = hire(", "hire("],
    ])("hides %s", (_label, text, hidden) => {
      const r = partial(text);
      expect(r.text).not.toContain(hidden);
      expect(r.text.endsWith("…")).toBe(true);
    });

    it("keeps an unfinished quote of the writer's own words", () => {
      expect(partial('The line "She didn’t bui')).toEqual({ text: 'The line "She didn’t bui', tripped: false });
      expect(partial("The line ‘She didn’t build it alone’ lands")).toEqual({
        text: "The line ‘She didn’t build it alone’ lands",
        tripped: false,
      });
    });

    it("never hides complete text that the final guard keeps", () => {
      for (const text of [
        "The writer's framing is vague; it's unclear who the workers were.",
        'The word "alone" is doing a lot of work.',
        "The line ‘She didn’t build it alone’ lands too early.",
        "It's the '90s all over again: the hook doesn't land until 0:40.",
        "Rock 'n' roll energy is missing from the cold open.",
        "The 27\" monitor shot is never set up.",
        "Use `useEffect` only once the stakes are clear.",
        "The *real* problem is the second act.",
        "Open with the reveal. Try cutting the second example.",
      ]) {
        expect(partial(text)).toEqual(strip(text));
        expect(partial(text)).toEqual({ text, tripped: false });
      }
    });

    it("strips closed spans exactly like the final guard", () => {
      const text = 'The hook is slow. Open stronger, e.g. "Imagine a world where nobody saw the workers." Then the stakes.';
      expect(partial(text)).toEqual(strip(text));
    });
  });
});

describe("isTooThin", () => {
  it("flags items gutted by the guard", () => {
    expect(isTooThin("Try …")).toBe(true);
    expect(isTooThin("The hook front-loads context before any question.")).toBe(false);
  });
});
