import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import type { EditorState } from "@tiptap/pm/state";
import type { Editor } from "@tiptap/react";
import type { FactIssueWithStaleness } from "@/types";

// --- Plugin Key ---

const factIssuePluginKey = new PluginKey("factIssueHighlight");

// --- Plugin Meta Types ---

interface FactIssuePluginState {
  issues: FactIssueWithStaleness[];
  activeIssueId: number | null;
  decorations: DecorationSet;
}

type FactIssueMeta =
  | { type: "setIssues"; issues: FactIssueWithStaleness[] }
  | { type: "setActive"; id: number | null };

// --- Helpers ---

const verdictClass: Record<string, string> = {
  inaccurate: "fact-highlight fact-highlight-error",
  misleading: "fact-highlight fact-highlight-warning",
  unverifiable: "fact-highlight fact-highlight-caution",
  verified: "fact-highlight fact-highlight-verified",
  "exaggeration-ok": "fact-highlight fact-highlight-exaggeration",
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
  issues: FactIssueWithStaleness[],
  activeIssueId: number | null
): DecorationSet {
  const decorations: Decoration[] = [];

  for (const issue of issues) {
    if (issue.status !== "pending") continue;

    const range = findTextRange(state, issue.claimText);
    if (!range) continue;

    const isActive = issue.id === activeIssueId;
    const cls = isActive
      ? "fact-highlight fact-highlight-active"
      : verdictClass[issue.verdict] || verdictClass.unverifiable;

    decorations.push(
      Decoration.inline(range.from, range.to, {
        class: cls,
        "data-fact-issue-id": String(issue.id),
      })
    );
  }

  return DecorationSet.create(state.doc, decorations);
}

// --- Tiptap Extension ---

export const FactIssueHighlightExtension = Extension.create({
  name: "factIssueHighlight",

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: factIssuePluginKey,
        state: {
          init(): FactIssuePluginState {
            return {
              issues: [],
              activeIssueId: null,
              decorations: DecorationSet.empty,
            };
          },
          apply(tr, prevState, _oldState, newState): FactIssuePluginState {
            const meta = tr.getMeta(factIssuePluginKey) as
              | FactIssueMeta
              | undefined;

            let { issues, activeIssueId } = prevState;
            let needsRebuild = false;

            if (meta) {
              if (meta.type === "setIssues") {
                issues = meta.issues;
                needsRebuild = true;
              } else if (meta.type === "setActive") {
                activeIssueId = meta.id;
                needsRebuild = true;
              }
            }

            if (needsRebuild || tr.docChanged) {
              return {
                issues,
                activeIssueId,
                decorations: buildDecorations(
                  newState,
                  issues,
                  activeIssueId
                ),
              };
            }

            return prevState;
          },
        },
        props: {
          decorations(state) {
            return (
              factIssuePluginKey.getState(state)?.decorations ??
              DecorationSet.empty
            );
          },
        },
      }),
    ];
  },
});

// --- Public API ---

export function setFactIssues(
  editor: Editor,
  issues: FactIssueWithStaleness[]
) {
  const { state, view } = editor;
  view.dispatch(
    state.tr.setMeta(factIssuePluginKey, {
      type: "setIssues",
      issues,
    } satisfies FactIssueMeta)
  );
}

export function setActiveFactIssue(editor: Editor, id: number | null) {
  const { state, view } = editor;
  view.dispatch(
    state.tr.setMeta(factIssuePluginKey, {
      type: "setActive",
      id,
    } satisfies FactIssueMeta)
  );

  // Scroll to issue if activating
  if (id !== null) {
    const pluginState = factIssuePluginKey.getState(
      editor.state
    ) as FactIssuePluginState | undefined;
    const issue = pluginState?.issues.find((i) => i.id === id);
    if (issue) {
      const range = findTextRange(editor.state, issue.claimText);
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

export function findFactIssueAtPos(
  state: EditorState,
  pos: number
): number | null {
  const pluginState = factIssuePluginKey.getState(
    state
  ) as FactIssuePluginState | undefined;
  if (!pluginState) return null;

  for (const issue of pluginState.issues) {
    if (issue.status !== "pending") continue;
    const range = findTextRange(state, issue.claimText);
    if (range && pos >= range.from && pos <= range.to) {
      return issue.id;
    }
  }

  return null;
}

export function getFactIssueRange(
  state: EditorState,
  issueId: number
): TextRange | null {
  const pluginState = factIssuePluginKey.getState(
    state
  ) as FactIssuePluginState | undefined;
  if (!pluginState) return null;

  const issue = pluginState.issues.find((i) => i.id === issueId);
  if (!issue) return null;

  return findTextRange(state, issue.claimText);
}
