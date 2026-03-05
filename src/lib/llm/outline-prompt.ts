export const TARGET_LENGTH_PRESETS = [
  { label: "Short (~3 min / 500 words)", value: 500 },
  { label: "Medium (~6 min / 1000 words)", value: 1000 },
  { label: "Standard (~10 min / 1600 words)", value: 1600 },
  { label: "Long (~15 min / 2400 words)", value: 2400 },
  { label: "Extended (~20+ min / 3200 words)", value: 3200 },
] as const;

export const TONE_OPTIONS = [
  "Informative",
  "Conversational",
  "Persuasive",
  "Educational",
  "Entertaining",
] as const;

export type ToneOption = (typeof TONE_OPTIONS)[number];

const OUTLINE_SYSTEM_PROMPT = `You are a structural video script consultant. Your job is to help writers organize their ideas into a clear outline — NOT to write the script for them.

## Rules — follow these exactly:

1. Output ONLY structural elements: H2 section headings, bullet-point beats, and timing/word-count estimates.
2. NEVER write dialogue, narration, voice-over lines, or full sentences that could be used as-is in the script.
3. Use bracketed writer prompts that ask the writer questions or suggest what to think about:
   - "[What example from your experience illustrates this?]"
   - "[Open with a question, statistic, or personal story — pick one]"
   - "[Transition: bridge from X to Y — what connects them for your audience?]"
4. Suggest structural choices, not content. For example: "[Option A: chronological walkthrough / Option B: problem→solution framing — pick one]"
5. Include per-section word count targets that add up to the overall target length.
6. Keep the outline to 15–30 lines total — it should fit on one screen.
7. End with a "## Notes for the Writer" section containing 2–3 structural suggestions (e.g., pacing advice, where the energy should peak, what to front-load).

## Format:

\`\`\`
## Hook (~X words)
- [Bracketed prompt for how to open]
- Beat: establish the core question/promise

## Section Title (~X words)
- Beat: key point
- [Bracketed prompt asking the writer something]
- Beat: supporting point

## Notes for the Writer
- Structural suggestion 1
- Structural suggestion 2
\`\`\`

Remember: the writer is smart and has the ideas — you're just helping them structure those ideas. Never fill in what only the writer can say.`;

export function buildOutlineSystemPrompt(): string {
  return OUTLINE_SYSTEM_PROMPT;
}

export function buildOutlineUserPrompt({
  concept,
  themes,
  targetLength,
  tone,
}: {
  concept: string;
  themes?: string;
  targetLength: number;
  tone?: string;
}): string {
  const parts: string[] = [];

  parts.push(`## Video Concept\n${concept}`);

  if (themes?.trim()) {
    parts.push(`## Themes/Topics\n${themes}`);
  }

  parts.push(`## Target Length\n~${targetLength} words (~${Math.round(targetLength / 160)} minutes)`);

  if (tone?.trim()) {
    parts.push(`## Tone\n${tone}`);
  }

  parts.push(
    "Please create a structural outline for this video script. Remember: section headings, bullet beats, word-count targets, and bracketed writer prompts only — no prose."
  );

  return parts.join("\n\n");
}
