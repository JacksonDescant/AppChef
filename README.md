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

Other scripts: `npm run typecheck`, `npm run lint`, `npm run build`.

## Architecture

- `src/` — React 19 + Vite SPA (Tailwind v4). LLM calls happen client-side via `src/llm.ts`.
- `server/` — Express 5 API + SQLite (better-sqlite3 + Drizzle). Data lives in `appchef.db`.
- `server/latex.ts` — converts the LLM's tagged resume text into a Jake's Resume LaTeX document.
- `server/tectonic.ts` — compiles it via tectonic and **enforces exactly one page**: progressively tighter spacing presets, then trimming the least-important content, recompiling until the output is a single page.
