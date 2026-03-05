import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import type { EditorState } from "@tiptap/pm/state";
import type { Editor } from "@tiptap/react";
import type { Suggestion } from "@/types";

// --- Plugin Key ---

const suggestionPluginKey = new PluginKey("suggestionHighlight");

// --- Plugin Meta Types ---

interface SuggestionPluginState {
  suggestions: Suggestion[];
  activeSuggestionId: number | null;
  decorations: DecorationSet;
}

type SuggestionMeta =
  | { type: "setSuggestions"; suggestions: Suggestion[] }
  | { type: "setActive"; id: number | null };

// --- Helpers ---

const priorityClass: Record<string, string> = {
  high: "suggestion-highlight suggestion-highlight-high",
  medium: "suggestion-highlight suggestion-highlight-medium",
  low: "suggestion-highlight suggestion-highlight-low",
};

function getDocText(state: EditorState): string {
  return state.doc.textBetween(0, state.doc.content.size, "\n", "\0");
}

interface TextRange {
  from: number;
  to: number;
}

function findTextRange(
  state: EditorState,
  searchText: string
): TextRange | null {
  const docText = getDocText(state);
  const idx = docText.indexOf(searchText);
  if (idx === -1) return null;

  // Map flat text offset to ProseMirror positions
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
      // Block boundary = newline in textBetween
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
  suggestions: Suggestion[],
  activeSuggestionId: number | null
): DecorationSet {
  const decorations: Decoration[] = [];

  for (const s of suggestions) {
    if (s.status !== "pending") continue;

    const range = findTextRange(state, s.originalText);
    if (!range) continue;

    const isActive = s.id === activeSuggestionId;
    const cls = isActive
      ? "suggestion-highlight suggestion-highlight-active"
      : priorityClass[s.priority] || priorityClass.medium;

    decorations.push(
      Decoration.inline(range.from, range.to, {
        class: cls,
        "data-suggestion-id": String(s.id),
      })
    );
  }

  return DecorationSet.create(state.doc, decorations);
}

// --- Tiptap Extension ---

export const SuggestionHighlightExtension = Extension.create({
  name: "suggestionHighlight",

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: suggestionPluginKey,
        state: {
          init(): SuggestionPluginState {
            return {
              suggestions: [],
              activeSuggestionId: null,
              decorations: DecorationSet.empty,
            };
          },
          apply(tr, prevState, _oldState, newState): SuggestionPluginState {
            const meta = tr.getMeta(suggestionPluginKey) as
              | SuggestionMeta
              | undefined;

            let { suggestions, activeSuggestionId } = prevState;
            let needsRebuild = false;

            if (meta) {
              if (meta.type === "setSuggestions") {
                suggestions = meta.suggestions;
                needsRebuild = true;
              } else if (meta.type === "setActive") {
                activeSuggestionId = meta.id;
                needsRebuild = true;
              }
            }

            // Rebuild decorations on doc change or meta change
            if (needsRebuild || tr.docChanged) {
              return {
                suggestions,
                activeSuggestionId,
                decorations: buildDecorations(
                  newState,
                  suggestions,
                  activeSuggestionId
                ),
              };
            }

            return prevState;
          },
        },
        props: {
          decorations(state) {
            return suggestionPluginKey.getState(state)?.decorations ?? DecorationSet.empty;
          },
        },
      }),
    ];
  },
});

// --- Public API ---

export function setSuggestions(editor: Editor, suggestions: Suggestion[]) {
  const { state, view } = editor;
  view.dispatch(
    state.tr.setMeta(suggestionPluginKey, {
      type: "setSuggestions",
      suggestions,
    } satisfies SuggestionMeta)
  );
}

export function setActiveSuggestion(editor: Editor, id: number | null) {
  const { state, view } = editor;
  view.dispatch(
    state.tr.setMeta(suggestionPluginKey, {
      type: "setActive",
      id,
    } satisfies SuggestionMeta)
  );

  // Scroll to suggestion if activating
  if (id !== null) {
    const pluginState = suggestionPluginKey.getState(
      editor.state
    ) as SuggestionPluginState | undefined;
    const suggestion = pluginState?.suggestions.find((s) => s.id === id);
    if (suggestion) {
      const range = findTextRange(editor.state, suggestion.originalText);
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

export function findSuggestionAtPos(
  state: EditorState,
  pos: number
): number | null {
  const pluginState = suggestionPluginKey.getState(
    state
  ) as SuggestionPluginState | undefined;
  if (!pluginState) return null;

  for (const s of pluginState.suggestions) {
    if (s.status !== "pending") continue;
    const range = findTextRange(state, s.originalText);
    if (range && pos >= range.from && pos <= range.to) {
      return s.id;
    }
  }

  return null;
}

export function getSuggestionRange(
  state: EditorState,
  suggestionId: number
): TextRange | null {
  const pluginState = suggestionPluginKey.getState(
    state
  ) as SuggestionPluginState | undefined;
  if (!pluginState) return null;

  const suggestion = pluginState.suggestions.find(
    (s) => s.id === suggestionId
  );
  if (!suggestion) return null;

  return findTextRange(state, suggestion.originalText);
}
