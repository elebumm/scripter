// Captures the request the real OpenRouter provider would send (fetch is
// stubbed and the key is a dummy, so nothing leaves the machine).

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Output, streamText } from "ai";
import { z } from "zod";
import { callSettingsFor, getModel, WEB_SEARCH_MAX_RESULTS } from "./providers";
import { MODELS, ROLE_MODELS } from "./models";
import { personaCritiqueSchema } from "./schemas";

type Body = {
  model: string;
  max_tokens?: number;
  reasoning?: Record<string, unknown>;
  plugins?: unknown[];
  response_format?: { type: string; json_schema?: { strict?: boolean; schema: Record<string, unknown> } };
};

let requests: Array<{ url: string; body: Body }> = [];
let reply: Array<Record<string, unknown>> = [];

function sse(deltas: Array<Record<string, unknown>>): Response {
  const chunk = (delta: Record<string, unknown>, finish: string | null) => ({
    id: "gen-test",
    object: "chat.completion.chunk",
    created: 1,
    model: "test",
    choices: [{ index: 0, delta, finish_reason: finish }],
  });
  const events = [
    ...deltas.map((d) => chunk(d, null)),
    { ...chunk({}, "stop"), usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 } },
  ];
  const text = events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join("") + "data: [DONE]\n\n";
  return new Response(text, { status: 200, headers: { "content-type": "text/event-stream" } });
}

beforeEach(() => {
  requests = [];
  reply = [{ role: "assistant", content: '{"a":"ok"}' }];
  vi.stubEnv("OPENROUTER_API_KEY", "sk-or-test-dummy");
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string | URL, init?: RequestInit) => {
      requests.push({ url: String(url), body: JSON.parse(String(init?.body)) as Body });
      return sse(reply);
    })
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

const smallSchema = z.object({ a: z.string(), b: z.string().optional() });

async function run<T>(slug: string, schema: z.ZodType<T>, options: { webSearch?: boolean } = {}) {
  const result = streamText({
    model: getModel(slug, options),
    output: Output.object({ schema }),
    prompt: "Review this.",
    ...callSettingsFor(slug),
  });
  const output = await Promise.resolve(result.output).catch((err: unknown) => err);
  expect(requests).toHaveLength(1);
  return { ...requests[0], output, reasoningText: await result.reasoningText };
}

describe("getModel request body", () => {
  it.each(MODELS.map((m) => [m.slug, m] as const))("%s sends a non-strict json_schema and its own effort", async (slug, model) => {
    const { url, body, output } = await run(slug, smallSchema);
    expect(url).toBe("https://openrouter.ai/api/v1/chat/completions");
    expect(body.model).toBe(model.openrouterId);
    expect(body.response_format?.type).toBe("json_schema");
    expect(body.response_format?.json_schema?.strict).toBe(false);
    expect(body.reasoning).toEqual({ effort: model.reasoningEffort });
    expect(body.max_tokens).toBe(model.maxOutputTokens);
    expect(body.plugins).toBeUndefined();
    expect(output).toEqual({ a: "ok" });
  });

  it("sends the critique schema to the GPT lens without strict mode, even though `question` is optional", async () => {
    reply = [{ role: "assistant", content: "{}" }];
    const { body } = await run("gpt-6.1-terra", personaCritiqueSchema);
    const json = body.response_format?.json_schema;
    expect(json?.strict).toBe(false);
    const notes = (json?.schema.properties as Record<string, { items: { properties: object; required: string[] } }>).notes;
    expect(Object.keys(notes.items.properties)).toContain("question");
    expect(notes.items.required).not.toContain("question");
  });

  it("pins the fact-check grounding to Exa with enough results", async () => {
    const { body } = await run(ROLE_MODELS.factCheck, smallSchema, { webSearch: true });
    expect(body.plugins).toEqual([{ id: "web", engine: "exa", max_results: WEB_SEARCH_MAX_RESULTS }]);
    expect(body.response_format?.json_schema?.strict).toBe(false);
  });

  it("keeps streamed reasoning out of the structured output", async () => {
    reply = [
      { role: "assistant", reasoning: "Thinking about the hook first." },
      { reasoning: " Then the pacing." },
      { content: '{"a":' },
      { content: '"ok"}' },
    ];
    const { output, reasoningText } = await run("claude-sonnet-5.5", smallSchema);
    expect(output).toEqual({ a: "ok" });
    expect(reasoningText).toBe("Thinking about the hook first. Then the pacing.");
  });

  it("falls back to the default persona model for an unknown slug", async () => {
    const { body } = await run("not-a-model", smallSchema);
    expect(body.model).toBe("anthropic/claude-sonnet-5.5");
  });
});

describe("callSettingsFor", () => {
  it("gives reasoning models only a total timeout, so a long silent think isn't cut off", () => {
    for (const m of MODELS) {
      const { timeout, maxOutputTokens } = callSettingsFor(m.slug);
      expect(maxOutputTokens).toBe(m.maxOutputTokens);
      expect(timeout.totalMs).toBe(240_000);
      if (m.reasoningEffort === "none") expect(timeout).toEqual({ totalMs: 240_000, chunkMs: 60_000 });
      else expect(timeout).toEqual({ totalMs: 240_000 });
    }
  });
});
