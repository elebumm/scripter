import { NextResponse } from "next/server";
import { ensureDb } from "@/lib/db/init";
import { listTemplates, createScriptFromTemplate } from "@/lib/db/queries/scripts";

export async function GET() {
  ensureDb();
  return NextResponse.json(listTemplates());
}

export async function POST(req: Request) {
  ensureDb();
  const { templateId, title } = await req.json();
  if (!templateId) {
    return NextResponse.json({ error: "templateId is required" }, { status: 400 });
  }
  const script = createScriptFromTemplate(Number(templateId), title);
  if (!script) {
    return NextResponse.json({ error: "Template not found" }, { status: 404 });
  }
  return NextResponse.json(script);
}
