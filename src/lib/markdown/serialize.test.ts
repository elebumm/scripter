import { describe, expect, it } from "vitest";
import { getSchema, type JSONContent } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import LinkExtension from "@tiptap/extension-link";
import { MarkdownManager } from "@tiptap/markdown";
import { Table } from "@tiptap/extension-table";
import { TableRow } from "@tiptap/extension-table-row";
import { TableCell } from "@tiptap/extension-table-cell";
import { TableHeader } from "@tiptap/extension-table-header";
import { cleanSerializedMarkdown, findRewrittenLine, splitFrontMatter } from "@/lib/markdown/serialize";
import { HtmlComment } from "@/components/editor/html-comment-extension";

// Same markdown-relevant extensions as RichEditor: StarterKit's bundled Link and
// Underline are off; Link is registered once on its own.
const extensions = [
  StarterKit.configure({ codeBlock: false, link: false, underline: false }),
  LinkExtension.configure({ openOnClick: false }),
  Table.configure({ resizable: false }),
  TableRow,
  TableCell,
  TableHeader,
  HtmlComment,
];
const schema = getSchema(extensions);
const manager = new MarkdownManager({ extensions });

const parse = (md: string): JSONContent => schema.nodeFromJSON(manager.parse(md)).toJSON();
const serialize = (md: string) => manager.serialize(parse(md));
/** What the editor stores after loading `md` and saving it again. */
const save = (md: string) => cleanSerializedMarkdown(serialize(md));

describe("cleanSerializedMarkdown", () => {
  it("keeps the writer's markdown byte-identical through a Tiptap round trip", () => {
    const samples = [
      // callouts
      "> [!tip] Hook idea\n> Keep it ~30 seconds, not ~2 minutes",
      "> [!NOTE] VISUAL Split screen: prototype vs. breadboard",
      // emphasis and literal markers
      "**[VISUAL: montage]** then *[0:00 - 2:00]* and snake_case_name",
      "Ship 5 * 3 builds, then `npm run dev` & relax -> done",
      // lists
      "- [B-ROLL: screen recording]\n- Beat: pitfall 1 — the mistake, not the lecture\n\n1. First\n2. Second",
      // headings, entities
      "## Payoff & CTA (~150 words)",
      // literal backslash
      "Save it to C:\\Users\\lewis\\scripts",
    ];
    for (const md of samples) {
      expect(serialize(md)).not.toBe(md); // Tiptap 3.32 alone would rewrite it
      expect(save(md)).toBe(md);
    }
  });

  it("keeps HTML comment blocks as comments, byte for byte", () => {
    const samples = [
      "<!-- Open with a bold claim. You have ~5 seconds. -->",
      "## Hook (0:00 - 0:15)\n\n<!-- Open with a bold claim, *surprising* fact. -->\n\n> [Insert hook]",
      "<!-- line one\nline two -->",
      "<!-- a -->\n\n<!-- b -->",
    ];
    for (const md of samples) {
      expect(parse(md).content?.some((n) => n.type === "htmlComment"), md).toBe(true);
      expect(save(md)).toBe(md);
    }
    // A comment right under a heading (as in the templates) only gains a blank line.
    const template = "## Hook (0:00 - 0:15)\n<!-- Open with a bold claim. -->";
    expect(save(template)).toBe("## Hook (0:00 - 0:15)\n\n<!-- Open with a bold claim. -->");
    expect(findRewrittenLine(template, save(template))).toBeNull();
    // Text after the comment on its line is not a comment: default handling.
    expect(parse("<!-- note --> spoken words").content?.some((n) => n.type === "htmlComment")).toBe(false);
  });

  it("keeps escapes that change meaning when removed", () => {
    // Literal text that would turn into formatting, a list item or a checkbox.
    expect(cleanSerializedMarkdown("\\*not italic\\*")).toBe("\\*not italic\\*");
    expect(cleanSerializedMarkdown("\\* not a list")).toBe("\\* not a list");
    expect(cleanSerializedMarkdown("- \\[ \\] not a checkbox")).toBe("- \\[ \\] not a checkbox");
    expect(cleanSerializedMarkdown("\\[label\\](not-a-link)")).toBe("\\[label\\](not-a-link)");
    expect(cleanSerializedMarkdown("a\\*b\\*c")).toBe("a\\*b\\*c");
    expect(cleanSerializedMarkdown("\\~a\\~ and 2\\~3")).toBe("~a\\~ and 2\\~3");
    // A literal backslash before punctuation must stay doubled.
    expect(cleanSerializedMarkdown("path\\\\*")).toBe("path\\\\*");
    expect(cleanSerializedMarkdown("C:\\\\Users")).toBe("C:\\Users");
    // Code is never touched.
    expect(cleanSerializedMarkdown("```\na\\_b \\[x\\]\n```")).toBe("```\na\\_b \\[x\\]\n```");
    expect(cleanSerializedMarkdown("run `a\\_b` now")).toBe("run `a\\_b` now");
  });

  it("never changes the parsed document", () => {
    const docs = [
      "> [!tip] A\n\n**bold** *it* ~~gone~~ `code` [link](https://e.com/a_b)",
      "Literal \\*stars\\* and \\_under\\_ and \\[x\\]\\[y\\] and \\~a\\~",
      "- \\[ \\] todo\n- \\[x\\] done\n- C:\\\\dir and \\\\*",
      "| a\\_b | 5 \\* 3 |\n| --- | --- |\n| \\[c\\] | &lt;d&gt; &amp; e |",
    ];
    for (const md of docs) {
      const raw = serialize(md);
      expect(parse(cleanSerializedMarkdown(raw))).toEqual(parse(raw));
    }
  });
});

