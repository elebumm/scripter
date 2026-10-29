import { describe, expect, it } from "vitest";
import { CRITERIA } from "@/lib/llm/rubric";
import {
  clampWeight,
  formatPrice,
  lengthHint,
  movePersona,
  normalizeWeights,
  parseWpm,
  PERSONA_LIMITS,
  personaSaveError,
  sortPersonas,
  validatePersonaDraft,
} from "./settings-utils";

const personas = [
  { id: 10, position: 2 },
  { id: 11, position: 0 },
  { id: 12, position: 1 },
];

describe("persona order", () => {
  it("sorts by position then id", () => {
    expect(sortPersonas(personas).map((p) => p.id)).toEqual([11, 12, 10]);
    expect(sortPersonas([{ id: 2, position: 0 }, { id: 1, position: 0 }]).map((p) => p.id)).toEqual([1, 2]);
  });

  it("swaps with the neighbour and reports only changed positions", () => {
    const moved = movePersona(personas, 10, -1)!;
    expect(moved.ordered.map((p) => p.id)).toEqual([11, 10, 12]);
    expect(moved.changes).toEqual([
      { id: 10, position: 1 },
      { id: 12, position: 2 },
    ]);
  });

  it("densifies tied positions (legacy rows all at 0)", () => {
    const tied = [
      { id: 1, position: 0 },
      { id: 2, position: 0 },
      { id: 3, position: 0 },
    ];
    const moved = movePersona(tied, 3, -1)!;
    expect(moved.ordered.map((p) => [p.id, p.position])).toEqual([
      [1, 0],
      [3, 1],
      [2, 2],
    ]);
    expect(moved.changes).toEqual([
      { id: 3, position: 1 },
      { id: 2, position: 2 },
    ]);
  });

  it("refuses moves past either end or for unknown ids", () => {
    expect(movePersona(personas, 11, -1)).toBeNull();
    expect(movePersona(personas, 10, 1)).toBeNull();
    expect(movePersona(personas, 99, 1)).toBeNull();
  });
});

describe("criteria weights", () => {
  it("fills every criterion and clamps values", () => {
    const weights = normalizeWeights({ hook: 2, pacing: "1.5", voice: 9, clarity: -1, ending: "", bogus: 3 });
    expect(Object.keys(weights)).toEqual(CRITERIA.map((c) => c.id));
    expect(weights.hook).toBe(2);
    expect(weights.pacing).toBe(1.5);
    expect(weights.voice).toBe(3);
    expect(weights.clarity).toBe(0);
    expect(weights.ending).toBe(1);
    expect(weights["story-engine"]).toBe(1);
    expect("bogus" in weights).toBe(false);
  });

  it("rounds to quarter steps", () => {
    expect(clampWeight(1.3)).toBe(1.25);
    expect(clampWeight(Number.NaN)).toBe(1);
  });

  it("tolerates missing weights", () => {
    expect(Object.values(normalizeWeights(null)).every((w) => w === 1)).toBe(true);
  });
});

describe("validatePersonaDraft", () => {
  const ok = { name: "Story Architect", description: "", systemPrompt: "You are the story architect of this council.", modelSlug: "claude-sonnet-5.5" };
  it("accepts a complete draft", () => {
    expect(validatePersonaDraft(ok, ["claude-sonnet-5.5"])).toBeNull();
  });
  it("names the problem", () => {
    expect(validatePersonaDraft({ ...ok, name: " " }, [])).toMatch(/name/);
    expect(validatePersonaDraft({ ...ok, systemPrompt: "" }, [])).toMatch(/prompt/);
    expect(validatePersonaDraft({ ...ok, modelSlug: "x-ai/grok-4" }, ["claude-sonnet-5.5"])).toMatch(/model/);
  });
  it("mirrors the server's length limits with plain messages", () => {
    expect(validatePersonaDraft({ ...ok, systemPrompt: "Be blunt." }, [])).toBe("The persona prompt needs at least 20 characters.");
    expect(validatePersonaDraft({ ...ok, systemPrompt: `  ${"x".repeat(PERSONA_LIMITS.promptMin)}  ` }, [])).toBeNull();
    expect(validatePersonaDraft({ ...ok, systemPrompt: "x".repeat(PERSONA_LIMITS.promptMax + 1) }, [])).toBe("The persona prompt can be at most 20,000 characters.");
    expect(validatePersonaDraft({ ...ok, name: "n".repeat(81) }, [])).toBe("Keep the name to 80 characters.");
    expect(validatePersonaDraft({ ...ok, name: "n".repeat(80) }, [])).toBeNull();
    expect(validatePersonaDraft({ ...ok, description: "d".repeat(601) }, [])).toBe("Keep the description to 600 characters.");
  });
});

describe("lengthHint", () => {
  it("counts trimmed characters and flags what the server would refuse", () => {
    const prompt = { min: PERSONA_LIMITS.promptMin, max: PERSONA_LIMITS.promptMax };
    expect(lengthHint("  Be blunt.  ", prompt)).toEqual({ text: "9 characters (20 to 20,000).", outOfRange: true });
    expect(lengthHint("x".repeat(1592), prompt)).toEqual({ text: "1,592 characters (20 to 20,000).", outOfRange: false });
    expect(lengthHint("x".repeat(PERSONA_LIMITS.promptMax + 1), prompt).outOfRange).toBe(true);
    expect(lengthHint("d".repeat(601), { max: PERSONA_LIMITS.descriptionMax })).toEqual({
      text: "601 characters (up to 600).",
      outOfRange: true,
    });
    expect(lengthHint("", { max: PERSONA_LIMITS.descriptionMax }).outOfRange).toBe(false);
  });
});

describe("personaSaveError", () => {
  it("never shows the server's raw validation output", () => {
    expect(personaSaveError("Invalid request: ✖ Too small: expected string to have >=20 characters\n  → at systemPrompt")).toBe(
      "The persona prompt needs 20 to 20,000 characters."
    );
    expect(personaSaveError("Invalid request: ✖ Too big: expected string to have <=80 characters\n  → at name")).toMatch(
      /^Give this council member a name of up to 80/
    );
    expect(personaSaveError("Invalid request: ✖ Something new")).toBe("Couldn't save this council member. Check each field and try again.");
    expect(personaSaveError("Council member not found")).toBe("Council member not found");
  });
});

describe("formatPrice", () => {
  it("formats registry prices per 1M tokens", () => {
    expect(formatPrice(2)).toBe("$2");
    expect(formatPrice(0.1)).toBe("$0.10");
    expect(formatPrice(0.66)).toBe("$0.66");
    expect(formatPrice(0.825)).toBe("$0.825");
    expect(formatPrice(4.125)).toBe("$4.125");
    expect(formatPrice(1.98)).toBe("$1.98");
  });
});

describe("speaking rate", () => {
  it("parses typed values within range", () => {
    expect(parseWpm("155")).toBe(155);
    expect(parseWpm(" 160.4 ")).toBe(160);
    expect(parseWpm("")).toBeNull();
    expect(parseWpm("abc")).toBeNull();
    expect(parseWpm("20")).toBeNull();
    expect(parseWpm("1000")).toBeNull();
  });
});
