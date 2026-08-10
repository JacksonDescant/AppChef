// ─── Retrieval index write path (docs/retrieval-research.md §5) ──────────────
// Rebuilds the chunks table from profile data on every mutation. Each bullet
// is wrapped in a deterministic context template before indexing — Anthropic's
// "contextual retrieval" for free, since the data is already structured. Only
// chunks whose content hash changed lose their embedding; a serialized async
// queue refills missing embeddings without blocking CRUD responses.

import { createHash } from 'node:crypto'
import { db, rawDb } from './db/index'
import { jobs, projects, skills } from './db/schema'
import { EMBEDDING_MODEL, embedDocuments, embeddingState } from './embeddings'

interface ChunkSpec {
  id: string
  kind: 'bullet' | 'skill' | 'entry'
  parentKind: 'job' | 'project' | 'skill'
  parentId: string
  text: string      // contextualized — what gets embedded and FTS-indexed
  rawText: string   // the bare bullet/skill text shown in evidence
}

function fmtDates(start: string, end: string, current: boolean): string {
  const e = current ? 'Present' : end
  return [start, e].filter(Boolean).join(' – ')
}

function jobTitle(j: { title: string; displayTitle: string }): string {
  const alias = j.displayTitle?.trim()
  return alias && alias !== j.title ? `${alias} (${j.title})` : j.title
}

function splitBullets(s: string | null | undefined): string[] {
  return (s ?? '').split('\n').map(l => l.trim()).filter(Boolean)
}

function buildChunkSpecs(): ChunkSpec[] {
  const specs: ChunkSpec[] = []

  for (const j of db.select().from(jobs).all()) {
    const ctx = `${jobTitle(j)} at ${j.company} (${fmtDates(j.startDate, j.endDate, j.current)})`
    if (j.description?.trim()) {
      specs.push({
        id: `job:${j.id}:entry`, kind: 'entry', parentKind: 'job', parentId: j.id,
        text: `${ctx} — ${j.description.trim()}`, rawText: j.description.trim(),
      })
    }
    splitBullets(j.bullets).forEach((b, i) => {
      specs.push({
        id: `job:${j.id}:b${i}`, kind: 'bullet', parentKind: 'job', parentId: j.id,
        text: `${ctx} — ${b}`, rawText: b,
      })
    })
  }

  for (const p of db.select().from(projects).all()) {
    const tech = p.technologies?.trim() ? ` (${p.technologies.trim()})` : ''
    const ctx = `Project ${p.name}${tech}`
    if (p.description?.trim()) {
      specs.push({
        id: `project:${p.id}:entry`, kind: 'entry', parentKind: 'project', parentId: p.id,
        text: `${ctx} — ${p.description.trim()}`, rawText: p.description.trim(),
      })
    }
    splitBullets(p.bullets).forEach((b, i) => {
      specs.push({
        id: `project:${p.id}:b${i}`, kind: 'bullet', parentKind: 'project', parentId: p.id,
        text: `${ctx} — ${b}`, rawText: b,
      })
    })
  }

  for (const s of db.select().from(skills).all()) {
    const cat = s.category?.trim() ? `${s.category.trim()}: ` : ''
    specs.push({
      id: `skill:${s.id}`, kind: 'skill', parentKind: 'skill', parentId: s.id,
      text: `Skill — ${cat}${s.name}`, rawText: s.name,
    })
  }

  return specs
}

