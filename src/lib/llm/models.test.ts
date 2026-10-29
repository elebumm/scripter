import { describe, expect, it } from "vitest";
import { estimateCostUsd, MODELS, reasons, resolveModel, ROLE_MODELS, type ReasoningEffort } from "./models";

// From OpenRouter's /api/v1/models on 2026-10-27: the efforts each model
// accepts (Kimi defaults to "max"; both GPT-6 models reason unless told not to).
const CATALOGUE: Record<string, { efforts: ReasoningEffort[]; priceIn: number; priceOut: number }> = {
  "anthropic/claude-sonnet-5.5": { efforts: ["high", "medium", "low"], priceIn: 2, priceOut: 10 },
  "anthropic/claude-opus-5.5": { efforts: ["high", "medium", "low"], priceIn: 4, priceOut: 20 },
  "anthropic/claude-haiku-5.5": { efforts: ["high", "medium", "low", "none"], priceIn: 0.1, priceOut: 0.5 },
  "openai/gpt-6.1-terra": { efforts: ["high", "medium", "low", "none"], priceIn: 1, priceOut: 5 },
  "openai/gpt-6-luna": { efforts: ["high", "medium", "low", "none"], priceIn: 0.1, priceOut: 0.5 },
  "google/gemini-3.8-flash": { efforts: ["high", "medium", "low"], priceIn: 0.825, priceOut: 4.125 },
  "google/gemini-4-argon": { efforts: ["high", "medium", "low"], priceIn: 2, priceOut: 10 },
  "x-ai/grok-4.7": { efforts: ["high", "medium", "low"], priceIn: 2, priceOut: 6 },
  "deepseek/deepseek-v4-pro-0813": { efforts: ["high", "low", "none"], priceIn: 0.66, priceOut: 1.98 },
  "moonshotai/kimi-k3.1-pro": { efforts: ["high", "low", "none"], priceIn: 2, priceOut: 10 },
};

describe("model registry", () => {
  it("lists every model in the catalogue snapshot", () => {
    expect(MODELS.map((m) => m.openrouterId).sort()).toEqual(Object.keys(CATALOGUE).sort());
  });

  it.each(MODELS.map((m) => [m.slug, m] as const))("%s uses an effort the catalogue lists", (_slug, m) => {
    expect(CATALOGUE[m.openrouterId].efforts).toContain(m.reasoningEffort);
  });

  it.each(MODELS.map((m) => [m.slug, m] as const))("%s has the 10k output budget a lens needs", (_slug, m) => {
    expect(m.maxOutputTokens).toBeGreaterThanOrEqual(10_000);
  });

  it("never lets the icon model reason (it answers in 200 tokens at temperature 0)", () => {
    expect(reasons(resolveModel(ROLE_MODELS.iconPicker))).toBe(false);
    expect(MODELS.filter((m) => !reasons(m)).map((m) => m.slug)).toEqual([ROLE_MODELS.iconPicker]);
  });

  it.each(MODELS.map((m) => [m.slug, m] as const))("%s matches the catalogue prices", (_slug, m) => {
    expect([m.priceIn, m.priceOut]).toEqual([CATALOGUE[m.openrouterId].priceIn, CATALOGUE[m.openrouterId].priceOut]);
  });

  it("has unique slugs and OpenRouter ids", () => {
    expect(new Set(MODELS.map((m) => m.slug)).size).toBe(MODELS.length);
    expect(new Set(MODELS.map((m) => m.openrouterId)).size).toBe(MODELS.length);
  });

  it("estimates cost per million tokens and falls back for unknown slugs", () => {
    expect(estimateCostUsd("claude-sonnet-5.5", 1_000_000, 100_000)).toBeCloseTo(3);
    expect(estimateCostUsd("not-a-model", 1_000_000, 1_000_000)).toBe(0);
    expect(resolveModel("not-a-model").slug).toBe("claude-sonnet-5.5");
  });
});
