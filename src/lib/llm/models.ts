// Single source of truth for every model the app may call.
// Server code resolves models only through this registry; client-supplied
// model ids are never passed to the provider (see isAllowedModelSlug).

export type ModelVendor = "anthropic" | "openai" | "google" | "xai" | "deepseek" | "moonshot";

/** OpenRouter `reasoning.effort` values the registry uses; "none" turns reasoning off. */
export type ReasoningEffort = "high" | "medium" | "low" | "none";

export interface RegisteredModel {
  /** Stable app-level id stored in the DB (evaluation_profiles.model_id). */
  slug: string;
  name: string;
  vendor: ModelVendor;
  /** OpenRouter model id, checked against /api/v1/models on 2026-10-27. */
  openrouterId: string;
  /** USD per 1M input tokens (OpenRouter list price; DeepSeek's off-peak rate). */
  priceIn: number;
  /** USD per 1M output tokens. */
  priceOut: number;
  /**
   * Caps reasoning plus the answer. 10k for every model: a full critique is
   * about 3k visible tokens, and any model can be put on a lens.
   */
  maxOutputTokens: number;
  /**
   * Sent on every call and always one of the model's supported_efforts in the
   * OpenRouter catalogue. Never left to the default: Kimi defaults to "max",
   * and the GPT-6 models reason unless told otherwise.
   */
  reasoningEffort: ReasoningEffort;
}

export const MODELS: readonly RegisteredModel[] = [
  { slug: "claude-sonnet-5.5", name: "Claude Sonnet 5.5", vendor: "anthropic", openrouterId: "anthropic/claude-sonnet-5.5", priceIn: 2, priceOut: 10, maxOutputTokens: 10_000, reasoningEffort: "medium" },
  { slug: "claude-opus-5.5", name: "Claude Opus 5.5", vendor: "anthropic", openrouterId: "anthropic/claude-opus-5.5", priceIn: 4, priceOut: 20, maxOutputTokens: 10_000, reasoningEffort: "medium" },
  { slug: "claude-haiku-5.5", name: "Claude Haiku 5.5", vendor: "anthropic", openrouterId: "anthropic/claude-haiku-5.5", priceIn: 0.1, priceOut: 0.5, maxOutputTokens: 10_000, reasoningEffort: "none" },
  { slug: "gpt-6.1-terra", name: "GPT-6.1 Terra", vendor: "openai", openrouterId: "openai/gpt-6.1-terra", priceIn: 1, priceOut: 5, maxOutputTokens: 10_000, reasoningEffort: "medium" },
  { slug: "gpt-6-luna", name: "GPT-6 Luna", vendor: "openai", openrouterId: "openai/gpt-6-luna", priceIn: 0.1, priceOut: 0.5, maxOutputTokens: 10_000, reasoningEffort: "low" },
  { slug: "gemini-3.8-flash", name: "Gemini 3.8 Flash", vendor: "google", openrouterId: "google/gemini-3.8-flash", priceIn: 0.825, priceOut: 4.125, maxOutputTokens: 10_000, reasoningEffort: "medium" },
  { slug: "gemini-4-argon", name: "Gemini 4 Argon", vendor: "google", openrouterId: "google/gemini-4-argon", priceIn: 2, priceOut: 10, maxOutputTokens: 10_000, reasoningEffort: "medium" },
  { slug: "grok-4.7", name: "Grok 4.7", vendor: "xai", openrouterId: "x-ai/grok-4.7", priceIn: 2, priceOut: 6, maxOutputTokens: 10_000, reasoningEffort: "medium" },
  // DeepSeek and Kimi list no "medium" effort.
  { slug: "deepseek-v4-pro", name: "DeepSeek V4 Pro", vendor: "deepseek", openrouterId: "deepseek/deepseek-v4-pro-0813", priceIn: 0.66, priceOut: 1.98, maxOutputTokens: 10_000, reasoningEffort: "low" },
  { slug: "kimi-k3.1-pro", name: "Kimi K3.1 Pro", vendor: "moonshot", openrouterId: "moonshotai/kimi-k3.1-pro", priceIn: 2, priceOut: 10, maxOutputTokens: 10_000, reasoningEffort: "low" },
];

/** Whether calls to this model reason (any effort but "none"). */
export function reasons(model: RegisteredModel): boolean {
  return model.reasoningEffort !== "none";
}

/** Which model each non-persona job uses. */
export const ROLE_MODELS = {
  synthesizer: "claude-sonnet-5.5",
  beats: "claude-sonnet-5.5",
  factCheck: "claude-sonnet-5.5",
  iconPicker: "claude-haiku-5.5",
} as const;

export type ModelRole = keyof typeof ROLE_MODELS;

/** Used when a persona row has no model or an unknown one. */
export const FALLBACK_PERSONA_MODEL = "claude-sonnet-5.5";

export function getModelBySlug(slug: string | null | undefined): RegisteredModel | undefined {
  if (!slug) return undefined;
  return MODELS.find((m) => m.slug === slug);
}

export function isAllowedModelSlug(slug: unknown): slug is string {
  return typeof slug === "string" && MODELS.some((m) => m.slug === slug);
}

/** Resolve a persona's model, falling back to a working default. */
export function resolveModel(slug: string | null | undefined): RegisteredModel {
  return getModelBySlug(slug) ?? getModelBySlug(FALLBACK_PERSONA_MODEL)!;
}

export function estimateCostUsd(slug: string, tokensIn: number, tokensOut: number): number {
  const model = getModelBySlug(slug);
  if (!model) return 0;
  return (tokensIn * model.priceIn + tokensOut * model.priceOut) / 1_000_000;
}

/**
 * What a call cost: OpenRouter's reported charge (providerMetadata, sent
 * because getModel asks for usage) when present, else the list-price estimate.
 * The reported charge follows the endpoint that served the call and DeepSeek's
 * time-of-day pricing.
 */
export function callCostUsd(slug: string, tokensIn: number, tokensOut: number, providerMetadata?: unknown): number {
  const reported = (providerMetadata as { openrouter?: { usage?: { cost?: unknown } } } | undefined)?.openrouter?.usage
    ?.cost;
  return typeof reported === "number" && Number.isFinite(reported) ? reported : estimateCostUsd(slug, tokensIn, tokensOut);
}
