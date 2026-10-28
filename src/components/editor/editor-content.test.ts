import { describe, expect, it } from "vitest";
import { Editor } from "@tiptap/core";
import { editorExtensions, editorMarkdown, findWysiwygRewrite, loadMarkdown, wysiwygRoundTrip } from "./editor-content";

const SCRIPT = [
  "# The chip that ate the world",
  "",
  "Open on a **cold open**: the fab at 3 a.m., nobody talking.",
  "",
  "> [!tip] Hook idea",
  "> Keep it under ~30 seconds, not two minutes",
  "",
  "- First beat: the *setup* and the stakes",
  "- Second beat: the [first failure](https://example.com/a_b)",
].join("\n");

/**
 * A headless editor with RichEditor's extensions, recording what onUpdate
 * would hand to autosave. Without a view Tiptap attaches no plugins (undo
 * history among them), so they're attached the way createView does.
 */
function headlessEditor() {
  const emits: string[] = [];
  let frontMatter = "";
  const editor = new Editor({
    element: null,
    // JSON, not "": an HTML string needs a DOM to parse.
    content: { type: "doc", content: [{ type: "paragraph" }] },
    extensions: editorExtensions(),
    // trimEnd: the trailing-node plugin adds an empty paragraph after a final list.
    onUpdate: ({ editor: ed }) => emits.push(editorMarkdown(ed, frontMatter).trimEnd()),
  });
  editor.view.updateState(editor.state.reconfigure({ plugins: editor.extensionManager.plugins }));
  return {
    editor,
    emits,
    load(md: string, opts?: { undoable?: boolean }) {
      frontMatter = loadMarkdown(editor, md, opts);
    },
    /** The writer types `text` at the end of the first block. */
    type(text: string) {
      const end = editor.state.doc.firstChild!.nodeSize - 1;
      editor.view.dispatch(editor.state.tr.insertText(text, end));
    },
    markdown: () => editorMarkdown(editor, frontMatter).trimEnd(),
  };
}

describe("loadMarkdown", () => {
  it("keeps the load out of undo history: Ctrl+Z right after opening changes nothing and saves nothing", () => {
    const h = headlessEditor();
    h.load(SCRIPT);
    expect(h.markdown()).toBe(SCRIPT);

    expect(h.editor.commands.undo()).toBe(false);
    expect(h.markdown()).toBe(SCRIPT);
    expect(h.emits).toEqual([]);
    h.editor.destroy();
  });

  it("undo stops at the loaded script after the writer's own edits", () => {
    const h = headlessEditor();
    h.load(SCRIPT);
    h.type(" Revised");
    const edited = SCRIPT.replace("the world", "the world Revised");
    expect(h.emits).toEqual([edited]);

    expect(h.editor.commands.undo()).toBe(true);
    expect(h.editor.commands.undo()).toBe(false);
    expect(h.emits).toEqual([edited, SCRIPT]);
    expect(h.markdown()).toBe(SCRIPT);
    h.editor.destroy();
  });

  it("keeps a reload (remount after markdown mode) out of history too", () => {
    const first = headlessEditor();
    first.load(SCRIPT);
    first.type("!");
    first.editor.destroy();

    const remounted = headlessEditor();
    remounted.load(first.emits[0]);
    expect(remounted.editor.commands.undo()).toBe(false);
    expect(remounted.markdown()).toBe(first.emits[0]);
    expect(remounted.emits).toEqual([]);
    remounted.editor.destroy();
  });

  it("lets a version restore be undone back to the previous draft", () => {
    const h = headlessEditor();
    h.load(SCRIPT);
    h.load("# Older version\n\nShorter text.", { undoable: true });
    expect(h.emits).toEqual([]);
    expect(h.editor.commands.undo()).toBe(true);
    expect(h.emits).toEqual([SCRIPT]);
    h.editor.destroy();
  });

  it("still lets the writer clear the script", () => {
    const h = headlessEditor();
    h.load(SCRIPT);
    h.editor.view.dispatch(h.editor.state.tr.delete(0, h.editor.state.doc.content.size));
    expect(h.emits.at(-1)).toBe("");
    h.editor.destroy();
  });

  it("writes front matter back byte for byte and never shows it as script text", () => {
    const fm = "---\ntitle: The chip\ntags: [script, ai]\nstatus: draft\n---\n\n";
    const h = headlessEditor();
    h.load(fm + SCRIPT);
    expect(h.editor.state.doc.textContent).not.toContain("title:");
    h.type("!");
    expect(h.emits).toEqual([fm + SCRIPT.replace("the world", "the world!")]);
    h.editor.destroy();
  });

  it("keeps a template's guidance comments when the writer types", () => {
    const md = "## Hook (0:00 - 0:15)\n\n<!-- Open with a bold claim. You have ~5 seconds. -->\n\nThe fab was silent.";
    const h = headlessEditor();
    h.load(md);
    expect(h.editor.state.doc.child(1).type.name).toBe("htmlComment");
    h.type("!");
    expect(h.emits).toEqual([md.replace("0:15)", "0:15)!")]);
    h.editor.destroy();
  });

  it("keeps an intro after an opening rule in the editor, not hidden as front matter", () => {
    const md = "---\nNarrator: Welcome back to the channel.\n\nToday we talk about chips.\n\n---\n\n## Part 1";
    const h = headlessEditor();
    h.load(md);
    expect(h.editor.state.doc.textContent).toContain("Today we talk about chips.");
    expect(findWysiwygRewrite(md)).toBeNull();
    h.editor.destroy();
  });
});

