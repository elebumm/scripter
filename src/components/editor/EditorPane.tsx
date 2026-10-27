"use client";

import { useCallback, useMemo, useState } from "react";
import { useAppStore } from "@/stores/app-store";
import { RichEditor } from "./RichEditor";
import { MarkdownSourceEditor } from "./MarkdownSourceEditor";
import { CouncilFeedbackCard } from "@/components/council/CouncilFeedbackCard";
import { DEFAULT_COUNCIL_MEMBERS } from "@/lib/design-system";
import type { SuggestionWithStaleness, FactIssueWithStaleness, ProductionDirectionWithStaleness, DirectionType } from "@/types";
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
  directions?: ProductionDirectionWithStaleness[];
  activeDirectionId?: number | null;
  onClickDirection?: (id: number | null) => void;
  onAcceptDirection?: (id: number) => void;
  onModifyDirection?: (id: number, newType: DirectionType) => void;
  onDismissDirection?: (id: number) => void;
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
  directions,
  activeDirectionId,
  onClickDirection,
}: EditorPaneProps) {
  const { editorMode, activeCouncilMemberId } = useAppStore();
  const [editor, setEditor] = useState<Editor | null>(null);

  const activeSuggestion = useMemo(() => {
    if (activeSuggestionId == null || !suggestions) return null;
    return suggestions.find((s) => s.id === activeSuggestionId) ?? null;
  }, [activeSuggestionId, suggestions]);

  const activeCouncilMember = useMemo(() => {
    if (!activeCouncilMemberId) return DEFAULT_COUNCIL_MEMBERS[0] ?? null;
    return DEFAULT_COUNCIL_MEMBERS.find((m) => m.id === activeCouncilMemberId) ?? DEFAULT_COUNCIL_MEMBERS[0] ?? null;
  }, [activeCouncilMemberId]);

  const handleClose = useCallback(() => {
    onClickSuggestion?.(null);
  }, [onClickSuggestion]);

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
        directions={directions}
        activeDirectionId={activeDirectionId}
        onClickDirection={onClickDirection}
        onEditorReady={handleEditorReady}
      />
      <CouncilFeedbackCard
        editor={editor}
        suggestion={activeSuggestion}
        councilMember={activeCouncilMember}
        onAccept={onAcceptSuggestion ?? (() => {})}
        onDismiss={onDismissSuggestion ?? (() => {})}
        onClose={handleClose}
      />
    </div>
  );
}
