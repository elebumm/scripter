import { ensureDb } from "@/lib/db/init";
import { getEvaluationsForScript } from "@/lib/db/queries/evaluations";
import { NextRequest } from "next/server";

export async function GET(req: NextRequest) {
  ensureDb();
  const scriptId = Number(req.nextUrl.searchParams.get("scriptId"));

  if (!scriptId) {
    return Response.json(
      { error: "scriptId is required" },
      { status: 400 }
    );
  }

  const rows = getEvaluationsForScript(scriptId);
  const completed = rows.filter((r) => r.status === "complete");

  return Response.json(completed);
}
