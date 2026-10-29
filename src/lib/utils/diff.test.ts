import { describe, expect, it } from "vitest";
import { buildDiffView, countWords, formatDiffStats } from "./diff";

describe("countWords", () => {
  it("counts whitespace-separated words", () => {
    expect(countWords("")).toBe(0);
    expect(countWords("   \n ")).toBe(0);
    expect(countWords("one two\nthree  four")).toBe(4);
  });
});

describe("buildDiffView", () => {
  it("reports identical texts with no blocks", () => {
    const view = buildDiffView("Same text.\n", "Same text.\n");
    expect(view.blocks).toEqual([]);
    expect(view.stats).toEqual({ wordsAdded: 0, wordsRemoved: 0, passagesChanged: 0, identical: true });
    expect(formatDiffStats(view.stats)).toBe("No differences");
  });

  it("word-diffs an edited paragraph inline", () => {
    const before = "Intro line.\n\nThe server crashed on Tuesday.\n\nOutro.\n";
    const after = "Intro line.\n\nThe server crashed on a quiet Friday.\n\nOutro.\n";
    const view = buildDiffView(before, after);
    const changed = view.blocks.find((b) => b.kind === "changed");
    expect(changed).toBeDefined();
    if (changed?.kind !== "changed") throw new Error("expected a changed block");
    const added = changed.parts.filter((p) => p.kind === "added").map((p) => p.text.trim());
    const removed = changed.parts.filter((p) => p.kind === "removed").map((p) => p.text.trim());
    expect(removed.join(" ")).toContain("Tuesday");
    expect(added.join(" ")).toContain("Friday");
    expect(view.stats.passagesChanged).toBe(1);
    expect(view.stats.wordsRemoved).toBe(1);
    expect(view.stats.wordsAdded).toBe(3);
    expect(view.stats.identical).toBe(false);
  });

  it("counts pure additions and removals", () => {
    const view = buildDiffView("A.\nB.\n", "A.\nB.\nC new line here.\n");
    expect(view.blocks.at(-1)).toEqual({ kind: "added", text: "C new line here.\n" });
    expect(view.stats).toMatchObject({ wordsAdded: 4, wordsRemoved: 0, passagesChanged: 1 });

    const removed = buildDiffView("A.\nGone soon.\nB.\n", "A.\nB.\n");
    expect(removed.blocks.some((b) => b.kind === "removed" && b.text === "Gone soon.\n")).toBe(true);
    expect(removed.stats).toMatchObject({ wordsAdded: 0, wordsRemoved: 2, passagesChanged: 1 });
  });

  it("folds long unchanged stretches but keeps context around changes", () => {
    const same = Array.from({ length: 20 }, (_, i) => `Line ${i + 1}.\n`).join("");
    const view = buildDiffView(`${same}Old ending.\n`, `${same}New ending.\n`);
    // Leading unchanged run: everything but the last 2 lines is folded.
    expect(view.blocks[0]).toMatchObject({ kind: "fold", lines: 18 });
    expect(view.blocks[1]).toEqual({ kind: "same", text: "Line 19.\nLine 20.\n" });
    const fold = view.blocks[0];
    if (fold.kind !== "fold") throw new Error("expected fold");
    expect(fold.text.startsWith("Line 1.\n")).toBe(true);
    expect(fold.text.endsWith("Line 18.\n")).toBe(true);
  });

  it("does not fold short unchanged runs", () => {
    const view = buildDiffView("One.\nTwo.\nThree.\nOld.\n", "One.\nTwo.\nThree.\nNew.\n");
    expect(view.blocks.some((b) => b.kind === "fold")).toBe(false);
  });

  it("folds the middle of an unchanged run between two changes", () => {
    const middle = Array.from({ length: 10 }, (_, i) => `Mid ${i + 1}.\n`).join("");
    const view = buildDiffView(`Start A.\n${middle}End A.\n`, `Start B.\n${middle}End B.\n`);
    const kinds = view.blocks.map((b) => b.kind);
    expect(kinds).toEqual(["changed", "same", "fold", "same", "changed"]);
    expect(view.blocks[2]).toMatchObject({ kind: "fold", lines: 6 });
    expect(view.stats.passagesChanged).toBe(2);
  });
});

describe("formatDiffStats", () => {
  it("summarises words and passages", () => {
    expect(formatDiffStats({ wordsAdded: 1200, wordsRemoved: 45, passagesChanged: 6, identical: false })).toBe(
      "+1,200 words · −45 words · 6 passages changed"
    );
    expect(formatDiffStats({ wordsAdded: 0, wordsRemoved: 0, passagesChanged: 1, identical: false })).toBe(
      "Whitespace and line breaks only · 1 passage changed"
    );
  });
});
