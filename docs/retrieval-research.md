# Modernizing Retrieval & Selection — Research and Decisions

*Researched 2026-08-08 through three parallel deep-dives (retrieval architecture
patterns, local-first embedding stacks, resume↔JD matching systems), ~90 sources:
Anthropic/Chroma/Qdrant/Weaviate engineering posts, LinkedIn & Eightfold published
architectures, 2024–2026 arXiv/ACL papers, llama.cpp/Ollama/sqlite-vec primary docs.
Companion to [ats-research.md](ats-research.md). Purpose: guide the evolution of
AppChef's selection stage (`buildSelectionMessage` → `parseSelection` in
src/prompts.ts).*

---

> **Deployment constraints:** fully local, no API keys, ever. Chat model is
> **Qwen 3.6 35B** on a local OpenAI-compatible server. Every Anthropic/Chroma/
> LinkedIn mention below is a research citation, not a dependency. Worth getting
> straight up front: the embedding model is a *separate*, tiny (~300M) model — a 35B
> chat model is not an embedding model, and decoder-chat endpoints don't serve usable
> embeddings. At 35B the LLM is a better judge than the small-model literature assumes
> (JSON compliance and listwise ranking improve markedly), which softens the
> *reliability* argument — but strengthens the *latency* one: a 35B model pays real
> seconds for every distractor token in the prompt, so deterministic pre-scoring that
> shrinks prompts pays for itself even more.

## 1. TL;DR — the decision

Replace "put every entry in one prompt and ask the LLM to pick IDs" with a
**deterministic hybrid-scoring layer feeding a smaller, smarter LLM step**:

1. **Write path** (on profile edits): embed every bullet — wrapped in a deterministic
   context template ("Senior Software Engineer @ Trafficly, Jun 2022–Present —
   {bullet}") — with a small local embedding model running in-process via
   transformers.js. Store normalized vectors as BLOBs in the existing SQLite DB
   alongside an FTS5 index. Nothing new runs at query time except one JD embedding.
2. **Query path**: keep the existing LLM keyword/requirement extraction (it already
   matches best practice), then score every bullet against every requirement with
   **hybrid retrieval** — BM25 (FTS5) + cosine similarity fused by reciprocal rank
   fusion — producing a requirement × bullet **evidence matrix** with confidence
   thresholds. Entry ranking = aggregate of its bullets' evidence + recency prior.
   All deterministic, explainable, sub-millisecond at this corpus size.
3. **The LLM's selection role shrinks to what LLMs are good at**: a single listwise
   confirmation over a pre-scored shortlist (scores visible in the prompt), instead of
   raw relevance judgment over everything. Generation then receives ranked evidence per
   requirement — which also mechanizes the "most relevant bullet first" rule and turns
   the coverage meter from string matching into semantic evidence checking with a
   first-class gap report.

Same two-stage shape LinkedIn uses (two-tower retrieval → cross-encoder rerank) and the
current academic SOTA (ConFit v3), scaled down to a single profile — where the corpus
is tiny but the *judge* is a local model whose pointwise relevance scores are
uncalibrated at any size, and whose per-token latency (real seconds at 35B) makes every
distractor in the prompt a cost the scoring layer eliminates.

## 2. Why change anything — what was weak

- **"It all fits in context" is true but insufficient.** Anthropic's own guidance says
  skip RAG under ~200k tokens, and the profile is far below that. But Chroma's Context
  Rot study (18 models) shows accuracy degrades with input length and **distractor
  count** even on trivially easy tasks — worst on small models. Irrelevant jobs and
  bullets in the selection prompt are distractors; scoring first and passing a
  shortlist improves the calls even though everything technically fits.
  (anthropic.com/engineering/contextual-retrieval; research.trychroma.com/context-rot)
- **Pointwise LLM relevance judgment is the documented anti-pattern.** Uncalibrated,
  drifts across prompts and candidate sets, "the worst of both worlds" (ZeroEntropy).
  That's exactly what the old selection prompt asked the model to do. Cross-encoder-
  style deterministic scoring beat gpt-class rerankers on NDCG@10 at 17x lower latency.
  The one endorsed LLM mode: listwise over ≤10–30 pre-ranked candidates.
- **Holistic LLM match scores are weak; per-requirement verdicts with evidence are the
  state of the practice.** Zero-shot GPT-4 resume ratings "correlate minorly" with
  human recruiters (NAACL 2025). Ashby — the strongest product analog — evaluates each
  recruiter-defined criterion as Meets / Does not Meet / Unknown **with citations to
  the exact resume span**, and deliberately shows no overall score.
- **The one paper on exactly this use case** (single-candidate career-vault RAG for
  resume tailoring, arXiv 2605.05257) found retrieval **helped matching roles (+7.8 ATS
  points) and actively hurt mismatched roles (−8.0)** until gated by confidence
  thresholds — weak evidence must surface as a gap, never get force-fitted.
- **Structured output wants constraint, not trust**: unconstrained 7–14B models fail
  JSON ~25% of the time; a 35B-class model is markedly better, but grammar-constrained
  decoding (llama.cpp GBNF / `response_format`) is free insurance where the runtime
  supports it; keeping the schema flat fixes semantics; "Unknown" must be a first-class
  verdict so the model isn't forced to hallucinate a determination.

## 3. Evidence behind each design choice

**Hybrid BM25 + dense, fused by RRF (k=60), is the uncontested default.**
Weaviate/Qdrant teach it as the standard; Anthropic's contextual-retrieval numbers
embody it (embeddings alone −35% retrieval failures; adding BM25 −49%; adding rerank
−67%); exact-term-heavy domains (skill tokens like "Kubernetes", "React") are BM25's
home turf and dense-only demonstrably misses them. RRF uses rank positions only — BM25
and cosine scales are incomparable. (weaviate.io/blog/hybrid-search-explained;
simonwillison.net/2024/Oct/4 for the SQLite-specific pattern)

**Score bullets, not documents.** Eightfold layers structured features over embeddings
rather than trusting whole-doc cosine; the best small-hardware result in the literature
(arXiv 2601.10321) decomposes profiles into sentence "utterances", embeds each with a
frozen tiny encoder, and beats small-LLM rankers at 1/10th the compute (287ms with
precomputed profile embeddings). Bullet-level scoring is also the only way to rank
bullets *within* an entry — the old pipeline's blind spot.

**Contextual retrieval is free here.** Anthropic's technique (prepend situating context
before embedding and BM25-indexing) exists because their chunks come from unstructured
documents and need an LLM to write the context. This profile data is already
structured — the contextual prefix is a string template (title, company, dates, tech),
zero LLM calls.

