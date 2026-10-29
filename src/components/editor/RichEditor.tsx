"use client";

import { useEditor, EditorContent, type Editor } from "@tiptap/react";
import { useEffect, useRef } from "react";
import { splitFrontMatter } from "@/lib/markdown/serialize";
import { annotationIdAtClick, setAnnotations, type Annotation } from "./annotations-extension";
import { editorExtensions, editorMarkdown, loadMarkdown } from "./editor-content";

interface RichEditorProps {
  value: string;
  onChange: (value: string) => void;
  /** Notes, fact notes and beats to highlight. */
  annotations?: Annotation[];
  /** Called with the clicked annotation id, or null for a click on plain text. */
  onAnnotationClick?: (id: string | null) => void;
  onEditorReady?: (editor: Editor | null) => void;
}

const NO_ANNOTATIONS: Annotation[] = [];

/** Stable identity for an annotation list, so unchanged lists aren't re-dispatched. */
function annotationsKey(list: Annotation[]): string {
  return list.map((a) => `${a.id}|${a.kind}|${a.priority ?? ""}|${a.active ? 1 : 0}|${a.anchorText}`).join("\n");
}

export function RichEditor({
  value,
  onChange,
  annotations = NO_ANNOTATIONS,
  onAnnotationClick,
  onEditorReady,
}: RichEditorProps) {
  const needsMarkdownInit = useRef(true);
  /** Last markdown this editor emitted, so echoing it back is a no-op. */
  const lastEmitted = useRef<string | null>(null);
  /** Front matter of the loaded script, written back as is (the editor has no node for it). */
  const frontMatter = useRef("");
  const onChangeRef = useRef(onChange);
  const onAnnotationClickRef = useRef(onAnnotationClick);
  const appliedAnnotations = useRef<string | null>(null);

  useEffect(() => {
    onChangeRef.current = onChange;
    onAnnotationClickRef.current = onAnnotationClick;
  });

  const editor = useEditor({
    immediatelyRender: false,
    extensions: editorExtensions(),
    content: "",
    // Programmatic loads pass emitUpdate: false, so every update here is the
    // writer's own edit (or their undo/redo of one).
    onUpdate: ({ editor: ed }) => {
      // The writer has typed: from now on the editor is the source of truth.
      needsMarkdownInit.current = false;
      const md = editorMarkdown(ed, frontMatter.current);
      lastEmitted.current = md;
      onChangeRef.current(md);
    },
    editorProps: {
      handleClick: (view, pos, event) => {
        onAnnotationClickRef.current?.(annotationIdAtClick(view.state, pos, event));
        return false;
      },
      attributes: {
        class: "prose prose-lg max-w-none min-h-[50vh] px-4 py-6 outline-none focus:outline-none",
        "aria-label": "Script",
        role: "textbox",
        "aria-multiline": "true",
      },
    },
  });

  // Hand the editor to the parent (cards, scrolling, section review).
  useEffect(() => {
    onEditorReady?.(editor);
    return () => onEditorReady?.(null);
  }, [editor, onEditorReady]);

  // Sync external content. The first load (also after switching back from
  // markdown mode, which remounts this editor) always parses markdown: initial
  // content is empty and `contentType` does not apply in onBeforeCreate. It is
  // kept out of undo history, so Ctrl+Z can't undo the script away. A later
  // external change is a version restore, which stays undoable (undoing it
  // returns to the writer's previous draft) unless it brings different front
  // matter, which undo couldn't put back. Echoes of what the editor just
  // emitted are skipped.
  useEffect(() => {
    if (!editor) return;
    if (value === lastEmitted.current) return;
    if (needsMarkdownInit.current) {
      if (!value) return;
      needsMarkdownInit.current = false;
      lastEmitted.current = value;
      frontMatter.current = loadMarkdown(editor, value);
      return;
    }
    const currentMd = editorMarkdown(editor, frontMatter.current);
    lastEmitted.current = value;
    if (value !== currentMd) {
      const undoable = splitFrontMatter(value).frontMatter === frontMatter.current;
      frontMatter.current = loadMarkdown(editor, value, { undoable });
    }
  }, [editor, value]);

  // Push highlights into the annotations plugin when they actually change.
  useEffect(() => {
    if (!editor) return;
    const key = annotationsKey(annotations);
    if (key === appliedAnnotations.current) return;
    appliedAnnotations.current = key;
    setAnnotations(editor, annotations);
  }, [editor, annotations]);

  return <EditorContent editor={editor} />;
}