// Prepared lazily — at module-load time initDb() hasn't created the table yet
// (ESM imports are hoisted above the initDb() call in server/index.ts).
let upsertChunkStmt: ReturnType<typeof rawDb.prepare> | null = null
function upsertChunk() {
  upsertChunkStmt ??= rawDb.prepare(`
    INSERT INTO chunks (id, kind, parent_kind, parent_id, text, raw_text, content_hash, model_id, dims, embedding, updated_at)
    VALUES (@id, @kind, @parentKind, @parentId, @text, @rawText, @hash, '', 0, NULL, @now)
    ON CONFLICT(id) DO UPDATE SET
      kind = excluded.kind, parent_kind = excluded.parent_kind, parent_id = excluded.parent_id,
      text = excluded.text, raw_text = excluded.raw_text, content_hash = excluded.content_hash,
      model_id = '', dims = 0, embedding = NULL, updated_at = excluded.updated_at
    WHERE chunks.content_hash != excluded.content_hash OR chunks.model_id != @model
  `)
  return upsertChunkStmt
}

// Full rebuild, diffed by content hash so unchanged rows keep their embeddings.
// At a few hundred chunks this is sub-millisecond; correctness over cleverness.
export const reindexChunks = rawDb.transaction(() => {
  const specs = buildChunkSpecs()
  const now = new Date().toISOString()
  const keep = new Set(specs.map(s => s.id))

  for (const row of rawDb.prepare('SELECT id FROM chunks').all() as { id: string }[]) {
    if (!keep.has(row.id)) rawDb.prepare('DELETE FROM chunks WHERE id = ?').run(row.id)
  }
  for (const s of specs) {
    const hash = createHash('sha256').update(s.text).digest('hex')
    upsertChunk().run({ ...s, hash, now, model: EMBEDDING_MODEL })
  }

  rawDb.prepare('DELETE FROM chunks_fts').run()
  const insFts = rawDb.prepare('INSERT INTO chunks_fts (text, chunk_id) VALUES (?, ?)')
  for (const s of specs) insFts.run(s.text, s.id)
})

// ─── Async embedding queue ───────────────────────────────────────────────────

let embedChain: Promise<void> = Promise.resolve()

export function scheduleEmbedding(): void {
  // The tail .catch keeps a queue failure from becoming an unhandled
  // rejection, which would take down the whole server process.
  embedChain = embedChain.then(embedPending, embedPending)
    .catch(e => console.warn(`[retrieval] embed queue error: ${(e as Error).message}`))
}

async function embedPending(): Promise<void> {
  const pending = rawDb
    .prepare('SELECT id, text FROM chunks WHERE embedding IS NULL ORDER BY id')
    .all() as { id: string; text: string }[]
  if (pending.length === 0) return

  const BATCH = 16
  for (let i = 0; i < pending.length; i += BATCH) {
    const batch = pending.slice(i, i + BATCH)
    const vectors = await embedDocuments(batch.map(b => b.text))
    if (!vectors) return // model unavailable — BM25-only until next reindex retries
    const write = rawDb.prepare('UPDATE chunks SET embedding = ?, model_id = ?, dims = ? WHERE id = ?')
    batch.forEach((b, j) => {
      const v = vectors[j]
      write.run(Buffer.from(v.buffer, v.byteOffset, v.byteLength), EMBEDDING_MODEL, v.length, b.id)
    })
  }
  console.log(`[retrieval] embedded ${pending.length} chunk(s)`)
}

// Debounced mutation hook: rebuild the index shortly after profile edits settle.
let reindexTimer: ReturnType<typeof setTimeout> | null = null

export function scheduleReindex(): void {
  if (reindexTimer) clearTimeout(reindexTimer)
  reindexTimer = setTimeout(() => {
    try {
      reindexChunks()
      scheduleEmbedding()
    } catch (e) {
      console.warn(`[retrieval] reindex failed: ${(e as Error).message}`)
    }
  }, 400)
}

export function indexStatus(): { chunks: number; embedded: number; embeddings: string } {
  const { n } = rawDb.prepare('SELECT COUNT(*) AS n FROM chunks').get() as { n: number }
  const { e } = rawDb.prepare('SELECT COUNT(*) AS e FROM chunks WHERE embedding IS NOT NULL').get() as { e: number }
  return { chunks: n, embedded: e, embeddings: embeddingState() }
}
