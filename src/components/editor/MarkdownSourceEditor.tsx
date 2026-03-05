"use client";

import { useCallback } from "react";

interface MarkdownSourceEditorProps {
  value: string;
  onChange: (value: string) => void;
}

export function MarkdownSourceEditor({
  value,
  onChange,
}: MarkdownSourceEditorProps) {
  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      onChange(e.target.value);
    },
    [onChange]
  );

  return (
    <div className="max-w-3xl mx-auto">
      <textarea
        value={value}
        onChange={handleChange}
        className="min-h-[50vh] w-full resize-none bg-background px-4 py-6 font-mono text-sm text-foreground outline-none"
        spellCheck={false}
        placeholder="Write your script in markdown..."
      />
    </div>
  );
}
