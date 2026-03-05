# Scripter

AI-powered video script editor that runs multiple LLM evaluations in parallel and synthesizes them into a unified summary. Write markdown scripts, get scored feedback from 5+ models simultaneously, and receive concrete text-level edit suggestions with inline editor highlights.

## Features

- **Rich text editor** — WYSIWYG editing powered by Tiptap with full markdown support, or switch to raw markdown mode
- **Parallel AI evaluation** — Run Claude, GPT, Gemini, Grok, and DeepSeek evaluations simultaneously via OpenRouter
- **Structured scoring** — Each model returns scored criteria (structure, pacing, clarity, etc.) alongside its written feedback
- **Master summary** — An AI synthesizer compares scores across models, surfaces consensus and contradictions, and ranks priorities
- **Inline suggestions** — The summary agent generates concrete text edits that appear as highlights in the editor with accept/dismiss controls
- **Version history** — Every save creates a new version; compare diffs between any two versions
- **Evaluation profiles** — Customize what the AI evaluates (e.g., "First Draft Review", "Final Polish", "Pacing Check Only")
- **Script templates** — Start from templates for long-form video, podcast, tutorial, or YouTube Shorts
- **Context & notes** — Attach background info, tone guidance, and audience notes that get sent to evaluators
- **Export** — Download scripts as markdown or plain text
- **Dark mode** — Default dark theme with light mode toggle

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) 18+
- An [OpenRouter](https://openrouter.ai/) API key

### Installation

```bash
git clone https://github.com/your-username/scripter.git
cd scripter
npm install
```

### Configuration

Create a `.env.local` file in the project root:

```
OPENROUTER_API_KEY=sk-or-...
```

This single key routes to all supported models (Claude, GPT, Gemini, Grok, DeepSeek) through OpenRouter.

### Run

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). The database is created automatically on first launch — no setup required.

## Built-in Models

**Active by default:**
- Claude Sonnet 4.6
- GPT-5.2
- Gemini 3.1 Pro
- Grok 4
- DeepSeek V3.2

**Available to toggle on:**
- Claude Opus 4.6
- Gemini 2.5 Pro
- DeepSeek R1
- Grok 4.1 Fast

You can also add custom models (any OpenRouter-supported model or local Ollama models) from the Settings page.

## Tech Stack

- **Framework**: Next.js 16 (App Router, TypeScript, React 19)
- **UI**: shadcn/ui, Tailwind CSS v4, lucide-react icons
- **Editor**: Tiptap WYSIWYG with markdown serialization
- **AI**: Vercel AI SDK v6 with OpenRouter provider
- **Database**: SQLite via Drizzle ORM + better-sqlite3
- **State**: Zustand with persist middleware

## Electron Desktop App

Scripter also builds as a standalone desktop app via Electron.

```bash
# Development (Next.js + Electron together)
npm run electron:dev

# Production build
npm run electron:build
```

## Project Structure

```
src/
├── app/          # Next.js pages and API routes
├── components/   # React components (editor, evaluation, settings)
├── hooks/        # Custom hooks (useEvaluation, useSuggestions, useScript)
├── lib/          # Core logic (db, llm, markdown, utils)
├── stores/       # Zustand state management
└── types/        # TypeScript types and model config
electron/         # Electron main process, IPC handlers, menu
drizzle/          # Database migrations
```

## License

MIT
