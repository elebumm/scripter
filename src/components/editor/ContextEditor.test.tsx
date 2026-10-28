import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ContextEditor, targetLengthChoices, targetLengthFromChoice } from "./ContextEditor";

describe("target length choices", () => {
  it("offers no target plus the kickoff presets", () => {
    expect(targetLengthChoices(1600)).toEqual([
      { value: "none", label: "No target" },
      { value: "500", label: "Short (~3 min)" },
      { value: "1000", label: "Medium (~6 min)" },
      { value: "1600", label: "Standard (~10 min)" },
      { value: "2400", label: "Long (~15 min)" },
      { value: "3900", label: "Documentary (~25 min)" },
    ]);
    expect(targetLengthChoices(null)).toHaveLength(6);
  });

  it("keeps a stored custom target as its own choice, in order", () => {
    const choices = targetLengthChoices(3000);
    expect(choices.map((c) => c.value)).toEqual(["none", "500", "1000", "1600", "2400", "3000", "3900"]);
    expect(choices.find((c) => c.value === "3000")?.label).toBe("~3,000 words");
  });

  it("maps a choice back to words, or null for no target", () => {
    expect(targetLengthFromChoice("2400")).toBe(2400);
    expect(targetLengthFromChoice("none")).toBeNull();
    expect(targetLengthFromChoice("0")).toBeNull();
    expect(targetLengthFromChoice("abc")).toBeNull();
  });
});

describe("ContextEditor", () => {
  it("renders collapsed with the brief's first line", () => {
    const html = renderToStaticMarkup(
      <ContextEditor
        context={"Concept: chips\nTone: dry"}
        onChange={() => {}}
        targetLength={1600}
        onTargetLengthChange={() => {}}
      />
    );
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain("Concept: chips");
    expect(html).not.toContain("Tone: dry");
  });
});
