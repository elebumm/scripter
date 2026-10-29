// Prompt text and pure prompt builders for the council (critique + synthesis).
// Everything here is deterministic so it can be unit-tested without a model.

import { renderRubric, criterionLabel, type CriteriaWeights } from "./rubric";
import type { NoteCategory, PersonaCritique, Priority } from "./schemas";
import { anchorExistsInMarkdown } from "@/lib/text/anchor";

/** Words per minute used to turn a word target into a spoken runtime. */
const PROMPT_WPM = 155;

/**
 * Who the writer is and what their videos are. Moved here from the old
 * seeded "Default Profile" so every lens and the synthesizer share it.
 */
export const CHANNEL_CONTEXT = `## The channel

The writer makes long-form, story-driven documentaries about technology for YouTube, usually 20-25 minutes, narrated by the writer. They are not tutorials, listicles or video essays; they are closer to a documentary film than a typical tech video. The channel's edge is storytelling, not information density.

Videos that work on this channel tend to have:
- a central human character whose decisions drive the story forward;
- escalating stakes, where each section raises a new tension before resolving the last one;
- technical ideas explained inside the action, because the viewer needs them to follow what happens next, not as standalone lessons;
- comedy and personality in the narration: a curious enthusiast, not a lecturer;
- themes that emerge from events rather than being announced ("the irony here is…" tells instead of trusting the viewer);
- an ending that recontextualises the whole story instead of summarising it, with a call to action that sounds like the rest of the video.

How to read the script:
- Judge it as a video, not a document: it will be read aloud over footage. Sentence fragments, abrupt cuts and unfinished thoughts can be deliberate pacing.
- Text in [square brackets], HTML comments and callout blocks (> [!note] …) are production notes, not narration.
- The first minute decides whether a viewer stays.
- Scripts almost always need trimming, not expansion. Do not ask for more material unless something is genuinely missing.
- Do not flag structure just to have an opinion; flag it when a viewer would feel it or click away.
- If you can't tell whether something is a problem or a deliberate choice, say so instead of penalising it.
- Be honest, not encouraging. The writer wants the truth, not reassurance.`;

/** The non-negotiable "Your words only" contract, appended to every AI job that critiques the script. */
export const YOUR_WORDS_ONLY = `## Your words only (non-negotiable)

The writer writes every word of this script. Your job is to diagnose, never to write.
- Anchor every note in the writer's own text: copy the passage verbatim (4-30 words from a single paragraph) so it can be highlighted. Never alter or invent anchor text.
- Say what isn't working and why it matters to the viewer. You may add one short question that helps the writer find their own fix.
- Never supply wording: no replacement lines, rewritten sentences, example phrasings, sample hooks, titles or transitions, and nothing like "try something like…", "e.g. …", "you could say…" or "rewrite it as…".
- Never put text in quotation marks unless it is copied exactly from the script.
- Describe what a passage needs to achieve, never the words that would achieve it.`;

export const CRITIQUE_OUTPUT_BUDGET = `## Output

Return only the structured object. Keep it tight; the writer reads every word.
- summary: at most 120 words, your overall read through your lens.
- criteria: every criterion exactly once, each with a 1-10 score and an observation of at most 40 words pointing at what earned the score.
- overallScore: your holistic 1-10 judgement of the whole video, NOT an average of the criteria.
- notes: 3-8, most important first. issue at most 40 words, why at most 40 words, optional question at most 25 words.
- landed: 1-3 passages that work and should be protected, each with why at most 30 words.`;

export interface BriefInput {
  title: string | null | undefined;
  context: string | null | undefined;
  /** Target length in words (scripts.target_length). */
  targetLength: number | null | undefined;
}

export interface PreviousNote {
  anchorText: string;
  issue: string;
  status: "open" | "addressed" | "dismissed";
  priority?: Priority | string;
  category?: NoteCategory | string;
}

/** Map stored notes onto the prompt's view (issue + status only, never scores). */
export function toPreviousNotes(
  rows: Array<{ anchorText: string; issue: string; status: string; priority?: string; category?: string }>
): PreviousNote[] {
  return rows.map((r) => ({
    anchorText: r.anchorText,
    issue: r.issue,
    status: r.status === "addressed" || r.status === "dismissed" ? r.status : "open",
    priority: r.priority,
    category: r.category,
  }));
}

export interface CritiquePersona {
  name: string;
  systemPrompt: string;
  criteriaWeights: CriteriaWeights | Record<string, number>;
}

/** YYYY-MM-DD in UTC. */
export function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** The writer's brief: title, target runtime and their own notes. */
export function formatBrief({ title, context, targetLength }: BriefInput): string {
  const lines: string[] = [`Title: ${title?.trim() || "Untitled script"}`];
  if (targetLength && targetLength > 0) {
    const minutes = Math.max(1, Math.round(targetLength / PROMPT_WPM));
    lines.push(`Target length: about ${targetLength} spoken words (roughly ${minutes} minute${minutes === 1 ? "" : "s"} at ${PROMPT_WPM} words a minute)`);
  }
  const notes = context?.trim();
  lines.push(notes ? `Writer's brief and notes:\n${notes}` : "Writer's brief and notes: (none given)");
  return lines.join("\n");
}

