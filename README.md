# AppChef

Local-first AI resume tailoring. Keep a structured profile (jobs, education, projects, skills), paste a target job description, and a locally-hosted LLM generates a one-page resume tailored to that job and rendered as a LaTeX PDF in the Jake's Resume format. Fully local — no API keys, nothing leaves the machine.

## Running it

Three things need to exist: Node, a LaTeX engine, and a local LLM server.

**1. One-time setup**

- **Node.js 20+**
- **Tectonic** (LaTeX engine) — `brew install tectonic`. First compile downloads LaTeX packages (~30–90s); the server runs a warm-up compile at startup so it never hits a preview. Set `TECTONIC_PATH` if the binary isn't on `PATH`.
- **A local LLM server** — anything OpenAI-compatible (llama.cpp, Ollama, LM Studio). Reference setup:

  ```sh
  brew install llama.cpp
  llama-server -hf unsloth/Qwen3.6-35B-A3B-GGUF:UD-Q4_K_M --jinja
  ```

  First run downloads the model (~19GB) to the Hugging Face cache; after that it starts from disk. Serves on `:8080`, which is the app's default endpoint.

**2. Every session**

```sh
llama-server -hf unsloth/Qwen3.6-35B-A3B-GGUF:UD-Q4_K_M --jinja   # model server, :8080
npm install                                                        # first time only
npm run dev                                                        # client (vite, :5173) + API (express, :3001)
```

Open http://localhost:5173. The Settings page holds the endpoint URL (`:8080` llama.cpp / `:11434` Ollama / `:1234` LM Studio) and model name. Sampling is fixed per pipeline stage (generation 0.7, refine 0.3, extraction/shortlist 0.1) and completions are never token-capped — every call runs until the model finishes. On first launch the server also downloads the embedding model (~140MB, one-time) — fully offline after that.

Data lives in `appchef.db` (SQLite) next to the code. Settings → Resume Data exports/imports the profile as JSON.

Other scripts: `npm run typecheck`, `npm run lint`, `npm run build`, `npm run check:pdf-text` (verifies generated PDFs extract as clean ASCII for ATS parsers).

## Architecture, simplified

**Stack:** React 19 + Vite SPA → Express 5 API → SQLite (better-sqlite3 + Drizzle). The browser talks to the LLM server directly (`src/llm.ts`); embeddings run in-process on the API server (nomic-embed-text-v1.5 via transformers.js); PDFs compile server-side via tectonic.

**What happens when Generate is pressed:**

1. **Extract** — a small LLM call pulls the JD's target title + must-have/nice-to-have skill terms (thinking disabled; reasoning would starve the token budget).
2. **Score** — deterministic retrieval matches every requirement against every profile bullet: BM25 (FTS5) + embedding cosine, rank-fused. Requirements that match nothing become explicit *gaps* (never faked). Entries and bullets get ranked per-JD; a fresh random seed adds bounded jitter so near-ties can swap between generations — a clearly better entry can never lose its spot.
3. **Shortlist** — one listwise LLM call confirms/trims the ranked entries; deterministic expand/trim guarantees the selection can fill exactly one page.
4. **Generate** — the model writes the resume in a tagged line format, guided by a per-entry bullet allocation (extra bullets go to the most JD-relevant entries), a requirement→evidence map, and "most relevant to this JD" bullet annotations. Header, education, and the TECHNICAL SKILLS section are composed from profile data, never generated — skills render as ≤4 deduplicated rows with JD-relevant skills first. The dense 10pt layout targets 5–7 total entries per page.
5. **Fill** — the real compiled page is measured; if meaningfully short, one corrective pass adds the next-ranked entry.
6. **Review + auto-fix** — deterministic lint checks the draft (citations valid, no banned/duplicate verbs, bullet counts, keyword overuse, must-haves with profile evidence that got left out). Hard violations trigger ONE automatic refine pass with the specific issues as edit instructions. The critic is code, never the model grading itself.
7. **Score panel** — the final text is scored against the requirements (exact hits + embedding similarity, thresholds calibrated on real data) and shown as a coverage percentage with per-requirement verdicts.

The PDF preview recompiles on every edit; the server enforces exactly one page (progressively tighter spacing presets, then content trims) and caches compiles by content hash.

**Directory map:**

- `src/components/` — UI; `Generate.tsx` owns the pipeline above, `ReflectionPanel.tsx` the score panel
- `src/prompts.ts` — every prompt, the tagged-format contract, page-budget math, bullet allocation
- `src/lib/lint.ts` / `src/lib/coverage.ts` — the deterministic checks
- `server/chunks.ts` / `server/embeddings.ts` / `server/retrieval.ts` — the index + hybrid scoring
- `server/score.ts` — semantic requirement coverage of generated output
- `server/latex.ts` / `server/tectonic.ts` — tagged text → Jake's Resume LaTeX → one-page PDF
- `docs/retrieval-research.md`, `docs/ats-research.md` — the research and decisions behind all of it
