import { describe, expect, it } from "vitest";
import { NoObjectGeneratedError } from "ai";
import {
  MISSING_EXPLANATION_NOTE,
  OUT_OF_ROOM_MESSAGE,
  QUOTED_EXPLANATION_NOTE,
  buildFactCheckSystemPrompt,
  carriedFactStatuses,
  factCheckFailureMessage,
  filterClaimSources,
  guardFactCheckPartial,
  indexReturnedSources,
  normalizeUrl,
  usageCost,
  validateFactClaims,
} from "./fact-check";
import type { FactCheckOutput } from "./schemas";
import { matchKey } from "@/lib/text/anchor";

const script = `# The Hidden Workforce

ImageNet was labelled by **49,000 workers** in 167 countries.

It launched in 2009 and changed computer vision forever.

Fei-Fei Li started the project at Princeton.`;

const returnedSources = indexReturnedSources([
  { sourceType: "url", url: "https://www.example.org/imagenet-history/?utm_source=openrouter#workers", title: "ImageNet history" },
  { sourceType: "url", url: "https://news.example.com/2009/imagenet", title: "" },
  { sourceType: "document", title: "a pdf" },
  { sourceType: "url", url: "ftp://files.example.com/x" },
]);

function claim(overrides: Partial<FactCheckOutput["claims"][number]>): FactCheckOutput["claims"][number] {
  return {
    claimText: "ImageNet was labelled by 49,000 workers in 167 countries.",
    verdict: "verified",
    explanation: "The project's own history page reports roughly 49,000 workers from 167 countries.",
    sources: [{ url: "https://example.org/imagenet-history" }],
    category: "statistic",
    ...overrides,
  };
}

describe("normalizeUrl", () => {
  it("drops scheme, www, fragment, trailing slash and utm_* params", () => {
    expect(normalizeUrl("https://www.Example.org/a/b/?utm_source=x&id=3&UTM_medium=y#frag")).toBe("example.org/a/b?id=3");
    expect(normalizeUrl("http://example.org/a/b?id=3")).toBe("example.org/a/b?id=3");
    expect(normalizeUrl("https://example.org/")).toBe("example.org");
  });

  it("rejects non-http URLs and garbage", () => {
    expect(normalizeUrl("ftp://example.org/file")).toBeNull();
    expect(normalizeUrl("javascript:alert(1)")).toBeNull();
    expect(normalizeUrl("not a url")).toBeNull();
  });
});

describe("indexReturnedSources / filterClaimSources", () => {
  it("indexes only http(s) url sources, keyed by normalized URL", () => {
    expect([...returnedSources.keys()]).toEqual(["example.org/imagenet-history", "news.example.com/2009/imagenet"]);
    expect(returnedSources.get("news.example.com/2009/imagenet")).toEqual({ url: "https://news.example.com/2009/imagenet" });
  });

  it("keeps a claim source only if search returned it, using the returned URL", () => {
    const kept = filterClaimSources(
      [
        { url: "http://example.org/imagenet-history/" },
        { url: "https://example.org/imagenet-history?utm_campaign=z" }, // duplicate after normalisation
        { url: "https://made-up.example.net/report", title: "From memory" },
        { url: "https://news.example.com/2009/imagenet", title: "Launch coverage" },
      ],
      returnedSources
    );
    expect(kept).toEqual([
      { url: "https://www.example.org/imagenet-history/?utm_source=openrouter#workers", title: "ImageNet history" },
      { url: "https://news.example.com/2009/imagenet", title: "Launch coverage" },
    ]);
  });
});

