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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface CustomModelFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (data: {
    name: string;
    provider: "openrouter" | "ollama";
    modelId: string;
    baseUrl?: string;
  }) => void;
}

export function CustomModelForm({
  open,
  onOpenChange,
  onSave,
}: CustomModelFormProps) {
  const [name, setName] = useState("");
  const [provider, setProvider] = useState<"openrouter" | "ollama">(
    "openrouter"
  );
  const [modelId, setModelId] = useState("");
  const [baseUrl, setBaseUrl] = useState("");

  const handleSave = () => {
    onSave({
      name,
      provider,
      modelId,
      baseUrl: provider === "ollama" ? baseUrl || undefined : undefined,
    });
    setName("");
    setModelId("");
    setBaseUrl("");
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add Custom Model</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Display Name</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Llama 3.1 70B"
            />
          </div>

          <div className="space-y-2">
            <Label>Provider</Label>
            <Select
              value={provider}
              onValueChange={(v) =>
                setProvider(v as "openrouter" | "ollama")
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="openrouter">OpenRouter</SelectItem>
                <SelectItem value="ollama">Ollama (Local)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Model ID</Label>
            <Input
              value={modelId}
              onChange={(e) => setModelId(e.target.value)}
              placeholder={
                provider === "openrouter"
                  ? "e.g. meta-llama/llama-3.1-70b-instruct"
                  : "e.g. llama3.1:70b"
              }
            />
          </div>

          {provider === "ollama" && (
            <div className="space-y-2">
              <Label>Base URL (optional)</Label>
              <Input
                value={baseUrl}
                onChange={(e) => setBaseUrl(e.target.value)}
                placeholder="http://localhost:11434/v1"
              />
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={!name || !modelId}>
            Add Model
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
