import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { db } from "./index";
import path from "path";
import { eq } from "drizzle-orm";
import { evaluationProfiles, scripts } from "./schema";

function getMigrationsFolder(): string {
  // In packaged Electron app, migrations are bundled alongside the app
  try {
    const { app } = require("electron");
    if (app && !app.isPackaged === false) {
      // In asar, resources are at process.resourcesPath
      const resourcesPath = (process as NodeJS.Process & { resourcesPath?: string }).resourcesPath;
      if (resourcesPath) {
        const asarPath = path.join(resourcesPath, "drizzle");
        const fs = require("fs");
        if (fs.existsSync(asarPath)) return asarPath;
      }
    }
  } catch {
    // Not in Electron
  }

  return path.join(process.cwd(), "drizzle");
}

export function runMigrations() {
  migrate(db, { migrationsFolder: getMigrationsFolder() });
}

const DEFAULT_SYSTEM_PROMPT = `# YouTube Script Evaluator — System Prompt

You are a script evaluator for a tech YouTube channel that produces documentary-style long-form videos (20-25 minutes). Your job is to evaluate draft scripts and provide actionable, honest feedback.

## About the Channel

The creator makes story-driven documentaries about technology. These are NOT tutorials, NOT video essays, NOT listicles. They are narratives — closer to a documentary film than a typical YouTube tech video. The channel's competitive advantage is storytelling, not information density.

Videos that perform well on this channel share these traits:
- A central human character whose decisions drive the story forward
- Escalating stakes where each section raises new tension before resolving the previous one
- Technical concepts explained *inside the action*, not as standalone lessons
- Comedy and personality woven into the narration — the tone is a curious enthusiast, not a lecturer
- Philosophical themes that emerge naturally from events rather than being explicitly stated
- A closing that recontextualizes the entire story rather than summarizing it

## Evaluation Criteria

Score each criterion from 1-10. Provide a 2-3 sentence justification for each score. Be honest — a 7 is a good score. Reserve 9-10 for genuinely exceptional work. Do not inflate scores to be nice.

### 1. Hook & Opening (0:00 - 2:00)
Does the first 60-90 seconds create genuine curiosity? Would a viewer who clicked on this thumbnail stay past the first minute? A strong hook poses a question the viewer didn't know they had, or presents a contrast that feels surprising. A weak hook front-loads information the viewer hasn't been given a reason to care about yet.

### 2. Story Engine
Every strong video has an engine — a repeating mechanism that generates forward momentum. In a problem-chain video, the engine is "solution creates new problem." In a character-driven video, the engine is "decision leads to consequence." Does this script have a clear engine? Does it stall at any point? Specifically flag any section longer than 90 seconds that doesn't contain an event, decision, revelation, or escalation.

### 3. Character & Humanity
Are the people in this story rendered as humans or as vehicles for information? Look for: specific details that make characters feel real (not just their job title), moments of vulnerability or failure, comedy that comes from character rather than from jokes inserted by the writer. Flag any section where a character is being praised without complication for more than 30 seconds — audiences distrust hagiography.

### 4. Technical Clarity
When the script explains a technical concept, does it do so inside the story or does it pause the narrative to teach? The best tech explanations in this format feel like you're learning something *because* you need to understand it to follow what happens next. Flag any explanation that could be cut without losing story coherence — that's a sign it's exposition, not narrative.

### 5. Pacing & Rhythm
Read the script out loud (or simulate doing so). Does it have variation — fast sections and slow sections, dense sections and breathing room? Are there any runs of 2+ minutes that maintain the same energy level without a shift? Flag sections where the script feels like it's "listing" things (deployments, features, accomplishments) rather than *moving* through events. Also flag any place where the script feels like it's wrapping up but isn't actually ending — false endings kill retention.

### 6. Thematic Coherence
Does the script have a clear thematic throughline, and does it trust the audience to identify it? The best documentaries plant themes early and pay them off later without ever explicitly stating "this is the theme." Flag any moment where the script explains its own point — e.g., "and this is why X matters" or "the irony here is..." The audience should feel the irony, not be told about it.

### 7. Tone & Voice
Does this sound like a specific person talking, or could it have been written by anyone? The channel's voice is: conversational but not sloppy, enthusiastic but not performative, opinionated but fair. It uses sentence fragments for rhythm. It uses comedy as a pacing tool, not as a crutch. Flag any line that sounds generic, overly formal, or like it came from a Wikipedia article.

### 8. Visual Direction
A YouTube script is not just words — it's a blueprint for a video. Does the script give enough visual direction that an editor could build the video without guessing? Are there visual cues during the most important moments? Specifically check: are the final 25% of the script's visual directions as detailed as the first 25%? Scripts often front-load visual cues and go dark in the back half.

### 9. Ending & Payoff
Does the ending recontextualize the story or just summarize it? A great ending makes the viewer rethink something from earlier in the video. A weak ending restates the thesis or trails off. Also evaluate: does the script have a natural place for a call to action that doesn't feel bolted on? The CTA should feel like part of the video's voice, not a contractual obligation.

### 10. Intellectual Honesty
Does the script present a fair picture, or does it have a bias it isn't acknowledging? Are there counterarguments or complications that are being glossed over? Does the script make any claims that feel unverified or exaggerated? Would an expert in this subject watch this video and feel it was fair? This is the most important criterion for long-term channel credibility.

## Rules

- Do not be sycophantic. The creator wants honest feedback, not encouragement.
- Do not suggest adding content that would make the video longer unless something is genuinely missing. YouTube scripts almost always need trimming, not expansion.
- Do not suggest structural changes just to demonstrate you have opinions. Only flag structural issues if they would cause a viewer to click away.
- Judge the script as a *video*, not as a *document*. Things that look odd on paper (sentence fragments, abrupt cuts, incomplete thoughts) may be deliberate pacing choices that work when spoken aloud.
- When you identify a problem, suggest a fix. "This section is slow" is not useful. "This section is slow because it explains X before the audience has a reason to care — move it after Y" is useful.
- If you are unsure whether something is a problem or a stylistic choice, say so. Don't penalize ambiguity.
- The overall score is NOT an average of the individual scores. It is your holistic assessment of whether this script would perform well as a published YouTube video on this channel.`;

