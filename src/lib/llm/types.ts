export interface LLMModelConfig {
  provider: string;
  modelId: string;
  baseUrl?: string;
}

export interface EvalRequest {
  scriptContent: string;
  sectionOnly?: string;
  systemPrompt: string;
  criteriaWeights?: Record<string, number>;
}

export interface SummarizeRequest {
  scriptContent: string;
  evaluations: Array<{
    modelName: string;
    result: string;
  }>;
}
