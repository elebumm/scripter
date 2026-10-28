import { ensureDb } from "@/lib/db/init";
import { listPersonas } from "@/lib/db/queries/profiles";

/** Council members (personas with a slug) by position, active and inactive. */
export async function GET() {
  ensureDb();
  return Response.json(listPersonas());
}