const DEFAULT_CRITERIA_WEIGHTS = JSON.stringify({
  "Hook & Opening": 9,
  "Story Engine": 9,
  "Character & Humanity": 8,
  "Technical Clarity": 7,
  "Pacing & Rhythm": 8,
  "Thematic Coherence": 7,
  "Tone & Voice": 8,
  "Visual Direction": 6,
  "Ending & Payoff": 8,
  "Intellectual Honesty": 8,
});

export function seedDefaults() {
  const existing = db.select().from(evaluationProfiles).all();

  // Migrate existing "First Draft Review" to new default profile
  const oldDefault = existing.find((p) => p.name === "First Draft Review");
  if (oldDefault) {
    db.update(evaluationProfiles)
      .set({
        name: "Default Profile",
        systemPrompt: DEFAULT_SYSTEM_PROMPT,
        criteriaWeights: DEFAULT_CRITERIA_WEIGHTS,
      })
      .where(eq(evaluationProfiles.id, oldDefault.id))
      .run();
  }

  // Always try to seed templates (idempotent — checks for existing)
  seedTemplates();

  if (existing.length > 0) return;

  db.insert(evaluationProfiles)
    .values([
      {
        name: "Default Profile",
        systemPrompt: DEFAULT_SYSTEM_PROMPT,
        criteriaWeights: DEFAULT_CRITERIA_WEIGHTS,
        isDefault: true,
      },
      {
        name: "Final Polish",
        systemPrompt: `You are a meticulous video script editor doing a final polish review. The script is nearly done — focus on:
- Word-level precision and economy
- Transition smoothness between sections
- Redundancy elimination
- Rhythm and cadence of spoken delivery
- Any remaining awkward phrasing
- CTA strength and placement

Be very specific. Quote exact phrases that need changing and provide exact replacements. Use callout blocks for suggestions.`,
        criteriaWeights: JSON.stringify({
          "Clarity & Conciseness": 10,
          "Pacing & Rhythm": 9,
          "Tone & Voice": 8,
          "Structure & Flow": 7,
          "Engagement & Retention": 6,
        }),
        isDefault: false,
      },
      {
        name: "Pacing Check Only",
        systemPrompt: `You are a video pacing specialist. Analyze ONLY the pacing and rhythm of this script. Ignore content quality — focus entirely on:
- Section length balance
- Transition timing
- Density of information per section
- Breathing room and pauses
- Hook-to-content ratio
- Estimated spoken timing per section

Provide a section-by-section timing breakdown and flag any sections that feel too dense, too sparse, or awkwardly transitioned.`,
        criteriaWeights: JSON.stringify({
          "Pacing & Rhythm": 10,
          "Structure & Flow": 8,
        }),
        isDefault: false,
      },
    ])
    .run();
}

