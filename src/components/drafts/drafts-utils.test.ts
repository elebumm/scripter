import { describe, expect, it } from "vitest";
import {
  countLabel,
  displayTitle,
  emptyState,
  exportFilename,
  filterScripts,
  formatScore,
  formatWords,
  headingFor,
  isLegacyDefaultTitle,
  isRecent,
  scriptHref,
  slugify,
  sortByUpdated,
} from "./drafts-utils";

const NOW = Date.parse("2026-10-27T12:00:00Z");

const scripts = [
  { id: 1, title: "SQLite Video", updatedAt: "2026-10-26 09:00:00" },
  { id: 2, title: "", updatedAt: "2026-10-01 09:00:00" },
  { id: 3, title: "The Rust Story", updatedAt: "2026-10-27 11:00:00" },
  { id: 4, title: "Old draft", updatedAt: "2025-01-01 00:00:00" },
];

describe("displayTitle", () => {
  it("falls back to Untitled script for empty or blank titles", () => {
    expect(displayTitle("")).toBe("Untitled script");
    expect(displayTitle("   ")).toBe("Untitled script");
    expect(displayTitle(null)).toBe("Untitled script");
    expect(displayTitle("  Hello ")).toBe("Hello");
    expect(displayTitle("", " The Rust Story ")).toBe("The Rust Story");
    expect(displayTitle("Set title", "Heading")).toBe("Set title");
    expect(displayTitle("", null)).toBe("Untitled script");
  });

  it("treats legacy default titles as no title, so the draft's headline shows", () => {
    expect(displayTitle("Untitled Scriptt", "Why Most Developers Get APIs Wrong")).toBe("Why Most Developers Get APIs Wrong");
    expect(displayTitle("Untitled Script", "Heading")).toBe("Heading");
    expect(displayTitle("Untitled Script", null)).toBe("Untitled script");
    expect(displayTitle("SQLite Video", "Heading")).toBe("SQLite Video");
  });

  it("keeps the title the writer typed onto the old default", () => {
    expect(displayTitle("Untitled ScriptA tutorial about building with AI tools for developers", null)).toBe(
      "A tutorial about building with AI tools for developers"
    );
    expect(displayTitle("Untitled ScriptA draft", "Heading")).toBe("A draft");
    expect(isLegacyDefaultTitle("Untitled ScriptA draft")).toBe(true);
  });

  it("leaves a real title that only starts with the same words", () => {
    expect(displayTitle("Untitled Scripture Study", "Heading")).toBe("Untitled Scripture Study");
    expect(displayTitle("Untitled Script 2", "Heading")).toBe("Untitled Script 2");
    expect(isLegacyDefaultTitle("Untitled Scripture Study")).toBe(false);
    expect(isLegacyDefaultTitle("Untitled Script")).toBe(true);
    expect(isLegacyDefaultTitle("Untitled Scriptt")).toBe(true);
  });

  it("ignores a template's placeholder heading", () => {
    expect(displayTitle("", "[Title]")).toBe("Untitled script");
    expect(displayTitle("", "[Working title] of the video")).toBe("[Working title] of the video");
  });
});

describe("headingFor", () => {
  it("names the main list Drafts, like the header link", () => {
    expect(headingFor("all")).toBe("Drafts");
    expect(headingFor("archive")).toBe("Archive");
  });
});

describe("isRecent", () => {
  it("treats DB timestamps as UTC and uses a 7-day window", () => {
    expect(isRecent("2026-10-20 12:00:00", NOW)).toBe(true);
    expect(isRecent("2026-10-20 11:59:59", NOW)).toBe(false);
    expect(isRecent(null, NOW)).toBe(false);
    expect(isRecent("not a date", NOW)).toBe(false);
  });
});

describe("sortByUpdated", () => {
  it("puts the newest edit first", () => {
    expect(sortByUpdated(scripts).map((s) => s.id)).toEqual([3, 1, 2, 4]);
  });
});

