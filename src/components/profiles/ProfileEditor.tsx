"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { EvaluationProfile } from "@/types";

interface ProfileEditorProps {
  profile?: EvaluationProfile | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (data: {
    name: string;
    systemPrompt: string;
    criteriaWeights: string;
  }) => void;
}

export function ProfileEditor({
  profile,
  open,
  onOpenChange,
  onSave,
}: ProfileEditorProps) {
  const [name, setName] = useState(profile?.name ?? "");
  const [systemPrompt, setSystemPrompt] = useState(
    profile?.systemPrompt ?? ""
  );
  const [criteriaWeights, setCriteriaWeights] = useState(
    profile?.criteriaWeights ?? "{}"
  );

  const handleSave = () => {
    onSave({ name, systemPrompt, criteriaWeights });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {profile ? "Edit Profile" : "New Profile"}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Name</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Profile name"
            />
          </div>

          <div className="space-y-2">
            <Label>System Prompt</Label>
            <Textarea
              value={systemPrompt}
              onChange={(e) => setSystemPrompt(e.target.value)}
              placeholder="Enter the system prompt for this evaluation profile..."
              rows={12}
            />
          </div>

          <div className="space-y-2">
            <Label>Criteria Weights (JSON)</Label>
            <Textarea
              value={criteriaWeights}
              onChange={(e) => setCriteriaWeights(e.target.value)}
              placeholder='{"Hook & Opening": 9, "Structure & Flow": 8}'
              rows={4}
              className="font-mono text-xs"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={!name || !systemPrompt}>
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
