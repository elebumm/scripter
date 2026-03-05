"use client";

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { Button } from "@/components/ui/button";
import { ArrowLeft, TrendingUp, TrendingDown, Minus } from "lucide-react";
import { useScoreTrends } from "@/hooks/useScoreTrends";

const CHART_COLORS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
  "hsl(200, 70%, 55%)",
  "hsl(340, 70%, 55%)",
  "hsl(100, 60%, 45%)",
  "hsl(40, 80%, 55%)",
  "hsl(270, 60%, 55%)",
];

interface ScoreTrendChartProps {
  scriptId: number | null;
  onBack: () => void;
}

export function ScoreTrendChart({ scriptId, onBack }: ScoreTrendChartProps) {
  const { dataPoints, deltas, criteriaNames, hasData, loading } =
    useScoreTrends(scriptId);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-sm text-muted-foreground">
        Loading trend data...
      </div>
    );
  }

  if (!hasData) {
    return (
      <div className="p-4">
        <Button variant="ghost" size="sm" onClick={onBack} className="mb-4">
          <ArrowLeft className="h-4 w-4 mr-1" />
          Back to current
        </Button>
        <div className="flex items-center justify-center h-48 text-sm text-muted-foreground">
          No structured score data yet. Run evaluations across multiple versions to see trends.
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ArrowLeft className="h-4 w-4 mr-1" />
          Back to current
        </Button>
        <h3 className="text-sm font-semibold">Score Trends</h3>
      </div>

      <div className="h-[280px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={dataPoints}>
            <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
            <XAxis
              dataKey="versionNumber"
              label={{ value: "Version", position: "insideBottom", offset: -5, fontSize: 11 }}
              tick={{ fontSize: 11 }}
            />
            <YAxis
              domain={[0, 10]}
              tick={{ fontSize: 11 }}
              width={30}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: "hsl(var(--popover))",
                border: "1px solid hsl(var(--border))",
                borderRadius: "var(--radius)",
                fontSize: 12,
              }}
              labelFormatter={(v) => `Version ${v}`}
            />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            {/* Overall score as dashed line */}
            <Line
              type="monotone"
              dataKey="overallScore"
              name="Overall"
              stroke="hsl(var(--foreground))"
              strokeDasharray="5 5"
              strokeWidth={2}
              dot={{ r: 3 }}
            />
            {/* Individual criteria */}
            {criteriaNames.map((name, i) => (
              <Line
                key={name}
                type="monotone"
                dataKey={name}
                stroke={CHART_COLORS[i % CHART_COLORS.length]}
                strokeWidth={1.5}
                dot={{ r: 2 }}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Delta summary */}
      {deltas.length > 0 && (
        <div className="space-y-1">
          <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Latest Changes
          </h4>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1">
            {deltas.map((d) => (
              <div
                key={d.criterion}
                className="flex items-center gap-1.5 text-xs"
              >
                {d.delta > 0 ? (
                  <TrendingUp className="h-3 w-3 text-green-500" />
                ) : d.delta < 0 ? (
                  <TrendingDown className="h-3 w-3 text-red-500" />
                ) : (
                  <Minus className="h-3 w-3 text-muted-foreground" />
                )}
                <span className="text-muted-foreground truncate">
                  {d.criterion}
                </span>
                <span
                  className={
                    d.delta > 0
                      ? "text-green-500 font-medium"
                      : d.delta < 0
                      ? "text-red-500 font-medium"
                      : "text-muted-foreground"
                  }
                >
                  {d.delta > 0 ? "+" : ""}
                  {d.delta}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
