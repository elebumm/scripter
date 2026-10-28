"use client";

import { useState } from "react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import * as api from "@/lib/api";
import type { RegisteredModel } from "@/lib/llm/models";
import { CRITERIA } from "@/lib/llm/rubric";
import type { Persona } from "@/types/review";
import { cn } from "@/lib/utils";
import { FieldLabel } from "./SettingsSection";
import {
  MAX_WEIGHT,
  MIN_WEIGHT,
  PERSONA_LIMITS,
  formatPrice,
  lengthHint,
  normalizeWeights,
  personaSaveError,
  validatePersonaDraft,
} from "./settings-utils";

interface PersonaEditorDialogProps {
  persona: Persona;
  models: RegisteredModel[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: (persona: Persona) => void;
}

function weightsToStrings(weights: Record<string, number>): Record<string, string> {
  return Object.fromEntries(Object.entries(weights).map(([k, v]) => [k, String(v)]));
}

/**
 * Edit one council member. Mount with a fresh `key` per opening so the form
 * starts from the saved persona.
 */
export function PersonaEditorDialog({ persona, models, open, onOpenChange, onSaved }: PersonaEditorDialogProps) {
  const [name, setName] = useState(persona.name);
  const [description, setDescription] = useState(persona.description);
  const [systemPrompt, setSystemPrompt] = useState(persona.systemPrompt);
  const [modelSlug, setModelSlug] = useState(persona.modelSlug);
  const [weights, setWeights] = useState<Record<string, string>>(() =>
    weightsToStrings(normalizeWeights(persona.criteriaWeights))
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const knownModel = models.some((m) => m.slug === modelSlug);
  const descriptionHint = lengthHint(description, { max: PERSONA_LIMITS.descriptionMax });
  const promptHint = lengthHint(systemPrompt, { min: PERSONA_LIMITS.promptMin, max: PERSONA_LIMITS.promptMax });

  const save = async () => {
    const problem = validatePersonaDraft(
      { name, description, systemPrompt, modelSlug },
      models.map((m) => m.slug)
    );
    if (problem) {
      setError(problem);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const updated = await api.updatePersona(persona.id, {
        name: name.trim(),
        description: description.trim(),
        systemPrompt: systemPrompt.trim(),
        modelSlug,
        criteriaWeights: normalizeWeights(weights),
      });
      onSaved(updated);
      onOpenChange(false);
      toast.success(`Saved ${updated.name || name.trim()}`);
    } catch (err) {
      setError(err instanceof Error && err.message ? personaSaveError(err.message) : "Couldn't save this council member.");
    } finally {
      setSaving(false);
    }
  };

  const idBase = `persona-${persona.id}`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle style={{ fontFamily: "var(--font-cabinet)" }}>Edit {persona.name || "council member"}</DialogTitle>
          <DialogDescription>
            A council member is a persona prompt run on one model. Scripter adds the scoring rubric, your channel
            context and the “Your words only” rules to every run, so the prompt only needs to describe the lens.
          </DialogDescription>
        </DialogHeader>

        <form
          className="space-y-5"
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <FieldLabel htmlFor={`${idBase}-name`}>Name</FieldLabel>
              <Input
                id={`${idBase}-name`}
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                maxLength={PERSONA_LIMITS.nameMax}
              />
            </div>
            <div className="space-y-1.5">
              <FieldLabel htmlFor={`${idBase}-model`}>Model</FieldLabel>
              <Select value={knownModel ? modelSlug : undefined} onValueChange={setModelSlug}>
                <SelectTrigger id={`${idBase}-model`} variant="outline" className="w-full">
                  <SelectValue placeholder={modelSlug ? `Unknown model (${modelSlug})` : "Pick a model"} />
                </SelectTrigger>
                <SelectContent position="popper">
                  {models.map((m) => (
                    <SelectItem key={m.slug} value={m.slug}>
                      {m.name}
                      <span className="text-stone-500 text-xs">
                        {formatPrice(m.priceIn)} in · {formatPrice(m.priceOut)} out
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <FieldLabel htmlFor={`${idBase}-description`}>Description</FieldLabel>
            <Input
              id={`${idBase}-description`}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What this lens pays attention to"
              aria-invalid={descriptionHint.outOfRange || undefined}
              aria-describedby={descriptionHint.outOfRange ? `${idBase}-description-hint` : undefined}
            />
            {descriptionHint.outOfRange && (
              <p id={`${idBase}-description-hint`} className="text-xs text-rose-700">
                {descriptionHint.text}
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <FieldLabel htmlFor={`${idBase}-prompt`}>Persona prompt</FieldLabel>
            <Textarea
              id={`${idBase}-prompt`}
              value={systemPrompt}
              onChange={(e) => setSystemPrompt(e.target.value)}
              rows={12}
              aria-invalid={promptHint.outOfRange || undefined}
              aria-describedby={`${idBase}-prompt-hint`}
              className="text-sm leading-relaxed"
            />
            <p
              id={`${idBase}-prompt-hint`}
              className={cn("text-xs tabular-nums", promptHint.outOfRange ? "text-rose-700" : "text-stone-600")}
            >
              {promptHint.text}
            </p>
          </div>

          <fieldset className="space-y-2">
            <legend
              className="text-[11px] font-semibold tracking-wider uppercase text-stone-600"
              style={{ fontFamily: "var(--font-inter)" }}
            >
              Criteria weights
            </legend>
            <p className="text-xs text-stone-500">
              1 is normal. Above 1 tells this lens to weigh a criterion heavily, below 1 lightly ({MIN_WEIGHT}–{MAX_WEIGHT}).
            </p>
            <div className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
              {CRITERIA.map((c) => (
                <div key={c.id} className="flex items-center justify-between gap-3">
                  <label htmlFor={`${idBase}-w-${c.id}`} className="text-sm text-stone-700" title={c.lookFor}>
                    {c.label}
                  </label>
                  <Input
                    id={`${idBase}-w-${c.id}`}
                    type="number"
                    inputMode="decimal"
                    min={MIN_WEIGHT}
                    max={MAX_WEIGHT}
                    step={0.25}
                    value={weights[c.id] ?? "1"}
                    onChange={(e) => setWeights((prev) => ({ ...prev, [c.id]: e.target.value }))}
                    className="h-8 w-20 text-right tabular-nums"
                  />
                </div>
              ))}
            </div>
          </fieldset>

          {error && (
            <p role="alert" className="text-sm text-red-700">
              {error}
            </p>
          )}

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
