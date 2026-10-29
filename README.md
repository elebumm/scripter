# Scripter

A local web app for writing long-form video scripts in your own words. A council of AI readers reviews saved versions of your script and leaves notes on what isn't working and why. It never writes, inserts or replaces your text.

## Features

- **Editor**: WYSIWYG editing with Tiptap and full markdown round-tripping, or raw markdown mode. A script with markdown the visual editor can't keep as written (images, task boxes, footnotes, inline HTML…) opens in markdown mode with a notice, so nothing is silently rewritten. The draft autosaves, retries by itself when a save fails, and warns before you close the tab with unsaved text; saved versions never change.
- **The council**: five persona lenses (Story Architect, Skeptical Viewer, Clarity Editor, Creative Director, Script Doctor), each a prompt plus a model from the registry. They read the same saved version in parallel, score it against a shared rubric and leave notes anchored to your own sentences. The model behind each lens is always shown. Review the whole script or just a selected section.
- **Synthesis**: merges the lenses' notes and shows a score table computed from the critiques, the per-lens critiques, run history and score trends by version. If the synthesis fails or you stop it, "Retry synthesis" writes it again without re-running the lenses.
- **Notes**: highlighted in the editor. Mark them addressed or dismiss them; a dismissed note is never raised again. A note whose passage you rewrote moves to "Addressed since last pass".
- **Beat Sheet**: plan what each part of the video must do. Suggested beats are proposals you add yourself, and "Check my draft" shows which beats the draft covers. The target length can be changed any time in the Brief.
- **Fact-check**: one grounded pass with web search. Each claim gets a verdict, what the sources say, and the source links; a claim no source backs is marked unverifiable. Claims you acknowledged or dismissed stay that way on later runs unless the verdict changes. There are no rewrites.
- **Versions**: timeline with word-level diffs and "Restore as draft". An unsaved draft is saved as a version before a restore replaces it.
- **Drafts**: recent and archived scripts, Markdown export per script, and an export of everything from Settings.
- **Backups**: a daily SQLite snapshot (keeps 14), a snapshot before every schema migration (no migration runs without one), and a Markdown safety copy before any permanent delete.

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) 22.22+
- An [OpenRouter](https://openrouter.ai/) API key

### Installation

```bash
npm install
```

### Configuration

Create a `.env.local` file in the project root:

```
OPENROUTER_API_KEY=sk-or-...
```

This one key routes to every model in the registry (`src/lib/llm/models.ts`) through OpenRouter. Optional: `SCRIPTER_DB_PATH` (database file), `SCRIPTER_BACKUP_DIR` (backups folder; each database gets its own subfolder in it).

### Run

```bash
npm run dev
```

Open [http://127.0.0.1:3000](http://127.0.0.1:3000). The server listens on this machine only. The database (`data/scripter.db`) is created and migrated on first request.

`npm run db:seed-local` copies the newest backup snapshot into `data/scripter.db` when that file doesn't exist yet (source folder: `SCRIPTER_BACKUP_SOURCE`). It refuses to run while `-wal`, `-shm` or `-journal` files from an earlier database sit next to the target.

### Checks

```bash
npm test                  # unit and route tests (no network)
npx tsc --noEmit
npx eslint src scripts
npm run build
node scripts/roundtrip-check.mjs   # editor markdown round-trip against every stored version (read-only)
```

## Tech Stack

- **Framework**: Next.js 16 (App Router, Turbopack, React Compiler), React 19, TypeScript
- **UI**: shadcn/ui on Radix, Tailwind CSS v4, lucide-react icons
- **Editor**: Tiptap 3 with `@tiptap/markdown`
- **AI**: Vercel AI SDK v6 structured output with the OpenRouter provider, streamed as NDJSON
- **Database**: SQLite via Drizzle ORM and better-sqlite3
- **State**: Zustand with persist middleware
- **Tests**: Vitest

## Project Structure

```
src/
├── app/          # Pages (Drafts, script workspace, Settings) and API routes
├── components/   # Editor, council, synthesis, beats, fact-check, drafts, settings, ui
├── hooks/        # useScript, useCouncil, useNotes, useBeats, useFactCheck, ...
├── lib/          # api (client), db, llm, guard, text, stream, markdown, utils
├── stores/       # Zustand store
├── types/        # Client-facing types
└── proxy.ts      # Local-only API guard
drizzle/          # Database migrations
scripts/          # db:seed-local, markdown round-trip check
```

See `CLAUDE.md` for architecture notes.

## License

MIT
