// One highlight layer for everything anchored to the writer's text: council
// notes, fact notes and beats. Anchors are quotes of the markdown; the editor
// shows rendered text. Both sides go through the same projection
// (markdownToPlain + normalizeForMatch from src/lib/text/anchor.ts), and the
// editor text is built together with its position map in a single pass, so a
// match can never drift off by the block/leaf counting that broke the old
// per-feature extensions (I08).

import { Extension, type Editor } from "@tiptap/core";
import { Plugin, PluginKey, type EditorState } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import type { Node as PMNode } from "@tiptap/pm/model";
import { markdownToPlain, normalizeForMatch, type NormalizedText } from "@/lib/text/anchor";

export type AnnotationKind = "note" | "fact" | "beat";

export interface Annotation {
  /** "note:12" | "fact:7" | "beat:3" */
  id: string;
  kind: AnnotationKind;
  /** Verbatim quote of the script (markdown allowed; it is projected to plain text). */
  anchorText: string;
  priority?: "high" | "medium" | "low";
  active: boolean;
}

export interface AnnotationRange {
  from: number;
  to: number;
}

/** Editor text plus, for every character, the document position it came from. */
export interface TextMap {
  text: string;
  pos: number[];
}

/**
 * Single pass over the document. Text characters map to their own position;
 * a "\n" separates blocks (and stands in for hard breaks), other inline leaves
 * become a space. Separators are never the first or last character of a
 * match because anchors are trimmed.
 */
export function buildTextMap(doc: PMNode): TextMap {
  let text = "";
  const pos: number[] = [];

  doc.descendants((node, nodePos) => {
    if (node.isText) {
      const t = node.text ?? "";
      text += t;
      for (let i = 0; i < t.length; i++) pos.push(nodePos + i);
      return false;
    }
    if (node.isBlock) {
      if (text.length > 0 && text[text.length - 1] !== "\n") {
        text += "\n";
        pos.push(nodePos);
      }
      return true;
    }
    if (node.isLeaf) {
      text += node.type.name === "hardBreak" ? "\n" : " ";
      pos.push(nodePos);
      return false;
    }
    return true;
  });

  return { text, pos };
}

/**
 * Anchor search over one text map with the same tiers as findAnchorInText
 * (exact, then normalised, then case-folded). The normalised projections are
 * built at most once per map, so many anchors cost one pass, not one each.
 */
export function createAnchorFinder(map: TextMap): (anchor: string) => AnnotationRange | null {
  let normalized: NormalizedText | undefined;
  let folded: NormalizedText | undefined;

  const toRange = (start: number, end: number): AnnotationRange | null => {
    const from = map.pos[start];
    const last = map.pos[end - 1];
    if (from === undefined || last === undefined) return null;
    const to = last + 1;
    return to > from ? { from, to } : null;
  };

  return (anchor: string) => {
    const needle = markdownToPlain(anchor).trim();
    if (!needle) return null;

    const exact = map.text.indexOf(needle);
    if (exact !== -1) return toRange(exact, exact + needle.length);

    for (const caseFold of [false, true]) {
      const hay = caseFold
        ? (folded ??= normalizeForMatch(map.text, { caseFold: true }))
        : (normalized ??= normalizeForMatch(map.text));
      const n = normalizeForMatch(needle, { caseFold }).text;
      if (!n) return null;
      const idx = hay.text.indexOf(n);
      if (idx !== -1) return toRange(hay.map[idx], hay.map[idx + n.length - 1] + 1);
    }
    return null;
  };
}

/** Where an anchor sits in a document, or null if the text is gone. */
export function findAnchorRangeInDoc(doc: PMNode, anchorText: string): AnnotationRange | null {
  return createAnchorFinder(buildTextMap(doc))(anchorText);
}

// --- Plugin ---------------------------------------------------------------

interface AnnotationsState {
  annotations: Annotation[];
  ranges: Map<string, AnnotationRange>;
  decorations: DecorationSet;
}

type AnnotationsMeta = { type: "set"; annotations: Annotation[] };

export const annotationsPluginKey = new PluginKey<AnnotationsState>("annotations");

const EMPTY_STATE: AnnotationsState = {
  annotations: [],
  ranges: new Map(),
  decorations: DecorationSet.empty,
};

const PRIORITY_LABEL: Record<NonNullable<Annotation["priority"]>, string> = {
  high: "High priority note",
  medium: "Note",
  low: "Low priority note",
};

function classFor(a: Annotation): string {
  const parts = ["annotation", `annotation-${a.kind}`];
  if (a.kind === "note") parts.push(`annotation-note-${a.priority ?? "medium"}`);
  if (a.active) parts.push("annotation-active");
  return parts.join(" ");
}

function priorityDot(a: Annotation): () => HTMLElement {
  return () => {
    const el = document.createElement("span");
    const priority = a.priority ?? "medium";
    el.className = `annotation-dot annotation-dot-${priority}${a.active ? " annotation-dot-active" : ""}`;
    el.setAttribute("data-annotation-id", a.id);
    el.setAttribute("contenteditable", "false");
    el.setAttribute("aria-hidden", "true");
    el.title = PRIORITY_LABEL[priority];
    return el;
  };
}

