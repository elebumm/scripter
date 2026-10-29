import { describe, expect, it } from "vitest";
import {
  DEFAULT_WORDS_PER_MINUTE,
  countSpokenWords,
  estimateRuntimeSeconds,
  firstH1Text,
  formatRuntime,
  getWordCount,
  h1LineText,
  leadingH1Text,
  spokenText,
} from "./reading-time";

describe("countSpokenWords", () => {
  it("counts plain narration", () => {
    expect(countSpokenWords("Hello there, world.")).toBe(3);
    expect(countSpokenWords("")).toBe(0);
    expect(countSpokenWords("   \n  ")).toBe(0);
  });

  it("drops front matter and headings", () => {
    const md = "---\ntitle: My video\ntags: [a, b]\n---\n# Cold open\n\nIt started with a file.\n\n## Act one (~5 min)\nThen it grew.";
    expect(countSpokenWords(md)).toBe(8);
    // A rule opening the script isn't front matter: the editor shows these words.
    expect(countSpokenWords("---\nNarrator: Welcome back.\n\nToday we talk about chips.\n\n---\n\nThe end.")).toBe(10);
  });

  it("drops setext H1 headings but keeps the paragraph before a thematic break", () => {
    expect(countSpokenWords("Big Title\n=========\n\nSpoken words here.")).toBe(3);
    expect(countSpokenWords("One two three.\n\n---\n\nFour five.")).toBe(5);
  });

  it("drops production callouts, including multi-line and lazy continuation", () => {
    const md = [
      "> [!NOTE] VISUAL Screen recording of a 2000-era browser",
      "> cycling through pages",
      "lazy continuation still inside the note",
      "",
      "Sadly, not many solutions.",
      "",
      "> [!warning]",
      "> Check the licence",
      "",
      "Back to the story.",
    ].join("\n");
    expect(countSpokenWords(md)).toBe(8);
  });

  it("keeps plain quotes and spoken callout bodies (not their titles)", () => {
    expect(countSpokenWords('> "If we think about each statement as a program"')).toBe(9);
    expect(countSpokenWords("> [!quote] Richard Hipp, 2001\n> Small is beautiful.")).toBe(3);
  });

  it("lets the caller choose which callout types are spoken", () => {
    const md = "> [!note] Title\n> Read this aloud.";
    expect(countSpokenWords(md)).toBe(0);
    expect(countSpokenWords(md, { spokenCalloutTypes: ["NOTE"] })).toBe(3);
  });

  it("drops [bracketed cues] but keeps link text", () => {
    expect(countSpokenWords("[BEAT.] Then he left. [PAUSE] [B-ROLL: server racks]")).toBe(3);
    expect(countSpokenWords("Read [the docs](https://sqlite.org) today ![diagram](a.png)")).toBe(4);
    expect(countSpokenWords("> [Insert cold open — a moment of tension]")).toBe(0);
  });

  it("drops HTML comments (multi-line and unclosed), tags and code blocks", () => {
    const md = "One <!-- hidden\nnote --> two <u>three</u>\n\n```js\nconst x = 1;\n```\n\n~~~\nmore code\n~~~\nfour\n\n<!-- never closed\nfive six";
    expect(countSpokenWords(md)).toBe(4);
  });

  it("does not count list markers, task boxes, table pipes or rules", () => {
    expect(countSpokenWords("1. First thing\n2) Second thing\n- [x] Done item\n* bullet")).toBe(7);
    expect(countSpokenWords("| a | b |\n|---|---|\n| one | two |")).toBe(4);
    expect(countSpokenWords("***\n— … |")).toBe(0);
  });

  it("strips emphasis around cues and counts inline code words", () => {
    expect(countSpokenWords("**[TITLE CARD]** run `npm install` now")).toBe(4);
  });

  it("spokenText keeps narration lines", () => {
    expect(spokenText("# H\n\nSay this.\n> [!note] x\n> y").trim()).toBe("Say this.");
  });

  it("does not count Tiptap's &nbsp; blank-paragraph markers", () => {
    expect(countSpokenWords("Hello there.\n\n&nbsp;\n\n&nbsp;\n\nGoodbye now.")).toBe(4);
    expect(countSpokenWords("&nbsp;\n\n&NBSP;\n\n&#160;\n\n&#xA0;")).toBe(0);
    expect(countSpokenWords("Tom&nbsp;Scott")).toBe(2);
  });
});

