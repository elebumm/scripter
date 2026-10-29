// What goes into and comes out of the WYSIWYG editor: its extension list,
// loading the writer's markdown, serialising it back, and the check that keeps
// a script out of the editor when saving it would rewrite the writer's text.
// scripts/roundtrip-check.mjs and src/lib/markdown/serialize.test.ts mirror
// the markdown-relevant part of the extension list.

import { getSchema, type Editor, type Extensions } from "@tiptap/core";
import type { Node as PMNode, Schema } from "@tiptap/pm/model";
import StarterKit from "@tiptap/starter-kit";
import { Markdown, MarkdownManager } from "@tiptap/markdown";
import Placeholder from "@tiptap/extension-placeholder";
import LinkExtension from "@tiptap/extension-link";
import { Table } from "@tiptap/extension-table";
import { TableRow } from "@tiptap/extension-table-row";
import { TableCell } from "@tiptap/extension-table-cell";
import { TableHeader } from "@tiptap/extension-table-header";
import CodeBlockLowlight from "@tiptap/extension-code-block-lowlight";
import { common, createLowlight } from "lowlight";
import {
  cleanSerializedMarkdown,
  findRewrittenLine,
  splitFrontMatter,
  type RewrittenLine,
} from "@/lib/markdown/serialize";
import { AnnotationsExtension } from "./annotations-extension";
import { HtmlComment } from "./html-comment-extension";

const lowlight = createLowlight(common);
const EMPTY_DOC = { type: "doc", content: [{ type: "paragraph" }] };

/** RichEditor's extensions. */
export function editorExtensions(): Extensions {
  return [
    // Link and Underline are bundled in StarterKit 3. Link is registered
    // once below with our options; Underline is off so `C++ … C++` stays text.
    StarterKit.configure({ codeBlock: false, link: false, underline: false }),
    Markdown,
    Placeholder.configure({
      placeholder: "Write your script...",
    }),
    LinkExtension.configure({
      openOnClick: false,
      HTMLAttributes: {
        class: "text-primary underline cursor-pointer",
        rel: "noopener noreferrer nofollow",
      },
    }),
    Table.configure({ resizable: false }),
    TableRow,
    TableCell,
    TableHeader,
    CodeBlockLowlight.configure({ lowlight }),
    HtmlComment,
    AnnotationsExtension,
  ];
}

/**
 * Load the writer's markdown into the editor without emitting an update.
 * Unless `undoable`, the load is kept out of undo history, so Ctrl+Z right
 * after opening a script can't empty the editor (and autosave the empty
 * draft). Returns the front matter kept aside, which the editor has no node
 * for; pass it to `editorMarkdown`.
 */
export function loadMarkdown(editor: Editor, markdown: string, { undoable = false } = {}): string {
  const { frontMatter, body } = splitFrontMatter(markdown);
  let chain = editor.chain();
  if (!undoable) chain = chain.setMeta("addToHistory", false);
  // An empty markdown parse has no block for the document to hold.
  if (body.trim()) chain.setContent(body, { contentType: "markdown", emitUpdate: false }).run();
  else chain.setContent(EMPTY_DOC, { emitUpdate: false }).run();
  return frontMatter;
}

/** The editor's document as the markdown to store, front matter put back as written. */
export function editorMarkdown(editor: Editor, frontMatter: string): string {
  return frontMatter + cleanSerializedMarkdown(editor.getMarkdown());
}

let headless: { schema: Schema; manager: MarkdownManager } | null = null;

function headlessEditor() {
  if (!headless) {
    const extensions = editorExtensions();
    headless = { schema: getSchema(extensions), manager: new MarkdownManager({ extensions }) };
  }
  return headless;
}

function parseBody(body: string): PMNode {
  const { schema, manager } = headlessEditor();
  return schema.nodeFromJSON(manager.parse(body));
}

function serializeDoc(doc: PMNode): string {
  return cleanSerializedMarkdown(headlessEditor().manager.serialize(doc.toJSON()));
}

/** What the WYSIWYG editor stores for `markdown` once the writer edits it. */
export function wysiwygRoundTrip(markdown: string): string {
  const { frontMatter, body } = splitFrontMatter(markdown);
  if (!body.trim()) return markdown;
  return frontMatter + serializeDoc(parseBody(body));
}

/** A list item opening with a comment block, which the editor's list items can't hold. */
const LIST_ITEM_COMMENT = /^\s*(?:>\s?)*\s*(?:[-*+]|\d+[.)])\s+<!--/;

function opensListItemWithComment(doc: PMNode): boolean {
  let found = false;
  doc.descendants((node) => {
    if (node.type.name === "listItem" && node.firstChild?.type.name === "htmlComment") found = true;
    return !found;
  });
  return found;
}

/**
 * The first line the WYSIWYG editor would rewrite (images, task checkboxes,
 * footnotes, inline HTML, entities...) or can't hold, or null when it keeps
 * the writer's text. Such a script stays in Markdown mode unless the writer
 * opts in.
 */
export function findWysiwygRewrite(markdown: string): RewrittenLine | null {
  if (!markdown.trim()) return null;
  try {
    const { frontMatter, body } = splitFrontMatter(markdown);
    if (!body.trim()) return null;
    const doc = parseBody(body);
    if (opensListItemWithComment(doc)) {
      const lines = markdown.split("\n");
      const at = Math.max(0, lines.findIndex((l) => LIST_ITEM_COMMENT.test(l)));
      return { line: at + 1, text: lines[at].trim() };
    }
    return findRewrittenLine(markdown, frontMatter + serializeDoc(doc));
  } catch {
    // Markdown the parser chokes on would fail in the editor too; don't add a second error.
    return null;
  }
}
