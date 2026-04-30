import express from 'express'
import cors from 'cors'
import { randomUUID } from 'crypto'
import PDFDocument from 'pdfkit'
import { Readability } from '@mozilla/readability'
import { JSDOM } from 'jsdom'
import { db, initDb } from './db/index'
import { jobs, education, projects, skills, targetJobs, applications, settings, profile, savedResumes } from './db/schema'
import { eq } from 'drizzle-orm'

const app = express()
app.use(cors({ origin: ['http://localhost:5173', 'http://localhost:4173'] }))
app.use(express.json())

initDb()

// ─── Generic CRUD factory ───────────────────────────────────────────────────

function crudRoutes<T extends { id: string }>(
  router: express.Router,
  path: string,
  table: Parameters<typeof db.select>[0] extends never ? never : any, // drizzle table
) {
  router.get(path, (_req, res) => {
    res.json(db.select().from(table).all())
  })

  router.post(path, (req, res) => {
    const item = { id: randomUUID(), ...req.body } as T
    db.insert(table).values(item).run()
    res.status(201).json(item)
  })

  router.put(`${path}/:id`, (req, res) => {
    const { id } = req.params
    db.update(table).set(req.body).where(eq(table.id, id)).run()
    res.json({ id, ...req.body })
  })

  router.delete(`${path}/:id`, (req, res) => {
    db.delete(table).where(eq(table.id, req.params.id)).run()
    res.status(204).end()
  })
}

const router = express.Router()

crudRoutes(router, '/jobs', jobs)
crudRoutes(router, '/education', education)
crudRoutes(router, '/projects', projects)
crudRoutes(router, '/skills', skills)
crudRoutes(router, '/target-jobs', targetJobs)

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

// ─── PDF generation ──────────────────────────────────────────────────────────

