"use client";

import { useRef, useState, type FormEvent } from "react";
import { Loader2, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { btnPrimary, btnSecondary, focusRing } from "./styles";

interface AddBeatFormProps {
  /** Resolves true when the beat was added. */
  onAdd: (data: { title: string; purpose: string }) => Promise<boolean>;
  /** Start with the form open (e.g. from the empty state). */
  defaultOpen?: boolean;
}

const fieldClass = cn(
  "w-full rounded-lg bg-white px-2.5 py-1.5 text-xs text-stone-800 ring-1 ring-stone-200 placeholder:text-stone-500 focus:ring-stone-400",
  focusRing
);

/** The writer adds a beat of their own. */
export function AddBeatForm({ onAdd, defaultOpen = false }: AddBeatFormProps) {
  const [open, setOpen] = useState(defaultOpen);
  const [title, setTitle] = useState("");
  const [purpose, setPurpose] = useState("");
  const [saving, setSaving] = useState(false);
  const titleRef = useRef<HTMLInputElement>(null);

  const close = () => {
    setOpen(false);
    setTitle("");
    setPurpose("");
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!title.trim() || saving) return;
    setSaving(true);
    const ok = await onAdd({ title: title.trim(), purpose: purpose.trim() });
    setSaving(false);
    if (ok) {
      setTitle("");
      setPurpose("");
      titleRef.current?.focus();
    }
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          "flex w-full items-center justify-center gap-1.5 rounded-xl border-2 border-dashed border-stone-200 py-2.5 text-xs font-semibold text-stone-600 transition-colors hover:border-stone-300 hover:bg-white/60 hover:text-stone-800",
          focusRing
        )}
      >
        <Plus className="h-3.5 w-3.5" />
        Add beat
      </button>
    );
  }

  return (
    <form
      onSubmit={submit}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.preventDefault();
          e.stopPropagation();
          close();
        }
      }}
      className="space-y-2 rounded-xl bg-white p-3 ring-1 ring-stone-200"
      aria-label="Add a beat"
    >
      <input
        ref={titleRef}
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Beat name, e.g. The reveal"
        aria-label="Beat name"
        maxLength={200}
        className={fieldClass}
        autoFocus
        required
      />
      <textarea
        value={purpose}
        onChange={(e) => setPurpose(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault();
            e.currentTarget.form?.requestSubmit();
          }
        }}
        placeholder="What must this part do for the viewer?"
        aria-label="What the beat must do"
        maxLength={2000}
        rows={2}
        className={cn(fieldClass, "field-sizing-content min-h-12 resize-none")}
      />
      <div className="flex gap-2">
        <button type="submit" className={btnPrimary} disabled={!title.trim() || saving}>
          {saving && <Loader2 className="h-3 w-3 animate-spin" />}
          Add beat
        </button>
        <button type="button" className={btnSecondary} onClick={close}>
          Done
        </button>
      </div>
    </form>
  );
}
