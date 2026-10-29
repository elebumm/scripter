// The brief is the writer's own description of the video. It is stored in
// scripts.context and given to every AI job as background.

export const TARGET_LENGTH_PRESETS = [
  { label: "Short (~3 min)", value: 500 },
  { label: "Medium (~6 min)", value: 1000 },
  { label: "Standard (~10 min)", value: 1600 },
  { label: "Long (~15 min)", value: 2400 },
  { label: "Documentary (~25 min)", value: 3900 },
] as const;

export const TONE_OPTIONS = ["Informative", "Conversational", "Persuasive", "Educational", "Entertaining"] as const;

export interface BriefFields {
  concept: string;
  themes?: string;
  tone?: string;
}

/** Turn the new-script form into the context text saved on the script. */
export function formatBrief({ concept, themes, tone }: BriefFields): string {
  const parts: string[] = [];
  if (concept.trim()) parts.push(`Concept: ${concept.trim()}`);
  if (themes?.trim()) parts.push(`Themes: ${themes.trim()}`);
  if (tone?.trim()) parts.push(`Tone: ${tone.trim()}`);
  return parts.join("\n");
}
