"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Check, X, AlertTriangle, ArrowRight } from "lucide-react";
import type { Editor } from "@tiptap/react";
import type { SuggestionWithStaleness } from "@/types";
import { getSuggestionRange } from "./suggestions-extension";

interface SuggestionPopoverProps {
  editor: Editor | null;
  suggestion: SuggestionWithStaleness | null;
  onAccept: (id: number) => void;
  onDismiss: (id: number) => void;
  onClose: () => void;
}

const priorityColors: Record<string, string> = {
  high: "bg-red-500/15 text-red-400 border-red-500/30",
  medium: "bg-yellow-500/15 text-yellow-400 border-yellow-500/30",
  low: "bg-blue-500/15 text-blue-400 border-blue-500/30",
};

export function SuggestionPopover({
  editor,
  suggestion,
  onAccept,
  onDismiss,
  onClose,
}: SuggestionPopoverProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{
    top: number;
    left: number;
  } | null>(null);

  // Position the popover near the highlighted text
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
        containerRect.width - 340
      ),
    });
  }, [editor, suggestion]);

  // Close on Escape
  useEffect(() => {
    if (!suggestion) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [suggestion, onClose]);

  // Close on click outside
  useEffect(() => {
    if (!suggestion) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (cardRef.current && !cardRef.current.contains(e.target as Node)) {
        // Don't close if clicking on a suggestion highlight
        const target = e.target as HTMLElement;
        if (target.closest("[data-suggestion-id]")) return;
        onClose();
      }
    };
    // Delay to avoid closing from the click that opened it
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

  return (
    <div
      ref={cardRef}
      className="absolute z-50"
      style={{
        top: position.top,
        left: Math.max(0, position.left),
        maxWidth: 360,
        minWidth: 280,
      }}
    >
      <Card className="shadow-lg border-border/80 bg-popover">
        <CardContent className="p-3 space-y-2.5">
          {/* Badges */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <Badge
              variant="outline"
              className={`text-[10px] px-1.5 py-0 ${priorityColors[suggestion.priority]}`}
            >
              {suggestion.priority}
            </Badge>
            <Badge variant="outline" className="text-[10px] px-1.5 py-0">
              {suggestion.category}
            </Badge>
            {suggestion.isStale && (
              <Badge
                variant="outline"
                className="text-[10px] px-1.5 py-0 bg-muted text-muted-foreground gap-0.5"
              >
                <AlertTriangle className="h-2.5 w-2.5" />
                stale
              </Badge>
            )}
          </div>

          {/* Diff view */}
          <div className="space-y-1 text-xs">
            <div className="rounded bg-red-500/10 px-2 py-1 line-through text-muted-foreground break-words">
              {suggestion.originalText}
            </div>
            <div className="flex items-center gap-1 text-muted-foreground">
              <ArrowRight className="h-3 w-3 shrink-0" />
            </div>
            <div className="rounded bg-green-500/10 px-2 py-1 break-words">
              {suggestion.suggestedText}
            </div>
          </div>

          {/* Reasoning */}
          <p className="text-xs text-muted-foreground">{suggestion.reasoning}</p>

          {/* Source models */}
          {suggestion.sourceModels.length > 0 && (
            <div className="flex gap-1 flex-wrap">
              {suggestion.sourceModels.map((model) => (
                <Badge
                  key={model}
                  variant="secondary"
                  className="text-[10px] px-1 py-0"
                >
                  {model}
                </Badge>
              ))}
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-1.5 pt-0.5">
            {!suggestion.isStale && (
              <Button
                size="sm"
                variant="outline"
                className="h-6 text-xs gap-1 text-green-400 hover:text-green-300 hover:bg-green-500/10"
                onClick={handleAccept}
              >
                <Check className="h-3 w-3" />
                Accept
              </Button>
            )}
            <Button
              size="sm"
              variant="outline"
              className="h-6 text-xs gap-1"
              onClick={handleDismiss}
            >
              <X className="h-3 w-3" />
              Dismiss
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
