"use client";

import { RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ROLE_MODELS, type ModelRole, type RegisteredModel } from "@/lib/llm/models";
import type { Persona } from "@/types/review";
import { formatPrice } from "./settings-utils";

const ROLE_LABELS: Record<ModelRole, string> = {
  synthesizer: "Synthesis",
  beats: "Beat suggestions",
  factCheck: "Fact-check (web search)",
  iconPicker: "Script icons",
};

interface ModelsTableProps {
  models: RegisteredModel[] | null;
  loading: boolean;
  error: string | null;
  personas: Persona[];
  onReload: () => void;
}

function usesFor(model: RegisteredModel, personas: Persona[]): string[] {
  const roles = (Object.keys(ROLE_MODELS) as ModelRole[])
    .filter((role) => ROLE_MODELS[role] === model.slug)
    .map((role) => ROLE_LABELS[role]);
  const lenses = personas.filter((p) => p.isActive && p.modelSlug === model.slug).map((p) => p.name);
  return [...lenses, ...roles];
}

export function ModelsTable({ models, loading, error, personas, onReload }: ModelsTableProps) {
  if (loading && !models) {
    return <Skeleton className="h-40 rounded-xl bg-stone-100" aria-hidden="true" />;
  }
  if (error && !models) {
    return (
      <div role="alert" className="flex flex-wrap items-center gap-3 text-sm text-stone-700">
        <span>Couldn&apos;t load the model list: {error}</span>
        <Button variant="outline" size="sm" onClick={onReload}>
          <RotateCw aria-hidden="true" />
          Try again
        </Button>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto -mx-2">
      <table className="w-full min-w-[520px] text-sm">
        <caption className="sr-only">Models Scripter can call, with OpenRouter prices per million tokens</caption>
        <thead>
          <tr
            className="text-left text-[11px] font-semibold tracking-wider uppercase text-stone-600"
            style={{ fontFamily: "var(--font-inter)" }}
          >
            <th scope="col" className="px-2 pb-2 font-semibold">Model</th>
            <th scope="col" className="px-2 pb-2 font-semibold text-right">Input / 1M</th>
            <th scope="col" className="px-2 pb-2 font-semibold text-right">Output / 1M</th>
            <th scope="col" className="px-2 pb-2 font-semibold">Used for</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-stone-200/80">
          {(models ?? []).map((m) => {
            const uses = usesFor(m, personas);
            return (
              <tr key={m.slug}>
                <td className="px-2 py-2.5">
                  <div className="font-medium text-stone-900">{m.name}</div>
                  <div className="text-xs text-stone-500 font-mono">{m.openrouterId}</div>
                </td>
                <td className="px-2 py-2.5 text-right tabular-nums text-stone-700">{formatPrice(m.priceIn)}</td>
                <td className="px-2 py-2.5 text-right tabular-nums text-stone-700">{formatPrice(m.priceOut)}</td>
                <td className="px-2 py-2.5 text-stone-600">{uses.length > 0 ? uses.join(", ") : <span className="text-stone-500">–</span>}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