describe("filterScripts", () => {
  it("returns everything for ALL, newest first", () => {
    expect(filterScripts(scripts, { filter: "all", search: "", now: NOW }).map((s) => s.id)).toEqual([3, 1, 2, 4]);
  });

  it("keeps only the last week for RECENT", () => {
    expect(filterScripts(scripts, { filter: "recent", search: "", now: NOW }).map((s) => s.id)).toEqual([3, 1]);
  });

  it("does not date-filter the archive list", () => {
    expect(filterScripts(scripts, { filter: "archive", search: "", now: NOW })).toHaveLength(4);
  });

  it("searches the displayed title case-insensitively", () => {
    expect(filterScripts(scripts, { filter: "all", search: "rust", now: NOW }).map((s) => s.id)).toEqual([3]);
    expect(filterScripts(scripts, { filter: "all", search: "untitled", now: NOW }).map((s) => s.id)).toEqual([2]);
    expect(filterScripts(scripts, { filter: "recent", search: "old", now: NOW })).toEqual([]);
  });

  it("also finds a script by its headline when a stored title hides it", () => {
    const withHeadlines = [
      { id: 13, title: "Long-form Video (Copy)", heading: "Meta Gave Away the Best AI on Earth", updatedAt: "2026-10-26 09:00:00" },
      { id: 12, title: "Long-form Video (Copy)", heading: "[Title]", updatedAt: "2026-10-25 09:00:00" },
      { id: 1, title: "Untitled Scriptt", heading: "Why Most Developers Get APIs Wrong", updatedAt: "2026-10-24 09:00:00" },
    ];
    const search = (q: string) => filterScripts(withHeadlines, { filter: "all", search: q, now: NOW }).map((s) => s.id);
    expect(search("meta")).toEqual([13]);
    expect(search("apis")).toEqual([1]);
    expect(search("long-form")).toEqual([13, 12]);
    expect(search("title")).toEqual([]);
  });

  it("finds a script with a legacy default title by its headline", () => {
    const legacy = [{ id: 9, title: "Untitled Scriptt", heading: "Why Most Developers Get APIs Wrong", updatedAt: "2026-10-26 09:00:00" }];
    expect(filterScripts(legacy, { filter: "all", search: "apis", now: NOW }).map((s) => s.id)).toEqual([9]);
  });
});

describe("labels", () => {
  it("formats scores with one decimal and hides missing ones", () => {
    expect(formatScore(7.456)).toBe("7.5");
    expect(formatScore(8)).toBe("8.0");
    expect(formatScore(null)).toBeNull();
    expect(formatScore(Number.NaN)).toBeNull();
  });

  it("formats word counts", () => {
    expect(formatWords(0)).toBe("No words yet");
    expect(formatWords(1)).toBe("1 word");
    expect(formatWords(4210)).toBe("4,210 words");
  });

  it("counts per filter", () => {
    expect(countLabel("all", 1)).toBe("1 script");
    expect(countLabel("all", 12)).toBe("12 scripts");
    expect(countLabel("archive", 2)).toBe("2 archived scripts");
    expect(countLabel("recent", 3)).toBe("3 edited in the last 7 days");
  });
});

describe("emptyState", () => {
  it("only says No scripts yet when there are truly none", () => {
    expect(emptyState("all", "", 0)).toMatchObject({ title: "No scripts yet", showCreate: true });
    expect(emptyState("recent", "", 5).title).toBe("Nothing edited in the last 7 days");
    expect(emptyState("all", "zzz", 5)).toMatchObject({ title: "No scripts match “zzz”", showCreate: false });
    expect(emptyState("archive", "", 0).title).toBe("The archive is empty");
  });
});

describe("file names and links", () => {
  it("slugifies titles for export", () => {
    expect(slugify("The Rust Story: Part 2!")).toBe("the-rust-story-part-2");
    expect(slugify("Café über naïve")).toBe("cafe-uber-naive");
    expect(slugify("   ")).toBe("");
    expect(exportFilename("", 7)).toBe("script-7.md");
    expect(exportFilename("SQLite Video", 7)).toBe("sqlite-video.md");
  });

  it("builds the script link with the beats flag", () => {
    expect(scriptHref(5)).toBe("/script/5");
    expect(scriptHref(5, { suggestBeats: true })).toBe("/script/5?beats=suggest");
  });
});
