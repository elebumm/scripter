"use client";

import { useState, type CSSProperties, type KeyboardEvent } from "react";
import { cn } from "@/lib/utils";
import { fieldBase } from "./styles";

interface InlineFieldProps {
  value: string;
  onCommit: (value: string) => void;
  label: string;
  placeholder?: string;
  /** Textarea that grows with its content. */
  multiline?: boolean;
  /** Enter commits (Shift+Enter adds a line in a multiline field). */
  enterCommits?: boolean;
  /** An empty value is reverted instead of saved. */
  required?: boolean;
  autoFocus?: boolean;
  maxLength?: number;
  className?: string;
  style?: CSSProperties;
}

/**
 * Text that edits in place: typing is local until blur (or Enter), then the
 * trimmed value is committed if it changed. Escape reverts.
 */
export function InlineField({
  value,
  onCommit,
  label,
  placeholder,
  multiline = false,
  enterCommits = !multiline,
  required = false,
  autoFocus,
  maxLength,
  className,
  style,
}: InlineFieldProps) {
  const [draft, setDraft] = useState<string | null>(null);
  const shown = draft ?? value;

  const commit = () => {
    if (draft === null) return;
    const next = draft.trim();
    setDraft(null);
    if (required && !next) return;
    if (next !== value) onCommit(next);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    if (e.key === "Enter" && enterCommits && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      e.currentTarget.blur();
    } else if (e.key === "Escape" && draft !== null) {
      e.preventDefault();
      e.stopPropagation();
      setDraft(null);
    }
  };

  if (multiline) {
    return (
      <textarea
        aria-label={label}
        value={shown}
        placeholder={placeholder}
        rows={1}
        autoFocus={autoFocus}
        maxLength={maxLength}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={onKeyDown}
        className={cn(fieldBase, "field-sizing-content min-h-7 resize-none placeholder:text-stone-500", className)}
        style={style}
      />
    );
  }

  return (
    <input
      type="text"
      aria-label={label}
      value={shown}
      placeholder={placeholder}
      autoFocus={autoFocus}
      maxLength={maxLength}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={onKeyDown}
      className={cn(fieldBase, "placeholder:text-stone-500", className)}
      style={style}
    />
  );
}
