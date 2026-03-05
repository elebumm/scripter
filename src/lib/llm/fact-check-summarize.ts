import { streamText, tool } from "ai";
import { getModel } from "./providers";
import { FACT_CHECK_SUMMARY_PROMPT } from "./fact-check-prompts";
import { factIssuesToolSchema } from "./fact-check-schema";
import type { FactCheckResult } from "./fact-check-schema";

interface FactCheckInput {
  modelName: string;
  result: string;
  structuredResult?: string | null;
}

function buildStructuredSection(factChecks: FactCheckInput[]): string {
  const structured: Array<{ modelName: string; data: FactCheckResult }> = [];

  for (const fc of factChecks) {
    if (fc.structuredResult) {
      try {
        const data = JSON.parse(fc.structuredResult) as FactCheckResult;
        structured.push({ modelName: fc.modelName, data });
      } catch {
        // Invalid JSON — skip
      }
    }
  }

  if (structured.length === 0) return "";

  let section = "## Structured Fact-Check Data\n\n";

  // Summary table
  section += "| Agent | Claims Found | Accuracy | Searches |\n";
  section += "| --- | --- | --- | --- |\n";
  for (const s of structured) {
    section += `| ${s.modelName} | ${s.data.claims.length} | ${s.data.overallAccuracy}% | ${s.data.searchesPerformed} |\n`;
  }

  // Claim details per agent
  section += "\n### Claims by Agent\n\n";
  for (const s of structured) {
    section += `**${s.modelName}:**\n`;
    for (const claim of s.data.claims) {
      const emoji =
        claim.verdict === "verified"
          ? "✅"
          : claim.verdict === "inaccurate"
          ? "❌"
          : claim.verdict === "misleading"
          ? "⚠️"
          : claim.verdict === "exaggeration-ok"
          ? "🎭"
          : "❓";
      section += `- ${emoji} **${claim.verdict}** (${claim.accuracy}%): "${claim.claimText.slice(0, 80)}${claim.claimText.length > 80 ? "..." : ""}"\n`;
      if (claim.correction) {
        section += `  - Correction: ${claim.correction}\n`;
      }
    }
    section += "\n";
  }

  return section;
}

export function streamFactCheckSummary({
  scriptContent,
  factChecks,
}: {
  scriptContent: string;
  factChecks: FactCheckInput[];
}) {
  const model = getModel("openrouter", "anthropic/claude-sonnet-4.6");

  const structuredSection = buildStructuredSection(factChecks);

  const checksText = factChecks
    .map((fc) => `### Fact-Check from ${fc.modelName}\n\n${fc.result}`)
    .join("\n\n---\n\n");

  const content = structuredSection
    ? `${structuredSection}\n\n---\n\n## Original Script\n\n${scriptContent}\n\n## Agent Fact-Check Results (Markdown)\n\n${checksText}\n\nPlease synthesize these fact-check results into a unified summary. Use the structured data for precise comparison.`
    : `## Original Script\n\n${scriptContent}\n\n## Agent Fact-Check Results\n\n${checksText}\n\nPlease synthesize these fact-check results into a unified summary.`;

  const contentWithInstruction =
    content +
    "\n\nAfter your full markdown summary, you MUST call the submit_fact_issues tool with the de-duplicated, merged list of ALL claims from all agents. Each claimText must be an EXACT verbatim substring from the original script.";

  return streamText({
    model,
    system: FACT_CHECK_SUMMARY_PROMPT,
    messages: [
      {
        role: "user",
        content: contentWithInstruction,
      },
    ],
    tools: {
      submit_fact_issues: tool({
        description:
          "Submit the merged, de-duplicated fact issues from all agents. Call this AFTER writing your full markdown summary. Each claimText must be an exact verbatim substring from the original script.",
        inputSchema: factIssuesToolSchema,
      }),
    },
    toolChoice: "auto",
  });
}
