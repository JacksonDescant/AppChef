// ─── Query-path scoring (docs/retrieval-research.md §5) ──────────────────────
// Per JD requirement: BM25 over FTS5 + brute-force cosine over chunk vectors,
// fused by reciprocal rank fusion (rank-based — the two score scales are
// incomparable). Produces the requirement × chunk evidence matrix, a
// confidence-gated covered/gap verdict per requirement, and a
// recency-weighted entry ranking. Brute force is the right call at this scale:
// a few hundred vectors is sub-millisecond, and the ANN crossover is ~100k+.
//
// Variety layer (docs/retrieval-research.md §7): requirement contributions are
// weighted by discriminativeness, entry/bullet ranks take bounded seeded
// jitter so near-ties explore across generations, and each entry's bullet
// order is diversified with MMR. With no seed the whole path is deterministic.

import { db, rawDb } from './db/index'
import { jobs, projects } from './db/schema'
import type { BulletRank, EvidenceHit, RankedEntry, RequirementEvidence, RequirementInput, RetrievalResult } from '../src/types'
import { cosine, embedQuery, embeddingState, ensureEmbeddings } from './embeddings'

const RRF_K = 60          // standard reciprocal-rank-fusion constant
const COSINE_TAU = 0.55   // confidence gate: below this (and no exact hit) ⇒ gap
const NICE_WEIGHT = 0.4   // nice-to-have requirements count less than must-haves
const TOP_EVIDENCE = 5
const RECENCY_DECAY = 0.15 // score multiplier 1/(1 + 0.15 × years since role ended)
const JITTER_TAU = 0.08          // entry jitter half-width — a swap needs a gap < 0.16
const JITTER_TAU_BULLETS = 0.05  // bullet jitter half-width (per-entry normalized rel)
const MMR_LAMBDA = 0.7           // bullet diversity: relevance vs redundancy trade-off

// English function words plus JD boilerplate. Without this filter the
// OR-of-tokens BM25 query for a phrase like "infrastructure as code" matches
// nearly every chunk through "as", compressing all entry scores toward each
// other. The exact-phrase query (coverage's exactHit) never uses this filter.
const STOPWORDS = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'by', 'for', 'from', 'has', 'have',
  'in', 'into', 'is', 'it', 'of', 'on', 'or', 'that', 'the', 'their', 'this',
  'to', 'with', 'you', 'your', 'we', 'our', 'will', 'can', 'using', 'use',
  'used', 'including', 'other', 'such', 'etc',
  'experience', 'experienced', 'years', 'year', 'knowledge', 'ability',
  'strong', 'proficiency', 'proficient', 'familiarity', 'familiar', 'working',
  'skills', 'skill', 'understanding', 'plus', 'preferred', 'required',
  'requirements', 'excellent', 'demonstrated', 'background', 'related',
  'relevant', 'tools', 'technologies',
])
// Short tokens that are real tech terms. Anything containing a digit (s3,
// k8s, ec2) survives unconditionally. unicode61 splits "#"/"+" at match time
// anyway — this list only decides survival into the OR query.
const SHORT_TECH = new Set(['c', 'r', 'go', 'ai', 'ml', 'ci', 'cd', 'qa', 'js', 'ts', 'ui', 'ux', 'db', 'os', 'bi', 'c#', 'f#', 'py'])

interface ChunkRow {
  id: string
  kind: string
  parent_kind: 'job' | 'project' | 'skill'
  parent_id: string
  raw_text: string
  embedding: Buffer | null
}

