"use client";

import { useMemo } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MarkdownPreview } from "@/components/editor/MarkdownPreview";
import { parseDbDate } from "@/lib/utils/dates";
import type { Synthesis } from "@/types/review";
import { buildFailedLenses, buildLensCards, buildScoreTable, buildSynthesisHeader } from "./view-model";
import { ScoreTable } from "./ScoreTable";
import { LensCard } from "./LensCard";
import { ModelChip, SectionLabel } from "./ScoreBits";

interface SynthesisViewProps {
  synthesis: Synthesis;
  now: Date;
  /** Offer Retry for these failed lenses (only when the synthesis is this session's current run). */
  retry?: { slugs: ReadonlySet<string>; onRetry: (slug: string) => void; disabled?: boolean };
}

/** Read-only view of one persisted synthesis: overview, scores, lens cards, failures. */
export function SynthesisView({ synthesis, now, retry }: SynthesisViewProps) {
  const header = buildSynthesisHeader(synthesis, now);
  const table = useMemo(() => buildScoreTable(synthesis), [synthesis]);
  const cards = useMemo(() => buildLensCards(synthesis), [synthesis]);
  const failed = useMemo(() => buildFailedLenses(synthesis), [synthesis]);
  const created = parseDbDate(synthesis.createdAt);

  return (
    <div className="space-y-5">
      <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-stone-600">
        <time
          className="font-semibold text-stone-800"
          dateTime={created?.toISOString()}
          title={created?.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}
        >
          {header.line}
        </time>
        <span aria-hidden="true">&middot;</span>
        <span>
          {header.lensCount} {header.lensCount === 1 ? "lens" : "lenses"}
          {header.failedCount > 0 && `, ${header.failedCount} failed`}
        </span>
        {header.cost && (
          <>
            <span aria-hidden="true">&middot;</span>
            <span title="Total model cost of this run">{header.cost}</span>
          </>
        )}
      </p>

      <section className="space-y-2" aria-label="Overview">
        <SectionLabel>Overview</SectionLabel>
        {synthesis.overview.trim() ? (
          <div className="rounded-2xl bg-white shadow-sm ring-1 ring-stone-200/70">
            <MarkdownPreview content={synthesis.overview} />
          </div>
        ) : (
          <p className="rounded-xl bg-white/70 px-4 py-3 text-xs text-stone-600 ring-1 ring-stone-200/70">
            No overview was saved for this run. The lens critiques below are all that&apos;s left of it.
          </p>
        )}
      </section>

      {!table.isEmpty && (
        <section className="space-y-2" aria-label="Scores">
          <SectionLabel>Scores</SectionLabel>
          <ScoreTable table={table} />
        </section>
      )}

      {cards.length > 0 && (
        <section className="space-y-3" aria-label="Lens critiques">
          <SectionLabel>Lens critiques</SectionLabel>
          {cards.map((lens) => (
            <LensCard key={lens.slug} lens={lens} />
          ))}
        </section>
      )}

      {failed.length > 0 && (
        <section className="space-y-2" aria-label="Lenses that failed">
          <SectionLabel>Didn&apos;t finish</SectionLabel>
          <ul className="space-y-2">
            {failed.map((f) => (
              <li key={f.slug} className="flex items-start gap-3 rounded-xl bg-white px-4 py-3 ring-1 ring-red-200">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-700" aria-hidden="true" />
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold text-stone-900">{f.name}</span>
                    <ModelChip name={f.modelName} />
                  </div>
                  <p className="break-words text-xs text-red-800">{f.error ?? "This lens failed; no error was recorded."}</p>
                </div>
                {retry?.slugs.has(f.slug) && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 shrink-0 gap-1 rounded-lg border-stone-300 text-xs text-stone-700"
                    disabled={retry.disabled}
                    onClick={() => retry.onRetry(f.slug)}
                    aria-label={`Retry ${f.name}`}
                  >
                    <RefreshCw className="h-3 w-3" aria-hidden="true" />
                    Retry
                  </Button>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
