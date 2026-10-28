// The council's synthesis: merge the run's critiques into an overview and
// one note list. The model never scores (the app computes the table) and its
// notes are validated before they are saved.

import { Output, streamText } from "ai";
import { getModel, callSettingsFor } from "./providers";
import { ROLE_MODELS } from "./models";
import { synthesisSchema, type SynthesisOutput, type NoteCategory } from "./schemas";
import { anchorExistsInMarkdown, matchKey, resolveAnchor } from "@/lib/text/anchor";
import { isTooThin, stripSuppliedWording } from "@/lib/guard/wording";
import { dismissedIssueTest, guardQuestion, samePassage, type DismissedIssue } from "./council";
import type { NewNote, NoteCarryOverPlan } from "@/lib/db/queries/notes";
import type { NoteDropReason, NoteStatus } from "@/types/review";

export function startSynthesis(args: {
  system: string;
  prompt: string;
  abortSignal?: AbortSignal;
  onError?: (error: unknown) => void;
}) {
  const slug = ROLE_MODELS.synthesizer;
  return streamText({
    model: getModel(slug),
    ...callSettingsFor(slug),
    system: args.system,
    messages: [{ role: "user", content: args.prompt }],
    output: Output.object({ schema: synthesisSchema }),
    abortSignal: args.abortSignal,
    onError: ({ error }) => args.onError?.(error),
  });
}

export interface NoteValidationContext {
  /** The reviewed version's markdown. */
  content: string;
  /** matchKey(content), computed once. */
  scriptKey?: string;
  /** A section review: anchors outside this passage are dropped. */
  section?: string | null;
  /** Slugs of the lenses in this run; anything else is dropped from personaSlugs. */
  runSlugs: string[];
  /** Persona slug -> model display name, for sourceModels. */
  modelBySlug: Record<string, string>;
  /** The writer's dismissed notes: the same issue on the same passage never comes back. */
  dismissed?: DismissedIssue[];
}

export type DropReason = NoteDropReason;

/** Drops that lose an issue the pass raised (as opposed to repeats and dismissals). */
export const LOSSY_DROP_REASONS: readonly DropReason[] = ["anchor", "wording"];

/**
 * Validate the synthesizer's merged notes before saving: the anchor must be
 * the writer's own text (stored as their text, never the model's string) and,
 * for a section review, inside the section; supplied wording is stripped (a
 * note left too thin is dropped); duplicates and dismissed issues are dropped;
 * persona slugs are limited to the run's lenses and source models (one per
 * slug) come from the run.
 */
export function validateSynthesisNotes(
  notes: SynthesisOutput["notes"],
  ctx: NoteValidationContext
): { kept: NewNote[]; dropped: number; reasons: DropReason[] } {
  const scriptKey = ctx.scriptKey ?? matchKey(ctx.content);
  const section = ctx.section?.trim() || null;
  const allowed = new Set(ctx.runSlugs);
  const isDismissed = dismissedIssueTest(ctx.dismissed ?? []);
  const seen = new Set<string>();
  const kept: NewNote[] = [];
  const reasons: DropReason[] = [];

  for (const n of notes) {
    const anchorText = resolveAnchor(ctx.content, n.anchorText);
    if (!anchorText) {
      reasons.push("anchor");
      continue;
    }
    if (section && !anchorExistsInMarkdown(section, anchorText)) {
      reasons.push("section");
      continue;
    }
    const category: NoteCategory = n.category;
    if (isDismissed(anchorText, category)) {
      reasons.push("dismissed");
      continue;
    }
    const dupKey = `${category}\u0000${matchKey(anchorText)}`;
    if (seen.has(dupKey)) {
      reasons.push("duplicate");
      continue;
    }

    const issue = stripSuppliedWording(n.issue, scriptKey).text;
    if (isTooThin(issue)) {
      reasons.push("wording");
      continue;
    }
    const why = stripSuppliedWording(n.why, scriptKey).text;
    const question = guardQuestion(n.question, scriptKey) ?? null;

    const personaSlugs = [...new Set(n.personaSlugs.map((s) => s.trim()))].filter((s) => allowed.has(s));
    const sourceModels = personaSlugs.map((s) => ctx.modelBySlug[s] ?? "");

    seen.add(dupKey);
    kept.push({ anchorText, issue, why, question, category, priority: n.priority, personaSlugs, sourceModels });
  }

  return { kept, dropped: reasons.length, reasons };
}

/** Drop reasons as counts (only the reasons that occurred). */
export function countDropReasons(reasons: DropReason[]): Partial<Record<DropReason, number>> {
  const counts: Partial<Record<DropReason, number>> = {};
  for (const r of reasons) counts[r] = (counts[r] ?? 0) + 1;
  return counts;
}

export interface CarryOverNote {
  id: number;
  runId: string | null;
  anchorText: string;
  status: NoteStatus | string;
}

/**
 * Decide what happens to existing notes when a synthesis saves new ones for
 * the reviewed version. Notes follow the draft:
 * - open, anchor gone from the reviewed text -> addressed, carried forward
 *   (the sidebar shows them as "addressed since last pass");
 * - open, anchor still there -> replaced by this pass (for a section review,
 *   only inside the section; outside it they are carried forward still open);
 * - open notes from this same run (a re-synthesis) -> replaced;
 * - but when validation dropped some of this pass's notes (`replacedBy` is
 *   set to the anchors it saved), an open note is replaced only by a saved
 *   note on the same passage; the rest stay open (`kept`, also in `move`),
 *   so a pass whose notes didn't survive never wipes the writer's list;
 * - addressed in the previous pass -> carried forward; older ones stay behind;
 * - dismissed -> always carried forward, so the writer's decisions stay visible.
 */
export function planNoteCarryOver(args: {
  candidates: CarryOverNote[];
  runId: string;
  previousRunId: string | null;
  content: string;
  sectionOnly?: string | null;
  replacedBy?: string[] | null;
}): NoteCarryOverPlan {
  const plan: NoteCarryOverPlan = { address: [], move: [], remove: [], kept: [] };
  const section = args.sectionOnly?.trim() || null;
  const replacedBy = args.replacedBy ?? null;
  const seen = new Set<number>();

  for (const n of args.candidates) {
    if (seen.has(n.id)) continue;
    seen.add(n.id);

    if (n.status === "open") {
      const sameRun = n.runId === args.runId;
      if (!sameRun && !anchorExistsInMarkdown(args.content, n.anchorText)) plan.address.push(n.id);
      else if (!sameRun && section && !anchorExistsInMarkdown(section, n.anchorText)) plan.move.push(n.id);
      else if (replacedBy && !replacedBy.some((a) => samePassage(a, n.anchorText))) {
        plan.move.push(n.id);
        plan.kept.push(n.id);
      } else plan.remove.push(n.id);
    } else if (n.status === "dismissed") {
      plan.move.push(n.id);
    } else if (n.status === "addressed" && n.runId !== null && n.runId === args.previousRunId) {
      plan.move.push(n.id);
    }
  }
  return plan;
}
