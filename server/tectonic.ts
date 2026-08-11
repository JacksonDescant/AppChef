// ─── LaTeX compilation via tectonic + one-page enforcement ───────────────────

import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import os from 'node:os'
import path from 'node:path'
import { parseTagged, renderTex, dropOne, SQUEEZE_PRESETS } from './latex'

const execFileP = promisify(execFile)
const TECTONIC = process.env.TECTONIC_PATH ?? 'tectonic'
const MAX_DROPS = 10

export class LatexError extends Error {
  logTail: string
  constructor(message: string, logTail = '') {
    super(message)
    this.name = 'LatexError'
    this.logTail = logTail
  }
}

// ─── Availability check ──────────────────────────────────────────────────────
// Cached when true; re-checked while false so installing tectonic works
// without a server restart.

let available: boolean | null = null

export async function checkTectonic(): Promise<boolean> {
  if (available === true) return true
  try {
    await execFileP(TECTONIC, ['--version'], { timeout: 10_000 })
    available = true
  } catch {
    available = false
  }
  return available
}

// ─── Single compile ──────────────────────────────────────────────────────────

function tail(s: string, lines = 30): string {
  return s.split('\n').slice(-lines).join('\n')
}

async function compileTex(tex: string): Promise<{ pdf: Buffer; pages: number; fillPct: number | null }> {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'appchef-tex-'))
  try {
    const texPath = path.join(dir, 'resume.tex')
    await writeFile(texPath, tex)

    let log = ''
    try {
      // --print emits the full TeX log to stdout, which we need for the page count
      const { stdout, stderr } = await execFileP(
        TECTONIC,
        ['--outdir', dir, '--print', texPath],
        { timeout: 60_000, maxBuffer: 10 * 1024 * 1024 },
      )
      log = stdout + stderr
    } catch (e) {
      const err = e as Error & { stdout?: string; stderr?: string }
      throw new LatexError('LaTeX compilation failed', tail((err.stdout ?? '') + (err.stderr ?? '')))
    }

    const pdf = await readFile(path.join(dir, 'resume.pdf'))

    const m = log.match(/Output written on .*\((\d+) pages?/)
    const pages = m
      ? parseInt(m[1], 10)
      : (pdf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) ?? []).length
    if (!pages) throw new LatexError('Could not determine page count', tail(log))

    // Real page fill logged by renderTex — only meaningful for 1-page output
    const fill = log.match(/APPCHEF-FILL: ([\d.]+)pt\s*OF ([\d.]+)pt/)
    const fillPct = fill && pages === 1
      ? Math.min(100, Math.round((parseFloat(fill[1]) / parseFloat(fill[2])) * 100))
      : null

    return { pdf, pages, fillPct }
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}

// ─── One-page enforcement loop ───────────────────────────────────────────────
// Phase A: progressively tighter spacing presets.
// Phase B: at max squeeze, drop least-important content and recompile.

export interface CompiledResume { pdf: Buffer; fillPct: number | null }

const cache = new Map<string, CompiledResume>() // sha256(taggedText) → result, LRU, cap 10

export async function compileOnePageResume(taggedText: string): Promise<CompiledResume> {
  const key = createHash('sha256').update(taggedText).digest('hex')
  const hit = cache.get(key)
  if (hit) {
    cache.delete(key)
    cache.set(key, hit) // refresh LRU position
    return hit
  }

  const ir = parseTagged(taggedText)

  const done = (result: CompiledResume): CompiledResume => {
    cache.set(key, result)
    if (cache.size > 10) cache.delete(cache.keys().next().value!)
    return result
  }

  for (let i = 0; i < SQUEEZE_PRESETS.length; i++) {
    const { pdf, pages, fillPct } = await compileTex(renderTex(ir, SQUEEZE_PRESETS[i]))
    if (pages === 1) return done({ pdf, fillPct })
    console.log(`[pdf] squeeze preset ${i} → ${pages} pages, tightening`)
  }

  const maxSqueeze = SQUEEZE_PRESETS[SQUEEZE_PRESETS.length - 1]
  for (let i = 0; i < MAX_DROPS; i++) {
    if (!dropOne(ir)) break
    const { pdf, pages, fillPct } = await compileTex(renderTex(ir, maxSqueeze))
    if (pages === 1) {
      console.log(`[pdf] fit on one page after dropping ${i + 1} item(s)`)
      return done({ pdf, fillPct })
    }
  }

  throw new LatexError('Could not fit resume on one page')
}

// ─── Serialization ───────────────────────────────────────────────────────────
// The live preview can fire while a compile is in flight; run compiles one at
// a time so tectonic processes never pile up.

let chain: Promise<unknown> = Promise.resolve()

export function serialized<T>(fn: () => Promise<T>): Promise<T> {
  const next = chain.then(fn, fn)
  chain = next.catch(() => {})
  return next
}

// ─── Warm-up ─────────────────────────────────────────────────────────────────
// Tectonic downloads packages on first use; compile a tiny document at boot so
// the user's first preview doesn't absorb that latency.

export async function warmUp(): Promise<void> {
  const sample = [
    '[NAME]Warm Up',
    '[CONTACT]warmup@example.com',
    '[SECTION]INIT',
    '[JOB_CO]AppChef\tLocal',
    '[JOB_ROLE]Warm-up compile\tJan 2026 – Present',
    '[BULLET]Preloads tectonic packages at server start',
    '[BULLET]Keeps the first real preview fast',
  ].join('\n')
  try {
    console.log('[pdf] warming up tectonic (first run downloads LaTeX packages)…')
    await serialized(() => compileTex(renderTex(parseTagged(sample), SQUEEZE_PRESETS[0])))
    console.log('[pdf] tectonic ready')
  } catch (e) {
    const err = e as LatexError
    console.warn(`[pdf] warm-up compile failed: ${err.message}\n${err.logTail ?? ''}`)
  }
}
