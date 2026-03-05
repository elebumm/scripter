"use client";

import { useEffect, useState } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAppStore } from "@/stores/app-store";
import type { EvaluationProfile } from "@/types";

export function ProfileSelector() {
  const { selectedProfileId, setSelectedProfileId } = useAppStore();
  const [profiles, setProfiles] = useState<EvaluationProfile[]>([]);

  useEffect(() => {
    fetch("/api/profiles")
      .then((r) => r.json())
      .then(setProfiles)
      .catch(() => {});
  }, []);

  return (
    <Select
      value={selectedProfileId?.toString() ?? "default"}
      onValueChange={(v) =>
        setSelectedProfileId(v === "default" ? null : Number(v))
      }
    >
      <SelectTrigger className="h-7 w-44 text-xs">
        <SelectValue placeholder="Select profile..." />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="default">Default Profile</SelectItem>
        {profiles.map((p) => (
          <SelectItem key={p.id} value={p.id.toString()}>
            {p.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
