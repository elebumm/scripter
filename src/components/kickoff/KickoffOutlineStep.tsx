"use client";

import { MarkdownPreview } from "@/components/editor/MarkdownPreview";
import { Badge } from "@/components/ui/badge";
import { Loader2 } from "lucide-react";

interface KickoffOutlineStepProps {
  outlineText: string;
  isStreaming: boolean;
}

export function KickoffOutlineStep({
  outlineText,
  isStreaming,
}: KickoffOutlineStepProps) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        {isStreaming ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            <span className="text-sm text-muted-foreground">Generating...</span>
          </>
        ) : (
          <Badge variant="secondary">Done</Badge>
        )}
      </div>
      <div className="h-[400px] rounded-md border bg-muted/30">
        <MarkdownPreview content={outlineText} className="h-full" />
      </div>
    </div>
  );
}
