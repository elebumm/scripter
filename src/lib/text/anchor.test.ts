import { describe, expect, it } from "vitest";
import {
  anchorExistsInMarkdown,
  findAnchorInText,
  isUsableAnchor,
  markdownToPlain,
  normalizeForMatch,
  resolveAnchor,
} from "./anchor";

describe("normalizeForMatch", () => {
  it("unifies quotes, dashes, ellipses and whitespace with a source map", () => {
    const src = "She said “hi” —  it’s…\nover";
    const { text, map } = normalizeForMatch(src);
    expect(text).toBe('She said "hi" - it\'s... over');
    expect(map).toHaveLength(text.length);
    expect(src[map[text.indexOf("over")]]).toBe("o");
  });

  it("case-folds on request", () => {
    expect(normalizeForMatch("Hello World", { caseFold: true }).text).toBe("hello world");
  });
});

describe("markdownToPlain", () => {
  it("drops structural markers but keeps words", () => {
    const md = "---\ntitle: x\n---\n# Cold open\n\n> [!note] Research\n> **Bold** and _italic_ and `code`\n\n- one [link](http://a.b)\n\n---\n\n1. two";
    const plain = markdownToPlain(md);
    expect(plain).not.toContain("title: x");
    expect(plain).toContain("Cold open");
    expect(plain).toContain("Bold and italic and code");
    expect(plain).toContain("one link");
    expect(plain).toContain("two");
    expect(plain).not.toMatch(/^---$/m);
  });

  it("keeps the words of a script that opens with a rule, as the editor shows them", () => {
    const md = "---\nNarrator: Welcome back.\n\nToday we talk about chips.\n\n---\n\n## Part 1";
    const plain = markdownToPlain(md);
    expect(plain).toContain("Narrator: Welcome back.");
    expect(plain).toContain("Today we talk about chips.");
    expect(markdownToPlain("---\ntitle: x\n...\nBody")).toBe("Body");
  });

  it("keeps snake_case and lone asterisks intact", () => {
    expect(markdownToPlain("call my_function now")).toBe("call my_function now");
    expect(markdownToPlain("2 * 3 = 6")).toBe("2 * 3 = 6");
  });

  it("removes backslash escapes added by the serializer", () => {
    expect(markdownToPlain("\\[!tip\\] keep \\*this\\*")).toBe("[!tip] keep *this*");
    expect(markdownToPlain("\\&amp; and \\: and a hard\\\nbreak")).toBe("&amp; and : and a hard\nbreak");
  });

  // Finding 47: the projection must match what the editor shows.
  it("decodes the entities the editor decodes, and only those", () => {
    expect(markdownToPlain("wrap it in a &lt;div> first")).toBe("wrap it in a <div> first");
    expect(markdownToPlain("Tom &amp; Jerry &quot;dq&quot; &#39;sq&#39; &#x27;hex&#x27; &#8212; &#150;")).toBe(
      "Tom & Jerry \"dq\" 'sq' 'hex' — –"
    );
    expect(markdownToPlain("a&nbsp;b &copy; &AMP; &amp;amp;")).toBe("a&nbsp;b &copy; &AMP; &amp;");
  });

  it("keeps raw HTML and inline comments, which markdown mode shows as text", () => {
    expect(markdownToPlain("This is <b>bold</b> and <!-- a note --> here")).toBe("This is <b>bold</b> and <!-- a note --> here");
  });

  it("drops comment-only blocks, which the editor shows without text", () => {
    expect(markdownToPlain("## Hook\n<!-- Open with a bold claim -->\n\nThe fab was silent.")).toBe(
      "Hook\n\n\nThe fab was silent."
    );
    expect(markdownToPlain("<!-- one\ntwo -->\nNext")).toBe("\n\nNext");
    expect(markdownToPlain("> <!-- c -->\n> quoted")).toBe("\nquoted");
    // Not only a comment: kept.
    expect(markdownToPlain("<!-- c --> spoken")).toBe("<!-- c --> spoken");
    expect(markdownToPlain("<!-- never closed\nline")).toBe("<!-- never closed\nline");
  });

  it("shows code as written", () => {
    expect(markdownToPlain("wrap it in a `<div>` and `&lt;b>` and ``a ` tick`` and `` spaced ``")).toBe(
      "wrap it in a <div> and &lt;b> and a ` tick and spaced"
    );
    expect(markdownToPlain("```js\n# not a heading\n- not a list &amp; *raw*\n```\nafter")).toBe(
      "\n# not a heading\n- not a list &amp; *raw*\n\nafter"
    );
  });

  it("puts each table cell on its own line", () => {
    expect(markdownToPlain("| Shot | Line |\n| --- | --- |\n| Wide of city | The city never sleeps |\n\nafter")).toBe(
      "Shot\nLine\n\nWide of city\nThe city never sleeps\n\nafter"
    );
    expect(markdownToPlain("Shot | Line\n:-- | --:\nWide | The city\nno pipe row")).toBe("Shot\nLine\n\nWide\nThe city\nno pipe row");
    expect(markdownToPlain("a | b without a delimiter row")).toBe("a | b without a delimiter row");
  });

  it("drops single-tilde strikethrough the way the editor does, and keeps a lone tilde", () => {
    expect(markdownToPlain("the ~first~ second take, about ~30 seconds and ~45 seconds")).toBe(
      "the first second take, about ~30 seconds and ~45 seconds"
    );
    expect(markdownToPlain("~~double~~ and ~esc\\~aped~ and \\~kept~")).toBe("double and esc~aped and ~kept~");
  });

  it("drops autolink brackets, closing heading hashes and setext underlines", () => {
    expect(markdownToPlain("See <https://example.com/a> or <me@x.com>")).toBe("See https://example.com/a or me@x.com");
    expect(markdownToPlain("## Title ##")).toBe("Title");
    expect(markdownToPlain("Setext title\n===\n\nBody")).toBe("Setext title\n\n\nBody");
  });
});

