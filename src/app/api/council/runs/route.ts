import { NextRequest } from "next/server";
import { ensureDb } from "@/lib/db/init";
import { getScriptEvaluations, getVersionContent } from "@/lib/db/queries/evaluations";
import { getPersonaLabels } from "@/lib/db/queries/profiles";
import { groupRuns, parseId, resolveLenses, summarizeRun, synthesisForGroup } from "@/lib/llm/council";
import { jsonError } from "@/lib/stream/ndjson";

/**
 * GET ?scriptId -> RunSummary[] (newest first; legacy rows grouped by version).
 * GET ?scriptId&runId -> that run's Synthesis (saved, or rebuilt from its critiques), or null.
 */
export async function GET(req: NextRequest) {
  ensureDb();
  const params = req.nextUrl.searchParams;
  const scriptId = parseId(params.get("scriptId"));
  if (!scriptId) return jsonError("scriptId is required");
  const runId = params.get("runId");

  const rows = getScriptEvaluations(scriptId);
  const groups = groupRuns(rows);
  const labels = getPersonaLabels(rows.flatMap((r) => (r.personaId !== null ? [r.personaId] : [])));

  if (runId) {
    const group = groups.find((g) => g.runId === runId);
    if (!group) return Response.json(null);
    // Legacy feedback predates the "your words only" guard; strip supplied wording on read.
    const guardContent = group.legacy ? (getVersionContent(group.versionId) ?? undefined) : undefined;
    return Response.json(synthesisForGroup(group, resolveLenses(group, labels, guardContent), scriptId));
  }

  return Response.json(groups.map((g) => summarizeRun(g, resolveLenses(g, labels))));
}
