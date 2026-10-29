import { describe, expect, it } from "vitest";
import { buildNotesExport } from "./export";

describe("buildNotesExport", () => {
  it("writes the title once when the draft already opens with it", () => {
    const md = buildNotesExport({
      title: "Why Most Developers Get APIs Wrong",
      content: "# Why Most Developers Get APIs Wrong\n\nBody.",
      notes: [],
    });
    expect(md.startsWith("# Why Most Developers Get APIs Wrong\n\nBody.\n\n---")).toBe(true);
    expect(md.match(/^# /gm)).toHaveLength(1);
  });

  it("matches the heading's plain text, as the page derives the title", () => {
    const md = buildNotesExport({ title: "Learn C#", content: "# Learn **C#**\n\nBody.", notes: [] });
    expect(md.match(/^# /gm)).toHaveLength(1);
  });

  it("sees the opening H1 past a leading comment or front matter", () => {
    const commented = buildNotesExport({ title: "Title", content: "<!-- draft 2 -->\n# Title\n\nBody.", notes: [] });
    expect(commented.startsWith("<!-- draft 2 -->\n# Title\n\nBody.")).toBe(true);
    expect(commented.match(/^# /gm)).toHaveLength(1);
    const frontMatter = buildNotesExport({ title: "Title", content: "---\nx: 1\n---\n# Title\n\nBody.", notes: [] });
    expect(frontMatter.match(/^# /gm)).toHaveLength(1);
  });

  it("adds the title when the draft opens with something else", () => {
    expect(buildNotesExport({ title: "Set title", content: "# Other heading\n\nBody.", notes: [] })).toMatch(
      /^# Set title\n\n# Other heading\n\nBody\./
    );
    expect(buildNotesExport({ title: "Set title", content: "Body first.\n\n# Set title", notes: [] })).toMatch(
      /^# Set title\n\nBody first\./
    );
    expect(buildNotesExport({ title: "", content: "", notes: [] })).toMatch(/^# Untitled script\n\n/);
  });
});
