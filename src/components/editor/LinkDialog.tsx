"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import type { Editor } from "@tiptap/react";

interface LinkDialogProps {
  editor: Editor;
  children: React.ReactNode;
}

export function LinkDialog({ editor, children }: LinkDialogProps) {
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState("");

  const isActive = editor.isActive("link");

  useEffect(() => {
    if (open) {
      const existing = editor.getAttributes("link").href ?? "";
      setUrl(existing);
    }
  }, [open, editor]);

  const handleApply = useCallback(() => {
    if (!url.trim()) return;
    editor
      .chain()
      .focus()
      .setLink({ href: url.trim() })
      .run();
    setOpen(false);
    setUrl("");
  }, [editor, url]);

  const handleRemove = useCallback(() => {
    editor.chain().focus().unsetLink().run();
    setOpen(false);
    setUrl("");
  }, [editor]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter") {
        e.preventDefault();
        handleApply();
      }
    },
    [handleApply]
  );

  const isValidUrl = url.trim().length > 0;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent className="w-72 p-3" align="start">
        <div className="space-y-2">
          <Input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="https://..."
            className="h-8 text-sm"
            autoFocus
          />
          <div className="flex gap-1.5">
            <Button
              size="sm"
              className="h-7 text-xs"
              onClick={handleApply}
              disabled={!isValidUrl}
            >
              Apply
            </Button>
            {isActive && (
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs"
                onClick={handleRemove}
              >
                Remove
              </Button>
            )}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
