export const DIRECTION_TYPES = [
  "talking-head",
  "b-roll",
  "motion-graphics",
  "screen-recording",
  "text-overlay",
  "archival",
  "interview-clip",
  "mixed",
] as const;

export type DirectionType = (typeof DIRECTION_TYPES)[number];

export interface ProductionDirection {
  id: number;
  scriptId: number;
  versionId: number;
  originalText: string;
  directionType: DirectionType;
  reasoning: string;
  visualNotes: string | null;
  confidence: "high" | "medium" | "low";
  agreeingModels: string[];
  disagreeingModels: Array<{ model: string; alternativeType: string }>;
  status: "pending" | "accepted" | "modified" | "dismissed";
  userOverrideType: string | null;
  createdAt: string;
}

export interface ProductionDirectionWithStaleness extends ProductionDirection {
  isStale: boolean;
}

export interface DirectionModelState {
  modelId: string;
  modelName: string;
  status: "idle" | "pending" | "streaming" | "complete" | "error";
  text: string;
  error?: string;
  durationMs?: number;
}
