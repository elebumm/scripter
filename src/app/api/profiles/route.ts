import { NextResponse } from "next/server";
import { ensureDb } from "@/lib/db/init";
import { listProfiles, createProfile } from "@/lib/db/queries/profiles";

export async function GET() {
  ensureDb();
  const profiles = listProfiles();
  return NextResponse.json(profiles);
}

export async function POST(req: Request) {
  ensureDb();
  const body = await req.json();
  const profile = createProfile({
    name: body.name,
    systemPrompt: body.systemPrompt,
    criteriaWeights: body.criteriaWeights,
    isDefault: body.isDefault ?? false,
  });
  return NextResponse.json(profile);
}
