// ─── In-process embeddings (docs/retrieval-research.md §4, Option A) ─────────
// nomic-embed-text-v1.5 via transformers.js: ungated on HF (EmbeddingGemma
// scores slightly higher but its repo requires license acceptance, which
// breaks the zero-friction offline story), Apache-2.0, 137M params, 768 dims,
// requires task prefixes. Downloads once to the HF cache (~140MB at q8), then
// fully offline. If the model can't load (no network on first run, platform
// issue), retrieval degrades to BM25-only — never blocks the server.

import { pipeline } from '@huggingface/transformers'

export const EMBEDDING_MODEL = process.env.EMBEDDING_MODEL ?? 'nomic-ai/nomic-embed-text-v1.5'
const DTYPE = 'q8'

type Extractor = (texts: string[], opts: { pooling: 'mean'; normalize: boolean }) => Promise<{ tolist(): number[][] }>

type State = 'idle' | 'loading' | 'ready' | 'unavailable'
let state: State = 'idle'
let extractor: Extractor | null = null
let loadPromise: Promise<void> | null = null

export function embeddingState(): State {
  return state
}

async function load(): Promise<void> {
  state = 'loading'
  try {
    console.log(`[retrieval] loading embedding model ${EMBEDDING_MODEL} (first run downloads ~140MB)…`)
    extractor = (await pipeline('feature-extraction', EMBEDDING_MODEL, {
      dtype: DTYPE,
    })) as unknown as Extractor
    state = 'ready'
    console.log('[retrieval] embedding model ready')
  } catch (e) {
    state = 'unavailable'
    console.warn(`[retrieval] embedding model unavailable — retrieval will use keyword matching only: ${(e as Error).message}`)
  }
}

export function ensureEmbeddings(): Promise<void> {
  if (!loadPromise) loadPromise = load()
  return loadPromise
}

// nomic v1.5 was trained with task prefixes; using them matters for quality.
export async function embedDocuments(texts: string[]): Promise<Float32Array[] | null> {
  await ensureEmbeddings()
  if (state !== 'ready' || !extractor) return null
  const out = await extractor(texts.map(t => `search_document: ${t}`), { pooling: 'mean', normalize: true })
  return out.tolist().map(v => Float32Array.from(v))
}

export async function embedQuery(text: string): Promise<Float32Array | null> {
  await ensureEmbeddings()
  if (state !== 'ready' || !extractor) return null
  const out = await extractor([`search_query: ${text}`], { pooling: 'mean', normalize: true })
  return Float32Array.from(out.tolist()[0])
}

// Vectors are L2-normalized by the pipeline, so dot product = cosine.
export function cosine(a: Float32Array, b: Float32Array): number {
  let s = 0
  const n = Math.min(a.length, b.length)
  for (let i = 0; i < n; i++) s += a[i] * b[i]
  return s
}
