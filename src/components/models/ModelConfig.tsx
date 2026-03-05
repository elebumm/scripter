"use client";

import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useAppStore } from "@/stores/app-store";
import { BUILT_IN_MODELS } from "@/types";

export function ModelConfig() {
  const { activeModelIds, toggleModel } = useAppStore();

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-medium">Models</h3>
      <div className="space-y-3">
        {BUILT_IN_MODELS.map((model) => (
          <div
            key={model.id}
            className="flex items-center justify-between rounded-lg border p-3"
          >
            <div className="flex items-center gap-3">
              <Switch
                checked={activeModelIds.includes(model.id)}
                onCheckedChange={() => toggleModel(model.id)}
              />
              <div>
                <Label className="text-sm font-medium">{model.name}</Label>
                <p className="text-xs text-muted-foreground">{model.modelId}</p>
              </div>
            </div>
            <Badge variant="outline" className="text-xs">
              {model.provider}
            </Badge>
          </div>
        ))}
      </div>
    </div>
  );
}
