"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useAppStore } from "@/stores/app-store";
import { Type, Code2, Target, Lightbulb, SearchCheck } from "lucide-react";

interface EditorToolbarProps {
  content: string;
  onEvaluateSelection: () => void;
  isEvaluating: boolean;
  pendingSuggestionsCount?: number;
  pendingFactIssuesCount?: number;
}

export function EditorToolbar({
  content,
  onEvaluateSelection,
  isEvaluating,
  pendingSuggestionsCount = 0,
  pendingFactIssuesCount = 0,
}: EditorToolbarProps) {
  const { editorMode, setEditorMode, selectedSection } = useAppStore();

  return (
    <div className="flex h-8 items-center gap-2 px-3 text-xs text-muted-foreground">
      <div className="flex gap-1">
        <Button
          variant={editorMode === "wysiwyg" ? "secondary" : "ghost"}
          size="sm"
          className="h-6 gap-1 px-2 text-xs"
          onClick={() => setEditorMode("wysiwyg")}
        >
          <Type className="h-3 w-3" />
          Rich Text
        </Button>
        <Button
          variant={editorMode === "markdown" ? "secondary" : "ghost"}
          size="sm"
          className="h-6 gap-1 px-2 text-xs"
          onClick={() => setEditorMode("markdown")}
        >
          <Code2 className="h-3 w-3" />
          Markdown
        </Button>
      </div>

      {pendingSuggestionsCount > 0 && (
        <Badge
          variant="outline"
          className="gap-1 text-xs text-yellow-400 border-yellow-500/30"
        >
          <Lightbulb className="h-3 w-3" />
          {pendingSuggestionsCount} suggestion{pendingSuggestionsCount !== 1 ? "s" : ""}
        </Badge>
      )}

      {pendingFactIssuesCount > 0 && (
        <Badge
          variant="outline"
          className="gap-1 text-xs text-blue-400 border-blue-500/30"
        >
          <SearchCheck className="h-3 w-3" />
          {pendingFactIssuesCount} fact issue{pendingFactIssuesCount !== 1 ? "s" : ""}
        </Badge>
      )}

      <div className="flex-1" />

      {selectedSection && (
        <Button
          variant="outline"
          size="sm"
          className="h-6 gap-1 px-2 text-xs"
          onClick={onEvaluateSelection}
          disabled={isEvaluating}
        >
          <Target className="h-3 w-3" />
          Evaluate Selection
        </Button>
      )}
    </div>
  );
}
