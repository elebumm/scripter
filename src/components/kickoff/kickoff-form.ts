// The new-script form: the writer's own brief. Nothing here generates text;
// the script starts empty (or as a copy of the writer's template).

import { TARGET_LENGTH_PRESETS, formatBrief } from "@/lib/brief";

export interface StartFreshForm {
  title: string;
  concept: string;
  themes: string;
  tone: string;
  /** Target length in words (one of TARGET_LENGTH_PRESETS). */
  targetLength: number;
  suggestBeats: boolean;
}

export const DEFAULT_TARGET_LENGTH = 1600;

export const EMPTY_START_FRESH: StartFreshForm = {
  title: "",
  concept: "",
  themes: "",
  tone: "",
  targetLength: DEFAULT_TARGET_LENGTH,
  suggestBeats: false,
};

/** Beat suggestions need something to work from: a concept. */
export function canSuggestBeats(form: Pick<StartFreshForm, "concept">): boolean {
  return form.concept.trim().length > 0;
}

/** The createScript payload: empty title stays empty, the brief becomes the context. */
export function toCreatePayload(form: StartFreshForm): { title: string; context: string; targetLength: number } {
  return {
    title: form.title.trim(),
    context: formatBrief({ concept: form.concept, themes: form.themes, tone: form.tone }),
    targetLength: form.targetLength,
  };
}

/** Whether to open the Beat Sheet with a suggestion after creating. */
export function wantsBeatSuggestion(form: StartFreshForm): boolean {
  return form.suggestBeats && canSuggestBeats(form);
}

/** "Standard (~10 min)" for a preset, otherwise "~1,234 words". */
export function targetLengthLabel(words: number | null | undefined): string | null {
  if (!words || words <= 0) return null;
  const preset = TARGET_LENGTH_PRESETS.find((p) => p.value === words);
  return preset ? preset.label : `~${words.toLocaleString("en-US")} words`;
}
