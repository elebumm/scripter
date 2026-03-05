import { streamText } from "ai";
import { getModel } from "./providers";
import { buildOutlineSystemPrompt, buildOutlineUserPrompt } from "./outline-prompt";

const OUTLINE_MODEL_ID = "anthropic/claude-sonnet-4-6";

export function streamOutline({
  concept,
  themes,
  targetLength,
  tone,
}: {
  concept: string;
  themes?: string;
  targetLength: number;
  tone?: string;
}) {
  const model = getModel("openrouter", OUTLINE_MODEL_ID);

  return streamText({
    model,
    system: buildOutlineSystemPrompt(),
    messages: [
      {
        role: "user",
        content: buildOutlineUserPrompt({ concept, themes, targetLength, tone }),
      },
    ],
  });
}