describe("validateFactClaims", () => {
  it("drops claims that don't quote the script and duplicates", () => {
    const result = validateFactClaims(
      {
        claims: [
          claim({}),
          claim({ claimText: "ImageNet was labelled by 50,000 contractors in 170 countries." }),
          claim({ claimText: "imagenet was labelled by 49,000 workers in 167 countries." }),
        ],
      },
      { content: script, returned: returnedSources }
    );
    expect(result.claims).toHaveLength(1);
    expect(result.dropped).toMatchObject({ notInScript: 1, duplicate: 1 });
  });

  it("accepts claims quoted across markdown emphasis", () => {
    const result = validateFactClaims({ claims: [claim({})] }, { content: script, returned: returnedSources });
    expect(result.claims[0].claimText).toBe("ImageNet was labelled by 49,000 workers in 167 countries.");
    expect(result.claims[0].sources).toHaveLength(1);
  });

  it("stores the script's own text, not the model's copy of the claim", () => {
    const result = validateFactClaims(
      { claims: [claim({ claimText: "imagenet was labelled by **49,000 workers**   in 167 countries." })] },
      { content: script, returned: returnedSources }
    );
    expect(result.claims[0].claimText).toBe("ImageNet was labelled by 49,000 workers in 167 countries.");
  });

  it("downgrades verdicts that need evidence when no returned source backs them", () => {
    const result = validateFactClaims(
      {
        claims: [
          claim({ verdict: "inaccurate", sources: [{ url: "https://made-up.example.net/report" }] }),
          claim({
            claimText: "It launched in 2009 and changed computer vision forever.",
            verdict: "exaggeration-ok",
            explanation: "The dataset was released in 2009; changed forever is framing the sources broadly support.",
            sources: [],
          }),
        ],
      },
      { content: script, returned: returnedSources }
    );
    expect(result.downgraded).toBe(2);
    expect(result.claims[0].verdict).toBe("unverifiable");
    expect(result.claims[0].sources).toEqual([]);
    expect(result.claims[0].explanation).toMatch(/marked unverifiable/);
    // An unsourced "fair exaggeration" is a claim nothing checked.
    expect(result.claims[1].verdict).toBe("unverifiable");
    expect(result.claims[1].explanation).toMatch(/marked unverifiable/);
  });

  it("keeps a sourced exaggeration-ok verdict", () => {
    const result = validateFactClaims(
      {
        claims: [
          claim({
            claimText: "It launched in 2009 and changed computer vision forever.",
            verdict: "exaggeration-ok",
            explanation: "The launch coverage dates it to 2009; forever is framing the sources broadly support.",
            sources: [{ url: "https://news.example.com/2009/imagenet" }],
          }),
        ],
      },
      { content: script, returned: returnedSources }
    );
    expect(result.downgraded).toBe(0);
    expect(result.claims[0].verdict).toBe("exaggeration-ok");
  });

  it("strips supplied wording from explanations and keeps the sourced verdict when nothing is left", () => {
    const result = validateFactClaims(
      {
        claims: [
          claim({
            explanation:
              'Sources put it at 49,000 workers. Change it to "nearly fifty thousand people across the globe" for accuracy.',
          }),
          claim({
            claimText: "Fei-Fei Li started the project at Princeton.",
            explanation: 'Try "Fei-Fei Li began the project as a Princeton professor".',
          }),
        ],
      },
      { content: script, returned: returnedSources }
    );
    expect(result.claims).toHaveLength(2);
    expect(result.claims[0].guardTripped).toBe(true);
    expect(result.claims[0].explanation).not.toContain("nearly fifty thousand");
    expect(result.claims[1]).toMatchObject({ verdict: "verified", explanation: QUOTED_EXPLANATION_NOTE, guardTripped: true });
    expect(result.claims[1].sources).toHaveLength(1);
    expect(result.dropped.tooThin).toBe(0);
  });

  it("keeps an inaccurate claim whose explanation only quotes the contradicting source", () => {
    const result = validateFactClaims(
      {
        claims: [
          claim({
            verdict: "inaccurate",
            explanation: 'Wired reports "about 25,000 workers in 50 countries labelled the images".',
          }),
        ],
      },
      { content: script, returned: returnedSources }
    );
    expect(result.claims).toHaveLength(1);
    expect(result.claims[0]).toMatchObject({ verdict: "inaccurate", explanation: QUOTED_EXPLANATION_NOTE });
    expect(result.claims[0].explanation).not.toContain("25,000");
    expect(result.claims[0].sources).toHaveLength(1);
  });

  it("drops a claim with neither a usable explanation nor a source", () => {
    const result = validateFactClaims(
      {
        claims: [
          claim({ verdict: "unverifiable", explanation: 'Try "Fei-Fei Li began the project as a Princeton professor".', sources: [] }),
          claim({ claimText: "Fei-Fei Li started the project at Princeton.", explanation: "", sources: [] }),
          claim({ claimText: "It launched in 2009 and changed computer vision forever.", verdict: "verified", explanation: "Yes.", sources: [{ url: "https://news.example.com/2009/imagenet" }] }),
        ],
      },
      { content: script, returned: returnedSources }
    );
    expect(result.dropped.tooThin).toBe(2);
    expect(result.claims).toHaveLength(1);
    expect(result.claims[0]).toMatchObject({ verdict: "verified", explanation: MISSING_EXPLANATION_NOTE });
  });

  it("returns claims in script order", () => {
    const result = validateFactClaims(
      {
        claims: [
          claim({
            claimText: "Fei-Fei Li started the project at Princeton.",
            explanation: "Princeton's announcement names Fei-Fei Li as the project's founder in 2007.",
            sources: [],
            verdict: "unverifiable",
          }),
          claim({}),
        ],
      },
      { content: script, returned: returnedSources }
    );
    expect(result.claims.map((c) => c.claimText)).toEqual([
      "ImageNet was labelled by 49,000 workers in 167 countries.",
      "Fei-Fei Li started the project at Princeton.",
    ]);
  });
});