describe("first H1", () => {
  it("reads a single heading line", () => {
    expect(h1LineText("# **The** _Title_")).toBe("The Title");
    expect(h1LineText("   # Closed heading ##  ")).toBe("Closed heading");
    expect(h1LineText("## Not an H1")).toBeNull();
    expect(h1LineText("#hashtag")).toBeNull();
    expect(h1LineText("#")).toBeNull();
    expect(h1LineText("    # indented code")).toBeNull();
    expect(h1LineText("\t# tab-indented code")).toBeNull();
  });

  it("reads the heading a script opens with, and only that one", () => {
    expect(leadingH1Text("# Title\n\nBody.")).toBe("Title");
    expect(leadingH1Text("\n<!-- draft 2 -->\n\n# Title\n\nBody.")).toBe("Title");
    expect(leadingH1Text("---\nx: 1\n---\n# Title")).toBe("Title");
    expect(leadingH1Text("Body first.\n\n# Title")).toBeNull();
    expect(leadingH1Text("## Section\n\n# Title")).toBeNull();
    expect(leadingH1Text("")).toBeNull();
  });

  it("keeps a trailing '#' that is part of the title", () => {
    expect(firstH1Text("# Learn C#")).toBe("Learn C#");
    expect(firstH1Text("# Why F# rocks")).toBe("Why F# rocks");
    expect(firstH1Text("# Learn C\\#")).toBe("Learn C#");
  });

  it("skips fenced code, comments and front matter", () => {
    expect(firstH1Text("Intro\n\n```bash\n# install the cli\nnpm i\n```\n\n# Real Title")).toBe("Real Title");
    expect(firstH1Text("~~~~\n# not this\n~~~\n# still code\n~~~~\n# Title")).toBe("Title");
    expect(firstH1Text("<!--\n# draft title\n-->\n# Kept")).toBe("Kept");
    expect(firstH1Text("---\ntitle: x\n---\n# After front matter")).toBe("After front matter");
    expect(firstH1Text("```\n# only code\n```")).toBeNull();
  });

  it("never reads across lines after a bare '#'", () => {
    expect(firstH1Text("#\nThis paragraph is not a heading")).toBeNull();
    expect(firstH1Text("#\r\nThis paragraph is not a heading\r\n# Title\r\n")).toBe("Title");
  });
});

describe("runtime helpers", () => {
  it("estimates seconds at the default 155 wpm", () => {
    expect(DEFAULT_WORDS_PER_MINUTE).toBe(155);
    expect(estimateRuntimeSeconds(155)).toBe(60);
    expect(estimateRuntimeSeconds(310, 155)).toBe(120);
    expect(estimateRuntimeSeconds(150, 150)).toBe(60);
  });

  it("guards bad inputs", () => {
    expect(estimateRuntimeSeconds(0)).toBe(0);
    expect(estimateRuntimeSeconds(-5)).toBe(0);
    expect(estimateRuntimeSeconds(155, 0)).toBe(60);
    expect(estimateRuntimeSeconds(155, Number.NaN)).toBe(60);
  });

  it("formats m:ss", () => {
    expect(formatRuntime(0)).toBe("0:00");
    expect(formatRuntime(65)).toBe("1:05");
    expect(formatRuntime(59.6)).toBe("1:00");
    expect(formatRuntime(4325)).toBe("72:05");
    expect(formatRuntime(Number.NaN)).toBe("0:00");
    expect(formatRuntime(-3)).toBe("0:00");
  });

  it("keeps a raw word count", () => {
    expect(getWordCount("# Title\n\nTwo words")).toBe(4);
    expect(getWordCount("  ")).toBe(0);
  });
});
