import { NextResponse } from "next/server";
import { z } from "zod";
import { ensureDb } from "@/lib/db/init";
import { getScriptEvaluations } from "@/lib/db/queries/evaluations";
import {
  MAX_CONTENT_LENGTH,
  createScript,
  listScriptSummaries,
  withoutDraft,
  type ScriptSummaryRow,
} from "@/lib/db/queries/scripts";
import { groupRuns, newestLegacyRun, resolveLenses, summarizeRun } from "@/lib/llm/council";

const createSchema = z.object({
  title: z.string().max(300).optional(),
  context: z.string().max(50_000).optional(),
  targetLength: z.number().int().min(0).max(100_000).nullable().optional(),
  content: z.string().max(MAX_CONTENT_LENGTH).optional(),
});

/**
 * Scripts reviewed only before the refresh have no saved synthesis; their
 * last score is the average of the newest legacy review's critiques.
 */
function withLegacyScore(summary: ScriptSummaryRow): ScriptSummaryRow {
  if (summary.lastScore !== null) return summary;
  const legacy = newestLegacyRun(groupRuns(getScriptEvaluations(summary.id)));
  if (!legacy) return summary;
  const run = summarizeRun(legacy, resolveLenses(legacy, new Map()));
  if (run.overallAverage === null) return summary;
  return { ...summary, lastScore: run.overallAverage, lastReviewedAt: legacy.createdAt };
}

/** Drafts list: non-template scripts, `?archived=1` for the archive. */
export async function GET(req: Request) {
  ensureDb();
  const flag = new URL(req.url).searchParams.get("archived");
  return NextResponse.json(listScriptSummaries({ archived: flag === "1" || flag === "true" }).map(withLegacyScore));
}

/** New script: empty title and content unless given; context holds the brief. */
export async function POST(req: Request) {
  ensureDb();
  const parsed = createSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: `Invalid script: ${parsed.error.issues[0]?.message ?? "bad body"}` }, { status: 400 });
  }
  const { title, context, targetLength, content } = parsed.data;
  const script = createScript(title?.trim() ?? "", content ?? "", { context, targetLength });
  return NextResponse.json(withoutDraft(script));
}
