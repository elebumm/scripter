import { NextRequest } from "next/server";
import { ensureDb } from "@/lib/db/init";
import { getScriptEvaluations } from "@/lib/db/queries/evaluations";
import { getPersonaLabels } from "@/lib/db/queries/profiles";
import { buildTrendPoints, groupRuns, parseId, resolveLenses } from "@/lib/llm/council";
import { jsonError } from "@/lib/stream/ndjson";

/** Score trend per version: its latest whole-script run (section reviews excluded). */
export async function GET(req: NextRequest) {
  ensureDb();
  const scriptId = parseId(req.nextUrl.searchParams.get("scriptId"));
  if (!scriptId) return jsonError("scriptId is required");

  const rows = getScriptEvaluations(scriptId);
  const labels = getPersonaLabels(rows.flatMap((r) => (r.personaId !== null ? [r.personaId] : [])));
  return Response.json(buildTrendPoints(groupRuns(rows), (g) => resolveLenses(g, labels)));
}
