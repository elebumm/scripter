import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { reasons, resolveModel, type RegisteredModel } from "./models";

let openrouterInstance: ReturnType<typeof createOpenRouter> | null = null;

function getOpenRouter() {
  if (!openrouterInstance) {
    openrouterInstance = createOpenRouter({
      apiKey: process.env.OPENROUTER_API_KEY,
    });
  }
  return openrouterInstance;
}

export function hasApiKey(): boolean {
  return !!process.env.OPENROUTER_API_KEY;
}

/** Pages one grounded call gets back; the fact-check covers up to 20 claims. */
export const WEB_SEARCH_MAX_RESULTS = 10;

interface GetModelOptions {
  /** Ground the call with OpenRouter's web search plugin. */
  webSearch?: boolean;
}

/**
 * Build a language model for a registry slug. Unknown slugs fall back to the
 * default persona model, so a stale DB value can never reach the provider.
 */
export function getModel(slug: string | null | undefined, options: GetModelOptions = {}) {
  const model: RegisteredModel = resolveModel(slug);
  return getOpenRouter().chat(model.openrouterId, {
    usage: { include: true },
    // OpenAI's strict mode rejects schemas with optional fields. The AI SDK
    // validates every result against the zod schema anyway.
    structuredOutputs: { strict: false },
    // Reasoning is not excluded, so its chunks show the stream is alive. Nothing
    // reads it: callers consume only the structured output.
    reasoning: { effort: model.reasoningEffort },
    // Exa, pinned: native search depends on which endpoint serves the call, and
    // the fact-check prompt expects results injected into the request.
    ...(options.webSearch ? { plugins: [{ id: "web", engine: "exa", max_results: WEB_SEARCH_MAX_RESULTS }] } : {}),
  });
}

/** Common call settings for structured jobs, sized for the resolved model. */
export function callSettingsFor(slug: string | null | undefined) {
  const model = resolveModel(slug);
  return {
    maxOutputTokens: model.maxOutputTokens,
    // A model can reason for minutes without sending a chunk, so only the total
    // bounds it; a per-chunk limit would cut it off mid-thought.
    timeout: reasons(model) ? { totalMs: 240_000 } : { totalMs: 240_000, chunkMs: 60_000 },
  } as const;
}
