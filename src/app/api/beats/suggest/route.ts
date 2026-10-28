import { NextRequest } from "next/server";
import { z } from "zod";
import type { DeepPartial } from "ai";
import { ensureDb } from "@/lib/db/init";
import { getLatestVersion, getScript } from "@/lib/db/queries/scripts";
import { listBeats } from "@/lib/db/queries/beats";
import {
  guardBeatSuggestionPartial,
  sanitizeBeatSuggestion,
  streamBeatSuggestion,
  writerBeatMaterial,
  writerMaterialKey,
  type BeatBrief,
} from "@/lib/llm/beats";
import type { BeatSuggestion } from "@/lib/llm/schemas";
import { hasApiKey } from "@/lib/llm/providers";
import { jsonError, ndjsonResponse } from "@/lib/stream/ndjson";

const schema = z.object({ scriptId: z.number().int().positive() });

/**
 * POST /api/beats/suggest {scriptId} → NDJSON BeatSuggestion
 * Proposes beats from the brief (and the current draft, if any). Nothing is
 * saved; the writer adds the beats they want.
 */
export async function POST(req: NextRequest) {
  ensureDb();
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return jsonError("scriptId is required");
  const script = getScript(parsed.data.scriptId);
  if (!script) return jsonError("Script not found", 404);
  if (!hasApiKey()) return jsonError("OPENROUTER_API_KEY is not set", 503);

  const draft = script.draftContent ?? getLatestVersion(script.id)?.content ?? "";
  if (!script.context.trim() && !draft.trim() && !script.title.trim()) {
    return jsonError("Write a brief or some draft text first, so the beats have something to fit.");
  }

  const existing = listBeats(script.id);
  const brief: BeatBrief = {
    title: script.title,
    context: script.context,
    targetLength: script.targetLength,
    draft,
    // Planned AI beats are what a new proposal replaces; everything else stays.
    keptBeats: existing.filter((b) => !(b.source === "ai" && b.status === "planned")),
  };
  const writerKey = writerMaterialKey([script.title, script.context, draft, ...writerBeatMaterial(existing)]);

  return ndjsonResponse<BeatSuggestion, DeepPartial<BeatSuggestion>>(async (send) => {
    let streamError: unknown = null;
    const result = streamBeatSuggestion(brief, {
      abortSignal: req.signal,
      onError: (error) => {
        streamError ??= error;
      },
    });

    for await (const partial of result.partialOutputStream) {
      send({ t: "partial", data: guardBeatSuggestionPartial(partial, writerKey) });
    }

    let output: BeatSuggestion;
    try {
      output = await result.output;
    } catch (err) {
      throw streamError ?? err;
    }

    const { suggestion, dropped, guardTripped } = sanitizeBeatSuggestion(output, writerKey);
    if (suggestion.beats.length === 0) throw new Error("The model didn't return any usable beats. Try again.");
    send({ t: "final", data: suggestion, meta: { dropped, guardTripped } });
  });
}
