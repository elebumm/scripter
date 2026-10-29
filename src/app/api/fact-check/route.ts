import { NextRequest } from "next/server";
import { z } from "zod";
import type { DeepPartial } from "ai";
import { ensureDb } from "@/lib/db/init";
import { getScript, getScriptVersion } from "@/lib/db/queries/scripts";
import { createFactCheck, finishFactCheck } from "@/lib/db/queries/fact-checks";
import { insertFactNotes, listGroundedFactNotes } from "@/lib/db/queries/fact-issues";
import {
  FACT_CHECK_MODEL,
  NO_SEARCH_RESULTS_MESSAGE,
  carriedFactStatuses,
  factCheckFailureMessage,
  guardFactCheckPartial,
  indexReturnedSources,
  streamFactCheck,
  usageCost,
  validateFactClaims,
} from "@/lib/llm/fact-check";
import { failureUsage } from "@/lib/llm/council";
import { getModelBySlug } from "@/lib/llm/models";
import { hasApiKey } from "@/lib/llm/providers";
import type { FactCheckOutput } from "@/lib/llm/schemas";
import { jsonError, ndjsonResponse } from "@/lib/stream/ndjson";
import { matchKey } from "@/lib/text/anchor";
import type { FactNote } from "@/types/review";

const schema = z.object({
  scriptId: z.number().int().positive(),
  versionId: z.number().int().positive(),
});

/**
 * POST /api/fact-check {scriptId, versionId} → NDJSON FactNote[]
 * One grounded agent (OpenRouter web search). Only URLs the search returned
 * are kept, claims must quote the script, and nothing is ever rewritten. A
 * claim the writer already acknowledged or dismissed (same text and verdict)
 * keeps that status. A run whose search returned nothing fails instead of
 * saving every claim as unverifiable.
 * Final meta: {factCheckId, searchCount, claimsSaved, claimsDropped, claimsDroppedBy, claimsDowngraded, claimsCarried, costUsd}.
 */
export async function POST(req: NextRequest) {
  const startedAt = Date.now();
  ensureDb();
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return jsonError("scriptId and versionId are required");
  const { scriptId, versionId } = parsed.data;

  const script = getScript(scriptId);
  if (!script) return jsonError("Script not found", 404);
  const version = getScriptVersion(versionId);
  if (!version || version.scriptId !== scriptId) return jsonError("Version not found", 404);
  if (!version.content.trim()) return jsonError("This version is empty; there is nothing to fact-check.");
  if (!hasApiKey()) return jsonError("OPENROUTER_API_KEY is not set", 503);

  const content = version.content;
  const scriptKey = matchKey(content);
  const modelName = getModelBySlug(FACT_CHECK_MODEL)?.name ?? FACT_CHECK_MODEL;
  const run = createFactCheck({ scriptId, versionId, modelId: FACT_CHECK_MODEL });

  return ndjsonResponse<FactNote[], DeepPartial<FactCheckOutput>>(async (send) => {
    let streamError: unknown = null;
    // Tokens and cost of a call that finished but can't be used, kept on the failed run.
    let spent: string | null = null;
    try {
      const result = streamFactCheck({
        title: script.title,
        context: script.context,
        content,
        today: new Date().toISOString().slice(0, 10),
        abortSignal: req.signal,
        onError: (error) => {
          streamError ??= error;
        },
      });

      for await (const partial of result.partialOutputStream) {
        send({ t: "partial", data: guardFactCheckPartial(partial, scriptKey) });
      }

      let output: FactCheckOutput;
      try {
        output = await result.output;
      } catch (err) {
        throw streamError ?? err;
      }

      const returned = indexReturnedSources(await result.sources);
      const { tokensIn, tokensOut, costUsd } = usageCost(
        FACT_CHECK_MODEL,
        await result.totalUsage,
        await result.providerMetadata
      );
      if (returned.size === 0 && output.claims.length > 0) {
        spent = JSON.stringify({ model: FACT_CHECK_MODEL, tokensIn, tokensOut, costUsd, claimsReturned: output.claims.length });
        throw new Error(NO_SEARCH_RESULTS_MESSAGE);
      }

      const validation = validateFactClaims(output, { content, returned, scriptKey });
      const { notInScript, duplicate, tooThin, overLimit } = validation.dropped;
      const claimsDropped = notInScript + duplicate + tooThin + overLimit;
      // Read after the model ran, so a note dismissed meanwhile is carried too.
      const statuses = carriedFactStatuses(listGroundedFactNotes(scriptId), validation.claims);
      const claimsCarried = statuses.filter((s) => s !== "pending").length;

      const notes = insertFactNotes(
        { factCheckId: run.id, scriptId, versionId, modelName },
        validation.claims.map((c, i) => ({
          claimText: c.claimText,
          verdict: c.verdict,
          explanation: c.explanation,
          sources: c.sources,
          category: c.category,
          status: statuses[i],
        }))
      );
      finishFactCheck(run.id, {
        status: "complete",
        result: `${notes.length} claims checked against ${returned.size} search results.`,
        structuredResult: JSON.stringify({
          model: FACT_CHECK_MODEL,
          tokensIn,
          tokensOut,
          costUsd,
          claimsReturned: output.claims.length,
          claimsSaved: notes.length,
          dropped: validation.dropped,
          downgraded: validation.downgraded,
          carried: claimsCarried,
          guardTripped: validation.claims.filter((c) => c.guardTripped).length,
          sources: [...returned.values()],
        }),
        searchCount: returned.size,
        durationMs: Date.now() - startedAt,
        errorMessage: null,
      });

      send({
        t: "final",
        data: notes,
        meta: {
          factCheckId: run.id,
          searchCount: returned.size,
          claimsSaved: notes.length,
          claimsDropped,
          claimsDroppedBy: validation.dropped,
          claimsDowngraded: validation.downgraded,
          claimsCarried,
          costUsd,
        },
      });
    } catch (err) {
      const message = factCheckFailureMessage(err, req.signal);
      // A call that ran but returned unusable output (e.g. cut off) was still paid for.
      const cutOff = failureUsage(err);
      if (!spent && cutOff) spent = JSON.stringify({ model: FACT_CHECK_MODEL, ...usageCost(FACT_CHECK_MODEL, cutOff, undefined) });
      finishFactCheck(run.id, {
        status: "error",
        errorMessage: message,
        durationMs: Date.now() - startedAt,
        ...(spent ? { structuredResult: spent, searchCount: 0 } : {}),
      });
      throw new Error(message);
    }
  });
}
