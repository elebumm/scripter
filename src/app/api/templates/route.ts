import { NextResponse } from "next/server";
import { z } from "zod";
import { ensureDb } from "@/lib/db/init";
import { createScriptFromTemplate, listTemplates, withoutDraft } from "@/lib/db/queries/scripts";

const createSchema = z.object({
  templateId: z.coerce.number().int().positive(),
  title: z.string().max(300).optional(),
});

export async function GET() {
  ensureDb();
  return NextResponse.json(listTemplates().map(withoutDraft));
}

/** Creates exactly ONE script from the template and returns it. */
export async function POST(req: Request) {
  ensureDb();
  const parsed = createSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "templateId is required" }, { status: 400 });
  }
  const script = createScriptFromTemplate(parsed.data.templateId, parsed.data.title);
  if (!script) {
    return NextResponse.json({ error: "Template not found" }, { status: 404 });
  }
  return NextResponse.json(withoutDraft(script));
}