**Don't paraphrase the JD before matching.** The PJB benchmark found LLM query
rewriting *degraded* retrieval both times they tried it — structural phrasing carries
matching information. Extract requirements verbatim (the keyword extraction already did
this — keep it); skip HyDE (it helps vague queries; a JD is document-shaped, and HyDE
measurably hurts specific queries).

**Keep must-have separate from nice-to-have — different signal types.** Formalized in
JobRec (qualification vs preference decoupling) and the PJB benchmark (parallel
checkable constraints vs serial inference); the existing mustHave/niceToHave split
already matched this — the scoring layer preserves it rather than blending into one
score.

**Ruled out at this scale** (explicit negative guidance from the research): GraphRAG
(the profile is already a typed graph; LLM entity extraction would be pointless cost),
agentic multi-hop retrieval (3–10x tokens, multiplies small-model error; Claude Code's
grep-only success depends on a frontier model driving iterations), a vector database
server (brute-force cosine over ≤1k vectors is sub-millisecond; the ANN crossover is
~100k+ vectors), and fixed top-k cutoffs (thresholds/adaptive-k instead, so weak
matches read as gaps).

## 4. The local stack (verified against this repo)

Verified locally 2026-08-08: FTS5 with bm25() is **already compiled into the
better-sqlite3 build the app ships** (zero new deps for the keyword channel);
`sqlite-vec` 0.1.9 is on npm and `db.loadExtension` works; `@huggingface/transformers`
4.x is current on npm.

**Embedding model**: EmbeddingGemma-300m — 768d with Matryoshka truncation to 256
(re-normalize after truncating), ~300MB as q8 ONNX, <200MB RAM, and it outperformed
nomic-embed-text-v1.5 in the closest published analog (a Mistral-7B local
resume-matching pipeline, Electronics 14(24):4960). Runner-up: Qwen3-Embedding-0.6B
(higher ceiling, ~640MB, needs last-token pooling — a real llama.cpp misconfiguration
trap). *(What actually shipped is nomic-embed-text-v1.5 — Gemma's HF repo is
license-gated, which breaks the zero-friction offline story.)*