function oneLine(s: string, max = 400): string {
  const flat = s.replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}

const STATUS_LABEL: Record<PreviousNote["status"], string> = {
  open: "still open (the writer hasn't marked it)",
  addressed: "the writer marked it addressed",
  dismissed: "the writer DISMISSED it (disagrees) - never raise it again",
};

/**
 * "Issues raised last time": issue text and status only. Deliberately no
 * scores, so every pass is scored from scratch.
 */
export function formatPreviousNotes(notes: PreviousNote[]): string {
  if (notes.length === 0) return "";
  const lines = notes.map((n) => {
    const tags = [n.priority, n.category].filter(Boolean).join(", ");
    return `- [${STATUS_LABEL[n.status]}]${tags ? ` (${tags})` : ""} at "${oneLine(n.anchorText, 240)}": ${oneLine(n.issue)}`;
  });
  return lines.join("\n");
}

function scriptBlock(content: string): string {
  return `<script>\n${content}\n</script>`;
}

/** Append the app-owned rules unless the (editable) persona prompt already carries them verbatim. */
function withRules(personaPrompt: string): string {
  const prompt = personaPrompt.trim();
  return prompt.includes(YOUR_WORDS_ONLY) ? prompt : `${prompt}\n\n${YOUR_WORDS_ONLY}`;
}

export interface CritiquePromptInput {
  persona: CritiquePersona;
  brief: BriefInput;
  content: string;
  /** The writer's selected passage for a section-only review. */
  sectionOnly?: string | null;
  /** Notes from the previous whole-script pass, with their statuses (a section review uses only the dismissed ones). */
  previousNotes?: PreviousNote[];
  today: Date;
}

/** System prompt + user message for one persona's critique. */
export function buildCritiquePrompt(input: CritiquePromptInput): { system: string; prompt: string } {
  const { persona, brief, content, sectionOnly, previousNotes = [], today } = input;

  const system = [
    withRules(persona.systemPrompt),
    CHANNEL_CONTEXT,
    `## Rubric\n\nScore every criterion from 1 to 10 through your lens. Weigh the criteria marked for you more heavily in your notes and overall judgement, but score all of them honestly.\n\n${renderRubric(persona.criteriaWeights as CriteriaWeights)}`,
    CRITIQUE_OUTPUT_BUDGET,
    `Today's date is ${isoDate(today)}. Treat anything the script presents as recent relative to that date.`,
  ].join("\n\n");

  const parts: string[] = [`# Brief\n\n${formatBrief(brief)}`];
  const section = sectionOnly?.trim();

  if (section) {
    // A focused pass: no "issues raised last time", but dismissals always apply.
    const dismissed = previousNotes.filter((n) => n.status === "dismissed");
    if (dismissed.length > 0) {
      parts.push(
        `# Issues the writer dismissed\n\nThe writer dismissed these notes on earlier passes because they disagree. Never raise them again.\n\n${formatPreviousNotes(dismissed)}`
      );
    }
  } else if (previousNotes.length > 0) {
    parts.push(
      `# Issues raised last time\n\nThe council's previous pass on an earlier draft raised these notes. Check each against this draft. In your summary, say briefly which ones this draft has resolved and which remain. Raise a remaining one again as a note only if it is still a real problem, anchored in the current text. Never raise a dismissed issue again.\n\n${formatPreviousNotes(previousNotes)}`
    );
  }

  parts.push(`# Script\n\n${scriptBlock(content)}`);

  if (section) {
    parts.push(
      `# Section to review\n\nThe writer asked for a review of this section only. Read the whole script for context, but score and critique this section: criteria that don't apply to a section on its own (such as the ending) are scored on how well the section sets them up. Every anchor must come from this section.\n\n<section>\n${section}\n</section>`
    );
    parts.push(`Review the section above through your lens as ${persona.name}.`);
  } else {
    parts.push(`Review the whole script above through your lens as ${persona.name}.`);
  }

  return { system, prompt: parts.join("\n\n") };
}

// ---------------------------------------------------------------------------
// Synthesis

