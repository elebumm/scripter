import { NextRequest } from "next/server";
import { ensureDb } from "@/lib/db/init";
import { getLatestSummaryRow, getScriptEvaluations, getVersionContent } from "@/lib/db/queries/evaluations";
import { getPersonaLabels } from "@/lib/db/queries/profiles";
import { groupRuns, newestLegacyRun, parseId, parseStoredSynthesis, resolveLenses, synthesisForGroup } from "@/lib/llm/council";
import { jsonError } from "@/lib/stream/ndjson";

/**
 * The most recent synthesis for a script, or null if it was never reviewed.
 * Order: the newest saved whole-script synthesis; else the newest pre-refresh
 * (legacy) review, rebuilt from its critiques (summaryId 0, no overview);
 * else the newest section review.
 */
export async function GET(req: NextRequest) {
  ensureDb();
  const scriptId = parseId(req.nextUrl.searchParams.get("scriptId"));
  if (!scriptId) return jsonError("scriptId is required");

  const row = getLatestSummaryRow(scriptId) ?? null;
  if (row && row.sectionOnly === null) return Response.json(parseStoredSynthesis(row));

  const rows = getScriptEvaluations(scriptId);
  const legacy = newestLegacyRun(groupRuns(rows));
  if (legacy) {
    const labels = getPersonaLabels(rows.flatMap((r) => (r.personaId !== null ? [r.personaId] : [])));
    // Legacy feedback predates the "your words only" guard; strip supplied wording on read.
    const guardContent = getVersionContent(legacy.versionId) ?? undefined;
    return Response.json(synthesisForGroup(legacy, resolveLenses(legacy, labels, guardContent), scriptId));
  }

  return Response.json(parseStoredSynthesis(row));
}
