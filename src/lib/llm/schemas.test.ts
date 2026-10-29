import { describe, expect, it } from "vitest";
import { Output, streamText } from "ai";
import { MockLanguageModelV3, simulateReadableStream } from "ai/test";
import type { z } from "zod";
import { CRITERIA_IDS } from "./rubric";
import {
  beatCheckSchema,
  beatSuggestionSchema,
  factCheckSchema,
  personaCritiqueSchema,
  synthesisSchema,
  type BeatSuggestion,
  type PersonaCritique,
} from "./schemas";

type Chunk = { type: string; [k: string]: unknown };
type StreamResult = Awaited<ReturnType<MockLanguageModelV3["doStream"]>>;

function modelReturning(value: unknown) {
  const json = JSON.stringify(value);
  return new MockLanguageModelV3({
    doStream: async () => ({
      stream: simulateReadableStream<Chunk>({
        chunks: [
          { type: "stream-start", warnings: [] },
          { type: "text-start", id: "t" },
          { type: "text-delta", id: "t", delta: json },
          { type: "text-end", id: "t" },
          {
            type: "finish",
            finishReason: { unified: "stop", raw: "stop" },
            usage: {
              inputTokens: { total: 10, noCache: 10, cacheRead: 0, cacheWrite: 0 },
              outputTokens: { total: 10, text: 10, reasoning: 0 },
            },
          },
        ],
      }) as StreamResult["stream"],
    }),
  });
}

function proposal(seconds: Array<number | undefined>): BeatSuggestion {
  return {
    beats: seconds.map((targetSeconds, i) => ({
      title: `Beat ${i + 1}`,
      purpose: "Give the viewer a reason to keep watching.",
      ...(targetSeconds === undefined ? {} : { targetSeconds }),
    })),
    rationale: "A documentary arc that escalates toward the reveal.",
  };
}

describe("beatSuggestionSchema", () => {
  it.each([
    ["a long middle beat", [90, 180, 960, 180, 100]],
    ["a 4-second hook in a Short", [4, 12, 20, 15, 7]],
    ["a fractional value", [90.5, 120, undefined, 60, 30]],
  ])("does not fail the whole proposal over %s", async (_label, seconds) => {
    const value = proposal(seconds);
    const result = streamText({ model: modelReturning(value), output: Output.object({ schema: beatSuggestionSchema }), prompt: "Plan it." });
    await expect(result.output).resolves.toEqual(value);
  });

  it("sends no numeric bounds for targetSeconds", async () => {
    const model = modelReturning(proposal([60, 60, 60, 60, 60]));
    const result = streamText({ model, output: Output.object({ schema: beatSuggestionSchema }), prompt: "Plan it." });
    await result.output;
    const format = model.doStreamCalls[0].responseFormat as { type: "json"; schema: { properties: Record<string, never> } };
    const beat = (format.schema.properties.beats as { items: { properties: { targetSeconds: Record<string, unknown> } } }).items;
    expect(beat.properties.targetSeconds).not.toHaveProperty("minimum");
    expect(beat.properties.targetSeconds).not.toHaveProperty("maximum");
  });
});

/** The JSON schema the model is sent for this output schema. */
async function sentSchema(schema: z.ZodType): Promise<Record<string, unknown>> {
  const model = modelReturning({});
  const result = streamText({ model, output: Output.object({ schema }), prompt: "Go." });
  await Promise.resolve(result.output).catch(() => undefined);
  const format = model.doStreamCalls[0].responseFormat;
  if (format?.type !== "json" || !format.schema) throw new Error("No JSON schema was sent");
  return format.schema as Record<string, unknown>;
}

// Anthropic's structured outputs reject these; OpenAI's strict mode does too.
const UNSUPPORTED = ["minimum", "maximum", "exclusiveMinimum", "exclusiveMaximum", "multipleOf", "minLength", "maxLength"];

function constraintsIn(node: unknown, path = "$"): string[] {
  if (!node || typeof node !== "object") return [];
  const own = UNSUPPORTED.filter((k) => k in node).map((k) => `${path}.${k}`);
  return [...own, ...Object.entries(node).flatMap(([k, v]) => constraintsIn(v, `${path}.${k}`))];
}

describe("schemas sent to the model", () => {
  it.each([
    ["personaCritiqueSchema", personaCritiqueSchema],
    ["synthesisSchema", synthesisSchema],
    ["beatSuggestionSchema", beatSuggestionSchema],
    ["beatCheckSchema", beatCheckSchema],
    ["factCheckSchema", factCheckSchema],
  ] as const)("%s carries no numeric or length constraints", async (_name, schema) => {
    expect(constraintsIn(await sentSchema(schema))).toEqual([]);
  });

  it("still asks for whole-number scores and beat ids", async () => {
    type Props = { properties: Record<string, { type?: string; items?: Props }> };
    const critique = (await sentSchema(personaCritiqueSchema)) as Props;
    expect(critique.properties.overallScore.type).toBe("integer");
    expect(critique.properties.criteria.items!.properties.score.type).toBe("integer");
    const check = (await sentSchema(beatCheckSchema)) as Props;
    expect(check.properties.coverage.items!.properties.beatId.type).toBe("integer");
  });
});

describe("personaCritiqueSchema scores", () => {
  const critique = (score: number, overallScore = 7): PersonaCritique => ({
    summary: "Reads well.",
    criteria: [{ id: CRITERIA_IDS[0], score, observation: "Clear." }],
    overallScore,
    notes: [],
    landed: [],
  });

  it.each([1, 7, 10])("accepts %s", (score) => {
    expect(personaCritiqueSchema.safeParse(critique(score, score)).success).toBe(true);
  });

  it.each([0, 11, 7.5])("still rejects a criterion score of %s", (score) => {
    expect(personaCritiqueSchema.safeParse(critique(score)).success).toBe(false);
  });

  it.each([0, 11, 6.5])("still rejects an overall score of %s", (overall) => {
    expect(personaCritiqueSchema.safeParse(critique(7, overall)).success).toBe(false);
  });
});

describe("beatCheckSchema", () => {
  it("does not fail the whole check over one beat id that isn't on the sheet", async () => {
    const value = {
      coverage: [
        { beatId: 3, covered: true, comment: "Lands the setup." },
        { beatId: 4.5, covered: false, comment: "Not there yet." },
      ],
      missing: [],
    };
    const result = streamText({ model: modelReturning(value), output: Output.object({ schema: beatCheckSchema }), prompt: "Check it." });
    await expect(result.output).resolves.toEqual(value);
  });
});
