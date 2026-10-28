// The scoring rubric shared by every council lens. Criterion ids are an enum
// in the output schema, so model output can't drift into free-text names.

export const CRITERIA = [
  { id: "hook", label: "Hook & Opening", lookFor: "Does the opening create genuine curiosity and a promise the video keeps? Surprising contrast, a question the viewer didn't know they had, stakes before information." },
  { id: "story-engine", label: "Story Engine", lookFor: "Is there a repeating mechanism (decision → consequence, solution → new problem) that pulls the viewer forward? Flag stretches with no event, decision, revelation or escalation." },
  { id: "humanity", label: "Character & Humanity", lookFor: "Are people rendered as humans with specific details, failures and stakes, not as vehicles for information or uncomplicated heroes?" },
  { id: "clarity", label: "Technical Clarity", lookFor: "Are complex ideas explained accurately and accessibly, inside the action rather than as standalone lessons? Jargon handled, no misleading oversimplification." },
  { id: "pacing", label: "Pacing & Rhythm", lookFor: "Does momentum hold? Breathing room after dense passages, varied sentence rhythm, no long monotone stretches." },
  { id: "coherence", label: "Thematic Coherence", lookFor: "Does every section serve the central thread? Tangents, sections that could be cut without loss, themes emerging from events rather than stated." },
  { id: "voice", label: "Tone & Voice", lookFor: "Does it sound like one curious, funny, specific person talking, consistently? No corporate register, no jarring shifts." },
  { id: "visuals", label: "Visual Direction", lookFor: "Are there moments that clearly call for B-roll, graphics or on-screen elements, and are cues placed where the viewer needs them?" },
  { id: "ending", label: "Ending & Payoff", lookFor: "Does the ending pay off the opening's promise and recontextualise the story rather than summarise it?" },
  { id: "honesty", label: "Intellectual Honesty", lookFor: "Nuance, limits acknowledged, counterpoints addressed, claims backed by the content, no clickbait the video doesn't earn." },
] as const;

export type CriterionId = (typeof CRITERIA)[number]["id"];

export const CRITERIA_IDS = CRITERIA.map((c) => c.id) as unknown as readonly [CriterionId, ...CriterionId[]];

export function criterionLabel(id: string): string {
  return CRITERIA.find((c) => c.id === id)?.label ?? id;
}

export const SCORE_ANCHORS = `| Score | Meaning |
|---|---|
| 9-10 | Exceptional: publishable as-is for this channel. Rare; justify it with a specific passage. |
| 7-8 | Strong: works, with specific improvements available. A 7 is a good score. |
| 5-6 | Average: works but has clear weaknesses a viewer would feel. |
| 3-4 | Below average: significant issues that undermine the video. |
| 1-2 | Poor: needs a fundamental rethink. |

The overall score is your holistic judgement of the whole video, NOT an average of the criteria. Score the text as written today; do not reward effort or improvement since a previous draft.`;

export type CriteriaWeights = Partial<Record<CriterionId, number>>;

/** Render the rubric for a prompt, marking the persona's heavier criteria. */
export function renderRubric(weights: CriteriaWeights = {}): string {
  const lines = CRITERIA.map((c) => {
    const w = weights[c.id];
    const emphasis = w && w > 1 ? " (weigh this heavily)" : w && w < 1 ? " (lighter weight for you)" : "";
    return `- **${c.id}** — ${c.label}${emphasis}: ${c.lookFor}`;
  });
  return `${lines.join("\n")}\n\n${SCORE_ANCHORS}`;
}

/** Legacy evaluations used free-text names; map them onto ids for history views. */
export function normalizeLegacyCriterionName(name: string): CriterionId | null {
  const n = name.toLowerCase();
  if (n.includes("hook") || n.includes("opening")) return "hook";
  if (n.includes("engine") || n.includes("story")) return "story-engine";
  if (n.includes("character") || n.includes("human")) return "humanity";
  if (n.includes("clarity") || n.includes("technical")) return "clarity";
  if (n.includes("pacing") || n.includes("rhythm")) return "pacing";
  if (n.includes("theme") || n.includes("thematic") || n.includes("coheren")) return "coherence";
  if (n.includes("tone") || n.includes("voice")) return "voice";
  if (n.includes("visual")) return "visuals";
  if (n.includes("ending") || n.includes("payoff")) return "ending";
  if (n.includes("honest")) return "honesty";
  return null;
}
