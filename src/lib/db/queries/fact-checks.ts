import { db } from "../index";
import { factChecks, factIssues } from "../schema";
import { and, desc, eq } from "drizzle-orm";

// One row per grounded fact-check run. Legacy rows (written by the old
// multi-agent flow without search) use model_provider "openrouter" and are
// never read back; grounded runs are marked with GROUNDED_PROVIDER.

export const GROUNDED_PROVIDER = "openrouter:web";

export type FactCheckRow = typeof factChecks.$inferSelect;

export function createFactCheck(data: { scriptId: number; versionId: number; modelId: string }): FactCheckRow {
  return db
    .insert(factChecks)
    .values({
      scriptId: data.scriptId,
      versionId: data.versionId,
      modelId: data.modelId,
      modelProvider: GROUNDED_PROVIDER,
      result: "",
      isSummary: false,
      status: "streaming",
    })
    .returning()
    .get();
}

export function finishFactCheck(
  id: number,
  data: {
    status: "complete" | "error";
    result?: string;
    /** JSON: accepted claims, dropped counts, tokens, cost, cited sources. */
    structuredResult?: string | null;
    errorMessage?: string | null;
    searchCount?: number;
    durationMs: number;
  }
): FactCheckRow | undefined {
  return db.update(factChecks).set(data).where(eq(factChecks.id, id)).returning().get();
}

/** The latest completed grounded run for a script (any version), if any. */
export function getLatestGroundedFactCheck(scriptId: number): FactCheckRow | undefined {
  return db
    .select()
    .from(factChecks)
    .where(
      and(
        eq(factChecks.scriptId, scriptId),
        eq(factChecks.modelProvider, GROUNDED_PROVIDER),
        eq(factChecks.status, "complete")
      )
    )
    .orderBy(desc(factChecks.id))
    .limit(1)
    .get();
}

/**
 * Delete a run and its fact notes. fact_issues.fact_check_id was added by
 * ALTER TABLE, so SQLite does not enforce its cascade: delete children first.
 */
export function deleteFactCheck(id: number): void {
  db.transaction((tx) => {
    tx.delete(factIssues).where(eq(factIssues.factCheckId, id)).run();
    tx.delete(factChecks).where(eq(factChecks.id, id)).run();
  });
}
