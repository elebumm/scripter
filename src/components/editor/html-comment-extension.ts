// HTML comments (`<!-- … -->` on their own lines, like the templates'
// guidance) as a block the editor keeps. Without it the browser parses a
// comment to nothing, so saving would delete it and every template-based
// draft would be held in markdown mode. The comment is shown as a quiet hint
// and written back exactly as it was; it is never spoken or counted, and
// markdownToPlain leaves it out like the editor's text does.
// Inline comments inside a paragraph still keep a script in markdown mode.

import { Node, mergeAttributes } from "@tiptap/core";
import { commentBlockText } from "@/lib/markdown/serialize";

/** What the hint shows: the comment text without its delimiters. */
export function commentHint(text: string): string {
  return text
    .split(/-->\s*/)
    .map((part) => part.replace(/^\s*<!--/, "").trim())
    .filter(Boolean)
    .join("\n");
}

export const HtmlComment = Node.create({
  name: "htmlComment",
  group: "block",
  atom: true,
  selectable: true,
  draggable: false,

  addAttributes() {
    return {
      text: {
        default: "",
        parseHTML: (el) => el.getAttribute("data-html-comment") ?? "",
        renderHTML: (attrs) => ({ "data-html-comment": attrs.text }),
      },
    };
  },

  parseHTML() {
    return [{ tag: "div[data-html-comment]" }];
  },

  renderHTML({ node, HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, { class: "html-comment", contenteditable: "false" }),
      commentHint(node.attrs.text) || "(empty comment)",
    ];
  },

  markdownTokenName: "html",

  // An empty result hands every other HTML token to the default handling.
  parseMarkdown: (token, helpers) => {
    if (!token.block) return [];
    const text = commentBlockText(String(token.raw ?? token.text ?? ""));
    return text ? helpers.createNode("htmlComment", { text }) : [];
  },

  renderMarkdown: (node) => String(node.attrs?.text ?? ""),
});
