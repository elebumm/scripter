import { streamText, tool } from "ai";
import { getModel } from "./providers";
import {
  directionsToolSchema,
  directionConsensusToolSchema,
} from "./directions-schema";

const DIRECTIONS_SYSTEM_PROMPT = `You are an expert video production director. Your job is to read a video script and annotate every segment with the appropriate production direction type — what the viewer should SEE on screen while the narrator/presenter speaks each part.

## Direction Types

- **talking-head**: Presenter on camera speaking directly. Use for personal stories, opinions, direct address, introductions, conclusions.
- **b-roll**: Supplementary footage that illustrates what's being said. Use for descriptions of places, events, actions, or scenes.
- **motion-graphics**: Animated graphics, diagrams, charts, or data visualizations. Use for explaining concepts, processes, data, comparisons, or abstract ideas.
- **screen-recording**: Screen capture or software demo. Use for tutorials, app walkthroughs, code demonstrations, website tours.
- **text-overlay**: Text/titles displayed on screen, possibly over B-roll or solid backgrounds. Use for key statistics, quotes, lists, or emphasis points.
- **archival**: Stock footage, historical footage, or archival material. Use for historical references, industry context, or establishing shots.
- **interview-clip**: Interview or guest footage. Use for expert quotes, testimonials, or guest appearances referenced in the script.
- **mixed**: Combination or transition between types. Use sparingly for segments that naturally blend multiple visual approaches.

## Instructions

1. Read the entire script carefully
2. Segment the script at natural content boundaries (paragraph breaks, topic shifts, rhetorical transitions)
3. Assign exactly ONE direction type to each segment
4. Cover the ENTIRE script — every piece of text should be annotated
5. For each segment, select the originalText as an exact verbatim substring from the script
6. Consider visual storytelling: what would make this segment most engaging to watch?
7. Write a brief markdown analysis of your production direction choices
8. Then call the submit_directions tool with your structured annotations

## Guidelines

- Avoid long stretches of the same type — variety keeps viewers engaged
- Talking-head segments should be shorter (1-3 sentences) unless it's a compelling personal story
- Motion graphics work best for explaining "how" and "why"
- B-roll is ideal for "what" and "where"
- Don't overuse text-overlay — it should highlight, not replace narration`;

const DIRECTIONS_SUMMARY_PROMPT = `You are a senior video production director synthesizing multiple AI models' production direction annotations into a final consensus plan.

## Your Job

1. **Compare Annotations**: Look at how each model segmented the script and what direction types they assigned
2. **Merge Segments**: Where models agree on boundaries and types, merge into consensus annotations
3. **Resolve Conflicts**: Where models disagree on direction type, determine the best choice based on majority and reasoning
4. **Determine Confidence**:
   - high = all/nearly all models agree on the type
   - medium = majority agrees but some alternatives suggested
   - low = significant disagreement, your judgment call
5. **Track Agreement**: Record which models agree and which propose alternatives

## Output Format

Write a brief markdown summary covering:
- Overall production style assessment
- Key decision points where models disagreed
- Recommended flow and pacing of visual types

Then call the submit_direction_consensus tool with the merged annotations. Each originalText must be an EXACT verbatim substring from the original script.

## Direction Types Reference

talking-head, b-roll, motion-graphics, screen-recording, text-overlay, archival, interview-clip, mixed`;

interface DirectionRunInput {
  modelName: string;
  result: string;
  structuredResult?: string | null;
}

export function streamDirectionAnalysis({
  scriptContent,
  scriptContext,
  modelProvider,
  modelId,
  modelBaseUrl,
}: {
  scriptContent: string;
  scriptContext?: string;
  modelProvider: string;
  modelId: string;
  modelBaseUrl?: string;
}) {
  const model = getModel(modelProvider, modelId, { baseUrl: modelBaseUrl });

  const contextBlock = scriptContext
    ? `## Author's Context & Notes\n${scriptContext}\n\n---\n\n`
    : "";

  const userMessage = `${contextBlock}Please analyze the following video script and provide production direction annotations:\n\n${scriptContent}`;

  return streamText({
    model,
    system: DIRECTIONS_SYSTEM_PROMPT,
    messages: [{ role: "user", content: userMessage }],
    maxTokens: 4096,
    tools: {
      submit_directions: tool({
        description:
          "Submit your production direction annotations. Call this AFTER writing your markdown analysis.",
        inputSchema: directionsToolSchema,
      }),
    },
    toolChoice: "auto",
  });
}

export function streamDirectionSummary({
  scriptContent,
  directionRuns,
}: {
  scriptContent: string;
  directionRuns: DirectionRunInput[];
}) {
  const model = getModel("openrouter", "anthropic/claude-sonnet-4.6");

  // Build structured data section from tool calls
  const structuredSections: string[] = [];
  for (const run of directionRuns) {
    if (run.structuredResult) {
      try {
        const data = JSON.parse(run.structuredResult);
        if (data.directions && Array.isArray(data.directions)) {
          const annotations = data.directions
            .map(
              (d: { originalText: string; directionType: string; reasoning: string }) =>
                `  - [${d.directionType}] "${d.originalText.slice(0, 80)}${d.originalText.length > 80 ? "..." : ""}" — ${d.reasoning}`
            )
            .join("\n");
          structuredSections.push(
            `### ${run.modelName} (Structured)\n${annotations}`
          );
        }
      } catch {
        // skip invalid JSON
      }
    }
  }

  const structuredBlock =
    structuredSections.length > 0
      ? `## Structured Direction Data\n\n${structuredSections.join("\n\n")}\n\n---\n\n`
      : "";

  const runsText = directionRuns
    .map((r) => `### Direction Analysis from ${r.modelName}\n\n${r.result}`)
    .join("\n\n---\n\n");

  const content = `${structuredBlock}## Original Script\n\n${scriptContent}\n\n## Model Direction Analyses\n\n${runsText}\n\nPlease synthesize these direction analyses into a consensus production plan. After your markdown summary, you MUST call the submit_direction_consensus tool. Each originalText must be an EXACT verbatim substring from the original script.`;

  return streamText({
    model,
    system: DIRECTIONS_SUMMARY_PROMPT,
    messages: [{ role: "user", content }],
    maxTokens: 4096,
    tools: {
      submit_direction_consensus: tool({
        description:
          "Submit the consensus production direction annotations. Call this AFTER writing your markdown summary.",
        inputSchema: directionConsensusToolSchema,
      }),
    },
    toolChoice: "auto",
  });
}
