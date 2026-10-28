import { db } from "../index";
import { factIssues } from "../schema";
import { and, asc, eq, isNotNull } from "drizzle-orm";
import type { FactNote } from "@/types/review";
import { FACT_VERDICTS, type FactVerdict } from "@/lib/llm/schemas";

// Fact notes: a claim from the script, a verdict and what the sources say.
// `correction` is always NULL: the app never offers replacement wording.
// Rows with fact_check_id NULL are legacy (written without search) and are
// never returned.

type FactIssueRow = typeof factIssues.$inferSelect;

export const FACT_NOTE_STATUSES = ["pending", "acknowledged", "dismissed"] as const satisfies readonly FactNote["status"][];

function parseSources(raw: string): FactNote["sources"] {
  try {
    const value: unknown = JSON.parse(raw);
    if (!Array.isArray(value)) return [];
    return value.flatMap((item): FactNote["sources"] => {
      if (typeof item === "string") return [{ url: item }];
      if (item && typeof item === "object" && typeof (item as { url?: unknown }).url === "string") {
        const { url, title } = item as { url: string; title?: unknown };
        return [typeof title === "string" && title ? { url, title } : { url }];
      }
      return [];
    });
  } catch {
    return [];
  }
}

function asVerdict(value: string): FactVerdict {
  return (FACT_VERDICTS as readonly string[]).includes(value) ? (value as FactVerdict) : "unverifiable";
}

function asStatus(value: string): FactNote["status"] {
  return (FACT_NOTE_STATUSES as readonly string[]).includes(value) ? (value as FactNote["status"]) : "acknowledged";
}

export function toFactNote(row: FactIssueRow): FactNote {
  return {
    id: row.id,
    factCheckId: row.factCheckId ?? 0,
    scriptId: row.scriptId,
    versionId: row.versionId,
    claimText: row.claimText,
    verdict: asVerdict(row.verdict),
    explanation: row.reasoning,
    sources: parseSources(row.sources),
    category: row.category,
    status: asStatus(row.status),
    createdAt: row.createdAt,
  };
}

export interface NewFactNote {
  claimText: string;
  verdict: FactVerdict;
  explanation: string;
  sources: Array<{ url: string; title?: string }>;
  category: string;
  /** Status carried over from an earlier run; defaults to "pending". */
  status?: FactNote["status"];
}

/** Save a run's validated claims, in the given order. */
export function insertFactNotes(
  run: { factCheckId: number; scriptId: number; versionId: number; modelName: string },
  items: NewFactNote[]
): FactNote[] {
  if (items.length === 0) return [];
  return db
    .insert(factIssues)
    .values(
      items.map((item) => ({
        scriptId: run.scriptId,
        versionId: run.versionId,
        factCheckId: run.factCheckId,
        claimText: item.claimText,
        verdict: item.verdict,
        accuracy: null,
        correction: null,
        reasoning: item.explanation,
        sources: JSON.stringify(item.sources),
        isExaggeration: item.verdict === "exaggeration-ok",
        category: item.category,
        agentModels: JSON.stringify([run.modelName]),
        status: item.status ?? "pending",
      }))
    )
    .returning()
    .all()
    .map(toFactNote);
}

/** Every grounded fact note of a script, oldest first (for carrying statuses across runs). */
export function listGroundedFactNotes(scriptId: number): FactNote[] {
  return db
    .select()
    .from(factIssues)
    .where(and(eq(factIssues.scriptId, scriptId), isNotNull(factIssues.factCheckId)))
    .orderBy(asc(factIssues.id))
    .all()
    .map(toFactNote);
}

export function listFactNotesForCheck(factCheckId: number): FactNote[] {
  return db
    .select()
    .from(factIssues)
    .where(eq(factIssues.factCheckId, factCheckId))
    .orderBy(asc(factIssues.id))
    .all()
    .map(toFactNote);
}

/** Update a grounded fact note's status; legacy rows are not addressable. */
export function setFactNoteStatus(id: number, status: FactNote["status"]): FactNote | undefined {
  const row = db
    .update(factIssues)
    .set({ status })
    .where(and(eq(factIssues.id, id), isNotNull(factIssues.factCheckId)))
    .returning()
    .get();
  return row ? toFactNote(row) : undefined;
}
