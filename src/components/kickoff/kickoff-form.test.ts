import { describe, expect, it } from "vitest";
import {
  EMPTY_START_FRESH,
  canSuggestBeats,
  targetLengthLabel,
  toCreatePayload,
  wantsBeatSuggestion,
} from "./kickoff-form";

describe("toCreatePayload", () => {
  it("keeps an empty title empty and sends no content", () => {
    const payload = toCreatePayload({ ...EMPTY_START_FRESH, title: "   " });
    expect(payload).toEqual({ title: "", context: "", targetLength: 1600 });
    expect(payload).not.toHaveProperty("content");
  });

  it("turns the brief fields into the script context", () => {
    const payload = toCreatePayload({
      ...EMPTY_START_FRESH,
      title: "  The chip war ",
      concept: " How one company ended up making every chip ",
      themes: "supply chains, geopolitics",
      tone: "Informative",
      targetLength: 3900,
    });
    expect(payload).toEqual({
      title: "The chip war",
      context:
        "Concept: How one company ended up making every chip\nThemes: supply chains, geopolitics\nTone: Informative",
      targetLength: 3900,
    });
  });
});

describe("beat suggestion opt-in", () => {
  it("needs a concept", () => {
    expect(canSuggestBeats({ concept: "  " })).toBe(false);
    expect(canSuggestBeats({ concept: "A story" })).toBe(true);
  });

  it("only asks for beats when the box is ticked and there is a concept", () => {
    expect(wantsBeatSuggestion({ ...EMPTY_START_FRESH, suggestBeats: true })).toBe(false);
    expect(wantsBeatSuggestion({ ...EMPTY_START_FRESH, concept: "A story", suggestBeats: false })).toBe(false);
    expect(wantsBeatSuggestion({ ...EMPTY_START_FRESH, concept: "A story", suggestBeats: true })).toBe(true);
  });
});

describe("targetLengthLabel", () => {
  it("names presets and falls back to a word count", () => {
    expect(targetLengthLabel(1600)).toBe("Standard (~10 min)");
    expect(targetLengthLabel(1234)).toBe("~1,234 words");
    expect(targetLengthLabel(null)).toBeNull();
    expect(targetLengthLabel(0)).toBeNull();
  });
});
