import { NextRequest } from "next/server";
import { ensureDb } from "@/lib/db/init";
import { listNotesForLatestVersion } from "@/lib/db/queries/notes";
import { parseId } from "@/lib/llm/council";
import { jsonError } from "@/lib/stream/ndjson";

/** All notes (any status) on the script's most recent version that has notes. */
export async function GET(req: NextRequest) {
  ensureDb();
  const scriptId = parseId(req.nextUrl.searchParams.get("scriptId"));
  if (!scriptId) return jsonError("scriptId is required");
  return Response.json(listNotesForLatestVersion(scriptId));
}
