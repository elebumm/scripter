"use client";

import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { visit } from "unist-util-visit";
import type { Blockquote, Paragraph, Root } from "mdast";
import { ScrollArea } from "@/components/ui/scroll-area";

// Renders model output and fact-check text. Raw HTML is never interpreted
// (no rehype-raw): any HTML in the markdown is shown as text.

const CALLOUT = /^\[!([\w-]+)\][+-]?[ \t]*([^\n]*)/;

/**
 * Obsidian-style callouts (`> [!tip] Title`) become
 * div.callout[data-callout-type] > div.callout-title + div.callout-content,
 * built as elements via hName/hProperties instead of raw HTML strings.
 */
function remarkCalloutElements() {
  return (tree: Root) => {
    visit(tree, "blockquote", (node: Blockquote) => {
      const first = node.children[0];
      if (!first || first.type !== "paragraph") return;
      const lead = first.children[0];
      if (!lead || lead.type !== "text") return;
      const match = lead.value.match(CALLOUT);
      if (!match) return;

      const type = match[1].toLowerCase();
      const title = match[2].trim() || type.charAt(0).toUpperCase() + type.slice(1);

      const rest = lead.value.slice(match[0].length).replace(/^\n/, "");
      if (rest) lead.value = rest;
      else first.children.shift();
      if (first.children[0]?.type === "break") first.children.shift();
      const body = first.children.length > 0 ? node.children : node.children.slice(1);

      const titleNode: Paragraph = {
        type: "paragraph",
        children: [{ type: "text", value: title }],
        data: { hName: "div", hProperties: { className: ["callout-title"] } },
      };
      const contentNode: Blockquote = {
        type: "blockquote",
        children: body,
        data: { hName: "div", hProperties: { className: ["callout-content"] } },
      };
      node.data = { ...node.data, hName: "div", hProperties: { className: ["callout"], dataCalloutType: type } };
      node.children = [titleNode, contentNode];
    });
  };
}

const components: Components = {
  a: ({ href, title, children }) => (
    <a href={href} title={title} target="_blank" rel="noopener noreferrer">
      {children}
    </a>
  ),
  // Images are never loaded: a model could otherwise make the browser request
  // any URL (with script words in it) just by the run being opened. The alt
  // text stays as plain text.
  img: ({ alt }) => (alt ? <span>{alt}</span> : null),
};

interface MarkdownPreviewProps {
  content: string;
  className?: string;
}

export function MarkdownPreview({ content, className }: MarkdownPreviewProps) {
  return (
    <ScrollArea className={`overflow-hidden ${className ?? ""}`}>
      <div className="prose prose-sm max-w-none min-w-0 p-4 break-words">
        <ReactMarkdown remarkPlugins={[remarkGfm, remarkCalloutElements]} components={components}>
          {content}
        </ReactMarkdown>
      </div>
    </ScrollArea>
  );
}
