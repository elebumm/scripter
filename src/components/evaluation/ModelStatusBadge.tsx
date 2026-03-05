"use client";

import { Badge } from "@/components/ui/badge";
import { Loader2 } from "lucide-react";

interface ModelStatusBadgeProps {
  status: "idle" | "pending" | "streaming" | "complete" | "error";
}

export function ModelStatusBadge({ status }: ModelStatusBadgeProps) {
  switch (status) {
    case "idle":
      return <Badge variant="outline">Idle</Badge>;
    case "pending":
      return (
        <Badge variant="secondary" className="gap-1">
          <Loader2 className="h-3 w-3 animate-spin" />
          Pending
        </Badge>
      );
    case "streaming":
      return (
        <Badge className="gap-1 bg-blue-500/20 text-blue-400 border-blue-500/30">
          <Loader2 className="h-3 w-3 animate-spin" />
          Streaming
        </Badge>
      );
    case "complete":
      return (
        <Badge className="bg-green-500/20 text-green-400 border-green-500/30">
          Complete
        </Badge>
      );
    case "error":
      return (
        <Badge variant="destructive">Error</Badge>
      );
  }
}
