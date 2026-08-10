// ─── Query-path scoring (docs/retrieval-research.md §5) ──────────────────────
// Per JD requirement: BM25 over FTS5 + brute-force cosine over chunk vectors,
// fused by reciprocal rank fusion (rank-based — the two score scales are
// incomparable). Produces the requirement × chunk evidence matrix, a
// confidence-gated covered/gap verdict per requirement, and a deterministic
// recency-weighted entry ranking. Brute force is the right call at this scale:
// a few hundred vectors is sub-millisecond, and the ANN crossover is ~100k+.

import { db, rawDb } from './db/index'
import { jobs, projects } from './db/schema'
import type { EvidenceHit, RankedEntry, RequirementEvidence, RequirementInput, RetrievalResult } from '../src/types'
import { cosine, embedQuery, embeddingState, ensureEmbeddings } from './embeddings'

const RRF_K = 60          // standard reciprocal-rank-fusion constant
const COSINE_TAU = 0.55   // confidence gate: below this (and no exact hit) ⇒ gap
const NICE_WEIGHT = 0.4   // nice-to-have requirements count less than must-haves
const TOP_EVIDENCE = 5
const RECENCY_DECAY = 0.15 // score multiplier 1/(1 + 0.15 × years since role ended)

interface ChunkRow {
  id: string
  kind: string
  parent_kind: 'job' | 'project' | 'skill'
  parent_id: string
  raw_text: string
  embedding: Buffer | null
}

function ftsTokens(text: string): string[] {
  return (text.match(/[A-Za-z0-9+#.]+/g) ?? []).filter(t => t.length > 1 || /[a-z]/i.test(t))
}

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

export async function retrieve(requirements: RequirementInput[]): Promise<RetrievalResult> {
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
  const entryBest = new Map<string, Map<number, number>>() // parentKey -> reqIdx -> best fused
  const chunkBest = new Map<string, number>()

  for (let ri = 0; ri < requirements.length; ri++) {
    const req = requirements[ri]
    const tokens = ftsTokens(req.text)
    const orQuery = tokens.map(t => `"${t.replace(/"/g, '""')}"`).join(' OR ')
    const phraseQuery = tokens.length > 1 ? `"${req.text.replace(/"/g, '""')}"` : orQuery

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
      if (!entryBest.has(key)) entryBest.set(key, new Map())
      const m = entryBest.get(key)!
      m.set(ri, Math.max(m.get(ri) ?? 0, s.score * weight))
    }
  }

  // ── Entry ranking: evidence aggregate × recency prior ──────────────────────
  const jobRows = db.select().from(jobs).all()
  const projectRows = db.select().from(projects).all()

  function rank(kind: 'job' | 'project', rows: { id: string; endDate: string; current?: boolean }[]): RankedEntry[] {
    const scored = rows.map(r => {
      const m = entryBest.get(`${kind}:${r.id}`)
      const evidence = m ? [...m.values()].reduce((a, b) => a + b, 0) : 0
      const matched = m ? [...m.keys()].map(ri => requirements[ri].text) : []
      const years = yearsSinceEnd(r.endDate, Boolean(r.current))
      return { id: r.id, raw: evidence * recencyMult(years), matched, years }
    })
    scored.sort((a, b) => (b.raw - a.raw) || (a.years - b.years))
    const max = scored[0]?.raw || 0
    return scored.map(s => ({ id: s.id, score: max > 0 ? s.raw / max : 0, matched: s.matched }))
  }

  // ── Within-entry bullet ranking (best evidence first) ──────────────────────
  const bulletRanks: Record<string, string[]> = {}
  const byParent = new Map<string, ChunkRow[]>()
  for (const c of chunks) {
    if (c.kind !== 'bullet') continue
    const list = byParent.get(c.parent_id) ?? []
    list.push(c)
    byParent.set(c.parent_id, list)
  }
  for (const [parentId, list] of byParent) {
    const originalIndex = (c: ChunkRow) => parseInt(c.id.split(':b')[1] ?? '0', 10)
    bulletRanks[parentId] = [...list]
      .sort((a, b) => (chunkBest.get(b.id) ?? 0) - (chunkBest.get(a.id) ?? 0) || originalIndex(a) - originalIndex(b))
      .map(c => c.raw_text)
  }

  return {
    requirements: reqEvidence,
    rankedJobs: rank('job', jobRows),
    rankedProjects: rank('project', projectRows),
    bulletRanks,
    embeddingsUsed,
    indexedChunks: chunks.length,
  }
}
