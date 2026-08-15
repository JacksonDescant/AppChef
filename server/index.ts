import express from 'express'
import cors from 'cors'
import { randomUUID } from 'crypto'
import { Readability } from '@mozilla/readability'
import { JSDOM } from 'jsdom'
import { checkTectonic, compileOnePageResume, serialized, warmUp, LatexError } from './tectonic'
import { db, initDb, rawDb } from './db/index'
import { jobs, education, projects, skills, targetJobs, applications, settings, profile, savedResumes } from './db/schema'
import { eq, getTableColumns } from 'drizzle-orm'
import { indexStatus, reindexChunks, scheduleEmbedding, scheduleReindex } from './chunks'
import { ensureEmbeddings } from './embeddings'
import { retrieve } from './retrieval'
import type { RequirementInput } from '../src/types'

const app = express()
app.use(cors({ origin: ['http://localhost:5173', 'http://localhost:4173'] }))
// Default 100kb is too small for backup imports (saved resumes alone exceed it)
app.use(express.json({ limit: '25mb' }))

initDb()

// ─── Generic CRUD factory ───────────────────────────────────────────────────

function crudRoutes<T extends { id: string }>(
  router: express.Router,
  path: string,
  table: Parameters<typeof db.select>[0] extends never ? never : any, // drizzle table
  onChange?: () => void,
) {
  router.get(path, (_req, res) => {
    res.json(db.select().from(table).all())
  })

  router.post(path, (req, res) => {
    const item = { id: randomUUID(), ...req.body } as T
    db.insert(table).values(item).run()
    onChange?.()
    res.status(201).json(item)
  })

  router.put(`${path}/:id`, (req, res) => {
    const { id } = req.params
    db.update(table).set(req.body).where(eq(table.id, id)).run()
    onChange?.()
    res.json({ id, ...req.body })
  })

  router.delete(`${path}/:id`, (req, res) => {
    db.delete(table).where(eq(table.id, req.params.id)).run()
    onChange?.()
    res.status(204).end()
  })
}

const router = express.Router()

// Retrieval-indexed tables rebuild their chunk index after mutations
crudRoutes(router, '/jobs', jobs, scheduleReindex)
crudRoutes(router, '/education', education)
crudRoutes(router, '/projects', projects, scheduleReindex)
crudRoutes(router, '/skills', skills, scheduleReindex)
crudRoutes(router, '/target-jobs', targetJobs)

// ─── Retrieval (docs/retrieval-research.md) ─────────────────────────────────

router.post('/retrieve', (req, res) => {
  const raw = (req.body as { requirements?: unknown })?.requirements
  const requirements: RequirementInput[] = Array.isArray(raw)
    ? (raw as RequirementInput[])
        .filter(r => typeof r?.text === 'string' && r.text.trim())
        .map(r => ({ text: r.text.trim().slice(0, 200), required: Boolean(r.required) }))
        .slice(0, 30)
    : []
  retrieve(requirements)
    .then(result => res.json(result))
    .catch((e: Error) => res.status(500).json({ error: e.message }))
})

router.get('/retrieval-status', (_req, res) => {
  res.json(indexStatus())
})

// ─── Applications (with CSV export) ─────────────────────────────────────────

router.get('/applications', (_req, res) => {
  res.json(db.select().from(applications).all())
})

router.post('/applications', (req, res) => {
  const item = {
    id: randomUUID(),
    createdAt: new Date().toISOString(),
    ...req.body,
  }
  db.insert(applications).values(item).run()
  res.status(201).json(item)
})

router.put('/applications/:id', (req, res) => {
  const { id } = req.params
  db.update(applications).set(req.body).where(eq(applications.id, id)).run()
  res.json({ id, ...req.body })
})

router.delete('/applications/:id', (req, res) => {
  db.delete(applications).where(eq(applications.id, req.params.id)).run()
  res.status(204).end()
})

router.get('/applications/export.csv', (_req, res) => {
  const rows = db.select().from(applications).all()
  const headers = ['company', 'role', 'status', 'appliedAt', 'url', 'notes']
  const csv = [
    headers.join(','),
    ...rows.map(r =>
      headers.map(h => `"${String((r as Record<string, unknown>)[h] ?? '').replace(/"/g, '""')}"`).join(',')
    ),
  ].join('\n')

  res.setHeader('Content-Type', 'text/csv')
  res.setHeader('Content-Disposition', 'attachment; filename="applications.csv"')
  res.send(csv)
})

