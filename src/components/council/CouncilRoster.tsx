"use client";

import { AlertTriangle, Check, Loader2, RotateCcw, Square } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import type { CouncilController } from "@/hooks/useCouncil";
import type { LensState, Persona } from "@/types";

interface CouncilRosterProps {
  /** The progress line reads council.runScopeLabel, which follows every run however it started. */
  council: CouncilController;
}

function initials(name: string): string {
  const words = name.replace(/^the\s+/i, "").split(/\s+/).filter(Boolean);
  return (words.length >= 2 ? words[0][0] + words[1][0] : name.slice(0, 2)).toUpperCase();
}

function LensStatus({
  lens,
  canRetry,
  onRetry,
}: {
  lens: LensState | undefined;
  canRetry: boolean;
  onRetry: () => void;
}) {
  if (!lens || lens.status === "idle") return null;
  switch (lens.status) {
    case "pending":
      return <span className="text-[11px] text-stone-500">Waiting…</span>;
    case "streaming":
      return (
        <span className="inline-flex items-center gap-1 text-[11px] text-stone-600">
          <Loader2 className="h-3 w-3 motion-safe:animate-spin" aria-hidden="true" />
          Reading
        </span>
      );
    case "complete": {
      const score = lens.critique?.overallScore;
      return (
        <span className="inline-flex items-center gap-1 text-[11px] text-stone-600">
          <Check className="h-3 w-3 text-emerald-700" aria-hidden="true" />
          Done{typeof score === "number" ? ` · ${score}/10` : ""}
        </span>
      );
    }
    case "error":
      return (
        <span className="flex flex-col gap-1">
          <span className="inline-flex items-start gap-1 text-[11px] text-rose-700" title={lens.error}>
            <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0" aria-hidden="true" />
            <span className="line-clamp-2">{lens.error || "Failed"}</span>
          </span>
          {canRetry && (
            <button
              type="button"
              onClick={onRetry}
              className="inline-flex w-fit items-center gap-1 text-[11px] font-semibold text-stone-800 underline underline-offset-2 hover:text-stone-950"
            >
              <RotateCcw className="h-3 w-3" aria-hidden="true" />
              Retry {lens.personaName}
            </button>
          )}
        </span>
      );
  }
}

function PersonaRow({
  persona,
  lens,
  running,
  canRetry,
  onToggle,
  onRetry,
}: {
  persona: Persona;
  lens: LensState | undefined;
  running: boolean;
  canRetry: boolean;
  onToggle: (active: boolean) => void;
  onRetry: () => void;
}) {
  return (
    <li className="flex items-start gap-3 rounded-xl px-2 py-2">
      <span
        className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white"
        style={{ backgroundColor: persona.color ?? "#57534e" }}
        aria-hidden="true"
      >
        {initials(persona.name)}
      </span>
      <span className="flex-1 min-w-0 space-y-0.5">
        <span className={`block text-xs font-semibold ${persona.isActive ? "text-stone-800" : "text-stone-500"}`}>
          {persona.name}
        </span>
        <span className="inline-block rounded-full bg-stone-100 px-2 py-0.5 text-[10px] font-medium text-stone-600">
          {persona.modelName}
        </span>
        <span className="block">
          <LensStatus lens={lens} canRetry={canRetry} onRetry={onRetry} />
        </span>
      </span>
      <Switch
        size="sm"
        className="mt-1"
        checked={persona.isActive}
        disabled={running}
        onCheckedChange={onToggle}
        aria-label={`Include ${persona.name} in the council`}
      />
    </li>
  );
}

/** Council members with their models, on/off toggles and live run status. */
export function CouncilRoster({ council }: CouncilRosterProps) {
  const { personas, lenses, phase, isRunning, runScopeLabel } = council;
  const lensById = new Map(lenses.map((l) => [l.personaId, l]));
  const settled = lenses.filter((l) => l.status === "complete" || l.status === "error").length;
  const total = lenses.length;

  if (personas.length === 0) {
    return <p className="px-2 text-xs text-stone-500">{council.error ?? "Loading the council…"}</p>;
  }

  return (
    <div className="space-y-2">
      <ul className="space-y-0.5" aria-label="Council members">
        {personas.map((p) => (
          <PersonaRow
            key={p.id}
            persona={p}
            lens={lensById.get(p.id)}
            running={isRunning}
            canRetry={!isRunning}
            onToggle={(active) => void council.setPersonaActive(p.id, active)}
            onRetry={() => void council.retryLens(p.id)}
          />
        ))}
      </ul>

      {isRunning && (
        <div className="rounded-xl bg-white/80 px-3 py-2.5 space-y-2" role="status" aria-live="polite">
          <div className="flex items-center gap-2">
            <Loader2 className="h-3.5 w-3.5 text-stone-600 motion-safe:animate-spin" aria-hidden="true" />
            <span className="flex-1 text-xs text-stone-700">
              {phase === "synthesizing" ? "Writing the synthesis…" : `${settled} of ${total} lenses done`}
              <span className="block text-[11px] text-stone-500">{runScopeLabel}</span>
            </span>
            <Button
              size="xs"
              variant="outline"
              className="rounded-lg border-stone-300 text-stone-700"
              onClick={council.stop}
              aria-label="Stop the council"
            >
              <Square className="h-3 w-3" aria-hidden="true" />
              Stop
            </Button>
          </div>
          <div className="h-1 rounded-full bg-stone-200 overflow-hidden" aria-hidden="true">
            <div
              className={`h-full rounded-full bg-stone-700 transition-[width] ${
                phase === "synthesizing" ? "w-full motion-safe:animate-pulse" : ""
              }`}
              style={phase === "synthesizing" ? undefined : { width: `${total ? (settled / total) * 100 : 0}%` }}
            />
          </div>
        </div>
      )}

      {!isRunning && phase === "error" && council.error && (
        <p className="rounded-xl bg-rose-50 px-3 py-2 text-xs text-rose-800" role="alert">
          {council.error}
        </p>
      )}

      {council.canRetrySynthesis && (
        <div className="flex items-start gap-2 rounded-xl bg-white/80 px-3 py-2">
          <span className="flex-1 text-[11px] leading-snug text-stone-700">
            No synthesis was saved for this run. Retrying uses the lenses that finished.
          </span>
          <button
            type="button"
            onClick={() => void council.retrySynthesis()}
            className="inline-flex shrink-0 items-center gap-1 text-[11px] font-semibold text-stone-800 underline underline-offset-2 hover:text-stone-950"
          >
            <RotateCcw className="h-3 w-3" aria-hidden="true" />
            Retry synthesis
          </button>
        </div>
      )}
    </div>
  );
}
