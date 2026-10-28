"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Clock, FileText, Loader2, RotateCcw } from "lucide-react";
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
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import * as api from "@/lib/api";
import { TARGET_LENGTH_PRESETS, TONE_OPTIONS } from "@/lib/brief";
import { errorMessage } from "@/lib/stream/ndjson";
import type { Script } from "@/types";
import {
  EMPTY_START_FRESH,
  canSuggestBeats,
  targetLengthLabel,
  toCreatePayload,
  wantsBeatSuggestion,
  type StartFreshForm,
} from "./kickoff-form";

interface KickoffDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called once with the new script's id; the caller navigates. */
  onCreated: (scriptId: number, opts: { suggestBeats: boolean }) => void;
}

const FONT_CABINET = { fontFamily: "var(--font-cabinet)" };
const NO_TONE = "_none";

/**
 * New script: either the writer's own brief (title, concept, themes, tone,
 * target length) on an empty page, or a copy of one of their templates.
 * Nothing here generates script text.
 */
export function KickoffDialog({ open, onOpenChange, onCreated }: KickoffDialogProps) {
  const [busy, setBusy] = useState(false);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        // Don't close halfway through creating; the script would still appear.
        if (!next && busy) return;
        onOpenChange(next);
      }}
    >
      <DialogContent className="gap-5 sm:max-w-xl" showCloseButton={!busy}>
        {/* Content unmounts when closed, so every open starts with a fresh form. */}
        <KickoffForm
          busy={busy}
          setBusy={setBusy}
          onCancel={() => onOpenChange(false)}
          onCreated={(id, opts) => {
            onCreated(id, opts);
            onOpenChange(false);
          }}
        />
      </DialogContent>
    </Dialog>
  );
}

interface KickoffFormProps {
  busy: boolean;
  setBusy: (busy: boolean) => void;
  onCancel: () => void;
  onCreated: (scriptId: number, opts: { suggestBeats: boolean }) => void;
}