function computeState(doc: PMNode, annotations: Annotation[]): AnnotationsState {
  if (annotations.length === 0) return { ...EMPTY_STATE, annotations };

  const find = createAnchorFinder(buildTextMap(doc));
  const ranges = new Map<string, AnnotationRange>();
  const decorations: Decoration[] = [];

  // Active last, so its span is the innermost when ranges overlap.
  const ordered = [...annotations].sort((a, b) => Number(a.active) - Number(b.active));
  for (const a of ordered) {
    const range = find(a.anchorText);
    if (!range) continue;
    ranges.set(a.id, range);
    decorations.push(
      Decoration.inline(range.from, range.to, { class: classFor(a), "data-annotation-id": a.id }, { id: a.id })
    );
    if (a.kind === "note") {
      decorations.push(
        Decoration.widget(range.from, priorityDot(a), {
          side: -1,
          ignoreSelection: true,
          key: `dot:${a.id}:${a.priority ?? "medium"}:${a.active ? 1 : 0}`,
        })
      );
    }
  }

  return { annotations, ranges, decorations: DecorationSet.create(doc, decorations) };
}

function smallestRange(state: EditorState, contains: (r: AnnotationRange) => boolean): string | null {
  const ranges = annotationsPluginKey.getState(state)?.ranges;
  if (!ranges) return null;
  let best: { id: string; size: number } | null = null;
  for (const [id, r] of ranges) {
    if (!contains(r)) continue;
    const size = r.to - r.from;
    if (!best || size < best.size) best = { id, size };
  }
  return best?.id ?? null;
}

/**
 * The smallest annotation range containing `pos`, read as the character that
 * starts there: `to` (just after the last highlighted character) is outside.
 */
export function findAnnotationAtPos(state: EditorState, pos: number): string | null {
  return smallestRange(state, (r) => pos >= r.from && pos < r.to);
}

/**
 * The annotation a click landed on: the innermost highlighted element under
 * the pointer (also catches the priority dot), else the smallest range with
 * the position strictly inside it. A click resolving to a range's edge (blank
 * space after a highlighted line end, or the half of a neighbouring character
 * next to a highlight) is plain text: only the element decides those. Null
 * for plain text.
 */
export function annotationIdAtClick(state: EditorState, pos: number, event: MouseEvent): string | null {
  const target =
    typeof Element !== "undefined" && event.target instanceof Element
      ? event.target.closest("[data-annotation-id]")
      : null;
  return target?.getAttribute("data-annotation-id") ?? smallestRange(state, (r) => pos > r.from && pos < r.to);
}

/**
 * The ProseMirror plugin on its own (used by the extension and by tests).
 * `onClick` receives the clicked annotation's id, or null for a click on
 * plain text.
 */
export function createAnnotationsPlugin(onClick?: (id: string | null) => void): Plugin<AnnotationsState> {
  return new Plugin<AnnotationsState>({
    key: annotationsPluginKey,
    state: {
      init: () => EMPTY_STATE,
      apply(tr, prev, _oldState, newState) {
        const meta = tr.getMeta(annotationsPluginKey) as AnnotationsMeta | undefined;
        if (meta?.type === "set") return computeState(newState.doc, meta.annotations);
        if (tr.docChanged) return computeState(newState.doc, prev.annotations);
        return prev;
      },
    },
    props: {
      decorations(state) {
        return annotationsPluginKey.getState(state)?.decorations ?? DecorationSet.empty;
      },
      handleClick(view, pos, event) {
        onClick?.(annotationIdAtClick(view.state, pos, event));
        return false;
      },
    },
  });
}

export interface AnnotationsOptions {
  onClick: ((id: string | null) => void) | null;
}

export const AnnotationsExtension = Extension.create<AnnotationsOptions>({
  name: "annotations",

  addOptions() {
    return { onClick: null };
  },

  addProseMirrorPlugins() {
    return [createAnnotationsPlugin((id) => this.options.onClick?.(id))];
  },
});

// --- Public helpers -----------------------------------------------------------

/** Replace the annotation set (not added to undo history). */
export function setAnnotations(editor: Editor, annotations: Annotation[]) {
  if (editor.isDestroyed) return;
  const tr = editor.state.tr
    .setMeta(annotationsPluginKey, { type: "set", annotations } satisfies AnnotationsMeta)
    .setMeta("addToHistory", false);
  editor.view.dispatch(tr);
}

/** Current document range of an annotation (for card positioning). */
export function findAnnotationRange(editor: Editor, id: string): AnnotationRange | null {
  if (editor.isDestroyed) return null;
  return annotationsPluginKey.getState(editor.state)?.ranges.get(id) ?? null;
}

function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
}

/** Scroll the editor so a document range is in the middle of the viewport. */
export function scrollRangeIntoView(editor: Editor, range: AnnotationRange) {
  if (editor.isDestroyed) return;
  try {
    const { node } = editor.view.domAtPos(range.from);
    const el = node instanceof Element ? node : node.parentElement;
    el?.scrollIntoView({ block: "center", behavior: prefersReducedMotion() ? "auto" : "smooth" });
  } catch {
    // position no longer in the document
  }
}

/**
 * Scroll to a quoted passage of the script (list clicks, beat jumps).
 * Returns false when the passage is no longer in the text.
 */
export function scrollToAnchor(editor: Editor, anchorText: string): boolean {
  if (editor.isDestroyed) return false;
  const range = findAnchorRangeInDoc(editor.state.doc, anchorText);
  if (!range) return false;
  scrollRangeIntoView(editor, range);
  return true;
}
