"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Check, X, AlertTriangle, ArrowRight, AlertCircle, Timer, Heart } from "lucide-react";
import type { LucideProps } from "lucide-react";
import type { Editor } from "@tiptap/react";
import type { SuggestionWithStaleness } from "@/types";
import type { CouncilMember } from "@/types/council";
import { getSuggestionRange } from "@/components/editor/suggestions-extension";

const iconMap: Record<string, React.ComponentType<LucideProps>> = {
  AlertCircle,
  Timer,
  Heart,
};

interface CouncilFeedbackCardProps {
  editor: Editor | null;
  suggestion: SuggestionWithStaleness | null;
  councilMember?: CouncilMember | null;
  onAccept: (id: number) => void;
  onDismiss: (id: number) => void;
  onClose: () => void;
}

export function CouncilFeedbackCard({
  editor,
  suggestion,
  councilMember,
  onAccept,
  onDismiss,
  onClose,
}: CouncilFeedbackCardProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);

  useEffect(() => {
    if (!editor || !suggestion) {
      setPosition(null);
      return;
    }

    const range = getSuggestionRange(editor.state, suggestion.id);
    if (!range) {
      setPosition(null);
      return;
    }

    const coords = editor.view.coordsAtPos(range.from);
    const editorContainer = editor.view.dom.closest(".tiptap-editor-container");
    if (!editorContainer || !coords) {
      setPosition(null);
      return;
    }

    const containerRect = editorContainer.getBoundingClientRect();
    setPosition({
      top: coords.bottom - containerRect.top + 8,
      left: Math.min(
        coords.left - containerRect.left,
        containerRect.width - 360
      ),
    });
  }, [editor, suggestion]);

  useEffect(() => {
    if (!suggestion) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [suggestion, onClose]);

  useEffect(() => {
    if (!suggestion) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (cardRef.current && !cardRef.current.contains(e.target as Node)) {
        const target = e.target as HTMLElement;
        if (target.closest("[data-suggestion-id]")) return;
        onClose();
      }
    };
    const timer = setTimeout(() => {
      document.addEventListener("mousedown", handleClickOutside);
    }, 100);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [suggestion, onClose]);

  const handleAccept = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      if (suggestion) onAccept(suggestion.id);
    },
    [suggestion, onAccept]
  );

  const handleDismiss = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      if (suggestion) onDismiss(suggestion.id);
    },
    [suggestion, onDismiss]
  );

  if (!suggestion || !position) return null;

  const Icon = councilMember ? (iconMap[councilMember.icon] || AlertCircle) : null;

  return (
    <div
      ref={cardRef}
      className="absolute z-50"
      style={{
        top: position.top,
        left: Math.max(0, position.left),
        maxWidth: 380,
        minWidth: 300,
      }}
    >
      <div className="glass rounded-xl p-4 space-y-3">
        {/* Council member header */}
        {councilMember && Icon && (
          <div className="flex items-center gap-2">
            <div
              className="w-6 h-6 rounded-full flex items-center justify-center"
              style={{ backgroundColor: `${councilMember.color}15` }}
            >
              <Icon className="h-3.5 w-3.5" style={{ color: councilMember.color }} />
            </div>
            <span
              className="text-xs font-semibold tracking-wide uppercase"
              style={{ color: councilMember.color, fontFamily: "var(--font-switzer)" }}
            >
              {councilMember.name}
            </span>
            {suggestion.isStale && (
              <span className="flex items-center gap-0.5 text-[10px] text-amber-500 ml-auto">
                <AlertTriangle className="h-2.5 w-2.5" />
                stale
              </span>
            )}
          </div>
        )}

        {/* Diff view */}
        <div className="space-y-1 text-xs">
          <div className="rounded-lg bg-red-50 px-3 py-2 line-through text-slate-400 break-words">
            {suggestion.originalText}
          </div>
          <div className="flex items-center gap-1 text-slate-300 justify-center">
            <ArrowRight className="h-3 w-3" />
          </div>
          <div className="rounded-lg bg-green-50 px-3 py-2 text-slate-700 break-words">
            {suggestion.suggestedText}
          </div>
        </div>

        {/* Reasoning */}
        <p className="text-xs text-slate-500 leading-relaxed">{suggestion.reasoning}</p>

        {/* Actions */}
        <div className="flex gap-2 pt-1">
          {!suggestion.isStale && (
            <Button
              size="sm"
              className="h-7 text-xs gap-1.5 rounded-lg bg-stone-600 text-white hover:bg-stone-700 border-0"
              onClick={handleAccept}
            >
              <Check className="h-3 w-3" />
              Rewrite
            </Button>
          )}
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs gap-1.5 rounded-lg border-slate-200 text-slate-500 hover:text-slate-700"
            onClick={handleDismiss}
          >
            <X className="h-3 w-3" />
            Dismiss
          </Button>
        </div>
      </div>
    </div>
  );
}
