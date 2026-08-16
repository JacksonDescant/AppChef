// ─── Deterministic output lint (docs/retrieval-research.md §7) ───────────────
// The reflection loop's critic. The research verdict is baked into the design:
// local models cannot reliably self-grade (Huang et al., arXiv:2310.01798), so
// every check here is code — the LLM's only role is executing targeted fixes
// through the refine edit contract. Hard issues trigger the single automatic
// repass; soft issues are display-only.

import type { BulletAllocation, LintIssue, LintKind, LintReport, RetrievalResult } from '../types'
import type { JdKeywords, ResumeData } from '../prompts'
import { BANNED_VERBS, numberedSourceMap } from '../prompts'
import { computeCoverage, keywordRegex } from './coverage'

export interface LintInput {
  rawBody: string   // model output before assembleResume — citations intact
  final: string     // assembled output — citations stripped (keyword checks)
  data: ResumeData  // the profile data the prompt numbered [S#] over
  retrieval: RetrievalResult | null
  keywords: JdKeywords | null
  allocation: BulletAllocation | null
  requireCitations: boolean  // false on the post-repass re-lint: refine
                             // legitimately leaves copied bullets uncited
}

interface ScannedEntry {
  kind: 'job' | 'project'
  name: string       // JOB_CO company / PROJECT name (left column, pre-"|")
  bullets: string[]  // raw bullet texts, citation tags still attached
}

const STATIC_TAGS = ['[NAME]', '[CONTACT]', '[EDU_INST]', '[EDU_DEG]']

// Mirrors stripCitations' trailing-tag grammar (src/prompts.ts).
const CITATION_RE = /\s*\[S(?:desc|\d+)(?:[,\s]+S(?:desc|\d+))*\]\s*$/

function splitCitation(bullet: string): { text: string; citation: string | null } {
  const m = bullet.match(CITATION_RE)
  return m
    ? { text: bullet.slice(0, m.index).trim(), citation: m[0].trim() }
    : { text: bullet.trim(), citation: null }
}

function scanEntries(rawBody: string): {
  entries: ScannedEntry[]
  untagged: string[]
  staticEcho: number
  totalBullets: number
} {
  const entries: ScannedEntry[] = []
  const untagged: string[] = []
  let current: ScannedEntry | null = null
  let staticEcho = 0
  let totalBullets = 0
  let inEducation = false
  for (const line of rawBody.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed) continue
    if (trimmed.startsWith('[SECTION]')) {
      inEducation = trimmed.slice(9).trim().toUpperCase() === 'EDUCATION'
      if (inEducation) staticEcho++
      current = null
      continue
    }
    if (inEducation) { staticEcho++; continue }
    if (STATIC_TAGS.some(t => trimmed.startsWith(t))) { staticEcho++; current = null; continue }
    if (trimmed.startsWith('[JOB_CO]')) {
      current = { kind: 'job', name: trimmed.slice(8).split('\t')[0].trim(), bullets: [] }
      entries.push(current)
      continue
    }
    if (trimmed.startsWith('[PROJECT]')) {
      current = { kind: 'project', name: trimmed.slice(9).split('\t')[0].split(' | ')[0].trim(), bullets: [] }
      entries.push(current)
      continue
    }
    if (trimmed.startsWith('[BULLET]')) {
      totalBullets++
      if (current) current.bullets.push(trimmed.slice(8).trim())
      continue
    }
    if (trimmed.startsWith('[JOB_ROLE]')) continue
    if (trimmed.startsWith('[SKILL]') || trimmed.startsWith('[SUMMARY]')) { current = null; continue }
    untagged.push(trimmed)
  }
  return { entries, untagged, staticEcho, totalBullets }
}

function entryDescription(entry: ScannedEntry, data: ResumeData): string {
  const norm = (s: string) => s.trim().toLowerCase()
  if (entry.kind === 'job') return data.jobs.find(j => norm(j.company) === norm(entry.name))?.description ?? ''
  return data.projects.find(p => norm(p.name) === norm(entry.name))?.description ?? ''
}

const trunc = (s: string, n = 60) => (s.length > n ? s.slice(0, n - 1) + '…' : s)

