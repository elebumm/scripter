"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Check,
  X,
  AlertTriangle,
  User,
  Film,
  Sparkles,
  Monitor,
  Type,
  Archive,
  Mic,
  Layers,
  ChevronDown,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { Editor } from "@tiptap/react";
import type { ProductionDirectionWithStaleness, DirectionType } from "@/types";
import { DIRECTION_TYPES } from "@/types";
import { getDirectionRange } from "./directions-extension";

interface DirectionPopoverProps {
  editor: Editor | null;
  direction: ProductionDirectionWithStaleness | null;
  onAccept: (id: number) => void;
  onModify: (id: number, newType: DirectionType) => void;
  onDismiss: (id: number) => void;
  onClose: () => void;
}

const directionConfig: Record<
  string,
  { label: string; color: string; bgColor: string; icon: React.ElementType }
> = {
  "talking-head": {
    label: "Talking Head",
    color: "text-teal-400 border-teal-500/30",
    bgColor: "bg-teal-500/15",
    icon: User,
  },
  "b-roll": {
    label: "B-Roll",
    color: "text-purple-400 border-purple-500/30",
    bgColor: "bg-purple-500/15",
    icon: Film,
  },
  "motion-graphics": {
    label: "Motion Graphics",
    color: "text-orange-400 border-orange-500/30",
    bgColor: "bg-orange-500/15",
    icon: Sparkles,
  },
  "screen-recording": {
    label: "Screen Recording",
    color: "text-green-400 border-green-500/30",
    bgColor: "bg-green-500/15",
    icon: Monitor,
  },
  "text-overlay": {
    label: "Text Overlay",
    color: "text-pink-400 border-pink-500/30",
    bgColor: "bg-pink-500/15",
    icon: Type,
  },
  archival: {
    label: "Archival",
    color: "text-amber-400 border-amber-500/30",
    bgColor: "bg-amber-500/15",
    icon: Archive,
  },
  "interview-clip": {
    label: "Interview Clip",
    color: "text-indigo-400 border-indigo-500/30",
    bgColor: "bg-indigo-500/15",
    icon: Mic,
  },
  mixed: {
    label: "Mixed",
    color: "text-gray-400 border-gray-500/30",
    bgColor: "bg-gray-500/15",
    icon: Layers,
  },
};

const confidenceColors: Record<string, string> = {
  high: "bg-green-500/15 text-green-400 border-green-500/30",
  medium: "bg-yellow-500/15 text-yellow-400 border-yellow-500/30",
  low: "bg-red-500/15 text-red-400 border-red-500/30",
};

export function DirectionPopover({
  editor,
  direction,
  onAccept,
  onModify,
  onDismiss,
  onClose,
}: DirectionPopoverProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{
    top: number;
    left: number;
  } | null>(null);

  // Position the popover near the highlighted text
  useEffect(() => {
    if (!editor || !direction) {
      setPosition(null);
      return;
    }

    const range = getDirectionRange(editor.state, direction.id);
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
  }, [editor, direction]);

  // Close on Escape
  useEffect(() => {
    if (!direction) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [direction, onClose]);

  // Close on click outside
  useEffect(() => {
    if (!direction) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (cardRef.current && !cardRef.current.contains(e.target as Node)) {
        const target = e.target as HTMLElement;
        if (target.closest("[data-direction-id]")) return;
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
  }, [direction, onClose]);

  const handleAccept = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      if (direction) onAccept(direction.id);
    },
    [direction, onAccept]
  );

  const handleDismiss = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      if (direction) onDismiss(direction.id);
    },
    [direction, onDismiss]
  );

  if (!direction || !position) return null;

  const effectiveType = (direction.userOverrideType || direction.directionType) as string;
  const config = directionConfig[effectiveType] ?? directionConfig.mixed;
  const DirectionIcon = config.icon;

  const totalModels =
    direction.agreeingModels.length + direction.disagreeingModels.length;
  const agreementText =
    totalModels > 0
      ? `${direction.agreeingModels.length}/${totalModels} models agree`
      : "";

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
          {/* Direction type & confidence badges */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <Badge
              variant="outline"
              className={`text-[10px] px-1.5 py-0 gap-0.5 ${config.bgColor} ${config.color}`}
            >
              <DirectionIcon className="h-2.5 w-2.5" />
              {config.label}
            </Badge>
            <Badge
              variant="outline"
              className={`text-[10px] px-1.5 py-0 ${confidenceColors[direction.confidence]}`}
            >
              {direction.confidence} confidence
            </Badge>
            {direction.isStale && (
              <Badge
                variant="outline"
                className="text-[10px] px-1.5 py-0 bg-muted text-muted-foreground gap-0.5"
              >
                <AlertTriangle className="h-2.5 w-2.5" />
                stale
              </Badge>
            )}
          </div>

          {/* Script text preview */}
          <div className="text-xs rounded bg-muted/50 px-2 py-1 break-words max-h-16 overflow-y-auto">
            {direction.originalText.length > 200
              ? direction.originalText.slice(0, 200) + "..."
              : direction.originalText}
          </div>

          {/* Visual notes */}
          {direction.visualNotes && (
            <div className="text-xs">
              <span className="text-muted-foreground font-medium">
                Visual notes:{" "}
              </span>
              {direction.visualNotes}
            </div>
          )}

          {/* Reasoning */}
          <p className="text-xs text-muted-foreground">
            {direction.reasoning}
          </p>

          {/* Model agreement */}
          {agreementText && (
            <div className="text-xs text-muted-foreground">
              {agreementText}
              {direction.disagreeingModels.length > 0 && (
                <div className="flex gap-1 flex-wrap mt-1">
                  {direction.disagreeingModels.map((dm) => {
                    const altConfig =
                      directionConfig[dm.alternativeType] ??
                      directionConfig.mixed;
                    return (
                      <Badge
                        key={dm.model}
                        variant="outline"
                        className="text-[10px] px-1 py-0 gap-0.5"
                      >
                        {dm.model}: {altConfig.label}
                      </Badge>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-1.5 pt-0.5">
            {!direction.isStale && (
              <>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-6 text-xs gap-1 text-green-400 hover:text-green-300 hover:bg-green-500/10"
                  onClick={handleAccept}
                >
                  <Check className="h-3 w-3" />
                  Accept
                </Button>

                {/* Modify dropdown */}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-6 text-xs gap-1"
                    >
                      Modify
                      <ChevronDown className="h-3 w-3" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start">
                    {DIRECTION_TYPES.filter((t) => t !== effectiveType).map(
                      (t) => {
                        const tc = directionConfig[t] ?? directionConfig.mixed;
                        const TypeIcon = tc.icon;
                        return (
                          <DropdownMenuItem
                            key={t}
                            onClick={() =>
                              direction && onModify(direction.id, t)
                            }
                            className="text-xs gap-2"
                          >
                            <TypeIcon className="h-3 w-3" />
                            {tc.label}
                          </DropdownMenuItem>
                        );
                      }
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              </>
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
