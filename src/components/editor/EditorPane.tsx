"use client";

import { useCallback, useMemo, useState } from "react";
import { useAppStore } from "@/stores/app-store";
import { RichEditor } from "./RichEditor";
import { MarkdownSourceEditor } from "./MarkdownSourceEditor";
import { SuggestionPopover } from "./SuggestionPopover";
import { FactIssuePopover } from "./FactIssuePopover";
import type { SuggestionWithStaleness, FactIssueWithStaleness } from "@/types";
import type { Editor } from "@tiptap/react";

interface EditorPaneProps {
  content: string;
  onChange: (value: string) => void;
  suggestions?: SuggestionWithStaleness[];
  activeSuggestionId?: number | null;
  onClickSuggestion?: (id: number | null) => void;
  onAcceptSuggestion?: (id: number) => void;
  onDismissSuggestion?: (id: number) => void;
  factIssues?: FactIssueWithStaleness[];
  activeFactIssueId?: number | null;
  onClickFactIssue?: (id: number | null) => void;
  onCorrectFactIssue?: (id: number) => void;
  onAcknowledgeFactIssue?: (id: number) => void;
  onDismissFactIssue?: (id: number) => void;
}

export function EditorPane({
  content,
  onChange,
  suggestions,
  activeSuggestionId,
  onClickSuggestion,
  onAcceptSuggestion,
  onDismissSuggestion,
  factIssues,
  activeFactIssueId,
  onClickFactIssue,
  onCorrectFactIssue,
  onAcknowledgeFactIssue,
  onDismissFactIssue,
}: EditorPaneProps) {
  const { editorMode } = useAppStore();
  const [editor, setEditor] = useState<Editor | null>(null);

  const activeSuggestion = useMemo(() => {
    if (activeSuggestionId == null || !suggestions) return null;
    return suggestions.find((s) => s.id === activeSuggestionId) ?? null;
  }, [activeSuggestionId, suggestions]);

  const activeFactIssue = useMemo(() => {
    if (activeFactIssueId == null || !factIssues) return null;
    return factIssues.find((i) => i.id === activeFactIssueId) ?? null;
  }, [activeFactIssueId, factIssues]);

  const handleClose = useCallback(() => {
    onClickSuggestion?.(null);
  }, [onClickSuggestion]);

  const handleFactIssueClose = useCallback(() => {
    onClickFactIssue?.(null);
  }, [onClickFactIssue]);

  const handleEditorReady = useCallback((ed: Editor | null) => {
    setEditor(ed);
  }, []);

  if (editorMode === "markdown") {
    return <MarkdownSourceEditor value={content} onChange={onChange} />;
  }

  return (
    <div className="tiptap-editor-container relative">
      <RichEditor
        value={content}
        onChange={onChange}
        suggestions={suggestions}
        activeSuggestionId={activeSuggestionId}
        onClickSuggestion={onClickSuggestion}
        factIssues={factIssues}
        activeFactIssueId={activeFactIssueId}
        onClickFactIssue={onClickFactIssue}
        onEditorReady={handleEditorReady}
      />
      <SuggestionPopover
        editor={editor}
        suggestion={activeSuggestion}
        onAccept={onAcceptSuggestion ?? (() => {})}
        onDismiss={onDismissSuggestion ?? (() => {})}
        onClose={handleClose}
      />
      <FactIssuePopover
        editor={editor}
        issue={activeFactIssue}
        onCorrect={onCorrectFactIssue ?? (() => {})}
        onAcknowledge={onAcknowledgeFactIssue ?? (() => {})}
        onDismiss={onDismissFactIssue ?? (() => {})}
        onClose={handleFactIssueClose}
      />
    </div>
  );
}
