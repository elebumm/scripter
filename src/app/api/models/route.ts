import { NextResponse } from "next/server";
import { ensureDb } from "@/lib/db/init";
import {
  listCustomModels,
  createCustomModel,
} from "@/lib/db/queries/models";

export async function GET() {
  ensureDb();
  const models = listCustomModels();
  return NextResponse.json(models);
}

export async function POST(req: Request) {
  ensureDb();
  const body = await req.json();
  const model = createCustomModel({
    name: body.name,
    provider: body.provider ?? "openrouter",
    modelId: body.modelId,
    baseUrl: body.baseUrl,
    isActive: body.isActive ?? true,
  });
  return NextResponse.json(model);
}
