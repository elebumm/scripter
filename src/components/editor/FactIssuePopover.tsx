"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Check,
  X,
  AlertTriangle,
  ArrowRight,
  ExternalLink,
  Eye,
  CircleCheck,
  CircleX,
  CircleAlert,
  CircleHelp,
  Drama,
} from "lucide-react";
import type { Editor } from "@tiptap/react";
import type { FactIssueWithStaleness } from "@/types";
import { getFactIssueRange } from "./fact-issues-extension";

interface FactIssuePopoverProps {
  editor: Editor | null;
  issue: FactIssueWithStaleness | null;
  onCorrect: (id: number) => void;
  onAcknowledge: (id: number) => void;
  onDismiss: (id: number) => void;
  onClose: () => void;
}

const verdictConfig: Record<
  string,
  { label: string; color: string; icon: React.ElementType }
> = {
  verified: {
    label: "Verified",
    color: "bg-green-500/15 text-green-400 border-green-500/30",
    icon: CircleCheck,
  },
  inaccurate: {
    label: "Inaccurate",
    color: "bg-red-500/15 text-red-400 border-red-500/30",
    icon: CircleX,
  },
  misleading: {
    label: "Misleading",
    color: "bg-orange-500/15 text-orange-400 border-orange-500/30",
    icon: CircleAlert,
  },
  unverifiable: {
    label: "Unverifiable",
    color: "bg-yellow-500/15 text-yellow-400 border-yellow-500/30",
    icon: CircleHelp,
  },
  "exaggeration-ok": {
    label: "Exaggeration OK",
    color: "bg-purple-500/15 text-purple-400 border-purple-500/30",
    icon: Drama,
  },
};

const categoryLabels: Record<string, string> = {
  statistic: "Statistic",
  date: "Date/Timeline",
  attribution: "Attribution",
  technical: "Technical",
  general: "General",
};

export function FactIssuePopover({
  editor,
  issue,
  onCorrect,
  onAcknowledge,
  onDismiss,
  onClose,
}: FactIssuePopoverProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{
    top: number;
    left: number;
  } | null>(null);

  // Position the popover near the highlighted text
  useEffect(() => {
    if (!editor || !issue) {
      setPosition(null);
      return;
    }

    const range = getFactIssueRange(editor.state, issue.id);
    if (!range) {
      setPosition(null);
      return;
    }

    const coords = editor.view.coordsAtPos(range.from);
    const editorContainer = editor.view.dom.closest(
      ".tiptap-editor-container"
    );
    if (!editorContainer || !coords) {
      setPosition(null);
      return;
    }

    const containerRect = editorContainer.getBoundingClientRect();
    setPosition({
      top: coords.bottom - containerRect.top + 8,
      left: Math.min(
        coords.left - containerRect.left,
        containerRect.width - 380
      ),
    });
  }, [editor, issue]);

  // Close on Escape
  useEffect(() => {
    if (!issue) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [issue, onClose]);

  // Close on click outside
  useEffect(() => {
    if (!issue) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (cardRef.current && !cardRef.current.contains(e.target as Node)) {
        const target = e.target as HTMLElement;
        if (target.closest("[data-fact-issue-id]")) return;
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
  }, [issue, onClose]);

  const handleCorrect = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      if (issue) onCorrect(issue.id);
    },
    [issue, onCorrect]
  );

  const handleAcknowledge = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      if (issue) onAcknowledge(issue.id);
    },
    [issue, onAcknowledge]
  );

  const handleDismiss = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      if (issue) onDismiss(issue.id);
    },
    [issue, onDismiss]
  );

  if (!issue || !position) return null;

  const verdict = verdictConfig[issue.verdict] ?? verdictConfig.unverifiable;
  const VerdictIcon = verdict.icon;

  return (
    <div
      ref={cardRef}
      className="absolute z-50"
      style={{
        top: position.top,
        left: Math.max(0, position.left),
        maxWidth: 400,
        minWidth: 300,
      }}
    >
      <Card className="shadow-lg border-border/80 bg-popover">
        <CardContent className="p-3 space-y-2.5">
          {/* Verdict & Category badges */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <Badge
              variant="outline"
              className={`text-[10px] px-1.5 py-0 gap-0.5 ${verdict.color}`}
            >
              <VerdictIcon className="h-2.5 w-2.5" />
              {verdict.label}
            </Badge>
            {issue.accuracy !== null && (
              <Badge
                variant="outline"
                className="text-[10px] px-1.5 py-0"
              >
                {issue.accuracy}% accurate
              </Badge>
            )}
            <Badge variant="outline" className="text-[10px] px-1.5 py-0">
              {categoryLabels[issue.category] ?? issue.category}
            </Badge>
            {issue.isStale && (
              <Badge
                variant="outline"
                className="text-[10px] px-1.5 py-0 bg-muted text-muted-foreground gap-0.5"
              >
                <AlertTriangle className="h-2.5 w-2.5" />
                stale
              </Badge>
            )}
          </div>

          {/* Claim text */}
          <div className="text-xs">
            <span className="text-muted-foreground">Claim: </span>
            <span className="break-words">
              &ldquo;{issue.claimText}&rdquo;
            </span>
          </div>

          {/* Correction diff */}
          {issue.correction && (
            <div className="space-y-1 text-xs">
              <div className="rounded bg-red-500/10 px-2 py-1 line-through text-muted-foreground break-words">
                {issue.claimText}
              </div>
              <div className="flex items-center gap-1 text-muted-foreground">
                <ArrowRight className="h-3 w-3 shrink-0" />
              </div>
              <div className="rounded bg-green-500/10 px-2 py-1 break-words">
                {issue.correction}
              </div>
            </div>
          )}

          {/* Reasoning */}
          <p className="text-xs text-muted-foreground">
            {issue.reasoning}
          </p>

          {/* Sources */}
          {issue.sources.length > 0 && (
            <div className="space-y-1">
              <span className="text-[10px] text-muted-foreground uppercase tracking-wider">
                Sources
              </span>
              <div className="flex flex-col gap-0.5">
                {issue.sources.slice(0, 3).map((url, i) => (
                  <a
                    key={i}
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[10px] text-blue-400 hover:text-blue-300 flex items-center gap-0.5 truncate"
                  >
                    <ExternalLink className="h-2.5 w-2.5 shrink-0" />
                    {url.replace(/^https?:\/\/(www\.)?/, "").slice(0, 50)}
                  </a>
                ))}
              </div>
            </div>
          )}

          {/* Agent models */}
          {issue.agentModels.length > 0 && (
            <div className="flex gap-1 flex-wrap">
              {issue.agentModels.map((model) => (
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
            {!issue.isStale && issue.correction && (
              <Button
                size="sm"
                variant="outline"
                className="h-6 text-xs gap-1 text-green-400 hover:text-green-300 hover:bg-green-500/10"
                onClick={handleCorrect}
              >
                <Check className="h-3 w-3" />
                Apply Correction
              </Button>
            )}
            <Button
              size="sm"
              variant="outline"
              className="h-6 text-xs gap-1"
              onClick={handleAcknowledge}
            >
              <Eye className="h-3 w-3" />
              Acknowledge
            </Button>
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
