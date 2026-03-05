import { ensureDb } from "@/lib/db/init";
import { getFactIssuesForVersion } from "@/lib/db/queries/fact-issues";
import { NextRequest } from "next/server";

export async function GET(req: NextRequest) {
  ensureDb();
  const { searchParams } = req.nextUrl;
  const scriptId = Number(searchParams.get("scriptId"));
  const versionId = Number(searchParams.get("versionId"));

  if (!scriptId || !versionId) {
    return new Response(
      JSON.stringify({ error: "scriptId and versionId are required" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  const issues = getFactIssuesForVersion(scriptId, versionId);

  // Parse JSON fields for client
  const parsed = issues.map((issue) => ({
    ...issue,
    sources: JSON.parse(issue.sources as string),
    agentModels: JSON.parse(issue.agentModels as string),
  }));

  return new Response(JSON.stringify(parsed), {
    headers: { "Content-Type": "application/json" },
  });
}
