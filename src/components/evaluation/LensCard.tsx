"use client";

import type { ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import { MarkdownPreview } from "@/components/editor/MarkdownPreview";
import type { LensCardView } from "./view-model";
import { ModelChip, ScorePill } from "./ScoreBits";

const PRIORITY_DOT: Record<string, string> = {
  high: "bg-red-600",
  medium: "bg-amber-500",
  low: "bg-stone-400",
};

function Disclosure({ label, children }: { label: string; children: ReactNode }) {
  return (
    <details className="group border-t border-stone-100">
      <summary className="flex cursor-pointer list-none items-center gap-1.5 px-4 py-2.5 text-xs font-medium text-stone-600 hover:text-stone-900 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-stone-700 [&::-webkit-details-marker]:hidden">
        <ChevronRight className="h-3.5 w-3.5 transition-transform group-open:rotate-90" aria-hidden="true" />
        {label}
      </summary>
      <div className="px-4 pb-3">{children}</div>
    </details>
  );
}

/** One lens's critique: persona + model, overall score, summary, criteria, notes, what landed. */
export function LensCard({ lens }: { lens: LensCardView }) {
  return (
    <article className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-stone-200/70" aria-label={`${lens.name} critique`}>
      <header className="flex items-start gap-3 px-4 pt-3.5">
        <div className="min-w-0 flex-1 space-y-1">
          <h4 className="truncate text-sm font-semibold text-stone-900">{lens.name}</h4>
          <ModelChip name={lens.modelName} />
        </div>
        <div className="flex flex-col items-end gap-0.5">
          <ScorePill score={lens.overall} context={`${lens.name}, overall`} size="lg" />
          <span className="text-[10px] uppercase tracking-wide text-stone-500">Overall</span>
        </div>
      </header>

      {lens.summary ? (
        <MarkdownPreview content={lens.summary} />
      ) : (
        <p className="px-4 py-3 text-xs text-stone-500">This lens didn&apos;t write a summary.</p>
      )}

      {lens.criteria.length > 0 && (
        <Disclosure label={`Criteria (${lens.criteria.length})`}>
          <ul className="space-y-2">
            {lens.criteria.map((c) => (
              <li key={c.id} className="flex gap-2.5">
                <ScorePill score={c.score} context={`${lens.name}, ${c.label}`} className="mt-0.5 shrink-0" />
                <div className="min-w-0">
                  <p className="text-xs font-medium text-stone-800">{c.label}</p>
                  {c.observation && <p className="text-xs leading-relaxed text-stone-600">{c.observation}</p>}
                </div>
              </li>
            ))}
          </ul>
        </Disclosure>
      )}

      {lens.notes.length > 0 && (
        <Disclosure label={`Notes from this lens (${lens.notes.length})`}>
          <ul className="space-y-3">
            {lens.notes.map((n, i) => (
              <li key={i} className="space-y-1">
                <blockquote className="border-l-2 border-stone-300 pl-2.5 text-xs italic text-stone-600">
                  &ldquo;{n.anchorText}&rdquo;
                </blockquote>
                <p className="flex items-start gap-1.5 text-xs text-stone-800">
                  <span
                    className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${PRIORITY_DOT[n.priority] ?? PRIORITY_DOT.low}`}
                    aria-hidden="true"
                  />
                  <span>
                    <span className="sr-only">{n.priority} priority: </span>
                    {n.issue}
                  </span>
                </p>
                {n.why && <p className="pl-3 text-xs text-stone-600">{n.why}</p>}
                {n.question && <p className="pl-3 text-xs font-medium text-stone-700">{n.question}</p>}
              </li>
            ))}
          </ul>
        </Disclosure>
      )}

      {lens.landed.length > 0 && (
        <section className="border-t border-stone-100 px-4 py-3" aria-label="What landed">
          <h5 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-emerald-800">What landed</h5>
          <ul className="space-y-2.5">
            {lens.landed.map((l, i) => (
              <li key={i} className="space-y-1">
                <blockquote className="border-l-2 border-emerald-400 pl-2.5 text-xs italic text-stone-700">
                  &ldquo;{l.anchorText}&rdquo;
                </blockquote>
                {l.why && <p className="pl-3 text-xs text-stone-600">{l.why}</p>}
              </li>
            ))}
          </ul>
        </section>
      )}
    </article>
  );
}