function rawTokens(text: string): string[] {
  return (text.match(/[A-Za-z0-9+#.]+/g) ?? []).filter(t => t.length > 1 || /[a-z]/i.test(t))
}

function ftsTokens(text: string): string[] {
  const raw = rawTokens(text)
  const filtered = raw.filter(t => {
    const lc = t.toLowerCase()
    if (STOPWORDS.has(lc)) return false
    if (/\d/.test(lc)) return true                 // s3, ec2, k8s
    if (lc.length <= 2) return SHORT_TECH.has(lc)  // drop "as"/"of"…; keep Go/ML/C#…
    return true
  })
  // A requirement made entirely of filler still deserves keyword evidence —
  // never regress to an empty query.
  return filtered.length > 0 ? filtered : raw
}

// Deterministic PRNG for seeded jitter — Math.random would make "same seed ⇒
// same ranking" untestable. Callers derive independent substreams per use
// site (XORed salts) so job/project/bullet draws don't perturb each other.
function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// U(−τ, τ): BOUNDED noise. Two entries can swap only when their base-score
// gap is under 2τ — the "randomize near-ties, never demote a clear winner"
// contract. (Gumbel/Gaussian tails would occasionally vault weak entries.)
const jitter = (rng: () => number, tau: number) => (rng() * 2 - 1) * tau

function ftsRanks(match: string, limit = 100): Map<string, number> {
  const out = new Map<string, number>()
  if (!match) return out
  try {
    const rows = rawDb
      .prepare('SELECT chunk_id FROM chunks_fts WHERE chunks_fts MATCH ? ORDER BY rank LIMIT ?')
      .all(match, limit) as { chunk_id: string }[]
    rows.forEach((r, i) => out.set(r.chunk_id, i + 1))
  } catch {
    // malformed MATCH despite sanitization — treat as no keyword evidence
  }
  return out
}

function yearsSinceEnd(endDate: string, current: boolean): number {
  if (current || !endDate) return 0
  const [y, m] = endDate.split('-').map(s => parseInt(s, 10))
  if (!y) return 0
  const now = new Date()
  return Math.max(0, (now.getFullYear() - y) + ((now.getMonth() + 1) - (m || 12)) / 12)
}

const recencyMult = (years: number) => 1 / (1 + RECENCY_DECAY * years)

// Greedy maximal-marginal-relevance: each next pick trades relevance against
// similarity to bullets already picked in this entry, so an entry's top
// bullets stop being three rewordings of the same achievement.
function mmrOrder(
  items: { c: ChunkRow; idx: number; rel: number }[],
  vectors: Map<string, Float32Array>,
): { c: ChunkRow; idx: number; rel: number }[] {
  const picked: typeof items = []
  const pool = [...items]
  while (pool.length > 0) {
    let bestK = 0
    let bestVal = -Infinity
    for (let k = 0; k < pool.length; k++) {
      const maxSim = picked.length === 0
        ? 0
        : Math.max(...picked.map(p => cosine(vectors.get(pool[k].c.id)!, vectors.get(p.c.id)!)))
      const val = MMR_LAMBDA * pool[k].rel - (1 - MMR_LAMBDA) * maxSim
      if (val > bestVal + 1e-12 || (Math.abs(val - bestVal) <= 1e-12 && pool[k].idx < pool[bestK].idx)) {
        bestK = k
        bestVal = val
      }
    }
    picked.push(pool.splice(bestK, 1)[0])
  }
  return picked
}

export async function retrieve(requirements: RequirementInput[], seed: number | null = null): Promise<RetrievalResult> {
  const chunks = rawDb
    .prepare('SELECT id, kind, parent_kind, parent_id, raw_text, embedding FROM chunks')
    .all() as ChunkRow[]
  const byId = new Map(chunks.map(c => [c.id, c]))

  const vectors = new Map<string, Float32Array>()
  for (const c of chunks) {
    if (c.embedding) {
      vectors.set(c.id, new Float32Array(c.embedding.buffer, c.embedding.byteOffset, c.embedding.byteLength / 4))
    }
  }
  // Stored vectors are useless without the query-side model — make sure it is
  // loaded (memoized; the boot warm-up usually finished long ago) rather than
  // silently degrading to keyword-only when the boot had nothing to embed.
  if (vectors.size > 0) await ensureEmbeddings()
  const embeddingsUsed = vectors.size > 0 && embeddingState() === 'ready'

  // fused score per requirement per chunk; also each chunk's best score overall
  const reqEvidence: RequirementEvidence[] = []
  const entryBest = new Map<string, Map<number, number>>() // parentKey -> reqIdx -> weighted fused
  const chunkBest = new Map<string, number>()

  for (let ri = 0; ri < requirements.length; ri++) {
    const req = requirements[ri]
    const nRawTokens = rawTokens(req.text).length
    const tokens = ftsTokens(req.text)
    const orQuery = tokens.map(t => `"${t.replace(/"/g, '""')}"`).join(' OR ')
    // The phrase gate keys on the RAW token shape — stopword filtering must
    // never cost a multi-word requirement its exact-phrase coverage check.
    const phraseQuery = nRawTokens > 1 ? `"${req.text.replace(/"/g, '""')}"` : orQuery

    const bmRanks = ftsRanks(orQuery)
    const phraseHits = ftsRanks(phraseQuery, 20)

    const cosRanked: { id: string; cos: number }[] = []
    if (embeddingsUsed) {
      const qv = await embedQuery(req.text)
      if (qv) {
        for (const [id, v] of vectors) cosRanked.push({ id, cos: cosine(qv, v) })
        cosRanked.sort((a, b) => b.cos - a.cos)
      }
    }
    const cosRanks = new Map(cosRanked.map((c, i) => [c.id, { rank: i + 1, cos: c.cos }]))

    const fused = new Map<string, { score: number; cos: number | null }>()
    for (const [id, rank] of bmRanks) {
      fused.set(id, { score: 1 / (RRF_K + rank), cos: cosRanks.get(id)?.cos ?? null })
    }
    for (const [id, { rank, cos }] of cosRanks) {
      // cosine ranks cover every embedded chunk — only fuse meaningful ones
      if (cos < 0.3 && !fused.has(id)) continue
      const prev = fused.get(id)
      fused.set(id, { score: (prev?.score ?? 0) + 1 / (RRF_K + rank), cos })
    }

    const sorted = [...fused.entries()].sort((a, b) => b[1].score - a[1].score)
    const topEvidence: EvidenceHit[] = sorted.slice(0, TOP_EVIDENCE).map(([id, s]) => {
      const c = byId.get(id)!
      return { chunkId: id, parentKind: c.parent_kind, parentId: c.parent_id, rawText: c.raw_text, score: s.score, cosine: s.cos }
    })

    const bestCos = cosRanked[0]?.cos ?? 0
    const exactHit = phraseHits.size > 0
    const covered = embeddingsUsed ? (exactHit || bestCos >= COSINE_TAU) : bmRanks.size > 0

    reqEvidence.push({ text: req.text, required: req.required, covered, topEvidence })

    const weight = req.required ? 1 : NICE_WEIGHT
    const topSet = new Set(sorted.slice(0, 10).map(([id]) => id))
    // This requirement's per-entry best evidence, accumulated locally so the
    // flush below can scale by how discriminative the requirement turned out.
    const reqEntryBest = new Map<string, number>()
    for (const [id, s] of fused) {
      const c = byId.get(id)!
      chunkBest.set(id, Math.max(chunkBest.get(id) ?? 0, s.score))
      if (c.parent_kind === 'skill') continue // skills inform coverage, not entry rank
      // An entry only "matches" a requirement on evidence that clears the same
      // bar as coverage — sub-threshold cosine noise must not inflate scores
      // or show up as "evidence for: X" in the shortlist prompt.
      if (!covered) continue
      const strongChunk = bmRanks.has(id) || (s.cos != null && s.cos >= COSINE_TAU)
      if (!strongChunk || !topSet.has(id)) continue
      const key = `${c.parent_kind}:${c.parent_id}`
      reqEntryBest.set(key, Math.max(reqEntryBest.get(key) ?? 0, s.score))
    }
    // Discriminativeness: a requirement only one entry evidences should decide
    // rankings; one every entry evidences should mostly cancel out. Coverage
    // verdicts, topEvidence, and matched lists are unaffected — only the
    // score contribution scales.
    const discrim = reqEntryBest.size > 0 ? 1 / (1 + Math.log2(reqEntryBest.size)) : 1
    for (const [key, best] of reqEntryBest) {
      if (!entryBest.has(key)) entryBest.set(key, new Map())
      entryBest.get(key)!.set(ri, best * weight * discrim)
    }
  }

  // ── Entry ranking: evidence aggregate × recency prior, near-tie jitter ─────
  const jobRows = db.select().from(jobs).all()
  const projectRows = db.select().from(projects).all()
  const rngJobs = seed != null ? mulberry32(seed ^ 0x9e3779b9) : null
  const rngProjects = seed != null ? mulberry32(seed ^ 0x85ebca6b) : null
  const rngBullets = seed != null ? mulberry32(seed ^ 0xc2b2ae35) : null

  function rank(
    kind: 'job' | 'project',
    rows: { id: string; endDate: string; current?: boolean }[],
    rng: (() => number) | null,
  ): RankedEntry[] {
    const scored = rows.map(r => {
      const m = entryBest.get(`${kind}:${r.id}`)
      const evidence = m ? [...m.values()].reduce((a, b) => a + b, 0) : 0
      const matched = m ? [...m.keys()].map(ri => requirements[ri].text) : []
      const years = yearsSinceEnd(r.endDate, Boolean(r.current))
      return { id: r.id, raw: evidence * recencyMult(years), matched, years }
    })
    scored.sort((a, b) => (b.raw - a.raw) || (a.years - b.years))
    const max = scored[0]?.raw || 0
    if (max === 0 || !rng) {
      // No evidence at all (the recency fallback must stay deterministic) or
      // jitter disabled — legacy behavior, identical ordering.
      return scored.map(s => {
        const base = max > 0 ? s.raw / max : 0
        return { id: s.id, score: base, baseScore: base, matched: s.matched }
      })
    }
    // Bounded jitter on normalized scores. Zero-evidence entries are never
    // jittered and positive-evidence keys are floored above zero, so evidence
    // always outranks no-evidence.
    const keyed = scored.map(s => {
      const base = s.raw / max
      return { ...s, base, key: base > 0 ? Math.max(base + jitter(rng, JITTER_TAU), 1e-4) : 0 }
    })
    keyed.sort((a, b) => (b.key - a.key) || (a.years - b.years))
    // Return the re-normalized jittered keys as the display score: the
    // shortlist prompt prints scores in rank order with "trust the ranking" —
    // pre-jitter values would show inversions and invite the LLM to undo the
    // swap the jitter just made.
    const maxKey = keyed[0]?.key || 0
    return keyed.map(s => ({
      id: s.id,
      score: maxKey > 0 ? s.key / maxKey : 0,
      baseScore: s.base,
      matched: s.matched,
    }))
  }

  // ── Within-entry bullet ranking: normalize → jitter → MMR diversity ───────
  const bulletRanks: Record<string, BulletRank[]> = {}
  const byParent = new Map<string, ChunkRow[]>()
  for (const c of chunks) {
    if (c.kind !== 'bullet') continue
    const list = byParent.get(c.parent_id) ?? []
    list.push(c)
    byParent.set(c.parent_id, list)
  }
  const originalIndex = (c: ChunkRow) => parseInt(c.id.split(':b')[1] ?? '0', 10)
  for (const [parentId, list] of byParent) {
    const maxRel = Math.max(...list.map(c => chunkBest.get(c.id) ?? 0))
    if (maxRel === 0) {
      // No JD evidence anywhere in this entry — the author's own order is the
      // best importance signal; noise or diversity here would be pure churn.
      bulletRanks[parentId] = [...list]
        .sort((a, b) => originalIndex(a) - originalIndex(b))
        .map(c => ({ text: c.raw_text, score: 0 }))
      continue
    }
    const items = list.map(c => ({
      c,
      idx: originalIndex(c),
      rel: (chunkBest.get(c.id) ?? 0) / maxRel,
    }))
    if (rngBullets) {
      for (const it of items) {
        if (it.rel > 0) it.rel = Math.max(it.rel + jitter(rngBullets, JITTER_TAU_BULLETS), 1e-4)
      }
    }
    // MMR needs a vector for every bullet — a mixed entry would hand
    // unembedded bullets a free pass on the redundancy penalty.
    const allEmbedded = embeddingsUsed && items.every(it => vectors.has(it.c.id))
    const ordered = allEmbedded
      ? mmrOrder(items, vectors)
      : [...items].sort((a, b) => (b.rel - a.rel) || (a.idx - b.idx))
    bulletRanks[parentId] = ordered.map(it => ({
      text: it.c.raw_text,
      score: Math.max(0, Math.min(1, it.rel)),
    }))
  }

  return {
    requirements: reqEvidence,
    rankedJobs: rank('job', jobRows, rngJobs),
    rankedProjects: rank('project', projectRows, rngProjects),
    bulletRanks,
    embeddingsUsed,
    indexedChunks: chunks.length,
    seed,
  }
}
