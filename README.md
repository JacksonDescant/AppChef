# AppChef

Local-first AI resume tailoring. Keep a structured profile (jobs, education, projects, skills), paste a target job description, and a locally-hosted LLM generates a one-page resume tailored to that job and rendered as a LaTeX PDF in the Jake's Resume format.

## Requirements

- **Node.js** (20+)
- **Tectonic** (LaTeX engine) — `brew install tectonic`
  - The first compile after install downloads LaTeX packages (~30–90s); the server runs a warm-up compile at startup so this doesn't hit your first preview.
  - Set `TECTONIC_PATH` to point at the binary if it isn't on `PATH`.
- **An OpenAI-compatible local LLM server** (llama.cpp, Ollama, LM Studio) — endpoint configurable in Settings, defaults to `http://localhost:8080`.

## Development

```sh
npm install
npm run dev        # client (vite, :5173) + server (express, :3001)
```

Other scripts: `npm run typecheck`, `npm run lint`, `npm run build`, `npm run check:pdf-text` (verifies generated PDFs extract as clean ASCII for ATS parsers; pass a path to check an existing PDF).

## Architecture

- `src/` — React 19 + Vite SPA (Tailwind v4). LLM calls happen client-side via `src/llm.ts`.
- `server/` — Express 5 API + SQLite (better-sqlite3 + Drizzle). Data lives in `appchef.db`.
- `server/chunks.ts` + `server/retrieval.ts` — the retrieval index (docs/retrieval-research.md): profile bullets are context-wrapped, BM25-indexed (FTS5) and embedded in-process (nomic-embed-text-v1.5 via transformers.js; ~140MB one-time download on first run, fully offline after). At generate time, JD requirements are scored against every bullet (hybrid RRF) to rank entries, order bullets, and gate keyword coverage — the LLM curates a scored shortlist instead of searching.
- `server/latex.ts` — converts the LLM's tagged resume text into a Jake's Resume LaTeX document.
- `server/tectonic.ts` — compiles it via tectonic and **enforces exactly one page**: progressively tighter spacing presets, then trimming the least-important content, recompiling until the output is a single page.