function KickoffForm({ busy, setBusy, onCancel, onCreated }: KickoffFormProps) {
  const [tab, setTab] = useState<"fresh" | "template">("fresh");
  const [form, setForm] = useState<StartFreshForm>(EMPTY_START_FRESH);
  const [templateId, setTemplateId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const templates = useTemplates();

  const update = <K extends keyof StartFreshForm>(key: K, value: StartFreshForm[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
  };

  const pickIconLater = (scriptId: number) => {
    // Fire and forget: the card gets an icon when it's ready.
    api.pickIcon(scriptId).catch(() => {});
  };

  const createFresh = async () => {
    const script = await api.createScript(toCreatePayload(form));
    pickIconLater(script.id);
    onCreated(script.id, { suggestBeats: wantsBeatSuggestion(form) });
  };

  const createFromTemplate = async () => {
    if (templateId === null) {
      setError("Choose a template first.");
      return;
    }
    // The only create call: the copy it returns is the script we open.
    const script = await api.createFromTemplate(templateId, form.title.trim());
    pickIconLater(script.id);
    onCreated(script.id, { suggestBeats: false });
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setError(null);
    setBusy(true);
    try {
      if (tab === "fresh") await createFresh();
      else await createFromTemplate();
    } catch (err) {
      setError(`Couldn't create the script: ${errorMessage(err)}`);
    } finally {
      setBusy(false);
    }
  };

  const suggestAvailable = canSuggestBeats(form);
  const submitDisabled = busy || (tab === "template" && templateId === null);

  return (
    <form onSubmit={submit} className="grid gap-5" aria-busy={busy}>
      <DialogHeader>
        <DialogTitle className="text-xl" style={FONT_CABINET}>
          New script
        </DialogTitle>
        <DialogDescription>
          Start from your own brief on an empty page, or from a copy of one of your templates. Scripter never writes
          the script for you.
        </DialogDescription>
      </DialogHeader>

      <div className="grid gap-2">
        <Label htmlFor="kickoff-title">Title</Label>
        <Input
          id="kickoff-title"
          value={form.title}
          onChange={(e) => update("title", e.target.value)}
          placeholder="Untitled script"
          autoComplete="off"
          disabled={busy}
        />
      </div>

      <Tabs
        value={tab}
        onValueChange={(v) => {
          setTab(v as "fresh" | "template");
          setError(null);
        }}
      >
        <TabsList className="w-full">
          <TabsTrigger value="fresh" disabled={busy}>
            Start fresh
          </TabsTrigger>
          <TabsTrigger value="template" disabled={busy}>
            From a template
          </TabsTrigger>
        </TabsList>

        <TabsContent value="fresh" className="mt-3 grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="kickoff-concept">Concept</Label>
            <Textarea
              id="kickoff-concept"
              value={form.concept}
              onChange={(e) => update("concept", e.target.value)}
              placeholder="What's the video about, and why should anyone watch it?"
              rows={3}
              disabled={busy}
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="kickoff-themes">Themes</Label>
            <Input
              id="kickoff-themes"
              value={form.themes}
              onChange={(e) => update("themes", e.target.value)}
              placeholder="Comma-separated, e.g. supply chains, ambition"
              autoComplete="off"
              disabled={busy}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label htmlFor="kickoff-length">Target length</Label>
              <Select
                value={String(form.targetLength)}
                onValueChange={(v) => update("targetLength", Number(v))}
                disabled={busy}
              >
                <SelectTrigger id="kickoff-length" variant="outline" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TARGET_LENGTH_PRESETS.map((p) => (
                    <SelectItem key={p.value} value={String(p.value)}>
                      {p.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="kickoff-tone">Tone</Label>
              <Select
                value={form.tone || NO_TONE}
                onValueChange={(v) => update("tone", v === NO_TONE ? "" : v)}
                disabled={busy}
              >
                <SelectTrigger id="kickoff-tone" variant="outline" className="w-full">
                  <SelectValue placeholder="Any" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_TONE}>Any</SelectItem>
                  {TONE_OPTIONS.map((t) => (
                    <SelectItem key={t} value={t}>
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex items-start gap-2.5 rounded-lg bg-stone-50 p-3 ring-1 ring-stone-200">
            <input
              id="kickoff-suggest-beats"
              type="checkbox"
              className="mt-0.5 h-4 w-4 cursor-pointer accent-stone-800 disabled:cursor-not-allowed"
              checked={form.suggestBeats && suggestAvailable}
              onChange={(e) => update("suggestBeats", e.target.checked)}
              disabled={busy || !suggestAvailable}
              aria-describedby="kickoff-suggest-beats-hint"
            />
            <div className="grid gap-1">
              <Label htmlFor="kickoff-suggest-beats" className="cursor-pointer">
                Suggest beats from my brief
              </Label>
              <p id="kickoff-suggest-beats-hint" className="text-xs leading-snug text-stone-500">
                {suggestAvailable
                  ? "Opens the Beat Sheet with a proposed plan: what each part must do, never lines to say. Nothing is added until you choose."
                  : "Describe the concept first, so the suggestions have something to work from."}
              </p>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="template" className="mt-3">
          <TemplatePicker
            state={templates}
            selectedId={templateId}
            onSelect={(id) => {
              setTemplateId(id);
              setError(null);
            }}
            disabled={busy}
          />
        </TabsContent>
      </Tabs>

      {error && (
        <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      )}

      <DialogFooter>
        <Button type="button" variant="ghost" onClick={onCancel} disabled={busy}>
          Cancel
        </Button>
        <Button type="submit" disabled={submitDisabled}>
          {busy && <Loader2 className="animate-spin" />}
          {tab === "fresh" ? "Create script" : "Create from template"}
        </Button>
      </DialogFooter>
    </form>
  );
}

interface TemplatesState {
  templates: Script[] | null;
  error: string | null;
  retry: () => void;
}

function useTemplates(): TemplatesState {
  const [templates, setTemplates] = useState<Script[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    api.listTemplates().then(
      (list) => {
        if (cancelled) return;
        setTemplates(list);
        setError(null);
      },
      (err) => {
        if (!cancelled) setError(errorMessage(err));
      }
    );
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  return {
    templates,
    error,
    retry: () => {
      setError(null);
      setAttempt((a) => a + 1);
    },
  };
}

function TemplatePicker({
  state,
  selectedId,
  onSelect,
  disabled,
}: {
  state: TemplatesState;
  selectedId: number | null;
  onSelect: (id: number) => void;
  disabled: boolean;
}) {
  if (state.error) {
    return (
      <div role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">
        <p>Couldn&apos;t load templates: {state.error}</p>
        <Button type="button" variant="ghost" size="sm" className="mt-1 text-red-800" onClick={state.retry}>
          <RotateCcw />
          Try again
        </Button>
      </div>
    );
  }

  if (state.templates === null) {
    return (
      <p className="flex items-center justify-center gap-2 py-8 text-sm text-stone-500">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading templates…
      </p>
    );
  }

  if (state.templates.length === 0) {
    return (
      <p className="rounded-lg bg-stone-50 px-4 py-8 text-center text-sm text-stone-500 ring-1 ring-stone-200">
        No templates yet. Start fresh instead.
      </p>
    );
  }

  return (
    <fieldset className="grid max-h-72 gap-2 overflow-y-auto pr-1 sm:grid-cols-2" disabled={disabled}>
      <legend className="sr-only">Template</legend>
      {state.templates.map((t) => {
        const length = targetLengthLabel(t.targetLength);
        const selected = selectedId === t.id;
        return (
          <label
            key={t.id}
            className={cn(
              "flex cursor-pointer items-start gap-2 rounded-lg bg-white p-3 ring-1 ring-stone-200 transition-colors hover:bg-stone-50",
              "has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-stone-500",
              selected && "bg-stone-50 ring-2 ring-stone-800"
            )}
          >
            <input
              type="radio"
              name="kickoff-template"
              value={t.id}
              checked={selected}
              onChange={() => onSelect(t.id)}
              className="sr-only"
            />
            <FileText className="mt-0.5 h-4 w-4 shrink-0 text-stone-500" aria-hidden />
            <span className="min-w-0">
              <span className="block text-sm font-medium text-stone-800">{t.title || "Untitled template"}</span>
              {t.templateDescription && (
                <span className="mt-0.5 line-clamp-2 block text-xs text-stone-500">{t.templateDescription}</span>
              )}
              {length && (
                <span className="mt-1 flex items-center gap-1 text-[11px] text-stone-500">
                  <Clock className="h-3 w-3" aria-hidden />
                  {length}
                </span>
              )}
            </span>
          </label>
        );
      })}
    </fieldset>
  );
}
