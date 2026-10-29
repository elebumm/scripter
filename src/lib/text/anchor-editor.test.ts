// markdownToPlain is the projection the server, the stale check and the
// editor highlight all share. It has to match the text the editor actually
// shows, or a note the server accepts never gets a highlight (finding 47).

import { describe, expect, it } from "vitest";
import { getSchema } from "@tiptap/core";
import { MarkdownManager } from "@tiptap/markdown";
import type { Node as PMNode } from "@tiptap/pm/model";
import { buildTextMap, createAnchorFinder } from "@/components/editor/annotations-extension";
import { editorExtensions } from "@/components/editor/editor-content";
import { cleanSerializedMarkdown } from "@/lib/markdown/serialize";
import { anchorExistsInMarkdown, markdownToPlain, normalizeForMatch, resolveAnchor } from "./anchor";

// RichEditor's own extension list, so this can't drift from the editor.
const extensions = editorExtensions();
const schema = getSchema(extensions);
const manager = new MarkdownManager({ extensions });
const parse = (md: string): PMNode => schema.nodeFromJSON(manager.parse(md));

const SCRIPT = [
  "# Wrap it in a div",
  "",
  "Open the editor and wrap it in a <div> first. The price was <5 dollars.",
  "",
  "Use `<section>` when it matters, and `&lt;b>` stays literal in code.",
  "",
  "Tom & Jerry said \"hi\" and it's fine — mostly…",
  "",
  "<!-- research: check the pay rates -->",
  "",
  "| Shot | Line |",
  "| --- | --- |",
  "| Wide of city | The city never sleeps at all |",
  "| Close on hands | She types &amp; deletes, again |",
  "",
  "See <https://example.com/a> for the **source** and [the paper](https://x.y/z).",
  "",
  "```js",
  "const a = \"&lt;b>\"; // # not a heading",
  "```",
  "",
  "- check the *numbers*",
  "1. then the ~~old~~ new ones",
  "2. the ~first~ second take, about ~30 seconds and ~45 seconds",
  "> [!tip] Keep it under ~30 seconds",
].join("\n");

/** The script as the editor stores it after a WYSIWYG save (entities escaped). */
const SAVED = cleanSerializedMarkdown(manager.serialize(parse(SCRIPT).toJSON()));

describe("markdownToPlain matches the editor text", () => {
  it.each([
    ["the source markdown", SCRIPT],
    ["the markdown the editor saves", SAVED],
  ])("for %s", (_label, md) => {
    const editor = buildTextMap(parse(md)).text;
    expect(normalizeForMatch(markdownToPlain(md)).text).toBe(normalizeForMatch(editor).text);
  });

  it("saves entities the projection decodes", () => {
    expect(SAVED).toContain("&lt;div>");
  });
});

describe("server acceptance and editor highlight agree", () => {
  const anchors = [
    "wrap it in a &lt;div> first",
    "wrap it in a <div> first",
    "The price was &lt;5 dollars",
    "Use `<section>` when it matters",
    "`&lt;b>` stays literal in code",
    "Tom &amp; Jerry said",
    "| Wide of city | The city never sleeps at all |",
    "Wide of city | The city never sleeps at all",
    "She types &amp; deletes, again",
    "<!-- research: check the pay rates -->",
    "for the **source** and [the paper](https://x.y/z)",
    "it's fine - mostly...",
    "Keep it under ~30 seconds",
    "the ~first~ second take",
    "the first second take, about ~30 seconds",
    "wrap it in a first",
    "a sentence the writer never wrote",
  ];

  for (const [label, md] of [
    ["source", SCRIPT],
    ["saved", SAVED],
  ] as const) {
    const find = createAnchorFinder(buildTextMap(parse(md)));
    it.each(anchors)(`${label}: %s`, (anchor) => {
      const accepted = anchorExistsInMarkdown(md, anchor);
      expect(find(anchor) !== null).toBe(accepted);
      const stored = resolveAnchor(md, anchor);
      // What the server stores is highlightable in the editor.
      if (stored) expect(find(stored)).not.toBeNull();
    });
  }
});
