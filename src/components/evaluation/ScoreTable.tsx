"use client";

import { ChevronRight } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { SCORE_BANDS, TONE_CLASSES, type ScoreTableView } from "./view-model";
import { ScorePill } from "./ScoreBits";

/** Criteria rows × lens columns, an average column and an overall row. */
export function ScoreTable({ table }: { table: ScoreTableView }) {
  const { columns, rows, overall } = table;
  // The row tooltips are hover-only, so the disclosure spells them out too.
  const criteria = rows.filter((row) => row.lookFor);

  return (
    <div className="space-y-2">
      <div className="overflow-x-auto rounded-xl bg-white ring-1 ring-stone-200/70">
        <table className="w-full border-collapse text-xs">
          <caption className="sr-only">Scores out of 10 by criterion and lens, with the average across lenses</caption>
          <thead>
            <tr className="border-b border-stone-200 text-stone-600">
              <th scope="col" className="px-3 py-2 text-left font-medium">
                Criterion
              </th>
              {columns.map((c) => (
                <th key={c.slug} scope="col" className="px-1 py-2 text-center font-semibold">
                  <abbr title={c.modelName ? `${c.name} (${c.modelName})` : c.name} className="no-underline">
                    {c.short}
                  </abbr>
                </th>
              ))}
              <th scope="col" className="px-2 py-2 text-center font-semibold text-stone-800">
                Avg
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-b border-stone-100 last:border-b-0">
                <th scope="row" className="px-3 py-1.5 text-left font-normal text-stone-700">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="cursor-help">{row.label}</span>
                    </TooltipTrigger>
                    {row.lookFor && (
                      <TooltipContent side="left" className="max-w-64 text-left">
                        {row.lookFor}
                      </TooltipContent>
                    )}
                  </Tooltip>
                  {row.split && (
                    <span
                      className="ml-1.5 inline-block rounded bg-stone-100 px-1 text-[10px] font-medium text-stone-600"
                      title={`The lenses are ${row.spread} points apart`}
                    >
                      split
                    </span>
                  )}
                </th>
                {row.cells.map((score, i) => (
                  <td key={columns[i].slug} className="px-1 py-1.5 text-center">
                    <ScorePill score={score} context={columns[i].name} />
                  </td>
                ))}
                <td className="px-2 py-1.5 text-center">
                  <ScorePill score={row.average} context="Average" />
                </td>
              </tr>
            ))}
            <tr className="border-t-2 border-stone-200 bg-stone-50/80">
              <th scope="row" className="px-3 py-2 text-left font-semibold text-stone-900">
                Overall
                {overall.split && (
                  <span
                    className="ml-1.5 inline-block rounded bg-stone-100 px-1 text-[10px] font-medium text-stone-600"
                    title={`The lenses are ${overall.spread} points apart`}
                  >
                    split
                  </span>
                )}
              </th>
              {overall.cells.map((score, i) => (
                <td key={columns[i].slug} className="px-1 py-2 text-center">
                  <ScorePill score={score} context={`${columns[i].name}, overall`} />
                </td>
              ))}
              <td className="px-2 py-2 text-center">
                <ScorePill score={overall.average} context="Average overall" size="lg" />
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Column key: initials are compact, so spell them out. */}
      <ul className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-stone-600" aria-label="Lens key">
        {columns.map((c) => (
          <li key={c.slug}>
            <span className="font-semibold text-stone-800">{c.short}</span> {c.name}
            {c.modelName && <span className="text-stone-500">{` · ${c.modelName}`}</span>}
          </li>
        ))}
      </ul>

      <details className="group text-[11px] text-stone-600">
        <summary className="flex cursor-pointer list-none items-center gap-1 rounded font-medium text-stone-600 hover:text-stone-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-700 [&::-webkit-details-marker]:hidden">
          <ChevronRight className="h-3 w-3 transition-transform group-open:rotate-90" aria-hidden="true" />
          How scores work
        </summary>
        <ul className="mt-2 space-y-1">
          {SCORE_BANDS.map((b) => (
            <li key={b.min} className="flex gap-2">
              <span className={`inline-flex w-10 shrink-0 justify-center rounded px-1 font-semibold tabular-nums ${TONE_CLASSES[b.tone]}`}>
                {`${b.min}–${b.max}`}
              </span>
              <span>{b.meaning}</span>
            </li>
          ))}
          <li className="pt-1 text-stone-600">
            Each lens&apos;s overall score is its holistic judgement, not an average of its criteria. &ldquo;Split&rdquo; marks rows where
            lenses are 3 or more points apart.
          </li>
        </ul>
        {criteria.length > 0 && (
          <>
            <h4 className="mt-3 font-medium text-stone-700">What each criterion looks for</h4>
            <dl className="mt-1 space-y-1">
              {criteria.map((row) => (
                <div key={row.id}>
                  <dt className="inline font-semibold text-stone-800">{row.label}: </dt>
                  <dd className="inline">{row.lookFor}</dd>
                </div>
              ))}
            </dl>
          </>
        )}
      </details>
    </div>
  );
}
