import { streamText, tool } from "ai";
import { getModel } from "./providers";
import { FACT_CHECK_AGENT_PROMPT } from "./fact-check-prompts";
import {
  webSearchInputSchema,
  factCheckResultSchema,
} from "./fact-check-schema";

async function tavilySearch(query: string): Promise<string> {
  const apiKey = process.env.TAVILY_API_KEY;
  if (!apiKey) {
    return "Error: TAVILY_API_KEY not configured. Cannot perform web search.";
  }

  try {
    const res = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: apiKey,
        query,
        search_depth: "basic",
        max_results: 5,
        include_answer: true,
      }),
    });

    if (!res.ok) {
      return `Search error: HTTP ${res.status} — ${await res.text()}`;
    }

    const data = await res.json();
    let output = "";

    if (data.answer) {
      output += `**Answer:** ${data.answer}\n\n`;
    }

    if (data.results && Array.isArray(data.results)) {
      output += "**Sources:**\n";
      for (const r of data.results.slice(0, 5)) {
        output += `- [${r.title}](${r.url}): ${r.content?.slice(0, 300) ?? ""}\n`;
      }
    }

    return output || "No results found.";
  } catch (err) {
    return `Search error: ${err instanceof Error ? err.message : "Unknown error"}`;
  }
}

export function streamFactCheck({
  scriptContent,
  scriptContext,
  modelProvider,
  modelId,
}: {
  scriptContent: string;
  scriptContext?: string;
  modelProvider: string;
  modelId: string;
}) {
  const model = getModel(modelProvider, modelId);

  const contextBlock = scriptContext
    ? `## Author's Context & Notes\n${scriptContext}\n\n---\n\n`
    : "";

  return streamText({
    model,
    system: FACT_CHECK_AGENT_PROMPT,
    messages: [
      {
        role: "user",
        content: `${contextBlock}Please fact-check the following video script. Identify all factual claims and verify each one using web search.\n\n${scriptContent}`,
      },
    ],
    maxTokens: 4096,
    maxSteps: 15,
    tools: {
      web_search: tool({
        description:
          "Search the web to verify a factual claim. Returns relevant sources and answers.",
        inputSchema: webSearchInputSchema,
        execute: async ({ query }) => {
          return await tavilySearch(query);
        },
      }),
      submit_fact_check: tool({
        description:
          "Submit your structured fact-check results. Call this AFTER completing all your web searches and analysis.",
        inputSchema: factCheckResultSchema,
      }),
    },
    toolChoice: "auto",
  });
}