// ─── Saved Resumes ───────────────────────────────────────────────────────────

router.get('/saved-resumes', (_req, res) => {
  const rows = db.select().from(savedResumes).all()
  rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  res.json(rows)
})

router.post('/saved-resumes', (req, res) => {
  const item = { id: randomUUID(), createdAt: new Date().toISOString(), ...req.body }
  db.insert(savedResumes).values(item).run()
  res.status(201).json(item)
})

router.delete('/saved-resumes/:id', (req, res) => {
  db.delete(savedResumes).where(eq(savedResumes.id, req.params.id)).run()
  res.status(204).end()
})

// ─── Profile (singleton row id=1) ────────────────────────────────────────────

router.get('/profile', (_req, res) => {
  const row = db.select().from(profile).where(eq(profile.id, 1)).get()
  res.json(row)
})

router.put('/profile', (req, res) => {
  db.update(profile).set(req.body).where(eq(profile.id, 1)).run()
  const updated = db.select().from(profile).where(eq(profile.id, 1)).get()
  res.json(updated)
})

// ─── Settings (singleton row id=1) ───────────────────────────────────────────

router.get('/settings', (_req, res) => {
  const row = db.select().from(settings).where(eq(settings.id, 1)).get()
  res.json(row)
})

router.put('/settings', (req, res) => {
  db.update(settings).set(req.body).where(eq(settings.id, 1)).run()
  const updated = db.select().from(settings).where(eq(settings.id, 1)).get()
  res.json(updated)
})

// ─── Resume data export / import (JSON backup) ──────────────────────────────
// Scope matches the app's Resume view: profile + the sections below. App
// state (target jobs, application tracker, saved-resume history) and
// machine-local settings are deliberately excluded.

const DATA_SECTIONS = [
  { key: 'jobs',      table: jobs,      required: ['company', 'title'] },
  { key: 'education', table: education, required: ['institution', 'degree'] },
  { key: 'projects',  table: projects,  required: ['name'] },
  { key: 'skills',    table: skills,    required: ['name'] },
] as const

router.get('/export', (_req, res) => {
  const dump: Record<string, unknown> = {
    app: 'appchef',
    version: 1,
    exportedAt: new Date().toISOString(),
    profile: db.select().from(profile).where(eq(profile.id, 1)).get() ?? null,
  }
  for (const s of DATA_SECTIONS) dump[s.key] = db.select().from(s.table).all()
  res.setHeader('Content-Disposition',
    `attachment; filename="appchef-resume-${new Date().toISOString().slice(0, 10)}.json"`)
  res.json(dump)
})

