import { z } from "zod";
import { ensureDb } from "@/lib/db/init";
import {
  createEvaluation,
  deleteEarlierSummaries,
  getEarlierSummaries,
  getPreviousWholeRunId,
  getScriptEvaluations,
  getScriptVersionPair,
  updateEvaluation,
} from "@/lib/db/queries/evaluations";
import {
  applySynthesisNotes,
  getCarryOverCandidates,
  getDismissedNotes,
  getIssuesRaisedLastTime,
} from "@/lib/db/queries/notes";
import { getPersonaLabels } from "@/lib/db/queries/profiles";
import {
  computeScoreTable,
  describeFailure,
  drainStructured,
  failureUsage,
  groupRuns,
  guardPartial,
  lensScores,
  resolveLenses,
  usageTokens,
  type LensView,
} from "@/lib/llm/council";
import { buildSynthesisPrompt, toPreviousNotes } from "@/lib/llm/prompts";
import {
  countDropReasons,
  LOSSY_DROP_REASONS,
  planNoteCarryOver,
  startSynthesis,
  validateSynthesisNotes,
} from "@/lib/llm/synthesize";
import { callCostUsd, estimateCostUsd, ROLE_MODELS } from "@/lib/llm/models";
import { hasApiKey } from "@/lib/llm/providers";
import type { PersonaCritique, SynthesisOutput } from "@/lib/llm/schemas";
import { stripSuppliedWording } from "@/lib/guard/wording";
import { matchKey } from "@/lib/text/anchor";
import { jsonError, ndjsonResponse } from "@/lib/stream/ndjson";
import type { Synthesis } from "@/types/review";

const bodySchema = z.object({
  scriptId: z.number().int().positive(),
  versionId: z.number().int().positive(),
  runId: z.string().trim().min(1).max(64),
});

type CompleteLens = LensView & { critique: PersonaCritique };

function sum(values: Array<number | null>): number {
  return values.reduce<number>((total, v) => total + (typeof v === "number" ? v : 0), 0);
}

/**
 * Merge a run's saved critiques into the synthesis: the score table is
 * computed here, the model writes the overview and merged notes, notes are
 * validated, saved, and the whole synthesis is persisted as the run's summary.
 */