describe("guardFactCheckPartial", () => {
  it("withholds unvalidated sources while streaming", () => {
    const partial = guardFactCheckPartial({ claims: [{ claimText: "x", sources: [{ url: "https://made-up.example.net" }] }] }, "");
    expect(partial.claims?.[0]).not.toHaveProperty("sources");
  });

  it("hides an open quote in the streaming explanation and claims that don't quote the script", () => {
    const key = matchKey(script);
    const partial = guardFactCheckPartial(
      {
        claims: [
          { claimText: "ImageNet was labelled by", explanation: "The history page agrees with the figure." },
          { claimText: "ImageNet was labelled by 50,000 contractors", explanation: 'Wired reports "about 25,000 workers in 50 countr' },
        ],
      },
      key
    );
    expect(partial.claims?.[0]).toMatchObject({ claimText: "ImageNet was labelled by", explanation: "The history page agrees with the figure." });
    expect(partial.claims?.[1]?.claimText).toBeUndefined();
    expect(partial.claims?.[1]?.explanation).not.toContain("25,000");
  });
});

describe("carriedFactStatuses", () => {
  it("keeps the writer's status for the same claim and verdict; the newest note wins", () => {
    const previous = [
      { claimText: "ImageNet was labelled by 49,000 workers in 167 countries.", verdict: "unverifiable" as const, status: "dismissed" as const },
      { claimText: "Fei-Fei Li started the project at Princeton.", verdict: "verified" as const, status: "dismissed" as const },
      { claimText: "Fei-Fei Li started the project at Princeton.", verdict: "verified" as const, status: "pending" as const },
      { claimText: "It launched in 2009 and changed computer vision forever.", verdict: "misleading" as const, status: "acknowledged" as const },
    ];
    expect(
      carriedFactStatuses(previous, [
        { claimText: "imagenet was labelled by 49,000 workers in 167 countries.", verdict: "unverifiable" },
        { claimText: "Fei-Fei Li started the project at Princeton.", verdict: "verified" },
        { claimText: "It launched in 2009 and changed computer vision forever.", verdict: "inaccurate" },
        { claimText: "A brand new claim in the script.", verdict: "verified" },
      ])
    ).toEqual(["dismissed", "pending", "pending", "pending"]);
  });
});

describe("factCheckFailureMessage", () => {
  it("says the model ran out of room when the output was cut off", () => {
    const err = new NoObjectGeneratedError({
      message: "No object generated: could not parse the response.",
      text: '{"claims":[{"claimText":"Image',
      response: { id: "r", timestamp: new Date(0), modelId: "m" },
      usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 } as never,
      finishReason: "length",
    });
    expect(factCheckFailureMessage(err)).toBe(OUT_OF_ROOM_MESSAGE);
    expect(factCheckFailureMessage(new Error("Upstream is down"))).toBe("Upstream is down");
    const aborted = new AbortController();
    aborted.abort();
    expect(factCheckFailureMessage(err, aborted.signal)).toBe("Stopped");
  });
});

describe("usageCost", () => {
  it("prefers the cost OpenRouter reports, else estimates from the registry", () => {
    expect(usageCost("claude-sonnet-5.5", { inputTokens: 1000, outputTokens: 100 }, { openrouter: { usage: { cost: 0.42 } } }).costUsd).toBe(0.42);
    expect(usageCost("claude-sonnet-5.5", { inputTokens: 1_000_000, outputTokens: 0 }, undefined).costUsd).toBe(2);
  });
});

describe("buildFactCheckSystemPrompt", () => {
  it("dates the prompt and forbids memory sources and rewrites", () => {
    const prompt = buildFactCheckSystemPrompt("2026-10-27");
    expect(prompt).toContain("2026-10-27");
    expect(prompt).toMatch(/only URLs that appear in the web search results/i);
    expect(prompt).toMatch(/never rewrite the writer's sentence/i);
    expect(prompt).toContain("An empty list is fine (then the verdict is unverifiable).");
  });
});
