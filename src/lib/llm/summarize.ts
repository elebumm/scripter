import { streamText, tool } from "ai";
import { getModel } from "./providers";
import { MASTER_SUMMARY_PROMPT, getStatusCalibration } from "./prompts";
import { suggestionsToolSchema } from "./suggestions-schema";
import type { StructuredEvaluation } from "./eval-schema";

interface EvaluationInput {
  modelName: string;
  result: string;
  structuredResult?: string | null;
}

function buildStructuredSection(evaluations: EvaluationInput[]): string {
  const structured: Array<{ modelName: string; data: StructuredEvaluation }> = [];

  for (const e of evaluations) {
    if (e.structuredResult) {
      try {
        const data = JSON.parse(e.structuredResult) as StructuredEvaluation;
        structured.push({ modelName: e.modelName, data });
      } catch {
        // Invalid JSON — skip this one
      }
    }
  }

  if (structured.length === 0) return "";

  // Build score comparison table
  const allCriteria = new Set<string>();
  for (const s of structured) {
    for (const c of s.data.criteria) {
      allCriteria.add(c.name);
    }
  }

  const criteriaList = Array.from(allCriteria);
  const modelNames = structured.map((s) => s.modelName);

  let table = "## Structured Score Data\n\n";
  table += `| Criterion | ${modelNames.join(" | ")} | Avg |\n`;
  table += `| --- | ${modelNames.map(() => "---").join(" | ")} | --- |\n`;

  for (const criterion of criteriaList) {
    const scores: number[] = [];
    const cells: string[] = [];
    for (const s of structured) {
      const match = s.data.criteria.find((c) => c.name === criterion);
      const score = match?.score ?? "-";
      cells.push(String(score));
      if (typeof score === "number") scores.push(score);
    }
    const avg = scores.length > 0 ? (scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(1) : "-";
    table += `| ${criterion} | ${cells.join(" | ")} | ${avg} |\n`;
  }

  // Overall scores
  const overallScores = structured.map((s) => s.data.overallScore);
  const overallAvg = (overallScores.reduce((a, b) => a + b, 0) / overallScores.length).toFixed(1);
  table += `| **Overall** | ${overallScores.join(" | ")} | **${overallAvg}** |\n`;

  // Consensus and divergence analysis
  table += "\n### Score Divergences (>2 point gap)\n\n";
  let hasDivergence = false;
  for (const criterion of criteriaList) {
    const scores: Array<{ model: string; score: number }> = [];
    for (const s of structured) {
      const match = s.data.criteria.find((c) => c.name === criterion);
      if (match) scores.push({ model: s.modelName, score: match.score });
    }
    if (scores.length >= 2) {
      const min = Math.min(...scores.map((s) => s.score));
      const max = Math.max(...scores.map((s) => s.score));
      if (max - min > 2) {
        hasDivergence = true;
        const low = scores.filter((s) => s.score === min).map((s) => `${s.model} (${s.score})`).join(", ");
        const high = scores.filter((s) => s.score === max).map((s) => `${s.model} (${s.score})`).join(", ");
        table += `- **${criterion}**: Range ${min}-${max} — Low: ${low}; High: ${high}\n`;
      }
    }
  }
  if (!hasDivergence) table += "- No major divergences found\n";

  // Top priorities across models
  table += "\n### Priority Items Across Models\n\n";
  for (const s of structured) {
    table += `**${s.modelName}:**\n`;
    for (const p of s.data.topPriorities) {
      table += `${p.rank}. ${p.description} — *${p.impact}*\n`;
    }
    table += "\n";
  }

  return table;
}

export function streamSummary({
  scriptContent,
  evaluations,
  scriptStatus,
}: {
  scriptContent: string;
  evaluations: EvaluationInput[];
  scriptStatus?: string;
}) {
  const model = getModel("openrouter", "anthropic/claude-sonnet-4.6");

  const structuredSection = buildStructuredSection(evaluations);

  const evalsText = evaluations
    .map(
      (e) =>
        `### Evaluation from ${e.modelName}\n\n${e.result}`
    )
    .join("\n\n---\n\n");

  const content = structuredSection
    ? `${structuredSection}\n\n---\n\n## Original Script\n\n${scriptContent}\n\n## Model Evaluations (Markdown)\n\n${evalsText}\n\nPlease synthesize these evaluations into a single actionable summary. Use the structured score data above for precise comparison, and supplement with insights from the markdown evaluations.`
    : `## Original Script\n\n${scriptContent}\n\n## Model Evaluations\n\n${evalsText}\n\nPlease synthesize these evaluations into a single actionable summary.`;

  const contentWithInstruction = content + "\n\nAfter your full markdown summary, you MUST call the submit_suggestions tool with specific text edit suggestions extracted from all model evaluations. Each originalText must be an EXACT verbatim substring from the original script.";

  return streamText({
    model,
    system: MASTER_SUMMARY_PROMPT + getStatusCalibration(scriptStatus),
    messages: [
      {
        role: "user",
        content: contentWithInstruction,
      },
    ],
    tools: {
      submit_suggestions: tool({
        description:
          "Submit specific text edit suggestions for the script. Call this AFTER writing your full markdown summary. Each originalText must be an exact verbatim substring from the original script.",
        inputSchema: suggestionsToolSchema,
      }),
    },
    toolChoice: "auto",
  });
}
