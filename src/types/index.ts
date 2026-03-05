export type { FactCheck, FactIssue, FactIssueWithStaleness, FactCheckModelState, FactCheckVerdict, FactCheckStatus, FactCheckCategory } from "./fact-check";
export { FACT_CHECK_MODELS } from "./fact-check";

export type ScriptStatus = "draft" | "in-progress" | "final";

export interface Script {
  id: number;
  title: string;
  context: string;
  targetLength: number | null;
  status: ScriptStatus;
  currentVersion: number;
  source: "app" | "file";
  filePath: string | null;
  isTemplate: boolean;
  templateDescription: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ScriptVersion {
  id: number;
  scriptId: number;
  version: number;
  content: string;
  wordCount: number;
  createdAt: string;
}

export interface Evaluation {
  id: number;
  scriptId: number;
  versionId: number;
  profileId: number | null;
  modelId: string;
  modelProvider: string;
  result: string;
  structuredResult: string | null;
  isMasterSummary: boolean;
  sectionOnly: string | null;
  status: "pending" | "streaming" | "complete" | "error";
  errorMessage: string | null;
  durationMs: number | null;
  createdAt: string;
}

export interface EvaluationProfile {
  id: number;
  name: string;
  systemPrompt: string;
  criteriaWeights: string;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CustomModel {
  id: number;
  name: string;
  provider: "openrouter" | "ollama";
  modelId: string;
  baseUrl: string | null;
  isActive: boolean;
  createdAt: string;
}

export interface Suggestion {
  id: number;
  scriptId: number;
  versionId: number;
  originalText: string;
  suggestedText: string;
  reasoning: string;
  priority: "high" | "medium" | "low";
  category: string;
  sourceModels: string[];
  status: "pending" | "accepted" | "dismissed";
  createdAt: string;
}

export interface SuggestionWithStaleness extends Suggestion {
  isStale: boolean;
}

export interface Tag {
  id: number;
  name: string;
  color: string | null;
  createdAt: string;
}

export interface ScriptWithTags extends Script {
  tags: Tag[];
}

export interface ModelConfig {
  id: string;
  name: string;
  provider: "openrouter" | "ollama";
  modelId: string;
  baseUrl?: string;
  isBuiltIn: boolean;
  isActive: boolean;
}

export interface EvaluationRequest {
  scriptContent: string;
  sectionOnly?: string;
  modelId: string;
  modelProvider: string;
  modelBaseUrl?: string;
  profilePrompt?: string;
  criteriaWeights?: Record<string, number>;
}

export interface ModelEvalState {
  modelId: string;
  modelName: string;
  status: "idle" | "pending" | "streaming" | "complete" | "error";
  text: string;
  error?: string;
  durationMs?: number;
}

export const BUILT_IN_MODELS: ModelConfig[] = [
  // --- Active by default (one per provider) ---
  {
    id: "claude-sonnet",
    name: "Claude Sonnet 4.6",
    provider: "openrouter",
    modelId: "anthropic/claude-sonnet-4.6",
    isBuiltIn: true,
    isActive: true,
  },
  {
    id: "gpt-5",
    name: "GPT-5.2",
    provider: "openrouter",
    modelId: "openai/gpt-5.2",
    isBuiltIn: true,
    isActive: true,
  },
  {
    id: "gemini-3",
    name: "Gemini 3.1 Pro",
    provider: "openrouter",
    modelId: "google/gemini-3.1-pro-preview",
    isBuiltIn: true,
    isActive: true,
  },
  {
    id: "grok-4",
    name: "Grok 4",
    provider: "openrouter",
    modelId: "x-ai/grok-4",
    isBuiltIn: true,
    isActive: true,
  },
  {
    id: "deepseek-v3",
    name: "DeepSeek V3.2",
    provider: "openrouter",
    modelId: "deepseek/deepseek-v3.2",
    isBuiltIn: true,
    isActive: true,
  },
  // --- Available to toggle on ---
  {
    id: "claude-opus",
    name: "Claude Opus 4.6",
    provider: "openrouter",
    modelId: "anthropic/claude-opus-4.6",
    isBuiltIn: true,
    isActive: false,
  },
  {
    id: "gemini-2.5",
    name: "Gemini 2.5 Pro",
    provider: "openrouter",
    modelId: "google/gemini-2.5-pro",
    isBuiltIn: true,
    isActive: false,
  },
  {
    id: "deepseek-r1",
    name: "DeepSeek R1",
    provider: "openrouter",
    modelId: "deepseek/deepseek-r1",
    isBuiltIn: true,
    isActive: false,
  },
  {
    id: "grok-4-fast",
    name: "Grok 4.1 Fast",
    provider: "openrouter",
    modelId: "x-ai/grok-4.1-fast",
    isBuiltIn: true,
    isActive: false,
  },
];