export async function POST(req: Request) {
  const startedAt = Date.now();
  ensureDb();

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return jsonError(`Invalid request: ${z.prettifyError(parsed.error)}`);
  const { scriptId, versionId, runId } = parsed.data;

  const pair = getScriptVersionPair(scriptId, versionId);
  if (!pair) return jsonError("That version doesn't belong to this script", 404);

  const rows = getScriptEvaluations(scriptId, [runId]);
  if (rows.length === 0) return jsonError("No critiques found for this run", 404);
  if (rows.some((r) => r.versionId !== versionId)) return jsonError("This run reviewed a different version", 409);

  const group = groupRuns(rows)[0];
  const lenses = resolveLenses(group, getPersonaLabels(rows.flatMap((r) => (r.personaId !== null ? [r.personaId] : []))));
  const complete = lenses.filter((l): l is CompleteLens => l.status === "complete" && l.critique !== null);
  if (complete.length === 0) return jsonError("No council member finished, so there is nothing to synthesize", 409);
  if (!hasApiKey()) return jsonError("OPENROUTER_API_KEY is not set on the server", 503);

  const { script, version } = pair;
  const content = version.content;
  // The brief is the writer's own words too: quoting it isn't supplied wording.
  const scriptKey = matchKey(`${content}\n${script.context}`);
  const sectionOnly = group.sectionOnly;
  const failed = lenses.filter((l) => l.status === "error");
  const { scoreTable, overall } = computeScoreTable(lensScores(complete));
  const previousRunId = getPreviousWholeRunId(scriptId, runId);

  const { system, prompt } = buildSynthesisPrompt({
    brief: { title: script.title, context: script.context, targetLength: script.targetLength },
    content,
    sectionOnly,
    lenses: complete.map((l) => ({ slug: l.personaSlug, name: l.personaName, modelName: l.modelName, critique: l.critique })),
    failedLenses: failed.map((l) => l.personaName),
    scoreTable,
    overall,
    previousNotes: toPreviousNotes(getIssuesRaisedLastTime(scriptId, previousRunId)),
    today: new Date(),
  });

  const synthesizer = ROLE_MODELS.synthesizer;
  const summaryRow = createEvaluation({
    scriptId,
    versionId,
    runId,
    personaId: null,
    modelId: synthesizer,
    modelProvider: "openrouter",
    isMasterSummary: true,
    sectionOnly,
    status: "streaming",
  });

  return ndjsonResponse<Synthesis, Partial<SynthesisOutput>>(async (send) => {
    let streamError: unknown = null;
    try {
      const result = startSynthesis({
        system,
        prompt,
        abortSignal: req.signal,
        onError: (error) => {
          streamError ??= error;
        },
      });
      const { output, usage, providerMetadata } = await drainStructured(result, (partial) =>
        send({ t: "partial", data: guardPartial(partial, scriptKey) as unknown as Partial<SynthesisOutput> })
      );

      // Everything from here to the summary update runs without awaiting, so
      // dismissals and note changes made during the stream are all seen.
      const overview = stripSuppliedWording(output.overview, scriptKey).text;
      const { kept, dropped, reasons } = validateSynthesisNotes(output.notes, {
        content,
        scriptKey,
        section: sectionOnly,
        runSlugs: complete.map((l) => l.personaSlug),
        modelBySlug: Object.fromEntries(complete.map((l) => [l.personaSlug, l.modelName])),
        dismissed: getDismissedNotes(scriptId),
      });
      const lostNotes = reasons.some((r) => LOSSY_DROP_REASONS.includes(r));
      const plan = planNoteCarryOver({
        candidates: getCarryOverCandidates(scriptId, versionId, runId),
        runId,
        previousRunId,
        content,
        sectionOnly,
        // Notes this pass lost can't replace the writer's open ones.
        replacedBy: lostNotes ? kept.map((n) => n.anchorText) : null,
      });
      const saved = applySynthesisNotes({ scriptId, versionId, runId, plan, newNotes: kept });
      const dropReasons = countDropReasons(reasons);

      const { tokensIn, tokensOut } = usageTokens(usage);
      const costUsd = callCostUsd(synthesizer, tokensIn, tokensOut, providerMetadata);
      // Earlier synthesis attempts of this run (a retry) are folded into this row before they're deleted.
      const earlier = getEarlierSummaries(scriptId, runId, summaryRow.id);
      const rowCost = costUsd + sum(earlier.map((r) => r.costUsd));
      const runCost = sum(group.critiques.map((r) => r.costUsd)) + rowCost;

      const synthesis: Synthesis = {
        summaryId: summaryRow.id,
        scriptId,
        versionId,
        versionNumber: version.version,
        runId,
        overview,
        scoreTable,
        overall,
        lenses: lenses.map((l) => ({
          personaSlug: l.personaSlug,
          personaName: l.personaName,
          modelName: l.modelName,
          evaluationId: l.evaluationId,
          critique: l.critique,
          status: l.status,
          ...(l.error ? { error: l.error } : {}),
        })),
        failedLenses: failed.map((l) => l.personaName),
        costUsd: runCost,
        createdAt: summaryRow.createdAt,
        noteReport: { saved: saved.length, dropped, dropReasons, previousKept: plan.kept.length },
      };

      updateEvaluation(summaryRow.id, {
        result: overview,
        structuredResult: JSON.stringify(synthesis),
        status: "complete",
        errorMessage: null,
        tokensIn: tokensIn + sum(earlier.map((r) => r.tokensIn)),
        tokensOut: tokensOut + sum(earlier.map((r) => r.tokensOut)),
        costUsd: rowCost,
        durationMs: Date.now() - startedAt,
      });
      deleteEarlierSummaries(scriptId, runId, summaryRow.id);

      send({
        t: "final",
        data: synthesis,
        meta: {
          summaryId: summaryRow.id,
          notesSaved: saved.length,
          notesDropped: dropped,
          dropReasons,
          previousNotesKept: plan.kept.length,
          costUsd,
        },
      });
    } catch (err) {
      const message = describeFailure(req.signal, streamError ?? err);
      // A call that ran but returned unusable output was still paid for.
      const { tokensIn, tokensOut } = usageTokens(failureUsage(err));
      const spent = tokensIn + tokensOut > 0 ? { tokensIn, tokensOut, costUsd: estimateCostUsd(synthesizer, tokensIn, tokensOut) } : {};
      updateEvaluation(summaryRow.id, { status: "error", errorMessage: message, durationMs: Date.now() - startedAt, ...spent });
      send({ t: "error", message });
    }
  });
}
