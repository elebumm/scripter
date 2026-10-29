# Scripter

A local, single-user web app for writing long-form video scripts in your own words. A council of AI "lenses" (persona prompt + model) reads a saved version in parallel, scores it against a shared rubric and leaves anchored notes; a synthesizer merges them. Beats plan what each part of the video must do, and a grounded fact-check reports what web sources say about the script's claims.

## Product principle: "Your words only" (non-negotiable)

AI never writes, inserts or replaces script text. There is no Accept / Apply / Rewrite anywhere.

- Allowed AI output: **Beats** (structural plan items), **Notes** (anchored diagnoses of the writer's own text, optionally a question), **Fact notes** (claim + verdict + what sources say + source URLs), **Synthesis** (prose summary shown in the panel, never inserted).
- Prompts, zod schemas, server validation and UI all enforce it. Server side, every AI text field shown to the writer (stored or streamed) goes through `stripSuppliedWording(text, scriptKey, { partial? })` / `isTooThin()` in `src/lib/guard/wording.ts`, and items left too thin are dropped. It strips:
  - quoted spans that aren't the writer's text: any quote style, backticks, capitalised italics, bold right after a cue, `[CUE: …]` brackets, blockquotes, fenced code. 4+ words, or any length right after a cue. A quote that never closes counts too (after a cue, or a capitalised run of 4+ words).
  - the clause after a lead-in cue: `Try:`, `Open with:`, `Something like:`, `Suggestion:` / `Better:` / `Example:` labels, `e.g. <Sentence>`, `Rewrite it as …`, `you could say …`, a `> [!example] **Suggested rewrite**` block body.
  - It keeps diagnosis: structural advice ("open with *the reveal*", "rewrite it to be shorter", "try saying it out loud"), what the draft does ("you never say who …"), questions, and the writer's own words quoted with punctuation, case, dash, number or `[cue]` drift or `…` elisions (compared word by word).
  - `scriptKey` is `matchKey(script)`; the council routes add the brief (`script.context`), the beats code adds writer beats and writer notes. Streamed partials pass `{ partial: true }` for the one field still growing, which also hides an unclosed quote, emphasis or cue clause until it closes. Text with nothing stripped comes back unchanged (trimmed), markdown structure included.
- Anchors and claims must quote the script: server code stores `resolveAnchor(markdown, anchor)` (`src/lib/text/anchor.ts`), the writer's own text as the editor shows it (a slice of `markdownToPlain`), never the model's string. It returns null, and the item is dropped, when the anchor doesn't quote the script or is too short (`isUsableAnchor`: 2+ words and 3 words or 12 characters).
- The writer can always edit beats (an edited AI beat becomes a writer beat), restore an older version (their own words), and resolve or dismiss notes.

## Tech Stack

- **Framework**: Next.js 16 (App Router, Turbopack, `reactCompiler: true`), React 19, TypeScript. Web app only (no Electron).
- **UI**: shadcn/ui primitives (radix-ui), Tailwind CSS v4, `lucide-react` icons (`@phosphor-icons/react` only in `ScriptIcon`). Light theme only. Fonts: Cabinet Grotesk, Switzer (local), Inter.
- **Editor**: Tiptap 3 (`@tiptap/react` + `@tiptap/markdown`) WYSIWYG, plain `<textarea>` for markdown mode.
- **Markdown rendering**: `react-markdown` + `remark-gfm` + an in-file callout plugin (`MarkdownPreview.tsx`). No `rehype-raw`: raw HTML is never interpreted.
- **AI**: Vercel AI SDK v6 (`ai`) with `@openrouter/ai-sdk-provider`; structured output via `Output.object`, streamed to the client as NDJSON.
- **Database**: SQLite via `drizzle-orm` + `better-sqlite3`, default `data/scripter.db`.
- **State**: `zustand` with `persist` (editor mode + words per minute only).
- **Tests**: Vitest 5 (`npm test`), Node environment, tests next to the code as `*.test.ts(x)`.

## Common Commands

```bash
npm run dev               # next dev -H 127.0.0.1 (open http://127.0.0.1:3000)
npm run build             # production build (Turbopack)
npm start                 # next start -H 127.0.0.1
npm test                  # vitest run
npx tsc --noEmit          # type-check
npx eslint src scripts    # lint (react-hooks compiler rules are on)
npx drizzle-kit generate  # new migration from schema changes
npm run db:seed-local     # copy the newest backup snapshot into ./data/scripter.db (only if it doesn't exist; refuses leftover -wal/-shm/-journal files)
node scripts/roundtrip-check.mjs [db]   # editor markdown round-trip against every stored version (read-only): backslashes added, callouts kept, keptInMarkdownMode
```

## Environment

```
OPENROUTER_API_KEY=sk-or-...        # required for AI features; one key for every model
SCRIPTER_DB_PATH=...                # optional DB file override (also used by drizzle.config.ts and tests)
SCRIPTER_BACKUP_DIR=...             # optional backups root; each DB gets <dir>/<dbname>-<hash8>/ (default <db folder>/backups, unscoped)
SCRIPTER_BACKUP_SOURCE=...          # db:seed-local source folder (default C:\Users\lewis\scripter\data\backups)
```

Settings shows only whether the key is set, never the key.

## Architecture

### Council run

```
Ctrl/Cmd+Enter or "Consult the council"
  -> POST /api/scripts/:id/versions {content}         immutable version (deduped: same text returns the latest)
  -> client makes a runId, then per active persona, in parallel:
     POST /api/council/critique {scriptId, versionId, personaId, runId, sectionOnly?}
        server loads content + persona + model from the DB (never trusts client content/model ids),
        streams Output.object(personaCritiqueSchema) as NDJSON partials, guards the result,
        persists an evaluations row (run_id, persona_id, tokens, cost, duration, status, real error message)
  -> when every lens settles (>= 1 success):
     POST /api/council/synthesize {scriptId, versionId, runId}
        score table computed server-side from the critiques (never by the model),
        model writes overview + merged notes; notes validated (anchor resolves, wording guard, no repeat of
        any dismissal, inside the section for a section review),
        open notes carried over / addressed / superseded, summary row persisted (is_master_summary, structured_result = Synthesis)
  -> client refreshes notes; SynthesisPanel shows the result
```

- Guards: `guardCritique` (one score per criterion, `criteriaMissing` in meta; lens notes repeating a dismissal dropped), `validateSynthesisNotes` (drop reasons `anchor | section | wording | duplicate | dismissed`). Dismissals are read after the stream ends, all of them (prompts list only the newest 40). Legacy critiques are guarded on read (`guardLegacyCritique`: rewrite callouts and labels removed).
- Carry-over: when a pass drops notes as `anchor` or `wording`, an earlier open note is replaced only by a saved note on the same passage; the rest stay open (`plan.kept`). `Synthesis.noteReport {saved, dropped, dropReasons, previousKept}` is saved and the panel shows a notice for unexpected drops (duplicates and out-of-section drops don't count).
- Retry synthesis: when the synthesis fails or is stopped, `useCouncil.retrySynthesis()` re-synthesizes the same runId without re-running lenses (panel, roster, or History "Synthesize this run" for the newest run with no saved synthesis). A synthesis folds the cost of the run's earlier attempts into its row and deletes them.
- Cost: `callCostUsd` (models.ts) uses OpenRouter's reported charge from `providerMetadata` when sent, else the list price. A call that ran but produced no valid object (e.g. cut off, "The model ran out of output room before it finished") still records its tokens and cost.
- On open: `GET /api/council/latest` (newest saved whole-script synthesis; else the newest pre-refresh review rebuilt from its critiques, `summaryId: 0`, empty overview; else a section review; else null) and `GET /api/notes` (notes on the version the latest pass with a saved synthesis reviewed, or a newer version that has notes; addressed notes only while they're news; the client computes `isStale` by anchor lookup).
- Section review ("Selected section"): `sectionOnly` (at most 20,000 chars, `MAX_SECTION_CHARS` in `useCouncil.ts`, pinned to the route by a test) is stored; such runs are excluded from trends and from "issues raised last time", and the server drops their notes outside the section.
- History and trends: `GET /api/council/runs?scriptId[&runId]`, `GET /api/council/trends`. Legacy rows (`run_id IS NULL`) are grouped by version as `legacy-<versionId>` runs and parsed tolerantly.
- Personas = `evaluation_profiles` rows with a `slug` (5 seeded idempotently in `migrate.ts` from `src/lib/llm/personas.ts`; legacy slug-less profiles are kept but inactive). Personas are deactivated, never deleted. Edit them in Settings (`PATCH /api/profiles/:id`).

### Beats, fact-check, drafts

- **Beats**: `/api/beats` (GET, POST, PUT = replace planned AI beats), `/api/beats/:id` (PATCH, DELETE), `/api/beats/reorder`, `/api/beats/suggest` (NDJSON proposal, nothing saved), `/api/beats/check` (coverage against a saved version; verified anchors + planned/drafted status saved). Beat Sheet is a workspace mode of the script page; suggestions and checks live in a per-script module store, so switching modes doesn't stop them (only Stop, Dismiss or a new request does).
  - Proposed `targetSeconds` is rounded and clamped to 5..900. POST with `source: "ai"` and PUT re-run the wording guard, skip AI beats left empty, and return 422 when nothing is left (existing beats untouched).
  - Editing an AI beat's title, purpose, notes or target time makes it a writer beat (a reorder doesn't). The guard key counts writer beats and writer notes only, never AI beat text.
- **Fact-check**: `POST /api/fact-check` runs one grounded agent (`getModel(ROLE_MODELS.factCheck, { webSearch: true })`, OpenRouter web plugin pinned to Exa, 10 results; 32k output tokens, 420 s total). Only URLs the search returned are kept; claims must quote the script; a verdict without a source (`exaggeration-ok` included) is downgraded to unverifiable; `correction` is always NULL.
  - A run whose search returned no sources fails with an error and saves nothing (the previous run stays shown). A sourced claim whose explanation the guard emptied is kept with a fixed neutral line.
  - Acknowledged and dismissed statuses carry to the same claim (`matchKey`) with the same verdict on later runs; a changed verdict comes back pending. Final meta: `claimsSaved`, `claimsDropped`, `claimsDroppedBy`, `claimsDowngraded`, `claimsCarried`.
  - `GET /api/fact-issues` returns notes of the latest completed grounded run; legacy rows (`fact_check_id IS NULL`) are never shown. Only pending, non-verified claims are underlined in the editor.
- **Drafts and versions**: `script_versions` rows are immutable (never UPDATE content); `wordCount` is recounted on read. Loading: `content = draft_content ?? latest version ?? ""`. Delete in Drafts is Archive; permanent delete only from the archive (a Markdown safety copy goes to `<backups>/deleted/` first).
  - Autosave is `DraftSaver` in `useScript.ts`: `PATCH /api/scripts/:id {draftContent}` 2 s after the last change, one write at a time; a draft equal to the latest version is stored as NULL. On network errors, 5xx, 408 and 429 it retries after 3, 6, 12, 24 s, then every 30 s, with one toast per failure streak. One saver per script lives for the tab's life (leaving the page never drops text). A version save runs on the saver's write chain (`DraftSaver.saveVersion`): draft writes up to the text land first, writes queued meanwhile run after it. The server clears the stored draft only when it equals the version and keeps a different one, which may be newer. A `beforeunload` sends unsaved drafts with `keepalive` and asks before leaving when that can't carry them or the last save failed.
  - Restore: a draft that isn't in any saved version is saved as one first (`restoreDraft` in `components/diff/restore.ts`); if that fails, nothing is restored.
- **Titles**: `src/lib/utils/titles.ts`. The legacy "Untitled Script" default (and a stray keystroke on it) counts as no title, and a template's `# [Title]` placeholder isn't a heading; the shown title falls back to the first H1 (`firstH1Text`). Migration 0011 cleared the exact legacy defaults ("Untitled Script", "<template> (Copy)").
- **Export**: per-script Markdown from the script menu; `POST /api/export-all` writes `data/exports/YYYY-MM-DD/<id>-<slug>/{script.md, versions/, notes.md, beats.md}`, built in a temp folder and swapped in, so a renamed or deleted script leaves no stale folder.

### Shared modules (import these; don't fork them)

| Module | Purpose |
|---|---|
| `src/lib/llm/models.ts` | Model registry (`MODELS`, `ROLE_MODELS`, `getModelBySlug`, `isAllowedModelSlug`, `reasons`, `estimateCostUsd`, `callCostUsd`). The only place OpenRouter model ids live. |
| `src/lib/llm/providers.ts` | `getModel(slug, { webSearch? })`, `callSettingsFor(slug)`, `hasApiKey()`, `WEB_SEARCH_MAX_RESULTS`. Unknown slugs fall back to a registry default. |
| `src/lib/llm/rubric.ts` | Criteria ids/labels, score anchors, `normalizeLegacyCriterionName`. |
| `src/lib/llm/schemas.ts` | Zod output schemas (`personaCritiqueSchema`, `synthesisSchema`, `beatSuggestionSchema`, `beatCheckSchema`, `factCheckSchema`). |
| `src/lib/llm/prompts.ts`, `personas.ts`, `council.ts`, `synthesize.ts`, `beats.ts`, `fact-check.ts`, `pick-icon.ts` | Prompt builders, persona seeds, run grouping/guards, per-feature model calls. |
| `src/lib/text/anchor.ts` | `resolveAnchor`, `markdownToPlain` (the text the editor shows: entities, code, tables, strikethrough and front matter as Tiptap renders them), `findAnchorInText`, `anchorExistsInMarkdown`, `isUsableAnchor`, `matchKey`. |
| `src/lib/guard/wording.ts` | "Your words only" guard (`stripSuppliedWording`, `isTooThin`). |
| `src/lib/stream/ndjson.ts` | `ndjsonResponse` (server) / `readNdjson` (client). Errors always arrive as `{t:"error"}`; a bare 5xx reads "Server error (HTTP n). The terminal running Scripter has the details." |
| `src/lib/utils/dates.ts` | `parseDbDate` (zone-less DB timestamps are UTC), `formatRelative`. Always parse DB dates with it. |
| `src/lib/utils/reading-time.ts` | `countSpokenWords` (skips headings, non-spoken callouts, `[cues]`, comments, code, `&nbsp;`), `estimateRuntimeSeconds`, `formatRuntime`, `firstH1Text` / `h1LineText` / `leadingH1Text`. Default 155 wpm. |
| `src/lib/utils/titles.ts` | `displayTitle`, `writerTitle`, `headingTitle`: the shown title, shared by Drafts, the script page and exports. |
| `src/lib/markdown/serialize.ts` | `cleanSerializedMarkdown()` must wrap every `editor.getMarkdown()`; `splitFrontMatter` (YAML-shaped lines only; anchors and word counts use it too); `findRewrittenLine`. |
| `src/components/editor/editor-content.ts` | `editorExtensions()` (the one Tiptap extension list), `loadMarkdown`, `editorMarkdown`, `findWysiwygRewrite`. |
| `src/lib/api/*` | The client API (`import * as api from "@/lib/api"`). UI code calls only these. |
| `src/types/review.ts` | `Note`, `Beat`, `Persona`, `LensState`, `Synthesis`, `FactNote` (re-exported from `src/types`). |

### Database

`src/lib/db/schema.ts`. In use: `scripts` (+ `draft_content`, `archived`), `script_versions` (immutable), `evaluations` (critiques and summaries; `run_id`, `persona_id`, tokens, cost), `evaluation_profiles` (personas), `notes`, `beats`, `fact_checks`, `fact_issues` (+ `fact_check_id`). Legacy tables kept but unused by code: `suggestions`, `tags`, `script_tags`, `direction_runs`, `production_directions`, `custom_models` (deleteScript still clears their rows).

- `src/lib/db/index.ts`: handle cached on `globalThis`, WAL, `foreign_keys = ON`, `SCRIPTER_DB_PATH` override, checkpoint + close on exit.
- `ensureDb()` (`src/lib/db/init.ts`) is called by every API route: pre-migration snapshot (`backups/pre-migration`, keep 10) when migrations are pending, migrations + seed, `wal_checkpoint(TRUNCATE)`, once-a-day `VACUUM INTO backups/auto/scripter-YYYY-MM-DD.db` (keep 14). With `SCRIPTER_BACKUP_DIR` set, backups go to `<dir>/<dbname>-<hash8>/`.
  - If a DB with data has pending migrations and no pre-migration copy could be written (`<backups>/pre-migration`, then `<data>/backups/pre-migration`), it refuses to migrate and the route returns 500; the next request retries. A failed prune of old snapshots only logs.
  - `runMigrations` turns `foreign_keys` OFF around drizzle's transaction (so a drizzle-kit table rebuild can't cascade-delete child rows), turns it back ON, and logs `foreign_key_check` violations (never throws) only when a migration was applied.
- `fact_issues.fact_check_id` and `evaluations.persona_id` were added by ALTER, so their ON DELETE actions are NOT enforced: delete `fact_issues` before a `fact_checks` row, and never delete personas.

### Security

Single-user, bound to 127.0.0.1. `src/proxy.ts` (Next 16 proxy) refuses `/api/*` requests whose Host isn't localhost/127.0.0.1/[::1], cross-site Origins, and mutating requests without `Content-Type: application/json`. `next.config.ts` sends `X-Frame-Options: DENY` and `Content-Security-Policy: frame-ancestors 'none'; img-src 'self' data: blob:` on every path. `MarkdownPreview` never renders `<img>` (alt text only), so model-written markdown can't fetch a URL.

### File layout

```
src/
├── app/
│   ├── page.tsx                 # Drafts (DraftsPage + KickoffDialog)
│   ├── script/[id]/page.tsx     # Revision / Beat Sheet workspace
│   ├── settings/page.tsx        # Council personas, models, speaking rate, data, API key status
│   └── api/                     # scripts, templates, council/*, notes, profiles, models, beats/*, fact-check, fact-issues, export-all, settings/status
├── components/
│   ├── layout/                  # AppHeader (+ FactCheckButton, ScriptMenu), RevisionSidebar, ConfirmDialog
│   ├── editor/                  # RichEditor, MarkdownSourceEditor, EditorPane, annotations-extension, AnchoredCard, MarkdownPreview, ContextEditor
│   ├── council/                 # CouncilRoster, ConsultButton, NotesList, NoteCard, lens chips
│   ├── evaluation/              # SynthesisPanel, SynthesisView, LensCard, ScoreTable, RunHistory, TrendsChart
│   ├── beats/                   # BeatSheet and its cards/forms
│   ├── factcheck/               # FactNoteCard, FactNotesList
│   ├── diff/                    # VersionTimeline, VersionDiff
│   ├── drafts/ kickoff/ settings/ ui/
├── hooks/                       # useScript, useCouncil, useNotes, useBeats, useFactCheck, useRuns, useTrends, useVersions, useTargetLength, useKeyboardShortcuts
├── lib/                         # api/, db/, llm/, guard/, text/, stream/, markdown/, utils/, brief.ts
├── stores/app-store.ts
├── types/
└── proxy.ts
```

Keyboard: Ctrl/Cmd+Enter consult, Ctrl/Cmd+S save version, Ctrl/Cmd+Shift+F fact-check, Ctrl/Cmd+Alt+N new script, Ctrl/Cmd+Alt+1/2 WYSIWYG/markdown. Esc closes only the topmost surface and never stops a run (Stop is a button). Focus: the synthesis panel takes focus on open and hands it back on close (the sidebar is `inert` while it's open); a closed note or fact card returns focus to its opener, else the next row, else the editor (`focus-return.ts`).

## Gotchas & Lessons Learned

### Vercel AI SDK v6

- Structured output: `streamText({ output: Output.object({ schema }) })`, then `result.partialOutputStream`, `await result.output`, `await result.totalUsage` (and `result.providerMetadata` for OpenRouter's reported cost). Use `maxOutputTokens` (not `maxTokens`), `stopWhen: stepCountIs(n)` (not `maxSteps`), and `timeout`.
- `getModel` sends `structuredOutputs: { strict: false }` for every model (OpenAI's strict mode rejects optional fields); the AI SDK still validates every result against the zod schema.
- Model-facing schemas in `schemas.ts` carry no numeric or length constraints (minimum/maximum/minLength…), which Anthropic's structured outputs reject. Keep ranges in a zod `.refine()` or in the guards, and hint integers with `.meta({ type: "integer" })` (zod 4's `.int()` emits ±MAX_SAFE_INTEGER bounds). `schemas.test.ts` enforces this.
- Each registry model has `reasoningEffort` (`high | medium | low | none`, from the catalogue's supported efforts), always sent; use `reasons(model)`. Every model has `maxOutputTokens` 10k (pick-icon passes its own 200; only its model, Haiku, has effort `none`). Reasoning isn't excluded (its chunks keep the stream alive; nothing reads it), and models that reason get only `timeout: { totalMs: 240_000 }`, no per-chunk limit.
- Tools use `inputSchema` (not `parameters`); tool calls expose `.input` (not `.args`).
- Every AI route streams NDJSON through `ndjsonResponse`; never return an empty 200 on failure.

### Tailwind CSS v4

- `@plugin` syntax in globals.css (e.g. `@plugin "@tailwindcss/typography"`), no `tailwind.config.ts`.
- `@custom-variant dark (&:is(.dark *))`; the app never sets `.dark`, so `dark:` classes in shadcn primitives are inert.
- There is no `overflow-wrap-anywhere` utility; use plain CSS (`overflow-wrap: anywhere`). In `.prose`, target p/li/td/blockquote/a/code explicitly and add `min-w-0` on the container.

### Tiptap

- `immediatelyRender: false` in `useEditor()` (SSR hydration).
- The extension list lives in `editorExtensions()` (`editor-content.ts`): `StarterKit.configure({ codeBlock: false, link: false, underline: false })` plus the separate Link extension. `anchor-editor.test.ts` imports it; keep `scripts/roundtrip-check.mjs` and `src/lib/markdown/serialize.test.ts` in sync with it.
- Table extensions use named exports.
- Load with `loadMarkdown(editor, md)` (out of undo history, `emitUpdate: false`, front matter set aside); save with `editorMarkdown(editor, frontMatter)`, which wraps `cleanSerializedMarkdown(editor.getMarkdown())` and writes the front matter back byte for byte.
- Markdown the editor can't keep: `EditorPane`'s `useWysiwygGuard` runs `findWysiwygRewrite()` on load, on a switch to WYSIWYG and on outside changes (restore), never while typing. When a line would change (images, task boxes, footnotes, inline HTML, inline comments, entities, wikilinks, a dropped `\#` / `1\.` escape), the script stays in the markdown textarea with a notice and "Edit visually anyway"; the stored mode preference is untouched.
- Comment blocks (`<!-- … -->` on their own lines, like the templates' guidance) are an `htmlComment` atom node (`html-comment-extension.ts`): shown as a muted hint, written back verbatim. Its `parseMarkdown` handles block `html` tokens first and returns `[]` (default handling) for anything else; `markdownToPlain` drops such blocks (`commentBlockText` in `serialize.ts`), and a list item opening with one keeps the script in markdown mode. Other raw HTML differs by environment: the browser parses it with the DOM (a comment inside a paragraph becomes nothing), while headless in Node (vitest, `roundtrip-check.mjs`) it stays literal text, so Node-side checks under-report what the browser would rewrite. Check editor behaviour around raw HTML in a real browser.
- Highlights (notes, fact notes, beat focus) come from one ProseMirror plugin, `annotations-extension.ts`, keyed `"note:12" | "fact:7" | "beat:3"`, using a single-pass text/position map and `findAnchorInText`.

### Drizzle migrations

- Generate with `npx drizzle-kit generate` (SQL + snapshot + journal together); never hand-write them. Data-only changes use `npx drizzle-kit generate --custom --name <name>` and fill in the SQL (e.g. 0011).
- SQLite ALTER TABLE only supports ADD COLUMN.
- Store timestamps with `datetime('now')` (UTC, no zone) and parse with `parseDbDate`.

### React compiler lint rules

eslint runs the react-hooks compiler rules: no setState in effects (derive state or adjust during render), no `Date.now()` / `Math.random()` during render (see `useNow`), no reading refs during render.

## Browser Testing Requirements

After implementing any changes that affect the web UI (components, styles, pages, hooks), you **MUST** test with Claude in Chrome (`mcp__claude-in-chrome__*` tools) before considering the work complete:

1. **Start the dev server** if not already running (`npm run dev`)
2. **Navigate** to the app (`mcp__claude-in-chrome__navigate` to `http://127.0.0.1:3000`)
3. **Take a screenshot** to verify visual rendering looks correct
4. **Check console for errors** (`mcp__claude-in-chrome__read_console_messages` with `onlyErrors: true`)
5. **Test key interactions** — click buttons, type in inputs, toggle modes, etc.
6. If errors are found, **fix them and re-test** until the page loads cleanly with zero console errors

This is enforced by a Stop hook — you cannot finish a session without browser verification for UI work.
