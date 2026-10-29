"use client";

import { useCallback, useMemo, useState, type ReactNode } from "react";
import type { Editor } from "@tiptap/react";
import { Button } from "@/components/ui/button";
import { useAppStore, type EditorMode } from "@/stores/app-store";
import type { RewrittenLine } from "@/lib/markdown/serialize";
import { RichEditor } from "./RichEditor";
import { MarkdownSourceEditor } from "./MarkdownSourceEditor";
import { findWysiwygRewrite } from "./editor-content";
import type { Annotation } from "./annotations-extension";

interface EditorPaneProps {
  content: string;
  onChange: (value: string) => void;
  annotations?: Annotation[];
  onAnnotationClick?: (id: string | null) => void;
  onEditorReady?: (editor: Editor | null) => void;
  /** Rendered inside the editor column (anchored note/fact cards). WYSIWYG only. */
  overlay?: ReactNode;
}

export interface WysiwygGuard {
  /** The line the WYSIWYG editor would rewrite in the checked text, if any. */
  rewrite: RewrittenLine | null;
  /** Show the markdown editor (with a notice) although the stored mode is WYSIWYG. */
  keepMarkdown: boolean;
  /** An editor emitted this text (the writer's own typing: never re-checked). */
  emitted: (value: string) => void;
  /** The writer chose to edit the checked text visually anyway. */
  editVisually: () => void;
}

/**
 * Whether the stored WYSIWYG mode is safe for `content`. Checked when the
 * script loads, when the mode switches and when text arrives from outside
 * (a restore); never while the writer types.
 */
export function useWysiwygGuard(content: string, editorMode: EditorMode): WysiwygGuard {
  /**
   * Last text either editor emitted since the last check. Any other `content`
   * came from outside (load, restore), even text the writer typed earlier
   * (restoring the version they saved it in).
   */
  const [emitted, setEmitted] = useState<string | null>(null);
  /** The text checked against the WYSIWYG round trip, and the mode it was checked in. */
  const [checked, setChecked] = useState({ content, mode: editorMode });
  /** Text the writer chose to edit visually despite the notice. */
  const [visualAnyway, setVisualAnyway] = useState<string | null>(null);

  if (editorMode !== checked.mode || (content !== emitted && content !== checked.content)) {
    setChecked({ content, mode: editorMode });
    if (emitted !== null) setEmitted(null);
  }

  const rewrite = useMemo(
    () => (checked.mode === "wysiwyg" ? findWysiwygRewrite(checked.content) : null),
    [checked]
  );
  const checkedContent = checked.content;
  const editVisually = useCallback(() => setVisualAnyway(checkedContent), [checkedContent]);

  return {
    rewrite,
    keepMarkdown: rewrite !== null && visualAnyway !== checkedContent,
    emitted: setEmitted,
    editVisually,
  };
}

/**
 * WYSIWYG (with highlights) or raw markdown, per the stored editor mode. A
 * script with markdown the WYSIWYG editor would rewrite (images, task
 * checkboxes, footnotes, inline HTML...) stays in the markdown editor, with a
 * notice, unless the writer chooses to edit it visually anyway. The stored
 * mode preference is left alone.
 */
export function EditorPane({ content, onChange, annotations, onAnnotationClick, onEditorReady, overlay }: EditorPaneProps) {
  const editorMode = useAppStore((s) => s.editorMode);
  const { rewrite, keepMarkdown, emitted, editVisually } = useWysiwygGuard(content, editorMode);

  const handleChange = useCallback(
    (value: string) => {
      emitted(value);
      onChange(value);
    },
    [emitted, onChange]
  );

  if (editorMode === "markdown" || keepMarkdown) {
    return (
      <>
        {keepMarkdown && rewrite && (
          <div
            role="status"
            className="mx-4 mb-2 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl bg-stone-100 px-3 py-2 text-xs leading-relaxed text-stone-700"
          >
            <p className="min-w-0 flex-1 [overflow-wrap:anywhere]">
              Kept in markdown so nothing gets rewritten: the visual editor can&apos;t keep line {rewrite.line}
              {rewrite.text && (
                <>
                  {" "}
                  (<code className="font-mono text-[11px] text-stone-800">{shorten(rewrite.text)}</code>)
                </>
              )}{" "}
              as written. Note highlights show only in the visual editor.
            </p>
            <Button variant="outline" size="xs" onClick={editVisually}>
              Edit visually anyway
            </Button>
          </div>
        )}
        <MarkdownSourceEditor value={content} onChange={handleChange} />
      </>
    );
  }

  return (
    <div className="tiptap-editor-container relative">
      <RichEditor
        value={content}
        onChange={handleChange}
        annotations={annotations}
        onAnnotationClick={onAnnotationClick}
        onEditorReady={onEditorReady}
      />
      {overlay}
    </div>
  );
}

function shorten(text: string, max = 60): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}
