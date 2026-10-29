"use client";

interface MarkdownSourceEditorProps {
  value: string;
  onChange: (value: string) => void;
}

/** Raw markdown editing. Notes and fact highlights show in WYSIWYG mode only. */
export function MarkdownSourceEditor({ value, onChange }: MarkdownSourceEditorProps) {
  return (
    <textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      aria-label="Script (markdown)"
      data-quiet-focus=""
      className="min-h-[60vh] w-full resize-none bg-transparent px-4 py-6 font-mono text-sm leading-relaxed text-stone-800 outline-none field-sizing-content"
      spellCheck={false}
      placeholder="Write your script in markdown..."
    />
  );
}
