import { NextRequest } from "next/server";
import { z } from "zod";
import type { DeepPartial } from "ai";
import { ensureDb } from "@/lib/db/init";
import { getScript, getScriptVersion } from "@/lib/db/queries/scripts";
import { applyCoverageUpdates, listBeats } from "@/lib/db/queries/beats";
import { guardBeatCheckPartial, planBeatCheck, streamBeatCheck, writerBeatMaterial, writerMaterialKey } from "@/lib/llm/beats";
import type { BeatCheck } from "@/lib/llm/schemas";
import { hasApiKey } from "@/lib/llm/providers";
import { jsonError, ndjsonResponse } from "@/lib/stream/ndjson";
import type { Beat } from "@/types/review";

const schema = z.object({
  scriptId: z.number().int().positive(),
  versionId: z.number().int().positive(),
});

/**
 * POST /api/beats/check {scriptId, versionId} → NDJSON {beats, check}
 * Checks a saved version against the beat sheet. Verified coverage anchors
 * and the planned <-> drafted status are saved; missing beats are proposals.
 */
export async function POST(req: NextRequest) {
  ensureDb();
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return jsonError("scriptId and versionId are required");
  const { scriptId, versionId } = parsed.data;

  const script = getScript(scriptId);
  if (!script) return jsonError("Script not found", 404);
  const version = getScriptVersion(versionId);
  if (!version || version.scriptId !== scriptId) return jsonError("Version not found", 404);
  if (!version.content.trim()) return jsonError("This version is empty; write some draft first.");

  const beats = listBeats(scriptId);
  const active = beats.filter((b) => b.status !== "cut");
  if (active.length === 0) return jsonError("Add some beats before checking the draft against them.");
  if (!hasApiKey()) return jsonError("OPENROUTER_API_KEY is not set", 503);

  const writerKey = writerMaterialKey([script.title, script.context, version.content, ...writerBeatMaterial(beats)]);

  return ndjsonResponse<{ beats: Beat[]; check: BeatCheck }, DeepPartial<BeatCheck>>(async (send) => {
    let streamError: unknown = null;
    const result = streamBeatCheck(
      { title: script.title, context: script.context, beats: active, content: version.content, versionNumber: version.version },
      {
        abortSignal: req.signal,
        onError: (error) => {
          streamError ??= error;
        },
      }
    );

    for await (const partial of result.partialOutputStream) {
      send({ t: "partial", data: guardBeatCheckPartial(partial, writerKey) });
    }

    let output: BeatCheck;
    try {
      output = await result.output;
    } catch (err) {
      throw streamError ?? err;
    }

    // Re-read the sheet: the writer may have edited beats while the model ran.
    const plan = planBeatCheck({ beats: listBeats(scriptId), check: output, content: version.content, writerKey });
    const updated = applyCoverageUpdates(scriptId, plan.updates);
    send({
      t: "final",
      data: { beats: updated, check: plan.check },
      meta: {
        versionId,
        anchorsAccepted: plan.anchorsAccepted,
        anchorsRejected: plan.anchorsRejected,
        missingDropped: plan.missingDropped,
      },
    });
  });
}