router.post('/pdf', (req, res) => {
  const { text, filename = 'resume' } = req.body as { text: string; filename?: string }

  const ML = 46, MR = 46, MT = 40
  const doc = new PDFDocument({ margin: 0, size: 'LETTER' })
  res.setHeader('Content-Type', 'application/pdf')
  res.setHeader('Content-Disposition', `attachment; filename="${filename}.pdf"`)
  doc.pipe(res)

  const PW = doc.page.width           // 612
  const UW = PW - ML - MR             // 520
  const MAX_Y = doc.page.height - 36  // stop before bottom margin
  const FS = 10
  const BASE_LG = 1.0

  const T  = 'Times-Roman'
  const TB = 'Times-Bold'
  const TI = 'Times-Italic'

  // ── Pass 1: measure total content height ──────────────────────────────────
  // Mirror the render logic exactly, accumulating heights via heightOfString.
  // Must set doc.x = ML before each call so wrap width is computed correctly.

  function measureLines(lines: string[]): number {
    let h = 0
    let prevMTag = ''

    function mH(font: string, fs: number, txt: string, width: number, lg: number): number {
      doc.font(font).fontSize(fs)
      doc.x = ML
      return doc.heightOfString(txt, { width, lineGap: lg })
    }

    for (const raw of lines) {
      if (raw.startsWith('[NAME]')) {
        h += mH(TB, 18, raw.slice(6).trim(), UW, 2)

      } else if (raw.startsWith('[CONTACT]')) {
        h += mH(T, 9.5, raw.slice(9).trim(), UW, 1)
        h += 0.2 * (BASE_LG + doc.currentLineHeight(false))  // moveDown(0.2)

      } else if (raw.startsWith('[SECTION]')) {
        // moveDown(0.28) + title + 3pt gap after rule
        h += 0.28 * (BASE_LG + doc.currentLineHeight(false))
        h += mH(TB, FS, raw.slice(9).trim(), UW, BASE_LG)
        h += 3

      } else if (raw.startsWith('[EDU_INST]')) {
        if (prevMTag === 'EDU_DEG') h += 0.3 * (BASE_LG + doc.currentLineHeight(false))
        const [left, right = ''] = raw.slice(10).split('\t')
        if (right) {
          doc.font(T).fontSize(FS)
          const rW = doc.widthOfString(right.trim()) + 1
          h += mH(TB, FS, left.trim(), UW - rW - 6, BASE_LG)
        } else {
          h += mH(TB, FS, left.trim(), UW, BASE_LG)
        }
        prevMTag = 'EDU_INST'

      } else if (raw.startsWith('[EDU_DEG]')) {
        const [left, right = ''] = raw.slice(9).split('\t')
        if (right) {
          doc.font(T).fontSize(FS)
          const rW = doc.widthOfString(right.trim()) + 1
          h += mH(TI, FS, left.trim(), UW - rW - 6, BASE_LG)
        } else {
          h += mH(TI, FS, left.trim(), UW, BASE_LG)
        }
        prevMTag = 'EDU_DEG'

      } else if (raw.startsWith('[JOB_CO]')) {
        // moveDown(0.22) gap (skip for very first item)
        h += 0.22 * (BASE_LG + doc.currentLineHeight(false))
        const [left, right = ''] = raw.slice(8).split('\t')
        if (right) {
          doc.font(TB).fontSize(FS)
          const rW = doc.widthOfString(right.trim()) + 1
          h += mH(TB, FS, left.trim(), UW - rW - 6, BASE_LG)
        } else {
          h += mH(TB, FS, left.trim(), UW, BASE_LG)
        }

      } else if (raw.startsWith('[JOB_ROLE]')) {
        const [left, right = ''] = raw.slice(10).split('\t')
        if (right) {
          doc.font(T).fontSize(FS)
          const rW = doc.widthOfString(right.trim()) + 1
          h += mH(TI, FS, left.trim(), UW - rW - 6, BASE_LG)
        } else {
          h += mH(TI, FS, left.trim(), UW, BASE_LG)
        }

      } else if (raw.startsWith('[PROJECT]')) {
        h += 0.22 * (BASE_LG + doc.currentLineHeight(false))
        const [left, right = ''] = raw.slice(9).split('\t')
        if (right) {
          doc.font(T).fontSize(FS)
          const rW = doc.widthOfString(right.trim()) + 1
          h += mH(TB, FS, left.trim(), UW - rW - 6, BASE_LG)
        } else {
          h += mH(TB, FS, left.trim(), UW, BASE_LG)
        }

      } else if (raw.startsWith('[BULLET]')) {
        h += mH(T, FS, raw.slice(8).trim(), UW - 13, BASE_LG)

      } else if (raw.startsWith('[SKILL]')) {
        const content = raw.slice(7).trim()
        const colonIdx = content.indexOf(':')
        if (colonIdx > 0 && colonIdx < 35) {
          const rest = content.slice(colonIdx + 1)
          h += mH(T, FS, rest, UW - 13, BASE_LG)
        } else {
          h += mH(T, FS, content, UW - 13, BASE_LG)
        }
      }
    }
    return h
  }

  const lines = text.split('\n')
  const measured = measureLines(lines)
  const available = MAX_Y - MT
  const rawScale = available / measured
  // Clamp: never shrink below 0.80 or expand beyond 1.25
  const spacingScale = Math.min(1.25, Math.max(0.80, rawScale))
  const LG = BASE_LG * spacingScale

  // ── Pass 2: render ─────────────────────────────────────────────────────────

  doc.y = MT
  const full = () => doc.y >= MAX_Y

  function row(left: string, leftFont: string, right: string, rightFont: string, fs = FS) {
    if (full()) return
    const y = doc.y
    if (right) {
      doc.font(rightFont).fontSize(fs)
      const rW = doc.widthOfString(right) + 1
      doc.font(rightFont).fontSize(fs).fillColor('#111')
         .text(right, PW - MR - rW, y, { lineBreak: false })
      doc.font(leftFont).fontSize(fs).fillColor('#111').lineGap(LG)
         .text(left, ML, y, { width: UW - rW - 6 })
    } else {
      doc.font(leftFont).fontSize(fs).fillColor('#111').lineGap(LG)
         .text(left, ML, y, { width: UW })
    }
  }

  function sectionHeader(title: string) {
    if (full()) return
    doc.moveDown(0.28 * spacingScale)
    const y = doc.y
    doc.font(TB).fontSize(FS).fillColor('#000')
       .text(title, ML, y, { width: UW })
    const lineY = doc.y
    doc.moveTo(ML, lineY).lineTo(PW - MR, lineY)
       .strokeColor('#000').lineWidth(0.65).stroke()
    doc.y = lineY + 3 * spacingScale
  }

  function bullet(content: string) {
    if (full()) return
    const y = doc.y
    doc.font(T).fontSize(FS).fillColor('#111')
       .text('•', ML + 3, y, { lineBreak: false })
    doc.font(T).fontSize(FS).fillColor('#111').lineGap(LG)
       .text(content, ML + 13, y, { width: UW - 13 })
  }

  function skillRow(content: string) {
    if (full()) return
    const colonIdx = content.indexOf(':')
    const y = doc.y
    doc.font(T).fontSize(FS).fillColor('#111')
       .text('•', ML + 3, y, { lineBreak: false })
    if (colonIdx > 0 && colonIdx < 35) {
      const bold = content.slice(0, colonIdx + 1)
      const rest = content.slice(colonIdx + 1)
      doc.font(TB).fontSize(FS).fillColor('#111').lineGap(LG)
         .text(bold, ML + 13, y, { continued: true, width: UW - 13 })
      doc.font(T).fontSize(FS).fillColor('#111').lineGap(LG)
         .text(rest, { continued: false })
    } else {
      doc.font(T).fontSize(FS).fillColor('#111').lineGap(LG)
         .text(content, ML + 13, y, { width: UW - 13 })
    }
  }

  let prevTag = ''

  for (const raw of lines) {
    if (full()) break

    if (raw.startsWith('[NAME]')) {
      doc.font(TB).fontSize(18).fillColor('#000').lineGap(2 * spacingScale)
         .text(raw.slice(6).trim(), ML, doc.y, { width: UW, align: 'center' })

    } else if (raw.startsWith('[CONTACT]')) {
      doc.font(T).fontSize(9.5).fillColor('#333').lineGap(1 * spacingScale)
         .text(raw.slice(9).trim(), ML, doc.y, { width: UW, align: 'center' })
      doc.moveDown(0.2 * spacingScale)

    } else if (raw.startsWith('[SECTION]')) {
      sectionHeader(raw.slice(9).trim())

    } else if (raw.startsWith('[EDU_INST]')) {
      if (prevTag === 'EDU_DEG') doc.moveDown(0.3 * spacingScale)
      const [left, right = ''] = raw.slice(10).split('\t')
      row(left.trim(), TB, right.trim(), T)
      prevTag = 'EDU_INST'

    } else if (raw.startsWith('[EDU_DEG]')) {
      const [left, right = ''] = raw.slice(9).split('\t')
      row(left.trim(), TI, right.trim(), T)
      prevTag = 'EDU_DEG'

    } else if (raw.startsWith('[JOB_CO]')) {
      if (doc.y > MT + 30) doc.moveDown(0.22 * spacingScale)
      const [left, right = ''] = raw.slice(8).split('\t')
      row(left.trim(), TB, right.trim(), TB)

    } else if (raw.startsWith('[JOB_ROLE]')) {
      const [left, right = ''] = raw.slice(10).split('\t')
      row(left.trim(), TI, right.trim(), T)

    } else if (raw.startsWith('[PROJECT]')) {
      if (doc.y > MT + 30) doc.moveDown(0.22 * spacingScale)
      const [left, right = ''] = raw.slice(9).split('\t')
      row(left.trim(), TB, right.trim(), T)

    } else if (raw.startsWith('[BULLET]')) {
      bullet(raw.slice(8).trim())

    } else if (raw.startsWith('[SKILL]')) {
      skillRow(raw.slice(7).trim())
    }
  }

  doc.end()
})

// ─── Mount & start ───────────────────────────────────────────────────────────

app.use('/api', router)

const PORT = process.env.PORT ?? 3001
app.listen(PORT, () => {
  console.log(`AppChef server → http://localhost:${PORT}`)
})
