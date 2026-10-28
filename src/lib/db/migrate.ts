import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import type Database from "better-sqlite3";
import { db, getSqlite } from "./index";
import path from "path";
import { and, eq, isNotNull, isNull } from "drizzle-orm";
import { evaluationProfiles, scripts, scriptVersions } from "./schema";
import { PERSONA_SEEDS } from "@/lib/llm/personas";
import { countSpokenWords } from "@/lib/utils/reading-time";

export function defaultMigrationsFolder(): string {
  return path.join(process.cwd(), "drizzle");
}

/**
 * Apply pending drizzle migrations with foreign keys OFF.
 *
 * drizzle runs every pending migration inside one BEGIN/COMMIT, and SQLite
 * ignores `PRAGMA foreign_keys` inside a transaction, so the
 * `PRAGMA foreign_keys=OFF` that drizzle-kit writes around a table rebuild is
 * a no-op there. With foreign keys on, the rebuild's `DROP TABLE` would
 * cascade-delete every child row (all versions, notes, evaluations...). The
 * pragma is therefore switched here, outside drizzle's transaction.
 */
export function runMigrations(migrationsFolder: string = defaultMigrationsFolder()) {
  const sqlite = getSqlite();
  sqlite.pragma("foreign_keys = OFF");
  try {
    if (sqlite.pragma("foreign_keys", { simple: true }) !== 0) {
      throw new Error("[db] couldn't switch foreign keys off (open transaction?); refusing to migrate");
    }
    const appliedBefore = appliedMigrationCount(sqlite);
    migrate(db, { migrationsFolder });
    // Nothing applied: any violation predates this run, so don't blame a migration.
    if (appliedMigrationCount(sqlite) === appliedBefore) return;
    // The migration has committed by now, so this reports rather than
    // prevents; the pre-migration snapshot is the way back.
    const violations = sqlite.pragma("foreign_key_check") as unknown[];
    if (violations.length > 0) {
      console.error(
        `[db] ${violations.length} foreign key violation(s) after migrating. ` +
          "The pre-migration snapshot under backups/pre-migration holds the earlier state.",
        violations.slice(0, 20)
      );
    }
  } finally {
    sqlite.pragma("foreign_keys = ON");
  }
}

function appliedMigrationCount(sqlite: Database.Database): number {
  const hasTable = sqlite
    .prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = '__drizzle_migrations'")
    .get();
  return hasTable ? (sqlite.prepare("SELECT count(*) AS n FROM __drizzle_migrations").get() as { n: number }).n : 0;
}

/**
 * Idempotent seed run on every startup:
 * - council personas, inserted by slug when missing (never overwritten: the
 *   writer edits them in Settings);
 * - legacy profiles (no slug) are kept for history but switched off;
 * - script templates, once.
 * The channel context that used to live in the "Default Profile" prompt is
 * now CHANNEL_CONTEXT in src/lib/llm/prompts.ts.
 */
export function seedDefaults() {
  seedPersonas();
  deactivateLegacyProfiles();
  seedTemplates();
}

function seedPersonas() {
  const existing = new Set(
    db
      .select({ slug: evaluationProfiles.slug })
      .from(evaluationProfiles)
      .where(isNotNull(evaluationProfiles.slug))
      .all()
      .map((r) => r.slug)
  );
  const missing = PERSONA_SEEDS.filter((p) => !existing.has(p.slug));
  if (missing.length === 0) return;
  db.insert(evaluationProfiles)
    .values(
      missing.map((p) => ({
        slug: p.slug,
        name: p.name,
        description: p.description,
        systemPrompt: p.systemPrompt,
        criteriaWeights: JSON.stringify(p.criteriaWeights),
        modelId: p.modelSlug,
        icon: p.icon,
        color: p.color,
        position: p.position,
        isActive: true,
        isDefault: false,
      }))
    )
    .onConflictDoNothing({ target: evaluationProfiles.slug })
    .run();
}

function deactivateLegacyProfiles() {
  db.update(evaluationProfiles)
    .set({ isActive: false })
    .where(and(isNull(evaluationProfiles.slug), eq(evaluationProfiles.isActive, true)))
    .run();
}

function insertTemplate(
  title: string,
  content: string,
  options: { context: string; targetLength: number; templateDescription: string }
) {
  const wordCount = countSpokenWords(content);
  db.transaction((tx) => {
    const script = tx
      .insert(scripts)
      .values({
        title,
        currentVersion: 1,
        context: options.context,
        targetLength: options.targetLength,
        isTemplate: true,
        templateDescription: options.templateDescription,
      })
      .returning()
      .get();
    tx.insert(scriptVersions).values({ scriptId: script.id, version: 1, content, wordCount }).run();
  });
}

function seedTemplates() {
  const existing = db
    .select({ id: scripts.id })
    .from(scripts)
    .where(eq(scripts.isTemplate, true))
    .limit(1)
    .all();
  if (existing.length > 0) return;

  insertTemplate("YouTube Short", `# [Title]

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
    templateDescription: "Hook-heavy short-form video (~60s). One takeaway, punchy delivery.",
  });

  insertTemplate("Long-form Video", `# [Title]

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
    templateDescription: "Full documentary-style video (20-25 min). Cold open, 3-act story structure, CTA.",
  });

  insertTemplate("Podcast Script", `# [Episode Title]

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
    templateDescription: "Conversational podcast episode (~30-45 min). Interview prompts and discussion segments.",
  });

  insertTemplate("Tutorial / How-To", `# [Tutorial Title]

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
    templateDescription: "Step-by-step tutorial (~10-15 min). Numbered steps with visual cue markers.",
  });
}
