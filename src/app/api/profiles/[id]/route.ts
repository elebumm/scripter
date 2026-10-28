import { z } from "zod";
import { ensureDb } from "@/lib/db/init";
import { getPersonaRow, toPersona, updatePersona } from "@/lib/db/queries/profiles";
import { parseId } from "@/lib/llm/council";
import { isAllowedModelSlug } from "@/lib/llm/models";
import { CRITERIA_IDS } from "@/lib/llm/rubric";
import { jsonError } from "@/lib/stream/ndjson";

type Params = { params: Promise<{ id: string }> };

// Personas are deactivated, never deleted (evaluations keep their persona_id).
const patchSchema = z
  .object({
    name: z.string().trim().min(1).max(80),
    description: z.string().trim().max(600),
    systemPrompt: z.string().trim().min(20).max(20_000),
    criteriaWeights: z.partialRecord(z.enum(CRITERIA_IDS), z.number().min(0).max(5)),
    modelSlug: z.string().refine(isAllowedModelSlug, "Unknown model; pick one from the registry"),
    isActive: z.boolean(),
    position: z.number().int().min(0).max(1000),
  })
  .partial();

export async function GET(_req: Request, { params }: Params) {
  ensureDb();
  const id = parseId((await params).id);
  const row = id ? getPersonaRow(id) : undefined;
  if (!row) return jsonError("Council member not found", 404);
  return Response.json(toPersona(row));
}

export async function PATCH(req: Request, { params }: Params) {
  ensureDb();
  const id = parseId((await params).id);
  if (!id || !getPersonaRow(id)) return jsonError("Council member not found", 404);
  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return jsonError(`Invalid request: ${z.prettifyError(parsed.error)}`);
  const persona = updatePersona(id, parsed.data);
  if (!persona) return jsonError("Council member not found", 404);
  return Response.json(persona);
}
