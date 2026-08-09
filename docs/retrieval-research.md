# Modernizing Retrieval & Selection — Research and Recommendation

*Researched 2026-08-08 via three parallel deep-dives (retrieval architecture patterns,
local-first embedding stack, resume↔JD matching systems), ~90 sources: Anthropic/Chroma/
Qdrant/Weaviate engineering posts, LinkedIn & Eightfold published architectures, 2024–2026
arXiv/ACL papers, llama.cpp/Ollama/sqlite-vec primary docs. Companion to
[ats-research.md](ats-research.md). Written to guide the evolution of AppChef's
selection stage (`buildSelectionMessage` → `parseSelection` in src/prompts.ts).*

---

> **Deployment constraints (owner-confirmed 2026-08-08):** fully local, no API keys.
> Chat model is **Qwen 3.6 35B** on the user's OpenAI-compatible local server. Every
> Anthropic/Chroma/LinkedIn mention below is a research citation, not a dependency.
> Note the embedding model is a *separate*, tiny (~300M) model — a 35B chat model is
> not an embedding model, and decoder-chat endpoints don't serve usable embeddings.
> At 35B the LLM is a better judge than the small-model literature assumes (JSON
> compliance and listwise ranking improve markedly), which makes the *reliability*
> argument softer — but the *latency* argument stronger: a 35B model pays real
> seconds for every distractor token in the prompt, so deterministic pre-scoring
> that shrinks prompts pays for itself even more.

## 1. TL;DR recommendation

Replace "put every entry in one prompt and ask the small LLM to pick IDs" with a
**deterministic hybrid-scoring layer feeding a smaller, smarter LLM step**:

1. **Write path** (profile edits): embed every bullet — wrapped in a deterministic
   context template ("Senior Software Engineer @ Trafficly, Jun 2022–Present — {bullet}")
   — with a small local embedding model (EmbeddingGemma-300m via transformers.js,
   in-process). Store normalized vectors as BLOBs in the existing SQLite DB alongside an
   FTS5 index. Nothing new runs at query time except one JD embedding.
2. **Query path**: keep the existing LLM keyword/requirement extraction (it already
   exists and matches best practice), then score every bullet against every requirement
   with **hybrid retrieval** — BM25 (FTS5) + cosine similarity fused by reciprocal rank
   fusion — producing a requirement × bullet **evidence matrix** with confidence
   thresholds. Entry ranking = aggregate of its bullets' evidence + recency prior.
   All deterministic, explainable, sub-millisecond at this corpus size.
3. **The LLM's selection role shrinks to what LLMs are good at**: a single listwise
   confirmation over a pre-scored shortlist (scores visible in the prompt), instead of
   raw relevance judgment over everything. Generation then receives ranked evidence per
   requirement — which also mechanizes the "most relevant bullet first" rule and turns
   the coverage meter from string matching into semantic evidence checking with a
   first-class gap report.

This is the two-stage shape used by LinkedIn (two-tower retrieval → cross-encoder
rerank) and the current academic SOTA (ConFit v3), scaled down to a single profile —
where the corpus is tiny but the *judge* is a local model whose pointwise relevance
scores are uncalibrated at any size, and whose per-token latency (real seconds at 35B)
makes every distractor in the prompt a cost the scoring layer eliminates.

## 2. Why change anything — what the research says is weak today

- **"It all fits in context" is true but insufficient.** Anthropic's own guidance says
  skip RAG under ~200k tokens, and the profile is far below that. But Chroma's Context
  Rot study (18 models) shows accuracy degrades with input length and **distractor
  count** even on trivially easy tasks — worst on small models. Irrelevant jobs and
  bullets in the selection prompt are distractors; scoring first and passing a shortlist
  improves the calls even though everything technically fits.
  (anthropic.com/engineering/contextual-retrieval; research.trychroma.com/context-rot)
