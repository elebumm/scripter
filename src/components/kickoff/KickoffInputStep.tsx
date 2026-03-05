"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { TARGET_LENGTH_PRESETS, TONE_OPTIONS } from "@/lib/llm/outline-prompt";

export interface KickoffFormData {
  title: string;
  concept: string;
  themes: string;
  targetLength: number;
  tone: string;
}

interface KickoffInputStepProps {
  formData: KickoffFormData;
  onChange: (data: KickoffFormData) => void;
}

export function KickoffInputStep({ formData, onChange }: KickoffInputStepProps) {
  const update = (field: keyof KickoffFormData, value: string | number) => {
    onChange({ ...formData, [field]: value });
  };

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="kickoff-title">Title</Label>
        <Input
          id="kickoff-title"
          value={formData.title}
          onChange={(e) => update("title", e.target.value)}
          placeholder="Untitled Script"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="kickoff-concept">
          Concept <span className="text-destructive">*</span>
        </Label>
        <Textarea
          id="kickoff-concept"
          value={formData.concept}
          onChange={(e) => update("concept", e.target.value)}
          placeholder="What's your video about?"
          rows={4}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="kickoff-themes">Themes</Label>
        <Input
          id="kickoff-themes"
          value={formData.themes}
          onChange={(e) => update("themes", e.target.value)}
          placeholder="productivity, minimalism, tech review"
        />
        <p className="text-xs text-muted-foreground">Comma-separated</p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Target Length</Label>
          <Select
            value={String(formData.targetLength)}
            onValueChange={(v) => update("targetLength", Number(v))}
          >
            <SelectTrigger className="w-full">
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

        <div className="space-y-2">
          <Label>Tone (optional)</Label>
          <Select
            value={formData.tone}
            onValueChange={(v) => update("tone", v === "_none" ? "" : v)}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Select tone..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="_none">None</SelectItem>
              {TONE_OPTIONS.map((t) => (
                <SelectItem key={t} value={t}>
                  {t}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>
  );
}
