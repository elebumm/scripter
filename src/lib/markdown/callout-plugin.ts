import { visit } from "unist-util-visit";
import type { Plugin } from "unified";
import type { Blockquote, Parent } from "mdast";

const CALLOUT_REGEX = /^\[!([\w-]+)\]\s*(.*)?$/;

export const remarkCallouts: Plugin = () => {
  return (tree) => {
    visit(tree, "blockquote", (node: Blockquote, index, parent: Parent | undefined) => {
      if (!parent || index === undefined) return;
      const firstChild = node.children[0];
      if (!firstChild || firstChild.type !== "paragraph") return;

      const firstInline = firstChild.children[0];
      if (!firstInline || firstInline.type !== "text") return;

      const match = firstInline.value.match(CALLOUT_REGEX);
      if (!match) return;

      const calloutType = match[1].toLowerCase();
      const title = match[2] || calloutType.charAt(0).toUpperCase() + calloutType.slice(1);

      // Remove the callout marker from text
      const remainingText = firstInline.value.replace(CALLOUT_REGEX, "").trim();
      if (remainingText) {
        firstInline.value = remainingText;
      } else {
        firstChild.children.shift();
        // Remove leading line break if present
        if (
          firstChild.children[0] &&
          firstChild.children[0].type === "text" &&
          firstChild.children[0].value.startsWith("\n")
        ) {
          firstChild.children[0].value =
            firstChild.children[0].value.slice(1);
        }
      }

      // Remove empty first paragraph
      if (firstChild.children.length === 0) {
        node.children.shift();
      }

      // Replace the blockquote with a custom HTML node
      const htmlOpen = `<div class="callout" data-callout-type="${calloutType}"><div class="callout-title">${title}</div><div class="callout-content">`;
      const htmlClose = `</div></div>`;

      // We use raw HTML nodes wrapping the content
      (parent.children as unknown[]).splice(index, 1,
        { type: "html", value: htmlOpen },
        ...node.children,
        { type: "html", value: htmlClose }
      );
    });
  };
};