describe("splitFrontMatter", () => {
  it("splits leading YAML front matter, with the blank lines after it", () => {
    expect(splitFrontMatter("---\ntitle: The chip\ntags: [script, ai]\n---\n\n# Body\n")).toEqual({
      frontMatter: "---\ntitle: The chip\ntags: [script, ai]\n---\n\n",
      body: "# Body\n",
    });
    expect(splitFrontMatter("---\ntitle: x\n...\nBody")).toEqual({ frontMatter: "---\ntitle: x\n...\n", body: "Body" });
    expect(splitFrontMatter("---\r\ntitle: x\r\n---\r\nBody").body).toBe("Body");
    expect(splitFrontMatter("---\ntitle: only\n---")).toEqual({ frontMatter: "---\ntitle: only\n---", body: "" });
    // Obsidian-style lists, nested keys, comments and folded text.
    const vault = [
      "---",
      "title: The chip: part 2",
      "tags:",
      "  - script",
      "- ai",
      "aliases: [chip]",
      "# draft status",
      "status: draft",
      "",
      "description: >",
      "  A folded",
      "  description",
      "---",
      "",
    ].join("\n");
    expect(splitFrontMatter(`${vault}# Body`)).toEqual({ frontMatter: vault, body: "# Body" });
  });

  it("leaves scripts without front matter alone", () => {
    for (const md of [
      "---\n\nIntro after a rule\n\n---\n\nMore", // opens with a horizontal rule
      "---\nNot yaml at all\n---\n\nBody",
      "---\ntitle: never closed\n\nBody",
      "# Title\n\n---\ntitle: x\n---",
      // A rule, then the writer's intro: its first line only looks like a key.
      "---\nNarrator: Welcome back to the channel.\n\nToday we talk about chips.\n\n---\n\n## Part 1",
    ]) {
      expect(splitFrontMatter(md)).toEqual({ frontMatter: "", body: md });
    }
  });
});

describe("findRewrittenLine", () => {
  it("ignores whitespace and syntax that says the same thing", () => {
    const same: [string, string][] = [
      ["Para one\n\n\nPara two  ", "Para one\n\nPara two\n\n&nbsp;"],
      ["* a\n+ b", "- a\n- b"],
      ["1) x\n1) y", "1. x\n2. y"],
      ["__bold__ _em_", "**bold** *em*"],
      ["***\n## H ##", "---\n\n## H"],
      ["See <https://e.com>", "See [https://e.com](https://e.com)"],
      ["|a|b|\n|:-|-:|", "| a   | b   |\n| :--- | ---: |"],
      ["~~~\ncode\n~~~", "```\ncode\n```"],
      ["Questions\n\n1.\n2.\n3.", "Questions"],
      // The writer's own escapes, dropped where they can't matter.
      ["\\[VISUAL: wide shot\\] and 5 \\* 3", "[VISUAL: wide shot] and 5 * 3"],
      // Escapes the editor adds where they can't matter either.
      ["[VISUAL]: Show the chart", "\\[VISUAL\\]: Show the chart"],
      ["*not emphasis", "\\*not emphasis"],
      ["Hard break\\\nnext line", "Hard break  \nnext line"],
      ["Mail <me@example.com>", "Mail [me@example.com](mailto:me@example.com)"],
    ];
    for (const [original, saved] of same) expect(findRewrittenLine(original, saved), original).toBeNull();
  });

  it("reports a paragraph that would turn into a heading, list or quote", () => {
    expect(findRewrittenLine("\\# not a heading", "# not a heading")).toEqual({ line: 1, text: "\\# not a heading" });
    expect(findRewrittenLine("Intro\n\n\\- not a list", "Intro\n\n- not a list")?.line).toBe(3);
    expect(findRewrittenLine("1\\. not a list", "1. not a list")?.line).toBe(1);
    expect(findRewrittenLine("> \\> not nested", "> > not nested")?.line).toBe(1);
  });

  it("reports the first line whose content would change", () => {
    expect(findRewrittenLine("Intro\n\n![Thumb](https://e.com/t.png)", "Intro\n\nThumb")).toEqual({
      line: 3,
      text: "![Thumb](https://e.com/t.png)",
    });
    expect(findRewrittenLine("- [ ] shoot intro", "- shoot intro")?.line).toBe(1);
    expect(findRewrittenLine("A &mdash; B", "A &amp;mdash; B")?.line).toBe(1);
    expect(findRewrittenLine("a\nb\nc", "a\nB\nc")).toEqual({ line: 2, text: "b" });
    // Escaping a wikilink makes it plain text in the writer's vault.
    expect(findRewrittenLine("See [[Previous Video]]", "See \\[\\[Previous Video\\]\\]")?.line).toBe(1);
    expect(findRewrittenLine("Lost words here", "")).toEqual({ line: 1, text: "Lost words here" });
    // Something added at the end points at the last line, which left it open.
    expect(findRewrittenLine("Open\n```", "Open\n```\n```")).toEqual({ line: 2, text: "```" });
  });
});
