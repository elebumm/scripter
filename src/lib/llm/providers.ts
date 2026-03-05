import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { createOpenAI } from "@ai-sdk/openai";

let openrouterInstance: ReturnType<typeof createOpenRouter> | null = null;

function getOpenRouter() {
  if (!openrouterInstance) {
    openrouterInstance = createOpenRouter({
      apiKey: process.env.OPENROUTER_API_KEY,
    });
  }
  return openrouterInstance;
}

export function getModel(
  provider: string,
  modelId: string,
  options?: { baseUrl?: string }
) {
  switch (provider) {
    case "openrouter":
      return getOpenRouter()(modelId);
    case "ollama":
      return createOpenAI({
        baseURL: options?.baseUrl ?? "http://localhost:11434/v1",
        apiKey: "ollama",
      })(modelId);
    default:
      return getOpenRouter()(modelId);
  }
}