router.post('/import', (req, res) => {
  const body = req.body as Record<string, unknown>
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    res.status(400).json({ error: 'Import must be a JSON object (an AppChef export file).' })
    return
  }

  // Sanitize and validate everything BEFORE touching the database: unknown
  // keys are dropped, ids are ensured, required fields checked — a bad file
  // is rejected whole, never half-applied. Sections absent from the file
  // leave the corresponding current data untouched.
  const sections: { key: string; table: (typeof DATA_SECTIONS)[number]['table']; rows: Record<string, unknown>[] }[] = []
  for (const s of DATA_SECTIONS) {
    const raw = body[s.key]
    if (raw === undefined) continue
    if (!Array.isArray(raw)) { res.status(400).json({ error: `"${s.key}" must be an array` }); return }
    const allowed = Object.keys(getTableColumns(s.table))
    const rows: Record<string, unknown>[] = []
    for (let i = 0; i < raw.length; i++) {
      const item = raw[i] as Record<string, unknown>
      if (!item || typeof item !== 'object' || Array.isArray(item)) {
        res.status(400).json({ error: `${s.key}[${i}] is not an object` })
        return
      }
      const row: Record<string, unknown> = {}
      for (const k of allowed) if (item[k] !== undefined) row[k] = item[k]
      for (const need of s.required) {
        if (typeof row[need] !== 'string' || !(row[need] as string).trim()) {
          res.status(400).json({ error: `${s.key}[${i}] is missing required field "${need}"` })
          return
        }
      }
      if (typeof row.id !== 'string' || !row.id) row.id = randomUUID()
      if ('current' in row) row.current = Boolean(row.current)
      rows.push(row)
    }
    sections.push({ key: s.key, table: s.table, rows })
  }

  let profileRow: Record<string, string> | null = null
  if (body.profile != null) {
    if (typeof body.profile !== 'object' || Array.isArray(body.profile)) {
      res.status(400).json({ error: '"profile" must be an object' })
      return
    }
    profileRow = {}
    for (const k of Object.keys(getTableColumns(profile))) {
      if (k === 'id') continue
      const v = (body.profile as Record<string, unknown>)[k]
      if (typeof v === 'string') profileRow[k] = v
    }
  }

  if (sections.length === 0 && !profileRow) {
    res.status(400).json({ error: 'No recognizable AppChef data in this file.' })
    return
  }

  // Replace atomically — any failure rolls the whole import back
  rawDb.transaction(() => {
    for (const s of sections) {
      db.delete(s.table).run()
      if (s.rows.length > 0) db.insert(s.table).values(s.rows as never).run()
    }
    if (profileRow) db.update(profile).set(profileRow).where(eq(profile.id, 1)).run()
  })()

  scheduleReindex() // jobs/projects/skills feed the retrieval index
  res.json({
    imported: Object.fromEntries(sections.map(s => [s.key, s.rows.length])),
    profile: Boolean(profileRow),
  })
})

// ─── Fetch job description from URL ─────────────────────────────────────────

router.post('/fetch-jd', async (req, res) => {
  const { url } = req.body as { url: string }
  if (!url) { res.status(400).json({ error: 'url required' }); return }

  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      },
    })
    if (!response.ok) { res.status(502).json({ error: `Page returned ${response.status}` }); return }

    const html = await response.text()
    const dom = new JSDOM(html, { url })
    const article = new Readability(dom.window.document).parse()

    if (!article?.textContent) { res.status(422).json({ error: 'Could not extract content from this page.' }); return }

    res.json({ text: article.textContent.trim() })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Failed to fetch URL'
    res.status(502).json({ error: msg })
  }
})

// ─── PDF generation (LaTeX via tectonic, Jake's Resume template) ─────────────

router.post('/pdf', async (req, res) => {
  const { text, filename = 'resume' } = req.body as { text: string; filename?: string }
  if (!text?.trim()) { res.status(400).json({ error: 'text required' }); return }

  if (!(await checkTectonic())) {
    res.status(503).json({
      error: 'LaTeX engine not installed. Run: brew install tectonic (then retry — no server restart needed)',
    })
    return
  }

  try {
    const { pdf, fillPct } = await serialized(() => compileOnePageResume(text))
    res.setHeader('Content-Type', 'application/pdf')
    res.setHeader('Content-Disposition', `attachment; filename="${filename}.pdf"`)
    // Real page fill (0–100) — drives the client's dynamic fill-the-page pass
    if (fillPct !== null) res.setHeader('X-Appchef-Fill', String(fillPct))
    res.send(pdf)
  } catch (e) {
    const err = e as LatexError
    res.status(422).json({ error: err.message ?? 'LaTeX compile failed', logTail: err.logTail })
  }
})

// ─── Mount & start ───────────────────────────────────────────────────────────

app.use('/api', router)

const PORT = process.env.PORT ?? 3001
app.listen(PORT, () => {
  console.log(`AppChef server → http://localhost:${PORT}`)
  checkTectonic().then(ok => {
    if (ok) warmUp()
    else console.warn('[pdf] tectonic not found — /api/pdf disabled. Install with: brew install tectonic')
  })
  // Build the retrieval index at boot; embedding model downloads on first run
  try {
    reindexChunks()
    scheduleEmbedding()
    const status = indexStatus()
    console.log(`[retrieval] index ready: ${status.chunks} chunk(s), ${status.embedded} embedded`)
    // Warm the query-side model even when nothing is pending, so the first
    // generate doesn't pay the load latency
    if (status.chunks > 0) void ensureEmbeddings()
  } catch (e) {
    console.warn(`[retrieval] index unavailable: ${(e as Error).message}`)
  }
})
