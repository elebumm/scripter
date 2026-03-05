export type FactCheckVerdict =
  | "verified"
  | "inaccurate"
  | "misleading"
  | "unverifiable"
  | "exaggeration-ok";

export type FactCheckStatus = "pending" | "acknowledged" | "dismissed" | "corrected";

export type FactCheckCategory = "statistic" | "date" | "attribution" | "technical" | "general";

export interface FactCheck {
  id: number;
  scriptId: number;
  versionId: number;
  modelId: string;
  modelProvider: string;
  result: string;
  structuredResult: string | null;
  isSummary: boolean;
  status: "pending" | "streaming" | "complete" | "error";
  errorMessage: string | null;
  searchCount: number | null;
  durationMs: number | null;
  createdAt: string;
}

export interface FactIssue {
  id: number;
  scriptId: number;
  versionId: number;
  claimText: string;
  verdict: FactCheckVerdict;
  accuracy: number | null;
  correction: string | null;
  reasoning: string;
  sources: string[];
  isExaggeration: boolean;
  category: FactCheckCategory;
  agentModels: string[];
  status: FactCheckStatus;
  createdAt: string;
}

export interface FactIssueWithStaleness extends FactIssue {
  isStale: boolean;
}

export interface FactCheckModelState {
  modelId: string;
  modelName: string;
  status: "idle" | "pending" | "streaming" | "complete" | "error";
  text: string;
  error?: string;
  durationMs?: number;
  searchCount?: number;
}

export const FACT_CHECK_MODELS = [
  {
    id: "claude-sonnet",
    name: "Claude Sonnet 4.6",
    provider: "openrouter" as const,
    modelId: "anthropic/claude-sonnet-4.6",
  },
  {
    id: "gpt-5",
    name: "GPT-5.2",
    provider: "openrouter" as const,
    modelId: "openai/gpt-5.2",
  },
  {
    id: "gemini-3",
    name: "Gemini 3.1 Pro",
    provider: "openrouter" as const,
    modelId: "google/gemini-3.1-pro-preview",
  },
  {
    id: "grok-4",
    name: "Grok 4",
    provider: "openrouter" as const,
    modelId: "x-ai/grok-4",
  },
];
