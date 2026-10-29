"use client";

import { useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, ArrowDown, ArrowUp, Pencil, RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import * as api from "@/lib/api";
import type { RegisteredModel } from "@/lib/llm/models";
import type { Persona } from "@/types/review";
import { PersonaEditorDialog } from "./PersonaEditorDialog";
import { formatPrice, movePersona, personaSaveError, sortPersonas } from "./settings-utils";

interface CouncilSettingsProps {
  personas: Persona[] | null;
  loading: boolean;
  error: string | null;
  models: RegisteredModel[];
  onUpdate: (fn: (personas: Persona[]) => Persona[]) => void;
  onReload: () => void;
}

function errorText(err: unknown): string {
  return err instanceof Error ? personaSaveError(err.message) : "Unknown error";
}

export function CouncilSettings({ personas, loading, error, models, onUpdate, onReload }: CouncilSettingsProps) {
  const [reordering, setReordering] = useState(false);
  const [editing, setEditing] = useState<Persona | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editorKey, setEditorKey] = useState(0);

  if (loading && !personas) {
    return (
      <div className="space-y-3" aria-hidden="true">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-14 rounded-xl bg-stone-100" />
        ))}
      </div>
    );
  }

  if (error && !personas) {
    return (
      <div role="alert" className="flex flex-wrap items-center gap-3 text-sm text-stone-700">
        <span>Couldn&apos;t load the council: {error}</span>
        <Button variant="outline" size="sm" onClick={onReload}>
          <RotateCw aria-hidden="true" />
          Try again
        </Button>
      </div>
    );
  }

  const ordered = sortPersonas(personas ?? []);
  const activeCount = ordered.filter((p) => p.isActive).length;
  const modelBySlug = new Map(models.map((m) => [m.slug, m]));

  const replace = (updated: Persona) => onUpdate((list) => list.map((p) => (p.id === updated.id ? { ...p, ...updated } : p)));

  const setActive = async (persona: Persona, isActive: boolean) => {
    replace({ ...persona, isActive });
    try {
      replace(await api.updatePersona(persona.id, { isActive }));
    } catch (err) {
      replace(persona);
      toast.error(`Couldn't update ${persona.name}: ${errorText(err)}`);
    }
  };

  const move = async (persona: Persona, direction: -1 | 1) => {
    const result = movePersona(ordered, persona.id, direction);
    if (!result) return;
    onUpdate(() => result.ordered);
    setReordering(true);
    try {
      await Promise.all(result.changes.map((c) => api.updatePersona(c.id, { position: c.position })));
    } catch (err) {
      toast.error(`Couldn't save the new order: ${errorText(err)}`);
      onReload();
    } finally {
      setReordering(false);
    }
  };

  const openEditor = (persona: Persona) => {
    setEditing(persona);
    setEditorKey((k) => k + 1);
    setEditorOpen(true);
  };

  return (
    <div>
      {activeCount === 0 && ordered.length > 0 && (
        <p role="status" className="mb-4 flex items-start gap-2 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" aria-hidden="true" />
          No council members are active, so the council can&apos;t run. Turn at least one on.
        </p>
      )}

      {ordered.length === 0 ? (
        <p className="text-sm text-stone-500">No council members found.</p>
      ) : (
        <ol className="divide-y divide-stone-200/80">
          {ordered.map((persona, index) => {
            const model = modelBySlug.get(persona.modelSlug);
            const switchId = `persona-active-${persona.id}`;
            return (
              <li key={persona.id} className="flex items-start gap-4 py-4 first:pt-0 last:pb-0">
                <Switch
                  id={switchId}
                  checked={persona.isActive}
                  onCheckedChange={(checked) => void setActive(persona, checked)}
                  aria-label={`${persona.name} sits on the council`}
                  className="mt-1"
                />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`font-semibold ${persona.isActive ? "text-stone-900" : "text-stone-500"}`}
                      style={{ fontFamily: "var(--font-cabinet)" }}
                    >
                      {persona.name || "Unnamed"}
                    </span>
                    <span
                      className="rounded-full bg-stone-100 px-2 py-0.5 text-[11px] font-medium text-stone-700"
                      title={model ? `${formatPrice(model.priceIn)} in / ${formatPrice(model.priceOut)} out per 1M tokens` : undefined}
                    >
                      {model?.name ?? persona.modelName ?? persona.modelSlug}
                      {model && (
                        <span className="text-stone-500">
                          {" "}
                          · {formatPrice(model.priceIn)}/{formatPrice(model.priceOut)}
                        </span>
                      )}
                    </span>
                    {!model && (
                      <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-900">
                        Model not in registry
                      </span>
                    )}
                    {!persona.slug && (
                      <span className="rounded-full border border-stone-200 px-2 py-0.5 text-[11px] text-stone-600">
                        Legacy profile
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-stone-500 mt-1 line-clamp-2">
                    {persona.description || "No description yet."}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Move ${persona.name} up`}
                    disabled={index === 0 || reordering}
                    onClick={() => void move(persona, -1)}
                  >
                    <ArrowUp aria-hidden="true" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Move ${persona.name} down`}
                    disabled={index === ordered.length - 1 || reordering}
                    onClick={() => void move(persona, 1)}
                  >
                    <ArrowDown aria-hidden="true" />
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => openEditor(persona)}>
                    <Pencil aria-hidden="true" />
                    Edit
                  </Button>
                </div>
              </li>
            );
          })}
        </ol>
      )}

      {editing && (
        <PersonaEditorDialog
          key={`${editing.id}-${editorKey}`}
          persona={editing}
          models={models}
          open={editorOpen}
          onOpenChange={setEditorOpen}
          onSaved={replace}
        />
      )}
    </div>
  );
}
