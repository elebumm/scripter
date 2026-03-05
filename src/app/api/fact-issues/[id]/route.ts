import { ensureDb } from "@/lib/db/init";
import { updateFactIssueStatus } from "@/lib/db/queries/fact-issues";

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  ensureDb();
  const { id } = await params;
  const body = await req.json();
  const { status } = body;

  if (!["acknowledged", "dismissed", "corrected"].includes(status)) {
    return new Response(
      JSON.stringify({ error: "Invalid status" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  const updated = updateFactIssueStatus(Number(id), status);

  if (!updated) {
    return new Response(
      JSON.stringify({ error: "Fact issue not found" }),
      { status: 404, headers: { "Content-Type": "application/json" } }
    );
  }

  return new Response(JSON.stringify(updated), {
    headers: { "Content-Type": "application/json" },
  });
}
