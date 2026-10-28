import { ensureDb } from "@/lib/db/init";
import { MODELS } from "@/lib/llm/models";

/** The model registry (read-only): what a council member may run on, with prices. */
export async function GET() {
  ensureDb();
  return Response.json(MODELS);
}
