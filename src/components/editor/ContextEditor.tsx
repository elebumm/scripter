"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight, FileText } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";

interface ContextEditorProps {
  context: string;
  onChange: (context: string) => void;
}

export function ContextEditor({ context, onChange }: ContextEditorProps) {
  const [open, setOpen] = useState(context.length > 0);

  return (
    <div className="border rounded-md mb-4">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center gap-2 px-3 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
      >
        {open ? (
          <ChevronDown className="h-3.5 w-3.5" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5" />
        )}
        <FileText className="h-3.5 w-3.5" />
        <span className="font-medium">Context & Notes</span>
        {!open && context.length > 0 && (
          <span className="ml-auto text-xs text-muted-foreground/70 truncate max-w-[200px]">
            {context.slice(0, 60)}{context.length > 60 ? "..." : ""}
          </span>
        )}
      </button>
      {open && (
        <div className="px-3 pb-3">
          <Textarea
            value={context}
            onChange={(e) => onChange(e.target.value)}
            placeholder="Describe themes, ideas, tone, target audience, or any notes for the AI evaluators..."
            className="min-h-[80px] max-h-[200px] resize-y text-sm"
          />
        </div>
      )}
    </div>
  );
}