describe("findAnchorInText", () => {
  const plain = "There's a fifteen-year-old girl standing in a hallway.\nShe has less than twenty dollars.";

  it("finds exact matches", () => {
    const m = findAnchorInText(plain, "less than twenty dollars");
    expect(m?.tier).toBe("exact");
    expect(plain.slice(m!.start, m!.end)).toBe("less than twenty dollars");
  });

  it("finds anchors with curly quotes and collapsed newlines", () => {
    const m = findAnchorInText(plain, "There’s a fifteen-year-old girl");
    expect(m?.tier).toBe("normalized");
    expect(plain.slice(m!.start, m!.end)).toBe("There's a fifteen-year-old girl");
    const across = findAnchorInText(plain, "in a hallway. She has");
    expect(plain.slice(across!.start, across!.end)).toBe("in a hallway.\nShe has");
  });

  it("falls back to case-insensitive matching", () => {
    const m = findAnchorInText(plain, "SHE HAS LESS");
    expect(m?.tier).toBe("casefold");
    expect(plain.slice(m!.start, m!.end)).toBe("She has less");
  });

  it("reports ambiguity and misses", () => {
    expect(findAnchorInText("a b a b", "a b")?.occurrences).toBe(2);
    expect(findAnchorInText(plain, "not in the script")).toBeNull();
    expect(findAnchorInText(plain, "   ")).toBeNull();
  });
});

describe("anchorExistsInMarkdown", () => {
  const md = "## Act one\n\nThis is **really** important, she said.\n\n- First point here";
  it("accepts anchors copied with or without markdown", () => {
    expect(anchorExistsInMarkdown(md, "This is **really** important")).toBe(true);
    expect(anchorExistsInMarkdown(md, "This is really important")).toBe(true);
    expect(anchorExistsInMarkdown(md, "- First point here")).toBe(true);
  });
  it("rejects invented text", () => {
    expect(anchorExistsInMarkdown(md, "This is truly important")).toBe(false);
  });
});

describe("isUsableAnchor", () => {
  it("requires enough text to point at one place", () => {
    expect(isUsableAnchor("the")).toBe(false);
    expect(isUsableAnchor("less than twenty dollars")).toBe(true);
  });

  // Findings 10 and 58: one-word anchors match all over a script and inside other words.
  it("rejects one-word anchors, however long", () => {
    for (const anchor of ["AI", "a", "basically", "extraordinarily-long-compound", "**RLHF**", "— AI —"]) {
      expect(isUsableAnchor(anchor), anchor).toBe(false);
    }
    expect(isUsableAnchor("Fei-Fei Li")).toBe(false);
    expect(isUsableAnchor("Mechanical Turk")).toBe(true);
    expect(isUsableAnchor("the dataset mattered")).toBe(true);
  });
});

describe("normalizeForMatch pipes", () => {
  it("treats table pipes as whitespace", () => {
    expect(normalizeForMatch("| Wide of city | The city |").text).toBe("Wide of city The city");
  });
});

describe("resolveAnchor", () => {
  const md = [
    "## Act one",
    "",
    "She didn't build it alone. This is **really** important, she said.",
    "",
    "Wrap it in a &lt;div> first.",
    "",
    "| Shot | Line |",
    "| --- | --- |",
    "| Wide of city | The city never sleeps at all |",
  ].join("\n");

  it("returns the writer's text, not the model's string (finding 56)", () => {
    expect(resolveAnchor(md, "This is **really** important")).toBe("This is really important");
    expect(resolveAnchor(md, "she didn’t build it ALONE.")).toBe("She didn't build it alone.");
    expect(resolveAnchor(md, "[She didn't build it alone.](Open instead with the line Forty nine thousand strangers)")).toBe(
      "She didn't build it alone."
    );
    expect(resolveAnchor(md, "wrap it in a &lt;div> first")).toBe("Wrap it in a <div> first");
    expect(resolveAnchor(md, "| Wide of city | The city never sleeps at all |")).toBe("Wide of city\nThe city never sleeps at all");
  });

  it("rejects anchors that hide the model's own words", () => {
    expect(resolveAnchor(md, "She didn't build it alone.<!-- Open instead with Forty nine thousand strangers -->")).toBeNull();
    expect(resolveAnchor(md, '<abbr title="Open instead with Forty nine thousand strangers">She didn\'t build it alone.</abbr>')).toBeNull();
    expect(resolveAnchor(md, "She didn't build it alone, she said")).toBeNull();
  });

  it("rejects anchors too short to point at one place", () => {
    expect(resolveAnchor(md, "alone")).toBeNull();
    expect(resolveAnchor(md, "**really**")).toBeNull();
  });

  it("returns text that finds itself again when re-projected (stored anchors stay highlightable)", () => {
    const plain = markdownToPlain(md);
    for (const anchor of ["This is **really** important", "wrap it in a &lt;div> first", "| Wide of city | The city never sleeps at all |"]) {
      const stored = resolveAnchor(md, anchor)!;
      const again = findAnchorInText(plain, markdownToPlain(stored));
      expect(again && plain.slice(again.start, again.end)).toBe(stored);
    }
  });
});