- **Pointwise LLM relevance judgment is the documented anti-pattern.** Uncalibrated,
  drifts across prompts and candidate sets, "the worst of both worlds" (ZeroEntropy).
  That is exactly what the current selection prompt asks a small model to do. Cross-
  encoder-style deterministic scoring beat gpt-class rerankers on NDCG@10 at 17x lower
  latency. The one endorsed LLM mode: listwise over ≤10–30 pre-ranked candidates.
- **Holistic LLM match scores are weak; per-requirement verdicts with evidence are the
  state of the practice.** Zero-shot GPT-4 resume ratings "correlate minorly" with human
  recruiters (NAACL 2025). Ashby — the strongest product analog — evaluates each
  recruiter-defined criterion as Meets / Does not Meet / Unknown **with citations to the
  exact resume span**, and deliberately shows no overall score.
- **The one paper on exactly this use case** (single-candidate career-vault RAG for
  resume tailoring, arXiv 2605.05257) found retrieval **helped matching roles (+7.8 ATS
  points) and actively hurt mismatched roles (−8.0)** until gated by confidence
  thresholds — weak evidence must surface as a gap, never get force-fitted.
- **Structured output wants constraint, not trust**: unconstrained 7–14B models fail
  JSON ~25% of the time; a 35B-class model is markedly better, but grammar-constrained
  decoding (llama.cpp GBNF / `response_format`) is free insurance where the runtime
  supports it; keeping the schema flat fixes semantics; "Unknown" must be a first-class
  verdict so the model isn't forced to hallucinate a determination.

## 3. Evidence highlights per design choice

**Hybrid BM25 + dense, fused by RRF (k=60), is the uncontested default.**
Weaviate/Qdrant teach it as the standard; Anthropic's contextual-retrieval numbers embody
it (embeddings alone −35% retrieval failures; adding BM25 −49%; adding rerank −67%);
exact-term-heavy domains (skill tokens like "Kubernetes", "React") are BM25's home turf
and dense-only demonstrably misses them. RRF uses rank positions only — BM25 and cosine
scales are incomparable. (weaviate.io/blog/hybrid-search-explained;
simonwillison.net/2024/Oct/4 for the SQLite-specific pattern)

**Score bullets, not documents.** Eightfold layers structured features over embeddings
rather than trusting whole-doc cosine; the best small-hardware result in the literature
(arXiv 2601.10321) decomposes profiles into sentence "utterances", embeds each with a
frozen tiny encoder, and beats small-LLM rankers at 1/10th the compute (287ms with
precomputed profile embeddings). Bullet-level scoring is also the only way to rank
bullets *within* an entry — the current pipeline's blind spot.

**Contextual retrieval is free here.** Anthropic's technique (prepend situating context
before embedding and BM25-indexing) exists because their chunks come from unstructured
documents and need an LLM to write the context. AppChef's data is already structured —
the contextual prefix is a string template (title, company, dates, tech), zero LLM calls.

**Don't paraphrase the JD before matching.** The PJB benchmark found LLM query rewriting
*degraded* retrieval both times they tried it — structural phrasing carries matching
information. Extract requirements verbatim (the current keyword extraction already does
this — keep it); skip HyDE (it helps vague queries; a JD is document-shaped, and HyDE
measurably hurts specific queries).

**Separate must-have from nice-to-have as different signal types.** Formalized in
JobRec (qualification vs preference decoupling) and the PJB benchmark (parallel
checkable constraints vs serial inference); AppChef's mustHave/niceToHave split already
matches this — the scoring layer should preserve it rather than blending into one score.

