const DEFAULT_CRITERIA = [
  "Hook & Opening",
  "Story Engine",
  "Character & Humanity",
  "Technical Clarity",
  "Pacing & Rhythm",
  "Thematic Coherence",
  "Tone & Voice",
  "Visual Direction",
  "Ending & Payoff",
  "Intellectual Honesty",
];

function getStatusCalibration(scriptStatus?: string): string {
  if (scriptStatus === "draft" || scriptStatus === "in-progress") {
    const label = scriptStatus === "draft" ? "DRAFT" : "WORK IN PROGRESS";
    return `\n\n## Script Status: ${label}

This script is not yet complete. Adjust your evaluation accordingly:
- Focus on direction, structure, and potential rather than polish
- Don't penalize missing sections, placeholder text, or incomplete endings
- Score based on the quality of what IS written, not what's missing
- Prioritize feedback that helps the author develop the strongest parts further
- Note structural gaps as "areas to develop" rather than flaws\n`;
  }
  return "";
}

export function buildEvalPrompt(
  systemPrompt: string | undefined,
  criteriaWeights?: Record<string, number>,
  scriptStatus?: string
): string {
  if (systemPrompt) return systemPrompt + getStatusCalibration(scriptStatus);

  const criteria = DEFAULT_CRITERIA.map((c) => {
    const weight = criteriaWeights?.[c];
    return weight ? `- ${c} (weight: ${weight}/10)` : `- ${c}`;
  }).join("\n");

  return `You are an expert video script evaluator. Analyze the provided script and give concise, actionable feedback.

Evaluate on these criteria:
${criteria}

## Response Format

Be BRIEF. For each criterion, write 1-2 sentences max — a score and the key observation. Use this format:

### Criterion Name: X/10
One sentence on what works or doesn't. One concrete fix if needed.

End with:
### Overall: X/10
Top 3 priority fixes (one line each).

Keep your entire response under 400 words. The detailed data goes in the tool call, not the markdown.

After your markdown, you MUST call the submit_evaluation tool with your structured scores and feedback. Include every criterion, numerical scores, and top 3 priorities.` + getStatusCalibration(scriptStatus);
}

export function buildSectionPrompt(
  section: string,
  fullScript: string,
  systemPrompt?: string
): string {
  const basePrompt =
    systemPrompt ||
    `You are an expert video script evaluator. Focus your analysis on the selected section while considering the full script context.`;

  return `${basePrompt}

## Full Script Context
${fullScript}

## Section to Evaluate
The user has selected the following section for focused evaluation:

---
${section}
---

Provide detailed feedback specifically on this section. Consider how it fits within the overall script flow. Use markdown formatting with callout blocks for key insights.`;
}

export { getStatusCalibration };

export function formatPriorFeedback(
  priorResult: string,
  structuredResult?: string | null
): string {
  let feedbackBlock = "";

  if (structuredResult) {
    try {
      const data = JSON.parse(structuredResult);
      // Build compact score table from structured data
      const scores: string[] = [];
      if (data.criteria && Array.isArray(data.criteria)) {
        for (const c of data.criteria) {
          scores.push(`- ${c.name}: ${c.score}/10`);
        }
      }
      if (data.overallScore !== undefined) {
        scores.push(`- **Overall: ${data.overallScore}/10**`);
      }
      feedbackBlock += scores.join("\n");

      // Add top priorities
      if (data.priorities && Array.isArray(data.priorities) && data.priorities.length > 0) {
        feedbackBlock += "\n\nTop priorities from previous review:\n";
        for (const p of data.priorities.slice(0, 5)) {
          feedbackBlock += `- ${p}\n`;
        }
      }
    } catch {
      // Invalid JSON — fall back to raw markdown
      feedbackBlock = priorResult.slice(0, 1500);
      if (priorResult.length > 1500) {
        feedbackBlock += "\n\n*(abbreviated)*";
      }
    }
  } else {
    feedbackBlock = priorResult.slice(0, 1500);
    if (priorResult.length > 1500) {
      feedbackBlock += "\n\n*(abbreviated)*";
    }
  }

  return `\n\n## Previous Evaluation Feedback (from your prior review of this script)\n\n${feedbackBlock}\n\nWhen evaluating, explicitly note:\n- Which issues from your previous feedback have been addressed\n- Which issues remain unresolved\n- Any new issues introduced since the last version`;
}

export const MASTER_SUMMARY_PROMPT = `You are a master script evaluation synthesizer. You have received evaluations of a video script from multiple AI models, including structured score data when available.

## Your Job

1. **Compare Scores Directly**: When structured scores are provided, compare numerical ratings per criterion across models. Note where models agree (scores within 1-2 points) and where they diverge (>2 point gap).
2. **Identify Consensus**: What do the majority of models agree on? Reference specific score counts (e.g., "4 out of 5 models scored Hook below 7").
3. **Flag Contradictions**: Where do models significantly disagree? Present the score spread and both perspectives, then give your recommendation.
4. **Prioritize Actions**: Create a ranked list of the most impactful changes, weighing frequency across model priorities and score severity.
5. **Synthesize Scores**: Present a score comparison table showing each model's score per criterion, plus the average.

## Input Format

You may receive:
- **Structured data** (JSON with scores per criterion, overall score, and priorities) — use this for precise comparison
- **Raw markdown** (free-form evaluation text) — extract insights qualitatively when structured data is unavailable

## Output Format

Format your response in markdown with clear sections:
- ## Score Comparison (table of criterion x model scores, with averages)
- ## Consensus Points (backed by score data)
- ## Contradictions & Recommendations (note the score spread)
- ## Priority Action Items (numbered, most impactful first, with score-based justification)
- ## Overall Assessment (with averaged overall score)

Use callout blocks:
- > [!tip] for consensus strengths (high scores across models)
- > [!warning] for consensus weaknesses (low scores across models)
- > [!info] for contradictions (divergent scores)
- > [!example] for top-priority rewrites

Be concise but thorough. Focus on actionable, specific feedback backed by data.

## Script Edit Suggestions

After writing your full markdown summary, you MUST call the submit_suggestions tool with specific text edit suggestions extracted from all model evaluations. Guidelines:

- **originalText**: Quote EXACT text from the original script — verbatim, case-sensitive, including all punctuation and whitespace. Copy-paste directly from the script. Include enough surrounding context to uniquely identify the location.
- **suggestedText**: Provide the improved replacement text.
- **reasoning**: 1-2 sentences explaining why this change improves the script.
- **priority**: high = critical fix that significantly impacts quality, medium = notable improvement, low = minor polish.
- **category**: Match the evaluation area (hook, clarity, pacing, engagement, structure, tone, cta, visual-cues, other).
- **sourceModels**: List which models' feedback supports each suggestion.
- Aim for 5-10 suggestions, prioritized by impact.
- Focus on content improvements (wording, structure, flow), not markdown formatting.
- Each suggestion should be a self-contained edit — applying one should not break others.`;