function seedTemplates() {
  const existing = db
    .select()
    .from(scripts)
    .where(eq(scripts.isTemplate, true))
    .all();
  if (existing.length > 0) return;

  const { createScript } = require("./queries/scripts");

  createScript("YouTube Short", `# [Title]

## Hook (0:00 - 0:15)
<!-- Open with a bold claim, surprising fact, or visual punch. You have ~5 seconds before they scroll. -->

> [Insert hook — one sentence that creates instant curiosity]

## Single Takeaway (0:15 - 0:45)
<!-- ONE idea. Not two. Not three. Develop it with a concrete example or quick story. -->



## Payoff & CTA (0:45 - 1:00)
<!-- Deliver the insight. End with a line worth replaying. -->


`, {
    context: "Short-form vertical video (~60 seconds). Hook-heavy, single takeaway format.",
    targetLength: 150,
    isTemplate: true,
    templateDescription: "Hook-heavy short-form video (~60s). One takeaway, punchy delivery.",
  });

  createScript("Long-form Video", `# [Title]

## Cold Open (0:00 - 1:30)
<!-- Drop the viewer into the middle of the story. No context. Make them need to understand what happens next. -->

> [Insert cold open — a moment of tension, surprise, or mystery]

---

## Act I — Setup (1:30 - 7:00)
<!-- Introduce the central character/situation. Establish what's normal before you break it. -->

### The World Before
<!-- Who is the character? What do they want? What's the status quo? -->



### The Inciting Event
<!-- What disrupts the status quo? What decision or event sets the story in motion? -->



---

## Act II — Escalation (7:00 - 17:00)
<!-- The engine of the video. Each section should raise new tension before resolving the previous one. -->

### First Consequence
<!-- What happens as a result of the inciting event? -->



### Complication
<!-- What makes the problem harder or more interesting than expected? -->



### Turning Point
<!-- A revelation, failure, or decision that changes the trajectory. -->



---

## Act III — Resolution (17:00 - 22:00)
<!-- Pay off the promises made in the setup. Recontextualize, don't just summarize. -->

### Climax
<!-- The decisive moment. Maximum tension. -->



### Denouement
<!-- What does the resolution mean? What's different now? -->



---

## Closing (22:00 - 24:00)
<!-- Reframe the entire story with a final thought. Don't summarize — recontextualize. -->

> [Insert closing line that makes the viewer rethink something from earlier]

<!-- CTA woven naturally into the closing voice -->
`, {
    context: "Documentary-style long-form YouTube video (20-25 min). Story-driven, 3-act structure.",
    targetLength: 3000,
    isTemplate: true,
    templateDescription: "Full documentary-style video (20-25 min). Cold open, 3-act story structure, CTA.",
  });

  createScript("Podcast Script", `# [Episode Title]

## Pre-Roll / Intro (0:00 - 2:00)
<!-- Casual intro. Set the tone. Tease the topic without giving away the punchline. -->

Hey everyone, welcome back to [Show Name]. Today we're talking about...



---

## Segment 1: The Setup (~5-8 min)
<!-- Lay the groundwork. What's the topic and why should the listener care right now? -->

### Context



### Key Question
<!-- Frame the discussion around a central question the episode will explore. -->



---

## Segment 2: Deep Dive (~8-12 min)
<!-- The meat of the episode. Explore multiple angles, bring in examples. -->

### Angle 1



### Angle 2



### [If interview format] Guest Questions
<!-- Prepare 3-5 open-ended questions that push past surface-level answers. -->

1.
2.
3.

---

## Segment 3: Synthesis (~5-8 min)
<!-- Pull threads together. What's the takeaway? Where do you land on the key question? -->



---

## Outro (1-2 min)
<!-- Wrap up naturally. CTA for subscribe/review. Tease next episode if applicable. -->

`, {
    context: "Podcast episode (~30-45 min spoken). Conversational tone with interview prompts.",
    targetLength: 2000,
    isTemplate: true,
    templateDescription: "Conversational podcast episode (~30-45 min). Interview prompts and discussion segments.",
  });

  createScript("Tutorial / How-To", `# [Tutorial Title]

## Intro — What We're Building (0:00 - 1:30)
<!-- Show the finished result first. Let the viewer decide if this is worth their time. -->

> [Screenshot/demo description of final result]

By the end of this video, you'll know how to...



---

## Prerequisites
<!-- List what the viewer needs before starting. Keep it minimal. -->

- [ ]
- [ ]

---

## Step 1: [Action Name]
<!-- Each step = one clear action. Start with what to do, then explain why. -->

<!-- VISUAL CUE: [Describe what should be on screen] -->



### What's happening here
<!-- Brief explanation of the concept behind this step. Keep it inside the action. -->



---

## Step 2: [Action Name]

<!-- VISUAL CUE: [Describe what should be on screen] -->



---

## Step 3: [Action Name]

<!-- VISUAL CUE: [Describe what should be on screen] -->



---

## Step 4: [Action Name]

<!-- VISUAL CUE: [Describe what should be on screen] -->



---

## Common Mistakes / Troubleshooting
<!-- Anticipate where viewers will get stuck. 2-3 common issues max. -->

1. **[Mistake]** — [How to fix]
2. **[Mistake]** — [How to fix]

---

## Recap & Next Steps
<!-- Quick recap of what was built. Point to natural next learning step. -->

> [Show final result again]

`, {
    context: "Step-by-step tutorial video (~10-15 min). Visual cue markers for editor. Clear numbered steps.",
    targetLength: 1500,
    isTemplate: true,
    templateDescription: "Step-by-step tutorial (~10-15 min). Numbered steps with visual cue markers.",
  });
}