export function runLint(input: LintInput): LintReport {
  const { rawBody, final, data, retrieval, keywords, allocation, requireCitations } = input
  const issues: LintIssue[] = []
  const scan = scanEntries(rawBody)
  const sourceMap = numberedSourceMap(data)
  const maxSource = sourceMap.size
  const textByLabel = new Map<string, string>()
  for (const [key, label] of sourceMap) textByLabel.set(label, key.split('\u0000')[1] ?? '')

  // ── Per-bullet checks: citations, banned verbs, openers, figure grounding ──
  const bannedRe = new RegExp(`\\b(${BANNED_VERBS.join('|')})\\b`, 'i')
  const openerSeen = new Map<string, string>()   // opener -> first entry name
  const openerFlagged = new Set<string>()
  for (const entry of scan.entries) {
    for (const bullet of entry.bullets) {
      const { text, citation } = splitCitation(bullet)
      if (requireCitations) {
        if (!citation) {
          issues.push({
            kind: 'missing-citation', severity: 'hard',
            message: `The bullet "${trunc(text)}" under ${entry.name} has no grounding citation — end it with the [S#] tag(s) of its real source bullets.`,
            entryLabel: entry.name, bulletText: text,
          })
        } else {
          const nums = [...citation.matchAll(/S(\d+)/g)].map(m => parseInt(m[1], 10))
          const bad = nums.find(n => n < 1 || n > maxSource)
          if (bad !== undefined) {
            issues.push({
              kind: 'bad-citation', severity: 'hard',
              message: `The bullet "${trunc(text)}" under ${entry.name} cites [S${bad}], which does not exist (sources run S1–S${maxSource}) — cite the real supporting source.`,
              entryLabel: entry.name, bulletText: text,
            })
          }
        }
      }
      const banned = text.match(bannedRe)
      if (banned) {
        issues.push({
          kind: 'banned-verb', severity: 'hard',
          message: `Replace the banned verb "${banned[1].toLowerCase()}" in the bullet "${trunc(text)}" under ${entry.name} with a different concrete action verb.`,
          entryLabel: entry.name, bulletText: text,
        })
      }
      const opener = text.replace(/^[^A-Za-z]+/, '').split(/\s+/)[0]?.toLowerCase() ?? ''
      if (opener) {
        const firstEntry = openerSeen.get(opener)
        if (firstEntry !== undefined && !openerFlagged.has(opener)) {
          openerFlagged.add(opener)
          issues.push({
            kind: 'duplicate-opener', severity: 'hard',
            message: `The verb "${opener}" opens more than one bullet (${firstEntry} and ${entry.name}) — rewrite one of them to start with a different action verb.`,
            entryLabel: entry.name,
          })
        } else if (firstEntry === undefined) {
          openerSeen.set(opener, entry.name)
        }
      }
      // Figure grounding (soft, cautious): a number in a cited bullet should
      // appear somewhere in the cited sources' own text.
      if (citation) {
        const cited: string[] = []
        for (const m of citation.matchAll(/S(?:desc|\d+)/g)) {
          cited.push(m[0] === 'Sdesc' ? entryDescription(entry, data) : (textByLabel.get(m[0]) ?? ''))
        }
        const hay = cited.join(' ').replace(/,/g, '')
        const figures = text.match(/\d[\d,.]*%?/g) ?? []
        const missing = figures.find(f => {
          const norm = f.replace(/[,%]/g, '').replace(/\.$/, '')
          return norm.length > 0 && !hay.includes(norm)
        })
        if (missing) {
          issues.push({
            kind: 'number-suspicion', severity: 'soft',
            message: `Verify the figure "${missing}" in "${trunc(text)}" under ${entry.name} — it does not appear in the cited source.`,
            entryLabel: entry.name, bulletText: text,
          })
        }
      }
    }
  }

  // ── Bullet counts: universal caps + allocation conformance ────────────────
  for (const entry of scan.entries) {
    const n = entry.bullets.length
    if (n < 2) {
      issues.push({
        kind: 'bullet-count', severity: 'hard',
        message: `${entry.name} has only ${n} bullet${n === 1 ? '' : 's'} — every entry needs at least 2; add one more grounded bullet from its source data.`,
        entryLabel: entry.name,
      })
    } else if (n > 4) {
      issues.push({
        kind: 'bullet-count', severity: 'hard',
        message: `${entry.name} has ${n} bullets — the cap is 3 (4 only for the single most relevant entry); remove the least job-relevant ones.`,
        entryLabel: entry.name,
      })
    }
  }
  const fourEntries = scan.entries.filter(e => e.bullets.length === 4)
  if (fourEntries.length > 1) {
    issues.push({
      kind: 'bullet-count', severity: 'hard',
      message: `${fourEntries.length} entries have 4 bullets (${fourEntries.map(e => e.name).join(', ')}) — at most ONE may; trim the others to 3.`,
    })
  }
  if (allocation) {
    const norm = (s: string) => s.trim().toLowerCase()
    const jobIdByCompany = new Map(data.jobs.map(j => [norm(j.company), j.id]))
    const projIdByName = new Map(data.projects.map(p => [norm(p.name), p.id]))
    const matchedAllocIds = new Set<string>()
    for (const kind of ['job', 'project'] as const) {
      const allocs = allocation.entries.filter(a => a.kind === kind)
      scan.entries.filter(e => e.kind === kind).forEach((entry, i) => {
        const id = kind === 'job' ? jobIdByCompany.get(norm(entry.name)) : projIdByName.get(norm(entry.name))
        const alloc = allocs.find(a => a.id === id) ?? allocs[i]  // positional fallback
        if (!alloc) return
        matchedAllocIds.add(alloc.id)
        const n = entry.bullets.length
        if (n >= 2 && n <= 4 && n !== alloc.count) {
          issues.push({
            kind: 'bullet-count', severity: 'soft',
            message: `${entry.name} has ${n} bullets; the page allocation asked for ${alloc.count}.`,
            entryLabel: entry.name,
          })
        }
      })
    }
    for (const a of allocation.entries) {
      if (!matchedAllocIds.has(a.id)) {
        issues.push({
          kind: 'missing-entry', severity: 'hard',
          message: `The entry "${a.label}" was allocated ${a.count} bullets but is missing from the resume — add it back with bullets grounded in its source data, trimming elsewhere as needed.`,
        })
      }
    }
    if (scan.totalBullets > allocation.total) {
      issues.push({
        kind: 'bullet-count', severity: 'hard',
        message: `The resume has ${scan.totalBullets} bullets but the page fits ${allocation.total} — remove ${scan.totalBullets - allocation.total} of the least job-relevant bullets (keep every entry at 2 minimum).`,
      })
    } else if (scan.totalBullets < allocation.total) {
      issues.push({
        kind: 'bullet-count', severity: 'soft',
        message: `The resume has ${scan.totalBullets} of the ${allocation.total} bullets the page fits — it may run short.`,
      })
    }
  }

  // ── Keyword checks (assembled text — raw would false-match [S3] tags) ─────
  if (keywords) {
    const prose = final.split('\n')
      .filter(l => l.startsWith('[SKILL]') || l.startsWith('[BULLET]') || l.startsWith('[SUMMARY]'))
      .join('\n')
    for (const kw of [...keywords.mustHave, ...keywords.niceToHave]) {
      const re = keywordRegex(kw, 'gi')
      if (!re) continue
      const count = (prose.match(re) ?? []).length
      if (count > 2) {
        issues.push({
          kind: 'keyword-overuse', severity: 'hard',
          message: `"${kw}" appears ${count} times — that reads as keyword stuffing; keep at most 2 mentions (once in TECHNICAL SKILLS, once in one evidence bullet) and reword the rest.`,
        })
      }
    }
    // Must-haves with profile evidence that never made the page — the exact
    // case the coverage chips label "try Refine", automated.
    if (retrieval) {
      const cov = computeCoverage(final, keywords)
      for (const item of cov.items) {
        if (!item.required || item.inSkills || item.inBullets) continue
        // Only keyword-like requirements (short skill terms) are expected to
        // appear literally. Long requirement phrases are measured
        // semantically by /api/score — demanding their exact text would push
        // awkward whole sentences into bullets.
        if (item.keyword.length > 40 || item.keyword.trim().split(/\s+/).length > 4) continue
        const req = retrieval.requirements.find(r => r.text.toLowerCase() === item.keyword.toLowerCase())
        if (!req?.covered) continue  // a real gap — never force coverage
        const cites = req.topEvidence
          .map(e => sourceMap.get(`${e.parentId}\u0000${e.rawText}`))
          .filter((s): s is string => Boolean(s))
          .slice(0, 2)
        const citeTxt = cites.length > 0 ? ` (evidence: [${cites.join('], [')}])` : ''
        issues.push({
          kind: 'missing-covered-keyword', severity: 'hard',
          message: `Must-have keyword "${item.keyword}" has real supporting evidence in the profile${citeTxt} but appears nowhere in the resume — add it to the matching TECHNICAL SKILLS row and work it into the most relevant existing bullet, citing that source.`,
        })
      }
    }
  }

  // ── Informational: untagged lines / echoed static content ─────────────────
  if (scan.untagged.length > 0) {
    issues.push({
      kind: 'untagged-line', severity: 'soft',
      message: `${scan.untagged.length} untagged line${scan.untagged.length === 1 ? '' : 's'} won't render in the PDF (e.g. "${trunc(scan.untagged[0])}").`,
    })
  }
  if (scan.staticEcho > 0) {
    issues.push({
      kind: 'static-echo', severity: 'soft',
      message: `The model echoed ${scan.staticEcho} header/education line${scan.staticEcho === 1 ? '' : 's'} — removed automatically.`,
    })
  }

  return {
    issues,
    hard: issues.filter(i => i.severity === 'hard'),
    soft: issues.filter(i => i.severity === 'soft'),
  }
}

// Priority: content correctness first, then style; capped so the refine
// request stays a focused edit rather than a rewrite.
const INSTRUCTION_PRIORITY: LintKind[] = [
  'missing-covered-keyword', 'missing-citation', 'bad-citation', 'banned-verb',
  'duplicate-opener', 'missing-entry', 'bullet-count', 'keyword-overuse',
]

export function buildLintInstruction(hard: LintIssue[]): string {
  const rank = (k: LintKind) => {
    const i = INSTRUCTION_PRIORITY.indexOf(k)
    return i === -1 ? INSTRUCTION_PRIORITY.length : i
  }
  return [...hard]
    .sort((a, b) => rank(a.kind) - rank(b.kind))
    .slice(0, 8)
    .map((issue, i) => `${i + 1}. ${issue.message}`)
    .join('\n')
}