describe("findWysiwygRewrite", () => {
  it("lets ordinary scripts and equivalent syntax through", () => {
    const samples = [
      SCRIPT,
      "",
      "## Hook (0:00 - 0:15)\n<!-- Open with a bold claim. You have ~5 seconds. -->\n\n> [Insert hook]",
      // Empty list items carry no words (the podcast template has them).
      "### Guest Questions\n\n1.\n2.\n3.\n\n---\n\n## Segment 3",
      "* star bullet\n+ plus bullet\n\n1) paren list\n1) numbered again",
      "__bold__ and _em_ and snake_case",
      "***\n\n## Heading ##",
      "| a | b |\n|:--|--:|\n| 1 | 2 |",
      "See <https://example.com> and https://example.org now",
      "- a\n    - nested four spaces\n\n- loose item",
      "~~~\ncode\n~~~",
      "---\ntitle: Front matter only\n---\n",
      "---\ntitle: The chip\n---\n\n" + SCRIPT,
      // Escapes and break styles that change nothing.
      "[VISUAL]: Show the chart\n\nNext paragraph",
      "Hard break\\\nnext line",
      "Write to <me@example.com>",
    ];
    for (const md of samples) expect(findWysiwygRewrite(md), md).toBeNull();
  });

  it.each([
    ["an image", "Intro line\n\n![Thumbnail idea](https://example.com/thumb.png)", 3],
    ["task checkboxes", "Shot list\n\n- [ ] shoot intro\n- [x] write hook", 3],
    ["a footnote", "A claim[^1] here.\n\n[^1]: https://example.com/source", 1],
    ["an inline comment", "Pause here <!-- breath --> and go on", 1],
    ["a comment opening a list item", "Shot list\n\n- <!-- wide first -->\n- close-up", 3],
    ["inline HTML", "Hello<br>world", 1],
    ["an HTML entity", "Then &mdash; silence", 1],
    ["a wikilink", "As in [[Previous Video]], the hook", 1],
    ["front matter after a blank line", "\n---\ntitle: x\n---\nBody", 3],
    // The editor drops these escapes, so the line would reload as a heading / list.
    ["an escaped heading marker", "Intro\n\n\\# 1 tip: keep it short", 3],
    ["an escaped list number", "1\\. is not a list here", 1],
  ])("reports %s with its line", (_label, md, line) => {
    const rewrite = findWysiwygRewrite(md);
    expect(rewrite?.line).toBe(line);
    expect(rewrite?.text).toBe(md.split("\n")[line - 1].trim());
  });

  it("matches what the editor writes back", () => {
    const md = "Intro\n\n![x](https://example.com/x.png)";
    const h = headlessEditor();
    h.load(md);
    expect(h.markdown()).toBe(wysiwygRoundTrip(md).trimEnd());
    h.editor.destroy();
  });
});