export const SYNTHESIS_SYSTEM_PROMPT = `You are the council's editor. Several lenses, each a different persona running on a different model, reviewed the same draft independently. Your job is to merge their notes into one list the writer can work through and to write a short overview. The app computes the score table itself; you never produce scores.

## How to merge
- Combine notes that point at the same underlying problem into one, even when the lenses anchored them differently. List every lens that raised it in personaSlugs, using the slugs exactly as given.
- Reuse an anchor exactly as a lens quoted it, and only when it is verbatim text from the script. Never write a new anchor that isn't copied from the script.
- Rank by impact on the viewer: problems several lenses raised, or that would make a viewer click away, come first.
- Keep disagreements visible: when lenses contradict each other, say so in the overview and name the lenses instead of averaging them away.
- Don't invent issues no lens raised.
- Issues raised last time: keep one only if this draft still has the problem (anchored in the current text). Never resurface a dismissed issue. Don't repeat an issue the writer marked addressed unless the problem is plainly still there.
- 5-12 notes, most important first. issue at most 40 words, why at most 40 words, optional question at most 25 words.

## Overview
Markdown, at most 250 words: where the lenses agree, where they disagree (name the lenses), and what the writer should work on first. Diagnosis only.`;

export interface SynthesisLensInput {
  slug: string;
  name: string;
  modelName: string;
  critique: PersonaCritique;
}

function formatLensForSynthesis(lens: SynthesisLensInput): string {
  const c = lens.critique;
  const notes = c.notes.length
    ? c.notes
        .map((n) => {
          const q = n.question ? ` Question: ${oneLine(n.question)}` : "";
          return `- [${n.priority}, ${n.category}] anchor: "${oneLine(n.anchorText, 300)}"\n  issue: ${oneLine(n.issue)}\n  why: ${oneLine(n.why)}${q}`;
        })
        .join("\n")
    : "- (no notes)";
  const landed = c.landed.length
    ? c.landed.map((l) => `- "${oneLine(l.anchorText, 300)}": ${oneLine(l.why)}`).join("\n")
    : "- (none)";
  return `## Lens ${lens.slug}: ${lens.name} (${lens.modelName})\n\nOverall read:\n${c.summary.trim()}\n\nNotes (slug ${lens.slug}):\n${notes}\n\nWhat landed:\n${landed}`;
}

export interface ScoreTableLike {
  criterionId: string;
  scores: Record<string, number>;
  average: number | null;
}

function formatScoreTable(slugs: string[], rows: ScoreTableLike[], overall: { scores: Record<string, number>; average: number | null }): string {
  const header = `| Criterion | ${slugs.join(" | ")} | Avg |\n|---|${slugs.map(() => "---").join("|")}|---|`;
  const body = rows.map(
    (r) => `| ${criterionLabel(r.criterionId)} | ${slugs.map((s) => r.scores[s] ?? "-").join(" | ")} | ${r.average ?? "-"} |`
  );
  body.push(`| Overall | ${slugs.map((s) => overall.scores[s] ?? "-").join(" | ")} | ${overall.average ?? "-"} |`);
  return [header, ...body].join("\n");
}

export interface SynthesisPromptInput {
  brief: BriefInput;
  content: string;
  sectionOnly?: string | null;
  lenses: SynthesisLensInput[];
  failedLenses: string[];
  scoreTable: ScoreTableLike[];
  overall: { scores: Record<string, number>; average: number | null };
  previousNotes?: PreviousNote[];
  today: Date;
}

export function buildSynthesisPrompt(input: SynthesisPromptInput): { system: string; prompt: string } {
  const { brief, content, sectionOnly, lenses, failedLenses, scoreTable, overall, previousNotes = [], today } = input;

  const system = [
    SYNTHESIS_SYSTEM_PROMPT,
    CHANNEL_CONTEXT,
    YOUR_WORDS_ONLY,
    `Today's date is ${isoDate(today)}.`,
  ].join("\n\n");

  const slugs = lenses.map((l) => l.slug);
  const parts: string[] = [`# Brief\n\n${formatBrief(brief)}`];

  parts.push(
    `# Lenses\n\n${lenses.map((l) => `- ${l.slug}: ${l.name} (${l.modelName})`).join("\n")}${
      failedLenses.length ? `\n\nThese lenses failed and are not part of this pass: ${failedLenses.join(", ")}.` : ""
    }\n\nScores computed by the app (for reference; don't restate the table):\n\n${formatScoreTable(slugs, scoreTable, overall)}`
  );

  parts.push(`# Critiques\n\n${lenses.map(formatLensForSynthesis).join("\n\n---\n\n")}`);

  // A section pass only replaces notes inside the section (the rest are kept
  // as they are), so it only sees those, plus every dismissal.
  const section = sectionOnly?.trim();
  const relevant = section
    ? previousNotes.filter((n) => n.status === "dismissed" || anchorExistsInMarkdown(section, n.anchorText))
    : previousNotes;
  if (relevant.length > 0) {
    parts.push(`# Issues raised last time\n\n${formatPreviousNotes(relevant)}`);
  }

  parts.push(`# Script\n\n${scriptBlock(content)}`);

  if (section) {
    parts.push(
      `# Reviewed section\n\nThis pass reviewed one section only; keep the notes to it. Every anchor must come from this section.\n\n<section>\n${section}\n</section>`
    );
  }

  parts.push("Merge the critiques into the overview and the note list.");
  return { system, prompt: parts.join("\n\n") };
}
