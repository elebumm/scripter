import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { ensureDb } from "@/lib/db/init";
import { db } from "@/lib/db";
import { scripts } from "@/lib/db/schema";
import { getLatestVersion, getScript } from "@/lib/db/queries/scripts";
import { pickIconForScript } from "@/lib/llm/pick-icon";
import { hasApiKey } from "@/lib/llm/providers";
import { errorMessage, jsonError } from "@/lib/stream/ndjson";

const schema = z.object({ scriptId: z.number().int().positive() });

/**
 * POST /api/scripts/pick-icon {scriptId} → {scriptId, icon}
 * Picks a card icon once (called when a script is created) and saves it.
 * icon is null when there was nothing to go on or no known icon came back.
 */
export async function POST(req: NextRequest) {
  ensureDb();
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return jsonError("scriptId is required");
  const { scriptId } = parsed.data;

  const script = getScript(scriptId);
  if (!script) return jsonError("Script not found", 404);
  if (!hasApiKey()) return jsonError("OPENROUTER_API_KEY is not set", 503);

  const content = script.draftContent ?? getLatestVersion(scriptId)?.content ?? "";
  let icon: string | null;
  try {
    icon = await pickIconForScript({ title: script.title, context: script.context, content }, req.signal);
  } catch (err) {
    return jsonError(`Couldn't pick an icon: ${errorMessage(err)}`, 502);
  }

  if (icon) db.update(scripts).set({ icon }).where(eq(scripts.id, scriptId)).run();
  return NextResponse.json({ scriptId, icon });
}
