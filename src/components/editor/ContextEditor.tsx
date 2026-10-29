"use client";

import { useId, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TARGET_LENGTH_PRESETS } from "@/lib/brief";
import { targetLengthLabel } from "@/components/kickoff/kickoff-form";

interface ContextEditorProps {
  context: string;
  onChange: (context: string) => void;
  /** Save now (the field also saves itself shortly after typing stops). */
  onCommit?: () => void;
  /** Target length in words (null = none). Drives the runtime target and the Beat Sheet totals. */
  targetLength: number | null;
  onTargetLengthChange: (words: number | null) => void;
}

const NO_TARGET = "none";

/**
 * The target length choices: none, the presets, and the stored value when it
 * isn't a preset (so an older custom target is shown, never silently changed).
 */
export function targetLengthChoices(current: number | null): Array<{ value: string; label: string }> {
  const words: number[] = TARGET_LENGTH_PRESETS.map((p) => p.value);
  if (current && current > 0 && !words.includes(current)) words.push(current);
  return [
    { value: NO_TARGET, label: "No target" },
    ...words.sort((a, b) => a - b).map((w) => ({ value: String(w), label: targetLengthLabel(w) ?? `${w} words` })),
  ];
}

export function targetLengthFromChoice(value: string): number | null {
  const words = Number(value);
  return value === NO_TARGET || !Number.isInteger(words) || words <= 0 ? null : words;
}

/**
 * The writer's brief: concept, audience, tone, anything the council and the
 * beat planner should know, plus the target length. Collapsed by default to
 * keep the sidebar quiet.
 */
export function ContextEditor({ context, onChange, onCommit, targetLength, onTargetLengthChange }: ContextEditorProps) {
  const [open, setOpen] = useState(false);
  const bodyId = useId();
  const targetId = useId();
  const Icon = open ? ChevronDown : ChevronRight;
  const current = targetLength && targetLength > 0 ? targetLength : null;

  return (
    <section className="space-y-1">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls={bodyId}
        className="flex w-full items-center gap-1.5 px-1 py-1 text-[10px] font-bold tracking-widest uppercase text-stone-600 hover:text-stone-900"
        style={{ fontFamily: "var(--font-inter)" }}
      >
        <Icon className="h-3 w-3" aria-hidden="true" />
        <span>Brief</span>
        {!open && (
          <span className="ml-2 flex-1 truncate text-left normal-case tracking-normal font-normal text-[11px] text-stone-500">
            {context.trim() ? context.trim().split("\n")[0] : "Add what this video is for"}
          </span>
        )}
      </button>
      {open && (
        <div id={bodyId} className="space-y-2">
          <textarea
            value={context}
            onChange={(e) => onChange(e.target.value)}
            onBlur={onCommit}
            aria-label="Brief"
            placeholder="Concept, audience, tone, what the video must leave the viewer with…"
            className="min-h-[120px] max-h-[320px] w-full resize-y rounded-xl border border-stone-200 bg-white/80 px-3 py-2 text-xs leading-relaxed text-stone-800 placeholder:text-stone-500"
          />
          <div className="flex items-center gap-2 px-1">
            <label htmlFor={targetId} className="flex-1 text-[11px] text-stone-600">
              Target length
            </label>
            <Select
              value={current ? String(current) : NO_TARGET}
              onValueChange={(v) => onTargetLengthChange(targetLengthFromChoice(v))}
            >
              <SelectTrigger
                id={targetId}
                size="sm"
                variant="outline"
                className="border-stone-300 bg-white/80 text-xs text-stone-800"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {targetLengthChoices(current).map((c) => (
                  <SelectItem key={c.value} value={c.value}>
                    {c.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      )}
    </section>
  );
}