**What is NOT justified at this scale** (explicit negative guidance from the research):
GraphRAG (the profile is already a typed graph; LLM entity extraction would be pointless
cost), agentic multi-hop retrieval (3–10x tokens, multiplies small-model error; Claude
Code's grep-only success depends on a frontier model driving iterations), a vector
database server (brute-force cosine over ≤1k vectors is sub-millisecond; the ANN
crossover is ~100k+ vectors), and fixed top-k cutoffs (use thresholds/adaptive-k so weak
matches read as gaps).

## 4. The local stack (verified against this repo)

Locally verified 2026-08-08: FTS5 with bm25() is **already compiled into the
better-sqlite3 build this app ships** (zero new deps for the keyword channel);
`sqlite-vec` 0.1.9 is on npm and `db.loadExtension` works; `@huggingface/transformers`
4.x is current on npm.

**Embedding model**: EmbeddingGemma-300m — 768d with Matryoshka truncation to 256
(re-normalize after truncating), ~300MB as q8 ONNX, <200MB RAM, and it outperformed
nomic-embed-text-v1.5 in the closest published analog (a Mistral-7B local resume-matching
pipeline, Electronics 14(24):4960). Runner-up: Qwen3-Embedding-0.6B (higher ceiling,
~640MB, needs last-token pooling — a real llama.cpp misconfiguration trap).

**Serving — recommended Option A: in-process via transformers.js** (`onnx-community/
embeddinggemma-300m-ONNX`, dtype q8; note fp16 breaks this model — q8/fp32 only).
Rationale: zero coupling to whichever chat runtime the user configured. The user's
endpoint may have no embedding model at all, and the failure modes of Option B are real:
a classic single-model `llama-server` returns 501 on `/v1/embeddings` (only the Dec 2025
router mode or a second `--embeddings` instance serves both), Ollama silently truncates
at its default `num_ctx`, and normalization differs by path — so Option B ("use my
server for embeddings", `POST {endpoint}/v1/embeddings`) should exist only as a settings
toggle with capability probing, layered over A. Always L2-normalize client-side; store
`(content_hash, model_id, dims)` with every vector; changing model triggers a visible
re-index, never silent garbage similarity.

**Storage**: normalized Float32Array BLOBs in the existing `appchef.db` + an FTS5
external-content table synced by triggers. At 100–500 bullets: ~1.5MB of vectors
(0.5MB at MRL-256) and sub-millisecond brute-force cosine in JS — `sqlite-vec` is the
growth path (metadata-filtered KNN in SQL), not a requirement.

**Reranker (optional Phase 3)**: only if hybrid quality proves insufficient — run
bge-reranker-v2-m3 **in-process via node-llama-cpp** (documented path). Avoid depending
on the user's runtime for this: Ollama has no rerank endpoint at all, and llama-server's
`/rerank` has an open garbage-scores bug (llama.cpp #16407) affecting Qwen3-Reranker
GGUFs among others. Budget 0.5–2s CPU for 20–50 pairs; make it async and optional.

## 5. Concrete AppChef architecture

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
1. JD ──LLM──→ requirements {targetTitle, mustHave[], niceToHave[]}   (exists today;
   keep phrasing verbatim, keep schema flat, prefer grammar-constrained JSON)
2. per requirement r:  RRF( BM25 rank over chunks, cosine rank over chunks )
   → evidence matrix M[r][chunk] with threshold τ  (below τ ⇒ requirement is a GAP)
3. entry score = Σ best-evidence of its bullets (must-haves weighted over nice-to-haves)
                 × recency prior          → deterministic entry ranking
4. LLM listwise pass (optional but recommended): shortlist + scores in prompt,
   final editorial pick — the LLM curates, it no longer searches
5. Generation prompt gains a requirement→evidence map:
   "Must-have 'Kubernetes': strongest evidence [S7], [S12]" — which mechanizes
   rule 8 (most relevant bullet first) instead of asking the model to infer it
6. Coverage meter upgrades from string matching to evidence checking:
   covered = keyword present AND evidence ≥ τ; below-τ requirements render as
   explicit gaps ("no supporting experience — add it to your profile")
```

### Phasing
- **Phase 1 — zero new dependencies**: FTS5 BM25 scoring + recency prior as the
  deterministic entry-ranking signal; selection call becomes listwise over the
  pre-ranked list. Ships the architecture change without any model download.
- **Phase 2 — the semantic half**: transformers.js + EmbeddingGemma, write-time
  embedding, RRF hybrid, requirement × bullet evidence matrix, gap-aware coverage
  meter, evidence-guided generation prompt. (This is the recommended end state.)
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