**Serving — Option A: in-process via transformers.js.** Rationale: zero coupling to
whichever chat runtime is configured. The endpoint may have no embedding model at all,
and Option B's failure modes are real: a classic single-model `llama-server` returns
501 on `/v1/embeddings` (only the Dec 2025 router mode or a second `--embeddings`
instance serves both), Ollama silently truncates at its default `num_ctx`, and
normalization differs by path — so Option B ("use the chat server for embeddings",
`POST {endpoint}/v1/embeddings`) should only ever exist as a settings toggle with
capability probing, layered over A. Always L2-normalize client-side; store
`(content_hash, model_id, dims)` with every vector; changing model triggers a visible
re-index, never silent garbage similarity.

**Storage**: normalized Float32Array BLOBs in the existing `appchef.db` + an FTS5
external-content table synced by triggers. At 100–500 bullets: ~1.5MB of vectors
(0.5MB at MRL-256) and sub-millisecond brute-force cosine in JS — `sqlite-vec` is the
growth path (metadata-filtered KNN in SQL), not a requirement.

**Reranker (optional Phase 3)**: only if hybrid quality proves insufficient — run
bge-reranker-v2-m3 **in-process via node-llama-cpp** (documented path). Don't depend on
the chat runtime for this: Ollama has no rerank endpoint at all, and llama-server's
`/rerank` has an open garbage-scores bug (llama.cpp #16407) affecting Qwen3-Reranker
GGUFs among others. Budget 0.5–2s CPU for 20–50 pairs; async and optional.

## 5. The architecture

### Write path (on profile save — server-side)
```
bullet text ─→ contextual template ─→ embed (transformers.js, q8, MRL-256, normalize)
   "«{resumeTitle} @ {company}, {dates}, tech: {skills-of-entry}» — {bullet}"
   └→ chunks table: (id, kind: bullet|skill|entry, parent_id, text, content_hash,
                     model_id, dims, embedding BLOB) + FTS5 shadow table
```
Skills and a per-entry rollup (title + description) get embedded too. Re-embed only on
content-hash change; model change → full visible re-index.

### Query path (Generate)
```
1. JD ──LLM──→ requirements {targetTitle, mustHave[], niceToHave[]}   (already existed;
   keep phrasing verbatim, keep schema flat, prefer grammar-constrained JSON)
2. per requirement r:  RRF( BM25 rank over chunks, cosine rank over chunks )
   → evidence matrix M[r][chunk] with threshold τ  (below τ ⇒ requirement is a GAP)
3. entry score = Σ best-evidence of its bullets (must-haves weighted over nice-to-haves)
                 × recency prior          → deterministic entry ranking
4. LLM listwise pass: shortlist + scores in the prompt, final editorial pick —
   the LLM curates, it no longer searches
5. Generation prompt gains a requirement→evidence map:
   "Must-have 'Kubernetes': strongest evidence [S7], [S12]" — which mechanizes
   rule 8 (most relevant bullet first) instead of asking the model to infer it
6. Coverage meter upgrades from string matching to evidence checking:
   covered = keyword present AND evidence ≥ τ; below-τ requirements render as
   explicit gaps ("no supporting experience — add it to your profile")
```

### Phasing
- **Phase 1 — zero new dependencies**: FTS5 BM25 scoring + recency prior as the
  deterministic entry-ranking signal; the selection call becomes listwise over the
  pre-ranked list. Ships the architecture change without any model download.
- **Phase 2 — the semantic half**: transformers.js embeddings, write-time indexing,
  RRF hybrid, requirement × bullet evidence matrix, gap-aware coverage meter,
  evidence-guided generation prompt. (The end state — this is what's live.)
- **Phase 3 — measured extras, only if quality demands**: Option B endpoint toggle,
  in-process reranker behind a flag, sqlite-vec if the corpus outgrows brute force.

## 6. Source quality notes

Strongest: Anthropic contextual-retrieval engineering post (with ablation numbers);
Chroma Context Rot technical report; LinkedIn's published retrieval architecture (arXiv
2402.13435 + engineering blog); Eightfold engineering blog; ZeroEntropy reranking
analysis (benchmarked); PJB benchmark (arXiv 2603.17386); ConFit v2/v3 (ACL 2025 /
arXiv 2605.09760); utterance-decomposition ranker (arXiv 2601.10321); llama.cpp/Ollama/
LM Studio primary docs; sqlite-vec releases and author docs. Single-source but
on-point: career-vault resume RAG (arXiv 2605.05257 — pilot scale, confidence-gating
finding). Vendor-published without architecture detail: HiredScore, Careerflow. Apple
Silicon embedding throughput figures are content-farm-grade — directional only.

## 7. Variety + reflection layer (shipped 2026-08-15)

Two additions on top of §5. Motivation: nearly the same resume was coming out for
every JD, plus an open question on whether the model should use tools or review its
own output. Decisions: relevance-first + near-tie jitter (never demote a clear
winner), a fresh random seed on every Generate click, auto-fix with a visible score
panel.

### 7.1 Ranking sharpness and bounded exploration (server/retrieval.ts)

- **Stopword-filtered OR queries.** `ftsTokens` now drops English function words and
  JD boilerplate ("experience", "knowledge"…) plus 1–2-char tokens outside a tech
  allowlist; digit-bearing tokens (s3, k8s) always survive. The exact-phrase query is
  untouched, and its gate keys on the RAW token count so filtering can never cost a
  requirement its `exactHit` check. Before: "infrastructure as code" OR-matched every
  chunk through "as", compressing all entry scores together. After: 3 contrasting JDs
  → 3 distinct top-3 job sets (it used to be the same winners every time).
- **Discriminativeness weighting.** Each requirement's contribution to entry scores
  scales by `1/(1 + log2(entries matched))` — a requirement only one entry evidences
  decides rankings; one that everything evidences mostly cancels out. Coverage
  verdicts, topEvidence, and matched lists are unaffected.
- **Bounded near-tie jitter.** `/api/retrieve` takes an optional `seed` (the client
  sends a fresh `crypto.getRandomValues` uint32 per Generate click). mulberry32
  substreams (jobs/projects/bullets) add uniform noise U(−τ, τ) to normalized scores,
  τ = 0.08 for entries / 0.05 for bullets. Uniform, NOT Gumbel — bounded noise makes
  "swaps only happen within a 2τ gap" a provable invariant (verified over 50 seeds:
  38 inversions, zero violations). Zero-evidence entries are never jittered; no seed ⇒
  byte-identical deterministic behavior (the test switch). Displayed scores are the
  re-normalized jittered keys so the shortlist LLM doesn't "correct" the swaps.
- **MMR bullet diversity.** Per entry: normalize rel → jitter → greedy MMR (λ = 0.7)
  over the stored chunk vectors, so an entry's top bullets stop being three rewordings
  of one achievement. Skipped per-entry unless every bullet has a vector; skipped when
  all rel = 0 (the profile's own bullet order is the signal there). `bulletRanks` is
  now `{text, score}[]`.

### 7.2 Rank-aware generation prompt (src/prompts.ts)

- `computeBulletAllocation`: explicit per-entry bullet counts — everyone gets 2, extras
  flow by jittered rank (the most recent job floors at 3 so the top of the page never
  looks thin), and the single rule-15 fourth bullet goes to the top-RANKED entry.
  Injected as a PER-ENTRY BULLET ALLOCATION block; the old recency-allocation wording
  in SYSTEM_PROMPT survives only as the no-retrieval fallback.
- The profile context annotates each entry with `Most relevant to this JD: [S5], [S2]`
  from bulletRanks (annotation, not reordering — reordering the source bullets would
  desync numberedSourceMap citations). Refine prompts stay annotation-free to protect
  the edit contract.

### 7.3 Reflection: the critic is code, never the model

The research verdict was clear (Huang et al. arXiv:2310.01798; the small-LM
self-correction literature): LLMs can't reliably self-correct without external
feedback. So scoring/critique is deterministic code + embeddings, and the LLM's only
job is executing the fixes it's handed, through the already-verified refine edit
contract.

- `src/lib/lint.ts` — pure checks over the raw (citations intact) and assembled
  outputs: citation presence/validity, banned verbs, duplicate openers, bullet counts
  vs the allocation, keyword overuse (>2), covered-but-missing must-haves (gated to
  ≤4-word terms; long phrases get scored semantically instead), figure-grounding
  suspicion (soft), untagged/static echoes (soft). Hard issues → `buildLintInstruction`
  (priority-ordered, capped at 8) → ONE automatic refine repass (temp ≤ 0.3) → re-lint
  with `requireCitations: false` (refine legitimately leaves copied bullets uncited).
  The repass preserves the draft's bullet count by contract, so page fill is never
  re-measured after it.
- `POST /api/score` (server/score.ts) — semantic requirement coverage of the final
  text: exact word-boundary hit OR embedding cosine per requirement. Thresholds
  calibrated on the profile's real bullets (2026-08-15): the true/false cosine
  distributions OVERLAP in 0.55–0.65 (true "REST APIs" 0.59 < false "GraphQL" 0.60),
  so strong = exact or ≥ 0.65, partial = 0.58–0.65 ("possibly addressed — verify",
  never claimed as coverage), absent < 0.58. Overall = weighted coverage (must 1.0 /
  nice 0.4) × 100. Panel-only; never gates generation.
- Live E2E on the real Qwen 3.6: frontend JD — lint caught 2 keyword-stuffing + 4
  covered-but-missing issues, one repass fixed 6/6, score 84%, page fill 94%. A
  contrasting backend JD selected a disjoint entry set.

### 7.4 Tool calling: researched, deliberately not adopted

llama.cpp supports OpenAI-style tools with `--jinja` and Qwen3.6-35B-A3B is genuinely
agentic-capable (SWE-bench Verified 73.4), but: streaming tool-call parsing in
llama.cpp has known failures, the app is stream-first, retrieval already front-loads
the evidence a tool would fetch, and multi-turn loops multiply latency and failure
modes on a local MoE. Reflection-with-an-external-verifier captures the benefit at
fixed cost. Revisit only if interactive features need it.

### 7.5 Incidental fix: thinking-budget starvation

Qwen 3.6's reasoning phase was silently consuming the small `max_tokens` budgets of
the extraction (768) and shortlist (256) calls before any content appeared —
extraction returned empty, and the pipeline quietly fell back to recency-only
selection. A major contributor to the "same resume every time" problem.
`streamCompletion` now supports `noThink: true`, which sends `chat_template_kwargs:
{"enable_thinking": false}` (verified: 0 reasoning tokens; the `/no_think` soft switch
does NOT work on Qwen 3.6). Extraction and shortlist use it; generation and refine
keep thinking.

Follow-up, same day: `max_tokens` caps are removed from every call entirely (the
field is omitted, so completions run to EOS or the server's context limit — the caps
were the truncation mechanism in the first place, and the Settings "Max Tokens" field
is gone with them). `noThink` stays: it saves real seconds on the tiny JSON calls,
and on runtimes that ignore `chat_template_kwargs` an uncapped call still delivers
its answer after thinking instead of getting truncated.

### 7.6 Densified layout + deterministic skills (2026-08-15, same day)

Problem: too little experience fit the page (4–5 entries), and the TECHNICAL
SKILLS section came out jumbled — the profile has 31 skills across 9
categories, the prompt demanded "3–4 rows", so the model invented ad-hoc
merges, and the auto-repass kept stuffing keywords into them. Decisions:
5–7 total entries, smaller type, skills composed by code.

- **Layout:** 10pt base across all squeeze presets (was 11pt for the first
  two), `\huge` name (was `\Huge`), tighter section spacing at preset 0, and a
  new harder max-squeeze rung. Client budget constants recalibrated against
  real tectonic compiles: 6-entry/19-bullet and 7-entry/18-bullet fixtures
  land at 95–97% fill on one page at preset 0. Real profile now selects
  7 entries (19 bullets) without a summary, 6 with.
- **TECHNICAL SKILLS is now composed, never generated** — same rule as the
  header and education. `buildSkillLines` (src/prompts.ts): skills are
  priority-scored (JD keyword match = +2, plus the retrieval engine's new
  per-skill `skillScores`), deduplicated case-insensitively across categories
  (profiles accumulate "Node.js" under three categories), grouped into at
  most 4 rows — highest-relevance categories keep their names, the tail folds
  into "Other" — capped at 10 skills per row (JD-matching skills are never
  dropped), proficiency levels omitted. The model is forbidden from emitting
  [SKILL]/TECHNICAL SKILLS (stripStaticTags removes echoes); the page-budget
  math charges exactly the composed row count. Lint's covered-but-missing
  check now demands bullet coverage only — the skills half of rule 5 is
  guaranteed by construction.
