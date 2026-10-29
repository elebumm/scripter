import { describe, expect, it } from "vitest";
import type { Note } from "@/types";
import { groupNotes, withStaleness } from "./useNotes";
import { buildNotesExport, scriptFilename, slugifyTitle } from "@/lib/utils/export";
import { clampWordsPerMinute, DEFAULT_WORDS_PER_MINUTE } from "@/stores/app-store";

function note(id: number, anchorText: string, extra: Partial<Note> = {}): Note {
  return {
    id,
    scriptId: 1,
    versionId: 1,
    runId: "run",
    anchorText,
    issue: `Issue ${id}`,
    why: "",
    question: null,
    category: "pacing",
    priority: "medium",
    personaSlugs: ["story-architect"],
    sourceModels: ["Claude Sonnet 5.5"],
    status: "open",
    statusChangedAt: null,
    createdAt: "2026-10-27 10:00:00",
    ...extra,
  };
}

const SCRIPT = "## Act 1\n\nThe **fab** was silent at 3 a.m. — nobody talked.\n\n- A list item that stays";

describe("withStaleness / groupNotes", () => {
  it("checks anchors against the rendered text, markdown and punctuation included", () => {
    const notes = withStaleness(
      [
        note(1, "The fab was silent at 3 a.m."),
        note(2, "The **fab** was silent"),
        note(3, "- A list item that stays"),
        note(4, "nobody talked."),
        note(5, "a passage the writer has since rewritten"),
      ],
      SCRIPT
    );
    expect(notes.map((n) => n.isStale)).toEqual([false, false, false, false, true]);
  });

  it("groups open, addressed-since-last-pass and dismissed notes, high priority first", () => {
    const notes = withStaleness(
      [
        note(1, "The fab was silent", { priority: "low" }),
        note(2, "nobody talked", { priority: "high" }),
        note(3, "gone from the draft"),
        note(4, "A list item", { status: "addressed" }),
        note(5, "The fab", { status: "dismissed" }),
      ],
      SCRIPT
    );
    const groups = groupNotes(notes);
    expect(groups.open.map((n) => n.id)).toEqual([2, 1]);
    expect(groups.addressed.map((n) => n.id).sort()).toEqual([3, 4]);
    expect(groups.dismissed.map((n) => n.id)).toEqual([5]);
  });
});

describe("export helpers", () => {
  it("builds safe file names", () => {
    expect(slugifyTitle("The Chip That Ate the World!")).toBe("the-chip-that-ate-the-world");
    expect(slugifyTitle("   ")).toBe("script");
    expect(scriptFilename("Café Story", "notes")).toBe("cafe-story-notes.md");
  });

  it("keeps the draft verbatim and lists notes without any replacement wording", () => {
    const notes = withStaleness([note(1, "nobody talked", { why: "The viewer loses the thread.", question: "What do you want them to feel?" })], SCRIPT);
    const md = buildNotesExport({ title: "Chips", content: SCRIPT, notes, lensNames: () => ["Story Architect (Claude Sonnet 5.5)"] });
    expect(md).toContain(SCRIPT);
    expect(md).toContain("## Open notes");
    expect(md).toContain("> nobody talked");
    expect(md).toContain("Question: What do you want them to feel?");
    expect(md).toContain("_Raised by: Story Architect (Claude Sonnet 5.5)_");
  });
});

describe("speaking rate", () => {
  it("clamps to a sane range and defaults bad values", () => {
    expect(clampWordsPerMinute(155.4)).toBe(155);
    expect(clampWordsPerMinute(10)).toBe(60);
    expect(clampWordsPerMinute(9000)).toBe(300);
    expect(clampWordsPerMinute(undefined)).toBe(DEFAULT_WORDS_PER_MINUTE);
    expect(clampWordsPerMinute(Number.NaN)).toBe(DEFAULT_WORDS_PER_MINUTE);
  });
});
