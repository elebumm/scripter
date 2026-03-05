"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { KickoffInputStep, type KickoffFormData } from "./KickoffInputStep";
import { KickoffOutlineStep } from "./KickoffOutlineStep";
import { isElectron } from "@/lib/api";
import * as api from "@/lib/api";
import type { Script } from "@/types";
import { FileText, Clock } from "lucide-react";

interface KickoffDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSkip: () => void;
  onConfirm: (data: {
    title: string;
    content: string;
    context: string;
    targetLength: number;
  }) => void;
}

const DEFAULT_FORM: KickoffFormData = {
  title: "Untitled Script",
  concept: "",
  themes: "",
  targetLength: 1600,
  tone: "",
};

export function KickoffDialog({
  open,
  onOpenChange,
  onSkip,
  onConfirm,
}: KickoffDialogProps) {
  const [step, setStep] = useState<"choose" | "input" | "outline">("choose");
  const [templates, setTemplates] = useState<Script[]>([]);
  const [templatesLoading, setTemplatesLoading] = useState(false);
  const [formData, setFormData] = useState<KickoffFormData>(DEFAULT_FORM);
  const [outlineText, setOutlineText] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  // Fetch templates when dialog opens
  useEffect(() => {
    if (open && step === "choose") {
      setTemplatesLoading(true);
      api
        .listTemplates()
        .then(setTemplates)
        .catch(() => {})
        .finally(() => setTemplatesLoading(false));
    }
  }, [open, step]);

  const reset = useCallback(() => {
    setStep("choose");
    setFormData(DEFAULT_FORM);
    setOutlineText("");
    setIsStreaming(false);
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
  }, []);

  const handleOpenChange = useCallback(
    (open: boolean) => {
      if (!open) {
        if (abortRef.current) {
          abortRef.current.abort();
          abortRef.current = null;
        }
        // Reset after close animation
        setTimeout(reset, 200);
      }
      onOpenChange(open);
    },
    [onOpenChange, reset]
  );

  const handleSkip = useCallback(() => {
    handleOpenChange(false);
    onSkip();
  }, [handleOpenChange, onSkip]);

  const handleSelectTemplate = useCallback(
    async (template: Script) => {
      // Create script from template and close dialog
      try {
        const script = await api.createFromTemplate(template.id);
        if (script) {
          onConfirm({
            title: script.title,
            content: "", // Will load via loadScript
            context: template.context ?? "",
            targetLength: template.targetLength ?? 1600,
          });
          handleOpenChange(false);
        }
      } catch {
        // Fall through to input step on failure
        setStep("input");
      }
    },
    [onConfirm, handleOpenChange]
  );

  const handleStartFromScratch = useCallback(() => {
    setStep("input");
  }, []);

  const streamOutline = useCallback(async () => {
    setOutlineText("");
    setIsStreaming(true);
    setStep("outline");

    const controller = new AbortController();
    abortRef.current = controller;

    const params = {
      concept: formData.concept,
      themes: formData.themes || undefined,
      targetLength: formData.targetLength,
      tone: formData.tone || undefined,
    };

    try {
      if (
        isElectron() &&
        typeof window !== "undefined" &&
        window.location.protocol === "file:" &&
        window.scripterAPI?.kickoff
      ) {
        // Electron IPC streaming path
        let accumulated = "";
        await window.scripterAPI.kickoff.run(params, (chunk: string) => {
          accumulated += chunk;
          setOutlineText(accumulated);
        });
      } else {
        // Web fetch streaming path
        const res = await fetch("/api/kickoff", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(params),
          signal: controller.signal,
        });

        if (!res.ok) {
          const err = await res.json().catch(() => ({ error: "Stream failed" }));
          throw new Error(err.error || "Stream failed");
        }

        const reader = res.body?.getReader();
        if (!reader) throw new Error("No stream reader");

        const decoder = new TextDecoder();
        let accumulated = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          accumulated += decoder.decode(value, { stream: true });
          setOutlineText(accumulated);
        }
      }
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        // User cancelled — no-op
        return;
      }
      // On error, stay on outline step so user can see what happened and go back
      setOutlineText(
        (prev) =>
          prev +
          "\n\n---\n\n**Error:** " +
          (err instanceof Error ? err.message : "Unknown error")
      );
    } finally {
      setIsStreaming(false);
      abortRef.current = null;
    }
  }, [formData]);

  const handleGenerateOutline = useCallback(() => {
    streamOutline();
  }, [streamOutline]);

  const handleRegenerate = useCallback(() => {
    streamOutline();
  }, [streamOutline]);

  const handleBack = useCallback(() => {
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
    setIsStreaming(false);
    if (step === "outline") {
      setStep("input");
    } else {
      setStep("choose");
    }
  }, [step]);

  const handleConfirm = useCallback(() => {
    const contextParts: string[] = [];
    if (formData.concept.trim()) {
      contextParts.push(`Concept: ${formData.concept.trim()}`);
    }
    if (formData.themes.trim()) {
      contextParts.push(`Themes: ${formData.themes.trim()}`);
    }
    if (formData.tone.trim()) {
      contextParts.push(`Tone: ${formData.tone.trim()}`);
    }

    onConfirm({
      title: formData.title.trim() || "Untitled Script",
      content: outlineText,
      context: contextParts.join("\n"),
      targetLength: formData.targetLength,
    });

    handleOpenChange(false);
  }, [formData, outlineText, onConfirm, handleOpenChange]);

  const canGenerate = formData.concept.trim().length > 0;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {step === "choose"
              ? "New Script"
              : step === "input"
              ? "New Script"
              : "Outline Preview"}
          </DialogTitle>
          <DialogDescription>
            {step === "choose"
              ? "Start from a template or create from scratch with AI-generated outline."
              : step === "input"
              ? "Describe your video concept and we'll generate a structural outline to get you started."
              : "Review the outline below. You can go back to adjust your inputs or regenerate."}
          </DialogDescription>
        </DialogHeader>

        {step === "choose" ? (
          <div className="space-y-3">
            {templatesLoading ? (
              <div className="text-sm text-muted-foreground text-center py-8">
                Loading templates...
              </div>
            ) : templates.length === 0 ? null : (
              <div className="grid grid-cols-2 gap-2">
                {templates.map((t) => (
                  <Card
                    key={t.id}
                    className="cursor-pointer transition-colors hover:bg-accent"
                    onClick={() => handleSelectTemplate(t)}
                  >
                    <CardContent className="p-3">
                      <div className="flex items-start gap-2">
                        <FileText className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
                        <div className="min-w-0">
                          <p className="text-sm font-medium">{t.title}</p>
                          {t.templateDescription && (
                            <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                              {t.templateDescription}
                            </p>
                          )}
                          {t.targetLength && (
                            <div className="flex items-center gap-1 mt-1">
                              <Clock className="h-3 w-3 text-muted-foreground" />
                              <span className="text-[10px] text-muted-foreground">
                                ~{t.targetLength} words
                              </span>
                            </div>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
        ) : step === "input" ? (
          <KickoffInputStep formData={formData} onChange={setFormData} />
        ) : (
          <KickoffOutlineStep
            outlineText={outlineText}
            isStreaming={isStreaming}
          />
        )}

        <DialogFooter>
          {step === "choose" ? (
            <>
              <Button variant="ghost" onClick={handleSkip}>
                Blank Script
              </Button>
              <Button onClick={handleStartFromScratch}>
                Start from Scratch
              </Button>
            </>
          ) : step === "input" ? (
            <>
              <Button variant="ghost" onClick={handleBack}>
                Back
              </Button>
              <Button variant="ghost" onClick={handleSkip}>
                Skip
              </Button>
              <Button
                onClick={handleGenerateOutline}
                disabled={!canGenerate}
              >
                Generate Outline
              </Button>
            </>
          ) : (
            <>
              <Button variant="ghost" onClick={handleBack}>
                Back
              </Button>
              <Button
                variant="outline"
                onClick={handleRegenerate}
                disabled={isStreaming}
              >
                Regenerate
              </Button>
              <Button onClick={handleConfirm} disabled={isStreaming}>
                Use This Outline
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
