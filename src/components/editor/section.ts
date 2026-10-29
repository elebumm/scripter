// What "Review this section" would send. Section review is explicit only
// (I17): the writer picks it from the Consult menu, and this decides whether
// that menu item is available and what it covers.

import type { EditorState } from "@tiptap/pm/state";

export interface ReviewSection {
  /** Plain text of the section, sent as `sectionOnly`. */
  text: string;
  /** Short label for the menu and progress text. */
  label: string;
  source: "selection" | "heading";
}

/** Shorter selections are almost always accidental. */
export const MIN_SECTION_CHARS = 40;

function shorten(text: string, words = 7): string {
  const parts = text.replace(/\s+/g, " ").trim().split(" ");
  return parts.length > words ? `${parts.slice(0, words).join(" ")}…` : parts.join(" ");
}

/**
 * The section to review: the current selection when it is long enough,
 * otherwise the H2 section around the cursor (up to the next H1/H2).
 * Null when neither applies.
 */
export function getReviewableSection(state: EditorState): ReviewSection | null {
  const { doc, selection } = state;

  if (!selection.empty) {
    const text = doc.textBetween(selection.from, selection.to, "\n", " ").trim();
    if (text.length >= MIN_SECTION_CHARS) {
      return { text, label: `“${shorten(text)}”`, source: "selection" };
    }
  }

  const cursor = selection.from;
  let start: number | null = null;
  let end: number | null = null;
  let heading = "";

  for (let i = 0, offset = 0; i < doc.childCount; i++) {
    const node = doc.child(i);
    const level = node.type.name === "heading" ? Number(node.attrs.level) : null;
    if (offset <= cursor) {
      if (level === 2) {
        start = offset;
        heading = node.textContent.trim();
      } else if (level === 1) {
        start = null;
      }
    } else if (start !== null && level !== null && level <= 2) {
      end = offset;
      break;
    }
    offset += node.nodeSize;
  }

  if (start === null) return null;
  const text = doc.textBetween(start, end ?? doc.content.size, "\n", " ").trim();
  if (!text) return null;
  return { text, label: heading ? shorten(heading, 8) : "This section", source: "heading" };
}
