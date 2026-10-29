"use client";

import { useMemo, useState } from "react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis, type TooltipContentProps } from "recharts";
import { Minus, TrendingDown, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { TrendPoint } from "@/lib/api";
import { criterionLabel } from "@/lib/llm/rubric";
import { cn } from "@/lib/utils";
import {
  TREND_SERIES_COLORS,
  buildTrendView,
  formatDelta,
  formatScore,
  toggleSeries,
  type SeriesSelection,
} from "./view-model";
import { SectionLabel } from "./ScoreBits";

const OVERALL_COLOR = "#292524"; // stone-800
const GRID_COLOR = "#e7e5e4"; // stone-200
const AXIS_TEXT = "#57534e"; // stone-600

interface TrendsChartProps {
  points: TrendPoint[];
  loading: boolean;
  error: string | null;
  onReload: () => void;
}

function DeltaIcon({ delta }: { delta: number | null }) {
  if (delta == null) return null;
  if (delta > 0) return <TrendingUp className="h-3.5 w-3.5 text-emerald-700" aria-hidden="true" />;
  if (delta < 0) return <TrendingDown className="h-3.5 w-3.5 text-red-700" aria-hidden="true" />;
  return <Minus className="h-3.5 w-3.5 text-stone-500" aria-hidden="true" />;
}

function TrendTooltip({ active, payload, label }: TooltipContentProps) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg bg-white px-3 py-2 text-xs shadow-md ring-1 ring-stone-200">
      <p className="mb-1 font-semibold text-stone-900">{label}</p>
      <ul className="space-y-0.5">
        {payload.map((entry) => (
          <li key={String(entry.dataKey)} className="flex items-center gap-2 text-stone-700">
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: entry.color }} aria-hidden="true" />
            <span className="flex-1">{entry.name}</span>
            <span className="font-semibold tabular-nums text-stone-900">
              {formatScore(typeof entry.value === "number" ? entry.value : null)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Overall score across versions, with up to three criteria overlaid on demand. */
export function TrendsChart({ points, loading, error, onReload }: TrendsChartProps) {
  const view = useMemo(() => buildTrendView(points), [points]);
  const [selection, setSelection] = useState<SeriesSelection[]>([]);
  // Drop selections for criteria that no longer have data.
  const shown = selection.filter((s) => view.criteria.some((c) => c.id === s.id));

  if (loading) {
    return (
      <div className="space-y-3" aria-busy="true" aria-label="Loading score trends">
        <Skeleton className="h-52 w-full rounded-2xl" />
        <Skeleton className="h-32 w-full rounded-2xl" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-3 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-800">
        <p>{error}</p>
        <Button size="sm" variant="outline" className="h-7 border-red-200 text-xs text-red-800" onClick={onReload}>
          Try again
        </Button>
      </div>
    );
  }

  if (view.rows.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 px-6 py-12 text-center">
        <TrendingUp className="h-6 w-6 text-stone-500" aria-hidden="true" />
        <p className="text-sm font-medium text-stone-800">No whole-script reviews yet</p>
        <p className="text-xs text-stone-600">
          Trends track the council&apos;s scores from one version to the next. Section reviews aren&apos;t counted.
        </p>
      </div>
    );
  }

  if (!view.enough) {
    const only = view.rows[0];
    return (
      <div className="flex flex-col items-center gap-2 px-6 py-12 text-center">
        <TrendingUp className="h-6 w-6 text-stone-500" aria-hidden="true" />
        <p className="text-sm font-medium text-stone-800">One reviewed version so far</p>
        <p className="text-xs text-stone-600">
          {only.label} scored {formatScore(only.overall)} overall. Consult the council on another version to see a trend.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <section className="space-y-2" aria-label="Overall score by version">
        <div className="flex items-baseline justify-between gap-2">
          <SectionLabel>Overall by version</SectionLabel>
          <p className="flex items-center gap-1 text-xs text-stone-700">
            <span className="font-semibold tabular-nums text-stone-900">{formatScore(view.overall.latest)}</span>
            <DeltaIcon delta={view.overall.delta} />
            {view.overall.delta != null && <span className="tabular-nums">{formatDelta(view.overall.delta)} vs previous</span>}
          </p>
        </div>

        {/* Legend: always present, text in ink, colour only on the swatch. */}
        <ul className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-stone-700" aria-label="Chart legend">
          <li className="flex items-center gap-1.5">
            <span className="h-0.5 w-4 rounded" style={{ backgroundColor: OVERALL_COLOR }} aria-hidden="true" />
            Overall (average of lenses)
          </li>
          {shown.map((s) => (
            <li key={s.id} className="flex items-center gap-1.5">
              <span className="h-0.5 w-4 rounded" style={{ backgroundColor: TREND_SERIES_COLORS[s.slot] }} aria-hidden="true" />
              {criterionLabel(s.id)}
            </li>
          ))}
        </ul>

        <div className="h-56 w-full rounded-2xl bg-white p-2 ring-1 ring-stone-200/70" aria-hidden="true">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={view.rows} margin={{ top: 8, right: 12, bottom: 0, left: -18 }}>
              <CartesianGrid stroke={GRID_COLOR} vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: AXIS_TEXT }} tickLine={false} axisLine={{ stroke: GRID_COLOR }} />
              <YAxis
                domain={[0, 10]}
                ticks={[0, 2, 4, 6, 8, 10]}
                tick={{ fontSize: 11, fill: AXIS_TEXT }}
                tickLine={false}
                axisLine={false}
                width={40}
              />
              <Tooltip content={TrendTooltip} cursor={{ stroke: "#a8a29e", strokeWidth: 1 }} />
              <Line
                type="monotone"
                dataKey="overall"
                name="Overall"
                stroke={OVERALL_COLOR}
                strokeWidth={2}
                dot={{ r: 4, fill: OVERALL_COLOR, stroke: "#ffffff", strokeWidth: 2 }}
                activeDot={{ r: 5, stroke: "#ffffff", strokeWidth: 2 }}
                connectNulls
                isAnimationActive={false}
              />
              {shown.map((s) => (
                <Line
                  key={s.id}
                  type="monotone"
                  dataKey={s.id}
                  name={criterionLabel(s.id)}
                  stroke={TREND_SERIES_COLORS[s.slot]}
                  strokeWidth={2}
                  dot={{ r: 4, fill: TREND_SERIES_COLORS[s.slot], stroke: "#ffffff", strokeWidth: 2 }}
                  activeDot={{ r: 5, stroke: "#ffffff", strokeWidth: 2 }}
                  connectNulls
                  isAnimationActive={false}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      </section>

      <section className="space-y-2" aria-label="Criteria">
        <div className="flex items-baseline justify-between gap-2">
          <SectionLabel>Criteria, latest vs previous</SectionLabel>
          <span className="text-[11px] text-stone-500">Plot up to 3</span>
        </div>
        <ul className="overflow-hidden rounded-xl bg-white ring-1 ring-stone-200/70">
          {view.criteria.map((c) => {
            const sel = shown.find((s) => s.id === c.id);
            return (
              <li key={c.id} className="border-b border-stone-100 last:border-b-0">
                <button
                  type="button"
                  aria-pressed={!!sel}
                  onClick={() => setSelection((prev) => toggleSeries(prev.filter((s) => view.criteria.some((x) => x.id === s.id)), c.id))}
                  className={cn(
                    "flex w-full items-center gap-2.5 px-3 py-2 text-left text-xs transition-colors hover:bg-stone-50 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-stone-700",
                    sel && "bg-stone-50"
                  )}
                >
                  <span
                    className={cn("h-3 w-3 shrink-0 rounded-sm ring-1 ring-inset", sel ? "ring-transparent" : "ring-stone-300")}
                    style={sel ? { backgroundColor: TREND_SERIES_COLORS[sel.slot] } : undefined}
                    aria-hidden="true"
                  />
                  <span className="flex-1 text-stone-800">{c.label}</span>
                  <span className="w-8 text-right font-semibold tabular-nums text-stone-900">{formatScore(c.latest)}</span>
                  <span className="flex w-14 items-center justify-end gap-1 tabular-nums text-stone-700">
                    <DeltaIcon delta={c.delta} />
                    {formatDelta(c.delta)}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </section>

      {/* Table view of the chart for screen readers and exact values. */}
      <table className="sr-only">
        <caption>Overall score by version</caption>
        <thead>
          <tr>
            <th scope="col">Version</th>
            <th scope="col">Overall</th>
          </tr>
        </thead>
        <tbody>
          {view.rows.map((r) => (
            <tr key={r.label}>
              <th scope="row">{r.label}</th>
              <td>{formatScore(r.overall)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
