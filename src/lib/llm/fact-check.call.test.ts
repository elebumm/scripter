// streamFactCheck's call settings: the grounded run gets more output room and
// a longer total timeout than the shared defaults (no model is called).

import { beforeEach, describe, expect, it, vi } from "vitest";

const mock = vi.hoisted(() => ({
  calls: [] as Array<Record<string, unknown>>,
  settings: { maxOutputTokens: 10_000, timeout: { totalMs: 240_000, chunkMs: 60_000 } } as {
    maxOutputTokens: number;
    timeout: { totalMs: number; chunkMs?: number };
  },
}));

vi.mock("ai", async (importOriginal) => ({
  ...(await importOriginal<typeof import("ai")>()),
  streamText: (options: Record<string, unknown>) => {
    mock.calls.push(options);
    return {};
  },
}));

vi.mock("./providers", () => ({
  getModel: () => ({}),
  callSettingsFor: () => mock.settings,
}));

const input = { title: "T", context: "", content: "ImageNet was labelled by 49,000 workers.", today: "2026-10-27" };

beforeEach(() => {
  mock.calls = [];
});

describe("streamFactCheck", () => {
  it("raises the output budget and total timeout, keeping the chunk timeout", async () => {
    const { FACT_CHECK_MAX_OUTPUT_TOKENS, streamFactCheck } = await import("./fact-check");
    streamFactCheck(input);
    expect(mock.calls[0]).toMatchObject({
      maxOutputTokens: FACT_CHECK_MAX_OUTPUT_TOKENS,
      timeout: { totalMs: 420_000, chunkMs: 60_000 },
    });
    expect(FACT_CHECK_MAX_OUTPUT_TOKENS).toBeGreaterThan(10_000);
  });

  it("never lowers a registry budget that is already larger", async () => {
    const { streamFactCheck } = await import("./fact-check");
    mock.settings = { maxOutputTokens: 64_000, timeout: { totalMs: 240_000 } };
    streamFactCheck(input);
    expect(mock.calls[0]).toMatchObject({ maxOutputTokens: 64_000, timeout: { totalMs: 420_000 } });
    expect(mock.calls[0].timeout).not.toHaveProperty("chunkMs");
  });
});
