import { ensureDb } from "@/lib/db/init";
import { getSuggestionsForVersion } from "@/lib/db/queries/suggestions";
import { NextRequest } from "next/server";

export async function GET(req: NextRequest) {
  ensureDb();
  const scriptId = Number(req.nextUrl.searchParams.get("scriptId"));
  const versionId = Number(req.nextUrl.searchParams.get("versionId"));

  if (!scriptId || !versionId) {
    return Response.json(
      { error: "scriptId and versionId are required" },
      { status: 400 }
    );
  }

  const rows = getSuggestionsForVersion(scriptId, versionId);

  const suggestions = rows.map((row) => ({
    ...row,
    sourceModels: JSON.parse(row.sourceModels) as string[],
  }));

  return Response.json(suggestions);
}
