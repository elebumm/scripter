"use client";

import { useEditor, EditorContent, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Markdown } from "@tiptap/markdown";
import Placeholder from "@tiptap/extension-placeholder";
import LinkExtension from "@tiptap/extension-link";
import { Table } from "@tiptap/extension-table";
import { TableRow } from "@tiptap/extension-table-row";
import { TableCell } from "@tiptap/extension-table-cell";
import { TableHeader } from "@tiptap/extension-table-header";
import CodeBlockLowlight from "@tiptap/extension-code-block-lowlight";
import { common, createLowlight } from "lowlight";
import { useEffect, useRef } from "react";
import { useAppStore } from "@/stores/app-store";
import { RichEditorToolbar } from "./RichEditorToolbar";
import type { Suggestion, FactIssueWithStaleness } from "@/types";
import {
  SuggestionHighlightExtension,
  setSuggestions,
  setActiveSuggestion,
  findSuggestionAtPos,
} from "./suggestions-extension";
import {
  FactIssueHighlightExtension,
  setFactIssues,
  setActiveFactIssue,
  findFactIssueAtPos,
} from "./fact-issues-extension";

const lowlight = createLowlight(common);

interface RichEditorProps {
  value: string;
  onChange: (value: string) => void;
  suggestions?: Suggestion[];
  activeSuggestionId?: number | null;
  onClickSuggestion?: (id: number | null) => void;
  factIssues?: FactIssueWithStaleness[];
  activeFactIssueId?: number | null;
  onClickFactIssue?: (id: number | null) => void;
  onEditorReady?: (editor: Editor | null) => void;
}

export function RichEditor({
  value,
  onChange,
  suggestions,
  activeSuggestionId,
  onClickSuggestion,
  factIssues,
  activeFactIssueId,
  onClickFactIssue,
  onEditorReady,
}: RichEditorProps) {
  const setSelectedSection = useAppStore((s) => s.setSelectedSection);
  const skipNextUpdate = useRef(false);
  const needsMarkdownInit = useRef(true);

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        codeBlock: false,
      }),
      Markdown,
      Placeholder.configure({
        placeholder: "Write your script...",
      }),
      LinkExtension.configure({
        openOnClick: false,
        HTMLAttributes: {
          class: "text-primary underline cursor-pointer",
        },
      }),
      Table.configure({ resizable: false }),
      TableRow,
      TableCell,
      TableHeader,
      CodeBlockLowlight.configure({ lowlight }),
      SuggestionHighlightExtension,
      FactIssueHighlightExtension,
    ],
    content: "",
    onUpdate: ({ editor: ed }) => {
      if (skipNextUpdate.current) {
        skipNextUpdate.current = false;
        return;
      }
      const md = ed.getMarkdown();
      onChange(md);
    },
    onSelectionUpdate: ({ editor: ed }) => {
      const { from, to } = ed.state.selection;
      if (from !== to) {
        const text = ed.state.doc.textBetween(from, to, " ");
        if (text.trim().length > 10) {
          setSelectedSection(text.trim());
        }
      } else {
        setSelectedSection(null);
      }
    },
    editorProps: {
      handleClick: (view, pos) => {
        // Fact issues take priority over suggestions
        const factIssueId = findFactIssueAtPos(view.state, pos);
        if (factIssueId !== null) {
          onClickFactIssue?.(factIssueId);
          return false;
        }

        if (!onClickSuggestion) return false;
        const suggestionId = findSuggestionAtPos(view.state, pos);
        onClickSuggestion(suggestionId);
        return false;
      },
      attributes: {
        class:
          "prose prose-lg dark:prose-invert max-w-3xl mx-auto min-h-[50vh] px-4 py-6 outline-none focus:outline-none",
      },
    },
  });

  // Notify parent when editor is ready
  useEffect(() => {
    onEditorReady?.(editor);
  }, [editor, onEditorReady]);

  // Sync external content changes (e.g. loading a different script)
  // On first load, always force markdown parsing since the initial content
  // is set as empty and the contentType option doesn't work in onBeforeCreate
  useEffect(() => {
    if (!editor) return;
    if (needsMarkdownInit.current && value) {
      needsMarkdownInit.current = false;
      skipNextUpdate.current = true;
      editor.commands.setContent(value, { contentType: "markdown" });
      return;
    }
    const currentMd = editor.getMarkdown();
    if (value !== currentMd) {
      skipNextUpdate.current = true;
      editor.commands.setContent(value, { contentType: "markdown" });
    }
  }, [editor, value]);

  // Sync suggestions into ProseMirror plugin state
  useEffect(() => {
    if (editor && suggestions) {
      setSuggestions(editor, suggestions);
    }
  }, [editor, suggestions]);

  // Sync active suggestion highlight
  useEffect(() => {
    if (editor) {
      setActiveSuggestion(editor, activeSuggestionId ?? null);
    }
  }, [editor, activeSuggestionId]);

  // Sync fact issues into ProseMirror plugin state
  useEffect(() => {
    if (editor && factIssues) {
      setFactIssues(editor, factIssues);
    }
  }, [editor, factIssues]);

  // Sync active fact issue highlight
  useEffect(() => {
    if (editor) {
      setActiveFactIssue(editor, activeFactIssueId ?? null);
    }
  }, [editor, activeFactIssueId]);

  return (
    <div>
      <div className="max-w-3xl mx-auto">
        <RichEditorToolbar editor={editor} />
      </div>
      <EditorContent editor={editor} />
    </div>
  );
}
