import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import type { EditorState } from "@tiptap/pm/state";
import type { Editor } from "@tiptap/react";
import type { ProductionDirectionWithStaleness } from "@/types";

// --- Plugin Key ---

const directionPluginKey = new PluginKey("directionHighlight");

// --- Plugin Meta Types ---

interface DirectionPluginState {
  directions: ProductionDirectionWithStaleness[];
  activeDirectionId: number | null;
  decorations: DecorationSet;
}

type DirectionMeta =
  | { type: "setDirections"; directions: ProductionDirectionWithStaleness[] }
  | { type: "setActive"; id: number | null };

// --- Helpers ---

const typeClass: Record<string, string> = {
  "talking-head": "direction-highlight direction-highlight-talking-head",
  "b-roll": "direction-highlight direction-highlight-b-roll",
  "motion-graphics": "direction-highlight direction-highlight-motion-graphics",
  "screen-recording": "direction-highlight direction-highlight-screen-recording",
  "text-overlay": "direction-highlight direction-highlight-text-overlay",
  archival: "direction-highlight direction-highlight-archival",
  "interview-clip": "direction-highlight direction-highlight-interview-clip",
  mixed: "direction-highlight direction-highlight-mixed",
};

interface TextRange {
  from: number;
  to: number;
}

function getDocText(state: EditorState): string {
  return state.doc.textBetween(0, state.doc.content.size, "\n", "\0");
}

function findTextRange(
  state: EditorState,
  searchText: string
): TextRange | null {
  const docText = getDocText(state);
  const idx = docText.indexOf(searchText);
  if (idx === -1) return null;

  let charCount = 0;
  let from = -1;
  let to = -1;

  state.doc.descendants((node, pos) => {
    if (to !== -1) return false;
    if (node.isText && node.text) {
      const start = charCount;
      const end = charCount + node.text.length;
      if (from === -1 && idx < end) {
        from = pos + (idx - start);
      }
      if (from !== -1 && idx + searchText.length <= end) {
        to = pos + (idx + searchText.length - start);
      }
      charCount = end;
    } else if (node.isBlock && charCount > 0) {
      charCount += 1;
    }
    return undefined;
  });

  if (from >= 0 && to > from) {
    return { from, to };
  }
  return null;
}

function buildDecorations(
  state: EditorState,
  directions: ProductionDirectionWithStaleness[],
  activeDirectionId: number | null
): DecorationSet {
  const decorations: Decoration[] = [];

  for (const d of directions) {
    if (d.status !== "pending") continue;

    const range = findTextRange(state, d.originalText);
    if (!range) continue;

    const effectiveType = d.userOverrideType || d.directionType;
    const isActive = d.id === activeDirectionId;
    const cls = isActive
      ? "direction-highlight direction-highlight-active"
      : typeClass[effectiveType] || typeClass.mixed;

    decorations.push(
      Decoration.inline(range.from, range.to, {
        class: cls,
        "data-direction-id": String(d.id),
      })
    );
  }

  return DecorationSet.create(state.doc, decorations);
}

// --- Tiptap Extension ---

export const DirectionHighlightExtension = Extension.create({
  name: "directionHighlight",

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: directionPluginKey,
        state: {
          init(): DirectionPluginState {
            return {
              directions: [],
              activeDirectionId: null,
              decorations: DecorationSet.empty,
            };
          },
          apply(tr, prevState, _oldState, newState): DirectionPluginState {
            const meta = tr.getMeta(directionPluginKey) as
              | DirectionMeta
              | undefined;

            let { directions, activeDirectionId } = prevState;
            let needsRebuild = false;

            if (meta) {
              if (meta.type === "setDirections") {
                directions = meta.directions;
                needsRebuild = true;
              } else if (meta.type === "setActive") {
                activeDirectionId = meta.id;
                needsRebuild = true;
              }
            }

            if (needsRebuild || tr.docChanged) {
              return {
                directions,
                activeDirectionId,
                decorations: buildDecorations(
                  newState,
                  directions,
                  activeDirectionId
                ),
              };
            }

            return prevState;
          },
        },
        props: {
          decorations(state) {
            return (
              directionPluginKey.getState(state)?.decorations ??
              DecorationSet.empty
            );
          },
        },
      }),
    ];
  },
});

// --- Public API ---

export function setDirections(
  editor: Editor,
  directions: ProductionDirectionWithStaleness[]
) {
  const { state, view } = editor;
  view.dispatch(
    state.tr.setMeta(directionPluginKey, {
      type: "setDirections",
      directions,
    } satisfies DirectionMeta)
  );
}

export function setActiveDirection(editor: Editor, id: number | null) {
  const { state, view } = editor;
  view.dispatch(
    state.tr.setMeta(directionPluginKey, {
      type: "setActive",
      id,
    } satisfies DirectionMeta)
  );

  // Scroll to direction if activating
  if (id !== null) {
    const pluginState = directionPluginKey.getState(
      editor.state
    ) as DirectionPluginState | undefined;
    const direction = pluginState?.directions.find((d) => d.id === id);
    if (direction) {
      const range = findTextRange(editor.state, direction.originalText);
      if (range) {
        const coords = editor.view.coordsAtPos(range.from);
        const editorDom = editor.view.dom.closest(".ProseMirror")
          ?.parentElement;
        if (editorDom && coords) {
          editorDom.scrollTo({
            top:
              editorDom.scrollTop +
              coords.top -
              editorDom.getBoundingClientRect().top -
              100,
            behavior: "smooth",
          });
        }
      }
    }
  }
}

export function findDirectionAtPos(
  state: EditorState,
  pos: number
): number | null {
  const pluginState = directionPluginKey.getState(
    state
  ) as DirectionPluginState | undefined;
  if (!pluginState) return null;

  for (const d of pluginState.directions) {
    if (d.status !== "pending") continue;
    const range = findTextRange(state, d.originalText);
    if (range && pos >= range.from && pos <= range.to) {
      return d.id;
    }
  }

  return null;
}

export function getDirectionRange(
  state: EditorState,
  directionId: number
): TextRange | null {
  const pluginState = directionPluginKey.getState(
    state
  ) as DirectionPluginState | undefined;
  if (!pluginState) return null;

  const direction = pluginState.directions.find((d) => d.id === directionId);
  if (!direction) return null;

  return findTextRange(state, direction.originalText);
}
