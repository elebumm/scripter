import { z } from "zod";
import { ensureDb } from "@/lib/db/init";
import {
  createEvaluation,
  getPreviousWholeRunId,
  getRunRows,
  getScriptVersionPair,
  updateEvaluation,
} from "@/lib/db/queries/evaluations";
import { getDismissedNotes, getIssuesRaisedLastTime } from "@/lib/db/queries/notes";
import { getPersonaRow, toPersona } from "@/lib/db/queries/profiles";
import { buildCritiquePrompt, toPreviousNotes } from "@/lib/llm/prompts";
import {
  describeFailure,
  drainStructured,
  failureUsage,
  guardCritique,
  guardPartial,
  LEGACY_RUN_PREFIX,
  startCritique,
  usageTokens,
} from "@/lib/llm/council";
import { callCostUsd, estimateCostUsd } from "@/lib/llm/models";
import { hasApiKey } from "@/lib/llm/providers";
import type { PersonaCritique } from "@/lib/llm/schemas";
import { matchKey } from "@/lib/text/anchor";
import { jsonError, ndjsonResponse } from "@/lib/stream/ndjson";

const bodySchema = z.object({
  scriptId: z.number().int().positive(),
  versionId: z.number().int().positive(),
  personaId: z.number().int().positive(),
  runId: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9-]{8,64}$/, "runId must be 8-64 letters, digits or dashes")
    .refine((id) => !id.startsWith(LEGACY_RUN_PREFIX), "runId is reserved"),
  sectionOnly: z.string().max(20_000).nullish(),
});

/**
 * Run one persona over a saved version and stream its critique as NDJSON.
 * Content, persona prompt and model all come from the DB.
 */
export async function POST(req: Request) {
  const startedAt = Date.now();
  ensureDb();

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return jsonError(`Invalid request: ${z.prettifyError(parsed.error)}`);
  const { scriptId, versionId, personaId, runId } = parsed.data;
  const sectionOnly = parsed.data.sectionOnly?.trim() || null;

  const pair = getScriptVersionPair(scriptId, versionId);
  if (!pair) return jsonError("That version doesn't belong to this script", 404);
  const personaRow = getPersonaRow(personaId);
  if (!personaRow) return jsonError("Council member not found", 404);
  if (getRunRows(scriptId, runId).some((r) => r.versionId !== versionId)) {
    return jsonError("This run already reviewed a different version", 409);
  }
  if (!hasApiKey()) return jsonError("OPENROUTER_API_KEY is not set on the server", 503);

  const persona = toPersona(personaRow);
  const { script, version } = pair;
  const content = version.content;
  // The brief is the writer's own words too: quoting it isn't supplied wording.
  const scriptKey = matchKey(`${content}\n${script.context}`);

  const { system, prompt } = buildCritiquePrompt({
    persona,
    brief: { title: script.title, context: script.context, targetLength: script.targetLength },
    content,
    sectionOnly,
    // Section reviews are focused passes: only the writer's dismissals carry over.
    previousNotes: toPreviousNotes(
      sectionOnly ? getDismissedNotes(scriptId, 40) : getIssuesRaisedLastTime(scriptId, getPreviousWholeRunId(scriptId, runId))
    ),
    today: new Date(),
  });

  const evaluation = createEvaluation({
    scriptId,
    versionId,
    runId,
    personaId,
    modelId: persona.modelSlug,
    modelProvider: "openrouter",
    sectionOnly,
    status: "streaming",
  });

  return ndjsonResponse<PersonaCritique, Partial<PersonaCritique>>(async (send) => {
    let streamError: unknown = null;
    try {
      const result = startCritique({
        modelSlug: persona.modelSlug,
        system,
        prompt,
        abortSignal: req.signal,
        onError: (error) => {
          streamError ??= error;
        },
      });
      const { output, usage, providerMetadata } = await drainStructured(result, (partial) =>
        send({ t: "partial", data: guardPartial(partial, scriptKey) as unknown as Partial<PersonaCritique> })
      );

      // Dismissals are read after the stream, so one made meanwhile still counts.
      const { critique, notesDropped, criteriaMissing } = guardCritique(output, content, scriptKey, {
        section: sectionOnly,
        dismissed: getDismissedNotes(scriptId),
      });
      const { tokensIn, tokensOut } = usageTokens(usage);
      const costUsd = callCostUsd(persona.modelSlug, tokensIn, tokensOut, providerMetadata);
      const durationMs = Date.now() - startedAt;
      updateEvaluation(evaluation.id, {
        result: critique.summary,
        structuredResult: JSON.stringify(critique),
        status: "complete",
        errorMessage: null,
        tokensIn,
        tokensOut,
        costUsd,
        durationMs,
      });
      send({ t: "final", data: critique, meta: { evaluationId: evaluation.id, costUsd, durationMs, notesDropped, criteriaMissing } });
    } catch (err) {
      const message = describeFailure(req.signal, streamError ?? err);
      // A call that ran but returned unusable output was still paid for.
      const { tokensIn, tokensOut } = usageTokens(failureUsage(err));
      const spent = tokensIn + tokensOut > 0 ? { tokensIn, tokensOut, costUsd: estimateCostUsd(persona.modelSlug, tokensIn, tokensOut) } : {};
      updateEvaluation(evaluation.id, { status: "error", errorMessage: message, durationMs: Date.now() - startedAt, ...spent });
      send({ t: "error", message });
    }
  });
}
