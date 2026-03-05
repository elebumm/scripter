import { ensureDb } from "@/lib/db/init";
import { updateSuggestionStatus } from "@/lib/db/queries/suggestions";

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  ensureDb();
  const { id } = await params;
  const body = await req.json();
  const { status } = body;

  if (!status || !["accepted", "dismissed"].includes(status)) {
    return Response.json(
      { error: "status must be 'accepted' or 'dismissed'" },
      { status: 400 }
    );
  }

  const updated = updateSuggestionStatus(Number(id), status);

  if (!updated) {
    return Response.json({ error: "Suggestion not found" }, { status: 404 });
  }

  return Response.json({
    ...updated,
    sourceModels: JSON.parse(updated.sourceModels) as string[],
  });
}
