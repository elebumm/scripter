"use client";

import type { Note, Persona } from "@/types";

export interface LensChip {
  key: string;
  persona: string;
  model: string | null;
}

/**
 * The model that read the note for each persona slug, from what the note
 * stored. Never the persona's current model: that may have changed since.
 * Notes store models parallel to slugs; older notes stored them deduplicated,
 * so a single model there means every lens ran it. Otherwise it's unknown.
 */
function storedModels(note: Pick<Note, "personaSlugs" | "sourceModels">): Array<string | null> {
  const models = note.sourceModels.map((m) => m.trim() || null);
  if (models.length === note.personaSlugs.length) return models;
  if (models.length === 1) return note.personaSlugs.map(() => models[0]);
  return note.personaSlugs.map(() => null);
}

/** Who raised a note: persona name plus the model that read the passage, when known. */
export function lensChipsForNote(note: Pick<Note, "personaSlugs" | "sourceModels">, personas: Persona[]): LensChip[] {
  const models = storedModels(note);
  const chips = note.personaSlugs.map((slug, i) => {
    const persona = personas.find((p) => p.slug === slug);
    return {
      key: slug,
      persona: persona?.name ?? slug.replace(/-/g, " "),
      model: models[i],
    };
  });
  if (chips.length === 0 && note.sourceModels.length > 0) {
    return note.sourceModels.map((m, i) => ({ key: `${i}-${m}`, persona: "Council", model: m.trim() || null }));
  }
  return chips;
}

export function LensChips({ chips, compact = false }: { chips: LensChip[]; compact?: boolean }) {
  if (chips.length === 0) return null;
  return (
    <ul className="flex flex-wrap gap-1" aria-label="Raised by">
      {chips.map((c) => (
        <li
          key={c.key}
          className="inline-flex items-center gap-1 rounded-full bg-stone-100 px-2 py-0.5 text-[10px] font-medium text-stone-700"
          style={{ fontFamily: "var(--font-inter)" }}
        >
          <span>{c.persona}</span>
          {c.model && !compact && <span className="text-stone-600">· {c.model}</span>}
        </li>
      ))}
    </ul>
  );
}

export const PRIORITY_STYLES: Record<Note["priority"], { label: string; dot: string; text: string }> = {
  high: { label: "High priority", dot: "bg-rose-600", text: "text-rose-700" },
  medium: { label: "Medium priority", dot: "bg-stone-500", text: "text-stone-600" },
  low: { label: "Low priority", dot: "bg-stone-300", text: "text-stone-500" },
};

export function categoryLabel(category: string): string {
  return category.charAt(0).toUpperCase() + category.slice(1);
}
