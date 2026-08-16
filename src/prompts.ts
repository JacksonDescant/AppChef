import type { BulletAllocation, EducationEntry, Job, Profile, Project, RetrievalResult, Skill } from './types'

export const EXTRACTION_SYSTEM_PROMPT = `You are a job-posting analyst. Extract the posting's target title and priority requirements. Return ONLY a valid JSON object — no explanation, no preamble, no markdown fences.`

export const SHORTLIST_SYSTEM_PROMPT = `You are a resume strategist. You receive the candidate's work experiences and projects ALREADY RANKED by a deterministic relevance engine (higher score = stronger evidence for this job). Confirm or adjust the final selection. Return ONLY a valid JSON object — no explanation, no preamble, no markdown fences.`

// Keywords extracted from a job description during the selection call.
// Drives the PRIORITY KEYWORDS block in the generation prompt and the
// coverage meter in the UI (see src/lib/coverage.ts).
export interface JdKeywords {
  targetTitle: string
  mustHave: string[]
  niceToHave: string[]
}

// Single source of truth for the verb ban — interpolated into both system
// prompts and enforced post-generation by src/lib/lint.ts.
export const BANNED_VERBS = ['spearheaded', 'leveraged', 'championed', 'orchestrated', 'utilized'] as const

export const SYSTEM_PROMPT = `You are an expert resume writer and career strategist. Produce a tailored, one-page resume using ONLY the exact tagged format below. Output nothing else — no preamble, no explanation, no markdown fences.

OUTPUT FORMAT:

[SUMMARY]2–3 line professional summary tailored to the target role — include this tag ONLY if the candidate profile provides a Summary; omit the tag entirely otherwise. No citation tags here.

[SECTION]WORK EXPERIENCE
[JOB_CO]Company Name\tCity, State
[JOB_ROLE]Job Title\tMon YYYY – Mon YYYY (e.g. "Jun 2022 – Present"; "Present" replaces the end date for a current role. Always include the start date)
[BULLET]Achievement-focused bullet reframed from candidate's source data [S1]
(minimum 2, maximum 3 bullets per job; BULLET COUNTS: when the user message provides a PER-ENTRY BULLET ALLOCATION, follow it exactly — it already balances relevance against recency; when none is provided, weight by recency: the most recent role gets the most bullets and detail, and an older entry never has more bullets than a more recent one; most recent first; omit irrelevant jobs entirely rather than giving them fewer than 2 bullets)

[SECTION]PROJECTS
[PROJECT]Project Name | Tech1, Tech2, Tech3\tMon YYYY – Mon YYYY
[BULLET]What you built and its measurable impact [S2]
(after " | ", list the 2–5 most job-relevant technologies copied from the project's Technologies list; omit the " | ..." part when no technologies were provided; minimum 2, maximum 3 bullets per project; most relevant projects only)

[SECTION]TECHNICAL SKILLS
[SKILL]Category: skill1, skill2, skill3
(3–4 rows; order skills within each row so the ones matching the target job description come first)

RULES:
1. Use ONLY the tagged lines above. No other text or blank lines between tags. NEVER output [NAME], [CONTACT], [EDU_INST], [EDU_DEG], or an EDUCATION section — the header and education are added automatically from the candidate's profile.
2. The \\t in two-column lines is a literal tab character separating left content from right content.
3. Bullets must be concise — one line each. Quantify impact wherever the source data supports it.
4. GROUNDING — CITATIONS REQUIRED: Every [BULLET] line must end with a citation tag: [S1] for a single source, [S1,S3] when synthesizing across multiple. The numbers correspond to [S#] labels in the candidate's profile data. If a bullet draws from an entry's Description field (not a numbered bullet), use [Sdesc]. Citations are stripped from the final resume output — they exist only to enforce factual grounding. You MAY: reframe and strengthen language, change emphasis to match the role, synthesize across multiple source bullets, and highlight the natural significance and implications of the candidate's actual work — even if the source phrasing is plain. You MAY NOT: introduce specific numbers, metrics, team sizes, dollar figures, dates, or concrete outcomes that are not present in the cited source(s). If source [S2] says "improved performance", you may write "drove critical performance improvements [S2]" — but NOT "improved performance by 40% [S2]" unless 40% appears in [S2].
5. KEYWORDS — COVERAGE, NOT FREQUENCY: Mirror keywords and technical terms from the job description naturally and truthfully. Address each job requirement ONCE with evidence; never use any keyword more than twice across the entire resume. When a PRIORITY KEYWORDS list is provided: every must-have keyword the candidate's data genuinely supports must appear once in TECHNICAL SKILLS and once inside a [BULLET] (or [SUMMARY]) with supporting evidence. Skip keywords the candidate's data cannot support — never invent experience to cover a keyword.
6. ACRONYMS: In TECHNICAL SKILLS, write the first mention of an acronym as the spelled-out form plus the acronym — "Amazon Web Services (AWS)", "Continuous Integration/Continuous Deployment (CI/CD)" — but only when you are certain of the standard expansion; otherwise keep the acronym alone. Everywhere else, use the same form the job description uses.
7. ORDERING IS MANDATORY: every section must appear in strict reverse-chronological order by END DATE — most recent end date first. "Present" is the most recent possible end date. This cannot be changed for any reason, including relevance to the job. Recency weighting affects bullet count and detail, not the order entries appear. The candidate's entries are pre-sorted — output them in the EXACT ORDER they are provided.
8. BULLET ORDER WITHIN AN ENTRY: order each entry's bullets by relevance to the target job, most relevant first. The FIRST bullet of the MOST RECENT job must address the job description's single most important requirement that the candidate's data supports — recruiters read that line first. When an entry's profile data includes a "Most relevant to this JD" line, build that entry's bullets around those cited sources first.
9. VERB VARIETY: start each bullet with a concrete action verb; never reuse the same opening verb twice in the resume; prefer verbs drawn from the candidate's own source data. Do not use: ${BANNED_VERBS.join(', ')}.
10. The entire output must represent one page of content — be selective and concise but always use the full page.
11. Never fabricate or exaggerate. Reframe truthfully to match the role.
12. NEVER invent, modify, or estimate any date. Copy dates exactly as given in the candidate's profile data. If a date was not provided, omit it entirely rather than guessing.
13. Copy job titles exactly as provided. Some titles include a market-standard form with the internal title in parentheses — keep both, unchanged.
14. MINIMUM BULLETS: Every work experience entry and every project entry that appears in the resume MUST have at least 2 [BULLET] lines. If page space is tight, drop an entire entry rather than leaving any entry with only 1 bullet.
15. BULLET CAP: No entry may have more than 3 bullets. AT MOST ONE entry in the entire resume may have 4 — only the entry the PER-ENTRY BULLET ALLOCATION designates for 4, or, when no allocation is provided, only an entry extremely relevant to the target role. The cap overrides the page-fill count.
16. PROJECTS PRESENCE: If PROJECTS entries are provided in the profile data, the PROJECTS section must appear with at least one project — two when space allows. Never drop the section entirely; drop an older job's bullet count or an older job before dropping the last project.`

// Refine is an EDIT pass, not a second generation: the draft already went
// through extraction → retrieval → shortlist → page fill, so its entry set and
// bullet counts are load-bearing. This prompt's job is surgical change plus
// verbatim preservation of everything else.
export const REFINE_SYSTEM_PROMPT = `You are a precise resume editor. You receive an existing one-page resume in a tagged line format and ONE refinement request. Apply the request with the smallest possible change and output the complete updated resume in the same tagged format. Output nothing else — no preamble, no explanation, no markdown fences.

EDIT CONTRACT — this overrides everything except factual accuracy:
1. Change ONLY what the request requires. Reproduce every other line EXACTLY as it appears in the current resume — same wording, same entries, same order, same bullet counts.
2. Do not re-tailor, rephrase, reorder, add, or remove anything the request does not ask for. If the request targets one bullet, every other bullet stays untouched.
3. The current resume already fills exactly one page. Keep the total number of [BULLET] lines the same unless the request itself adds or removes content. If the request removes an entry, redistribute roughly that many bullets across the remaining entries (within the caps below); if it adds an entry, trim the least job-relevant bullets elsewhere to make room.

FORMAT (identical to the current resume): [SUMMARY], [SECTION], [JOB_CO]Company\\tCity, [JOB_ROLE]Title\\tDates, [PROJECT]Name | Tech\\tDates, [BULLET]text, [SKILL]Category: items. The \\t is a literal tab character. NEVER output [NAME], [CONTACT], [EDU_INST], [EDU_DEG], or an EDUCATION section — the header and education are added automatically.

RULES FOR LINES YOU CHANGE OR ADD (lines copied unchanged are exempt):
1. GROUNDING: every new or rewritten [BULLET] must end with a citation tag — [S1], or [S1,S3] when synthesizing — pointing at the numbered source bullets in the candidate profile ([Sdesc] for an entry's Description field). Never introduce numbers, metrics, team sizes, dates, or outcomes that are not in the cited source. Bullets copied verbatim from the current resume carry no citation.
2. Never fabricate or exaggerate; copy dates and job titles exactly as the profile provides them.
3. KEYWORDS — coverage, not frequency: no keyword more than twice across the entire resume.
4. BULLET COUNTS: every entry keeps at least 2 bullets and at most 3; at most ONE entry in the resume may have 4, and only when extremely relevant to the target role.
5. Reverse-chronological order by end date is mandatory in every section — never reorder entries.
6. PROJECTS: never remove the last remaining project — the section survives with at least one entry.
7. Start each bullet with a concrete action verb; never reuse an opening verb twice in the resume. Do not use: ${BANNED_VERBS.join(', ')}.`

export interface ResumeData {
  jobs: Job[]
  education: EducationEntry[]
  projects: Project[]
  skills: Skill[]
}

function sortByRecency<T extends { startDate: string; endDate: string; current: boolean }>(items: T[]): T[] {
  return [...items].sort((a, b) => {
    const aEnd = a.current ? '9999-12' : (a.endDate || '')
    const bEnd = b.current ? '9999-12' : (b.endDate || '')
    const endDiff = bEnd.localeCompare(aEnd)
    if (endDiff !== 0) return endDiff
    return b.startDate.localeCompare(a.startDate)
  })
}

function sortProjectsByRecency(items: Project[]): Project[] {
  return [...items].sort((a, b) => {
    const aEnd = a.endDate || '9999-12'
    const bEnd = b.endDate || '9999-12'
    const endDiff = bEnd.localeCompare(aEnd)
    if (endDiff !== 0) return endDiff
    return b.startDate.localeCompare(a.startDate)
  })
}

function recencyLabel(endDate: string, current: boolean): string {
  if (current) return 'current'
  if (!endDate) return ''
  const [yearStr, monthStr] = endDate.split('-')
  const year = parseInt(yearStr, 10)
  const month = parseInt(monthStr ?? '1', 10)
  if (isNaN(year)) return ''
  const now = new Date()
  const totalMonths = (now.getFullYear() - year) * 12 + (now.getMonth() + 1 - month)
  if (totalMonths <= 3) return 'recent'
  const years = Math.round(totalMonths / 12)
  if (years < 1) return 'recent'
  return `${years} yr${years !== 1 ? 's' : ''} ago`
}

function formatDate(val: string): string {
  if (!val) return ''
  const [year, month] = val.split('-')
  const short = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
  const m = parseInt(month, 10)
  if (!year || isNaN(m) || m < 1 || m > 12) return val
  return `${short[m-1]} ${year}`
}

// "Display Title (Internal Title)" when a market-standard alias is set —
// the honest form of title alignment (see docs/ats-research.md §2).
function resumeTitle(j: Job): string {
  const alias = j.displayTitle?.trim()
  return alias && alias !== j.title ? `${alias} (${j.title})` : j.title
}

// ─── Page budget calculator ───────────────────────────────────────────────────
// Approximates the LaTeX renderer (Jake's Resume template, server/latex.ts):
// letterpaper with 0.5in side margins, 11pt Computer Modern (~13.6pt lines).
// The hard one-page guarantee lives server-side (squeeze presets + content
// drops in server/tectonic.ts); this budget only needs to be close enough
// that the LLM writes roughly the right amount and drops rarely fire.
const PDF = {
  pageH: 792, mt: 36, mb: 36,   // usable ≈ 720pt
  header: 58,       // \Huge name + contact line + gap
  sectionHdr: 31,   // \large small-caps title + titlerule + eased boundary spacing
  eduEntry: 30,     // \resumeSubheading (two rows)
  eduGap: 4,        // gap between edu entries
  jobHdr: 30,       // \resumeSubheading (two rows)
  jobGap: 4,        // spacing before each job
  projectHdr: 22,   // \resumeProjectHeading (single row)
  skillRow: 17,     // one \small skill line (wrap allowance)
  bullet: 18,       // one \small bullet at 11pt + itemSep 2 (wrap allowance)
  summaryText: 40,  // 2–3 wrapped \small summary lines
}

function bulletBudget(nJobs: number, nEdus: number, nProjects: number, nSkillCats: number, hasSummary: boolean): number {
  const usable = PDF.pageH - PDF.mt - PDF.mb
  const fixed =
    PDF.header +
    (hasSummary ? 5 : 4) * PDF.sectionHdr +
    (hasSummary ? PDF.summaryText : 0) +
    nEdus     * PDF.eduEntry  + Math.max(0, nEdus - 1)  * PDF.eduGap +
    nJobs     * PDF.jobHdr    + Math.max(0, nJobs - 1)  * PDF.jobGap +
    nProjects * PDF.projectHdr +
    nSkillCats * PDF.skillRow
  // 0.88 wrap allowance for bullets/skill rows that run to a second line; +2
  // corrects observed underbudget. Biased HIGH deliberately: overshoot is
  // absorbed by the server's squeeze presets, while undershoot leaves visible
  // blank page that nothing downstream can fix.
  return Math.max(4, Math.floor((usable - fixed) / PDF.bullet * 0.88) + 2)
}

// ─── Stage 1: requirement extraction (JD only — the model never needs the
// profile to parse a posting; keeping this prompt small is the main latency
// win on a large local model). Phrasing stays VERBATIM: paraphrasing the JD
// measurably degrades retrieval matching (docs/retrieval-research.md §3).
export function buildExtractionMessage(jobDescription: string): string {
  return (
    `Job posting:\n${jobDescription}\n\n` +
    `---\n\n` +
    `EXTRACTION RULES:\n` +
    `1. targetTitle: the posting's job title as a standard market title (e.g. "Senior Software Engineer").\n` +
    `2. mustHave: up to 12 hard skills, tools, platforms, certifications, or methodologies that are explicitly required, sit in the requirements/qualifications section, or repeat across the posting. Copy the posting's EXACT phrasing (keep "React.js" as "React.js") — do not paraphrase. Treat "preferred" qualifications as required. Each item must be a SHORT skill term (1–4 words): extract "Python" from "strong Python engineering background in production systems" and "data pipelines" from "designing and operating data pipelines at scale" — never a whole requirement sentence.\n` +
    `3. niceToHave: up to 8 secondary or bonus terms.\n` +
    `4. Never include soft-skill filler ("team player", "fast-paced environment", "communication", "detail-oriented").\n\n` +
    `Return ONLY this JSON:\n` +
    `{"targetTitle":"...","mustHave":["..."],"niceToHave":["..."]}`
  )
}

// ─── Stage 2: listwise confirmation over the deterministically scored
// shortlist. The engine searches; the model curates — the one LLM-ranking
// mode the retrieval research endorses.
export function buildShortlistMessage(
  data: ResumeData,
  retrieval: RetrievalResult,
  keywords: JdKeywords | null,
): string {
  const jobById = new Map(data.jobs.map(j => [j.id, j]))
  const projectById = new Map(data.projects.map(p => [p.id, p]))

  const jobLines = retrieval.rankedJobs.map(r => {
    const j = jobById.get(r.id)
    if (!j) return ''
    const dates = [formatDate(j.startDate), j.current ? 'Present' : formatDate(j.endDate)].filter(Boolean).join(' – ')
    const recency = recencyLabel(j.endDate, j.current)
    const matched = r.matched.length > 0
      ? ` | evidence for: ${r.matched.slice(0, 4).join(', ')}${r.matched.length > 4 ? ` (+${r.matched.length - 4} more)` : ''}`
      : ' | no requirement evidence found'
    return `[ID:${r.id}] score ${r.score.toFixed(2)}${recency ? ` [${recency}]` : ''} ${resumeTitle(j)} at ${j.company} (${dates})${matched}`
  }).filter(Boolean).join('\n')

  const projectLines = retrieval.rankedProjects.map(r => {
    const p = projectById.get(r.id)
    if (!p) return ''
    const matched = r.matched.length > 0
      ? ` | evidence for: ${r.matched.slice(0, 4).join(', ')}`
      : ' | no requirement evidence found'
    const tech = p.technologies ? ` (${p.technologies})` : ''
    return `[ID:${r.id}] score ${r.score.toFixed(2)} ${p.name}${tech}${matched}`
  }).filter(Boolean).join('\n')

  const target = keywords?.targetTitle ? `Target role: ${keywords.targetTitle}\n\n` : ''

  return (
    target +
    `Work experience, ranked by the relevance engine (best first):\n${jobLines || '(none)'}\n\n` +
    `Projects, ranked by the relevance engine (best first):\n${projectLines || '(none)'}\n\n` +
    `---\n\n` +
    `A strong one-page resume typically shows 2-4 work experiences and 1-2 projects — quality over quantity.\n\n` +
    `SELECTION RULES:\n` +
    `1. Trust the ranking unless you see a clear semantic mismatch the scores missed (e.g. same tools, unrelated domain).\n` +
    `2. Always include the most recent work experience unless it is completely unrelated to this role.\n` +
    `3. WEIGHT RECENCY: when two entries are comparably relevant, always prefer the more recent one. A job that ended more than ~2 years ago must uniquely cover a core requirement to earn its place.\n` +
    `4. PROJECTS: always keep the top-ranked project; keep a second when it shows requirement evidence. Beyond that, drop entries marked "no requirement evidence found" unless they are the most recent job.\n` +
    `5. The resume must fill one page: when only a few entries are strong, keep borderline ones rather than cutting to a sparse selection — the ranking already ordered them.\n` +
    `6. Keep your output ordered most-relevant first.\n\n` +
    `Return ONLY this JSON:\n` +
    `{"jobIds":["..."],"projectIds":["..."]}`
  )
}

// Sanitizes a model-emitted keyword list: strings only, trimmed, deduped
// case-insensitively, capped in count and length.
function cleanKeywords(raw: unknown, cap: number): string[] {
  if (!Array.isArray(raw)) return []
  const seen = new Set<string>()
  const out: string[] = []
  for (const item of raw) {
    if (typeof item !== 'string') continue
    const kw = item.trim()
    const key = kw.toLowerCase()
    if (!kw || kw.length > 60 || seen.has(key)) continue
    seen.add(key)
    out.push(kw)
    if (out.length >= cap) break
  }
  return out
}

export function parseExtraction(text: string): JdKeywords | null {
  try {
    const match = text.match(/\{[\s\S]*\}/)
    if (!match) return null
    const parsed = JSON.parse(match[0]) as { targetTitle?: unknown, mustHave?: unknown, niceToHave?: unknown }
    const mustHave = cleanKeywords(parsed.mustHave, 12)
    const niceToHave = cleanKeywords(parsed.niceToHave, 8)
      .filter(kw => !mustHave.some(m => m.toLowerCase() === kw.toLowerCase()))
    const targetTitle = typeof parsed.targetTitle === 'string' ? parsed.targetTitle.trim().slice(0, 80) : ''
    return mustHave.length > 0 || niceToHave.length > 0 || targetTitle
      ? { targetTitle, mustHave, niceToHave }
      : null
  } catch {
    return null
  }
}

// Fallback on any parse failure is the engine's own ranking — the shortlist
// call can only refine the deterministic result, never lose it.
export function parseShortlist(
  text: string,
  rankedJobIds: string[],
  rankedProjectIds: string[],
): { jobIds: string[], projectIds: string[] } {
  try {
    const match = text.match(/\{[\s\S]*\}/)
    if (!match) throw new Error('no json')
    const parsed = JSON.parse(match[0]) as { jobIds?: unknown, projectIds?: unknown }
    const jobIds = Array.isArray(parsed.jobIds)
      ? (parsed.jobIds as string[]).filter(id => rankedJobIds.includes(id))
      : rankedJobIds
    let projectIds = Array.isArray(parsed.projectIds)
      ? (parsed.projectIds as string[]).filter(id => rankedProjectIds.includes(id))
      : rankedProjectIds
    // Floor: the model may not drop the projects section entirely (owner rule)
    if (projectIds.length === 0 && rankedProjectIds.length > 0) {
      projectIds = rankedProjectIds.slice(0, 1)
    }
    if (jobIds.length === 0 && rankedJobIds.length > 0) {
      return { jobIds: rankedJobIds.slice(0, 1), projectIds }
    }
    return { jobIds, projectIds }
  } catch {
    return { jobIds: rankedJobIds, projectIds: rankedProjectIds }
  }
}

// Mirror of trimToPageFit: with bullets capped at 3 per entry (rule 15), a
// small selection cannot fill the page vertically — pages must fill
// horizontally, with more entries. Re-adds the next-ranked unselected entries
// until the cap ceiling (3n+1 bullets) can reach the page budget. Prefers
// jobs, except to satisfy the ideally-2-projects rule first.
export function expandToPageFit(
  jobIds: string[],
  projectIds: string[],
  rankedJobIds: string[],
  rankedProjectIds: string[],
  nEdus: number,
  nSkillCats: number,
  hasSummary: boolean,
): { jobIds: string[], projectIds: string[] } {
  const jIds = [...jobIds]
  const pIds = [...projectIds]
  const jobPool = rankedJobIds.filter(id => !jIds.includes(id))
  const projPool = rankedProjectIds.filter(id => !pIds.includes(id))
  while (jobPool.length > 0 || projPool.length > 0) {
    const budget = bulletBudget(jIds.length, nEdus, pIds.length, nSkillCats, hasSummary)
    if (3 * (jIds.length + pIds.length) + 1 >= budget) break
    if (projPool.length > 0 && (pIds.length < 2 || jobPool.length === 0)) {
      pIds.push(projPool.shift()!)
    } else {
      jIds.push(jobPool.shift()!)
    }
  }
  return { jobIds: jIds, projectIds: pIds }
}

// Drops the least-relevant entries (end of each array, entries ordered
// most-relevant first) until the bullet budget covers 2 bullets per entry
// plus slack for the top role's extras. Sacrifice ladder preserves the
// projects section (owner rule: at least 1 project, ideally 2):
//   projects beyond 2 → jobs down to 2 → the 2nd project → jobs down to 1.
// The last project is never dropped here.
export function trimToPageFit(
  jobIds: string[],
  projectIds: string[],
  nEdus: number,
  nSkillCats: number,
  hasSummary: boolean,
): { jobIds: string[], projectIds: string[] } {
  let jIds = [...jobIds]
  let pIds = [...projectIds]
  while (true) {
    const n = jIds.length + pIds.length
    if (n === 0) break
    const budget = bulletBudget(jIds.length, nEdus, pIds.length, nSkillCats, hasSummary)
    if (budget >= 2 * n + 2) break
    if (pIds.length > 2) { pIds = pIds.slice(0, -1); continue }
    if (jIds.length > 2) { jIds = jIds.slice(0, -1); continue }
    if (pIds.length > 1) { pIds = pIds.slice(0, -1); continue }
    if (jIds.length > 1) { jIds = jIds.slice(0, -1); continue }
    break
  }
  return { jobIds: jIds, projectIds: pIds }
}

function groupSkillsByCategory(skills: Skill[]): Record<string, string[]> {
  return skills.reduce<Record<string, string[]>>((acc, s) => {
    const cat = s.category || 'General'
    if (!acc[cat]) acc[cat] = []
    acc[cat].push(s.level ? `${s.name} (${s.level})` : s.name)
    return acc
  }, {})
}

// Resolves an entry's top-ranked bullets (retrieval's jittered + MMR order)
// to the [S#] labels assigned in the numbering loop. Annotation instead of
// reordering: numberedSourceMap and buildProfileContext number independently,
// and reordering the source bullets would silently desync citations.
function topRelevantLine(
  retrieval: RetrievalResult | null,
  parentId: string,
  labelByText: Map<string, string>,
): string | undefined {
  const ranked = retrieval?.bulletRanks?.[parentId]
  if (!ranked || ranked.length === 0) return undefined
  const labels = ranked
    .filter(b => b.score > 0)
    .map(b => labelByText.get(b.text.trim()))
    .filter((s): s is string => Boolean(s))
    .slice(0, 3)
  return labels.length > 0 ? `Most relevant to this JD: [${labels.join('], [')}]` : undefined
}

function buildProfileContext(data: ResumeData, profile: Profile | null, retrieval: RetrievalResult | null = null): string {
  const { jobs, projects, skills } = data
  const sections: string[] = []
  let sourceIdx = 1

  if (profile) {
    // Contact fields are deliberately absent — the header is composed
    // deterministically by buildHeaderLines, never written by the model.
    const lines = [
      profile.name    && `Name: ${profile.name}`,
      profile.summary && `Summary: ${profile.summary}`,
    ].filter(Boolean)
    if (lines.length) sections.push('## CANDIDATE PROFILE\n' + lines.join('\n'))
  }

  if (jobs.length > 0) {
    sections.push(
      '## WORK EXPERIENCE (entries numbered — output in this exact order, #1 first)\n' +
      sortByRecency(jobs).map((j, i) => {
        const start = formatDate(j.startDate)
        const end = j.current ? 'Present' : formatDate(j.endDate)
        const dates = [start, end].filter(Boolean).join(' – ')
        const loc = j.location ? ` | ${j.location}` : ''
        const recency = recencyLabel(j.endDate, j.current)
        const tag = recency ? ` [${recency}]` : ''
        const bulletLines = j.bullets?.trim()
          ? j.bullets.split('\n').map(l => l.trim()).filter(Boolean)
          : []
        const labelByText = new Map<string, string>()
        const numberedBullets = bulletLines.map(l => {
          const label = `S${sourceIdx++}`
          if (!labelByText.has(l)) labelByText.set(l, label)
          return `[${label}] ${l}`
        }).join('\n')
        return [
          `[#${i + 1}] ${resumeTitle(j)} at ${j.company}${loc} (${dates})${tag}`,
          j.description && `Description: ${j.description}`,
          numberedBullets || undefined,
          topRelevantLine(retrieval, j.id, labelByText),
        ].filter(Boolean).join('\n')
      }).join('\n\n')
    )
  }

  // Education is deliberately absent — like the header, it is composed
  // deterministically by buildEducationLines, never written by the model.

  if (projects.length > 0) {
    sections.push(
      '## PROJECTS (entries numbered — output in this exact order, #1 first)\n' +
      sortProjectsByRecency(projects).map((p, i) => {
        const start = formatDate(p.startDate)
        const end = formatDate(p.endDate)
        const dates = start && end ? ` (${start} – ${end})` : start ? ` (${start})` : ''
        const tech = p.technologies ? ` | Technologies: ${p.technologies}` : ''
        const url = p.url ? ` | URL: ${p.url}` : ''
        const bulletLines = p.bullets?.trim()
          ? p.bullets.split('\n').map(l => l.trim()).filter(Boolean)
          : []
        const labelByText = new Map<string, string>()
        const numberedBullets = bulletLines.map(l => {
          const label = `S${sourceIdx++}`
          if (!labelByText.has(l)) labelByText.set(l, label)
          return `[${label}] ${l}`
        }).join('\n')
        return [
          `[#${i + 1}] ${p.name}${dates}${tech}${url}`,
          p.description && `Description: ${p.description}`,
          numberedBullets || undefined,
          topRelevantLine(retrieval, p.id, labelByText),
        ].filter(Boolean).join('\n')
      }).join('\n\n')
    )
  }

  const byCategory = groupSkillsByCategory(skills)
  if (skills.length > 0) {
    sections.push(
      '## SKILLS\n' +
      Object.entries(byCategory).map(([cat, items]) => `${cat}: ${items.join(', ')}`).join('\n')
    )
  }

  return sections.join('\n\n')
}

// Bullet count the generation prompt will demand — exported so the dynamic
// fill loop can tell whether a corrective pass would actually change anything.
// `bulletBonus` folds in the measured shortfall from a real compile.
export function pageFillCount(data: ResumeData, hasSummary: boolean, bulletBonus = 0): number {
  const byCategory = groupSkillsByCategory(data.skills)
  const budget = bulletBudget(
    data.jobs.length,
    data.education.length,
    data.projects.length,
    Object.keys(byCategory).length,
    hasSummary,
  )
  const n = data.jobs.length + data.projects.length
  const minRequired = 2 * n
  // Rule 15 cap: every entry ≤3 bullets, plus one extra for at most one
  // extremely relevant entry — never ask for more than the caps allow.
  const capped = 3 * n + 1
  return Math.max(Math.min(budget + bulletBonus, capped), minRequired)
}

// ─── Relevance-driven bullet allocation ──────────────────────────────────────
// Explicit per-entry bullet counts for the generation prompt: every entry gets
// 2, extras flow by retrieval rank (recency and job-before-project only break
// ties), the most recent job takes the first extra so the top of the page
// never looks thin, and the single rule-15 fourth bullet goes to the
// top-ranked entry when the budget allows. Replaces "allocate top-down by
// recency", which gave every JD the same page shape. Null without retrieval —
// the recency fallback keeps today's prompt wording.
export function computeBulletAllocation(
  data: ResumeData,
  retrieval: RetrievalResult | null,
  hasSummary: boolean,
  bulletBonus = 0,
): BulletAllocation | null {
  if (!retrieval) return null
  const jobScore = new Map(retrieval.rankedJobs.map(r => [r.id, r.score]))
  const projScore = new Map(retrieval.rankedProjects.map(r => [r.id, r.score]))
  const entries = [
    ...sortByRecency(data.jobs).map(j => ({
      id: j.id,
      kind: 'job' as const,
      label: `${resumeTitle(j)} at ${j.company}`,
      count: 2,
      score: jobScore.get(j.id) ?? 0,
      end: j.current ? '9999-12' : (j.endDate || ''),
    })),
    ...sortProjectsByRecency(data.projects).map(p => ({
      id: p.id,
      kind: 'project' as const,
      label: p.name,
      count: 2,
      score: projScore.get(p.id) ?? 0,
      end: p.endDate || '9999-12',
    })),
  ]
  if (entries.length === 0) return null
  // Priority: score desc → more recent end first → job before project.
  const priority = [...entries].sort((a, b) =>
    (b.score - a.score)
    || b.end.localeCompare(a.end)
    || (a.kind === b.kind ? 0 : a.kind === 'job' ? -1 : 1))
  const total = pageFillCount(data, hasSummary, bulletBonus)
  // pageFillCount guarantees 2n ≤ total ≤ 3n+1; clamp defensively anyway.
  let extras = Math.max(0, Math.min(total - 2 * entries.length, entries.length + 1))
  const recentJob = entries.find(e => e.kind === 'job')
  if (extras > 0 && recentJob) {
    recentJob.count = 3
    extras--
  }
  for (const e of priority) {
    if (extras === 0) break
    if (e.count < 3) {
      e.count = 3
      extras--
    }
  }
  if (extras > 0) priority[0].count = 4 // the single rule-15 slot, by relevance
  return {
    entries: entries.map(({ id, kind, label, count }) => ({ id, kind, label, count })),
    total: entries.reduce((a, e) => a + e.count, 0),
  }
}

function pageFillInstruction(data: ResumeData, hasSummary: boolean, bulletBonus = 0, allocation: BulletAllocation | null = null): string {
  if (allocation) {
    return (
      `PAGE FILL REQUIREMENT: this resume has space for exactly ${allocation.total} bullet points ` +
      `across all work experience and project entries combined — no more (it will overflow the page).\n` +
      `PER-ENTRY BULLET ALLOCATION (already balanced for relevance to THIS job and for recency — follow it exactly):\n` +
      allocation.entries.map(e => `- ${e.label}: ${e.count} bullets`).join('\n') +
      `\nEvery listed entry must appear with exactly its allocated bullet count.`
    )
  }
  const effective = pageFillCount(data, hasSummary, bulletBonus)
  return (
    `PAGE FILL REQUIREMENT: Based on the layout, this resume has space for exactly ${effective} bullet points ` +
    `across all work experience and project entries combined. Write that many [BULLET] lines — ` +
    `no more (it will overflow the page). ` +
    `Every entry that appears must receive at least 2 bullets, and the rule-15 cap (3 per entry, ` +
    `one extremely relevant entry may have 4) always wins over this count. ` +
    `Allocate the remaining bullets top-down by recency: the most recent role gets the largest share, ` +
    `and within WORK EXPERIENCE an older entry must never have more bullets than a more recent one.`
  )
}

// The resume header is deterministic profile data — composing it here (instead
// of asking the LLM to echo it) removes a whole class of typo/omission risk.
// The renderer turns URL parts into labeled hyperlinks (see server/latex.ts).
export function buildHeaderLines(profile: Profile | null): string {
  if (!profile) return ''
  const contact = [profile.location, profile.email, profile.phone, profile.website, profile.linkedin, profile.github]
    .map(s => s?.trim())
    .filter(Boolean)
    .join(' | ')
  const lines = [
    profile.name?.trim() && `[NAME]${profile.name.trim()}`,
    contact && `[CONTACT]${contact}`,
  ].filter(Boolean)
  return lines.join('\n')
}

// Education is deterministic profile data too — never LLM-generated. Jake's
// Resume layout: Institution | Location on top, Degree | Dates beneath
// (GPA folded into the degree text since dates occupy that column).
export function buildEducationLines(education: EducationEntry[]): string {
  if (education.length === 0) return ''
  const entries = sortByRecency(education).map(e => {
    const degree = [e.degree, e.field].filter(Boolean).join(' in ')
      + (e.minor ? `, Minor in ${e.minor}` : '')
      + (e.gpa ? ` (GPA: ${e.gpa})` : '')
    const dates = e.current
      ? (e.endDate ? `Expected ${formatDate(e.endDate)}` : [formatDate(e.startDate), 'Present'].filter(Boolean).join(' – '))
      : [formatDate(e.startDate), formatDate(e.endDate)].filter(Boolean).join(' – ')
    return `[EDU_INST]${e.institution}\t${e.location ?? ''}\n[EDU_DEG]${degree}\t${dates}`
  })
  return ['[SECTION]EDUCATION', ...entries].join('\n')
}

// Defense against the model echoing statically-composed content despite
// rule 1: drops header/education tag lines and any EDUCATION section
// wholesale (including stray bullets inside it, which would otherwise
// re-attach to the previous entry when parsed).
export function stripStaticTags(text: string): string {
  const out: string[] = []
  let inEducation = false
  for (const line of text.split('\n')) {
    if (line.startsWith('[SECTION]')) {
      inEducation = line.slice(9).trim().toUpperCase() === 'EDUCATION'
      if (inEducation) continue
    }
    if (inEducation) continue
    if (line.startsWith('[NAME]') || line.startsWith('[CONTACT]')
      || line.startsWith('[EDU_INST]') || line.startsWith('[EDU_DEG]')) continue
    out.push(line)
  }
  return out.join('\n')
}

// Final document assembly: statically-composed header + summary (hoisted from
// wherever the model emitted it) + education + the model's cleaned sections.
export function assembleResume(header: string, education: string, modelOutput: string): string {
  const cleaned = stripCitations(enforceChronologicalOrder(stripStaticTags(modelOutput))).trim()
  const lines = cleaned ? cleaned.split('\n') : []
  const summary = lines.filter(l => l.startsWith('[SUMMARY]'))
  const rest = lines.filter(l => !l.startsWith('[SUMMARY]')).join('\n').trim()
  return [header, summary.join('\n'), education, rest].filter(Boolean).join('\n')
}

// Mirrors the [S#] numbering that buildProfileContext assigns to bullet lines
// (jobs by recency, then projects by recency, one counter). Keep the two in
// sync — the evidence map cites these numbers.
export function numberedSourceMap(data: ResumeData): Map<string, string> {
  const map = new Map<string, string>()
  let sourceIdx = 1
  for (const j of sortByRecency(data.jobs)) {
    for (const b of (j.bullets ?? '').split('\n').map(l => l.trim()).filter(Boolean)) {
      map.set(`${j.id}\u0000${b}`, `S${sourceIdx++}`)
    }
  }
  for (const p of sortProjectsByRecency(data.projects)) {
    for (const b of (p.bullets ?? '').split('\n').map(l => l.trim()).filter(Boolean)) {
      map.set(`${p.id}\u0000${b}`, `S${sourceIdx++}`)
    }
  }
  return map
}

// Deterministic retrieval verdicts rendered for the generation prompt: which
// source bullets are the strongest evidence per requirement, and which
// requirements are gaps that must NOT be papered over (rule 5).
function evidenceBlock(data: ResumeData, retrieval: RetrievalResult | null, forEdit = false): string {
  if (!retrieval || retrieval.requirements.length === 0) return ''
  const sources = numberedSourceMap(data)
  const lines: string[] = []
  for (const req of retrieval.requirements) {
    const label = req.required ? 'Must-have' : 'Nice-to-have'
    const cites = req.topEvidence
      .map(e => sources.get(`${e.parentId}\u0000${e.rawText}`))
      .filter((s): s is string => Boolean(s))
      .slice(0, 2)
    if (!req.covered) {
      if (req.required) lines.push(`${label} "${req.text}" — NO SUPPORTING EVIDENCE in the profile. This is a gap: do not fabricate coverage; omit rather than stretch.`)
    } else if (cites.length > 0) {
      lines.push(`${label} "${req.text}" — strongest source bullets: [${cites.join('], [')}]`)
    }
  }
  if (lines.length === 0) return ''
  return (
    'EVIDENCE MAP (deterministic retrieval over the candidate profile):\n' +
    lines.join('\n') +
    (forEdit
      ? '\nUse these citations to ground any bullet you rewrite or add. They are NOT a reason to touch bullets the request leaves alone.\n\n'
      : '\nUse these citations when selecting and ordering bullets (rule 8): within each entry, cited evidence bullets come first, and the top cited bullet for the most important requirement leads the most recent role.\n\n')
  )
}

// The extracted-keyword block injected into generation/refine prompts.
// Coverage rules live in SYSTEM_PROMPT rule 5; this supplies the data.
function keywordsBlock(keywords: JdKeywords | null, forEdit = false): string {
  if (!keywords) return ''
  const lines = [
    'PRIORITY KEYWORDS (extracted from this job description):',
    keywords.targetTitle && `Target title: ${keywords.targetTitle}`,
    keywords.mustHave.length > 0 && `Must-have: ${keywords.mustHave.join(', ')}`,
    keywords.niceToHave.length > 0 && `Nice-to-have: ${keywords.niceToHave.join(', ')}`,
    forEdit
      ? 'If your requested change touches keywords, keep coverage-not-frequency: once in TECHNICAL SKILLS plus once in an evidence bullet, never more than twice overall. This list is NOT a reason to change lines the request leaves alone.'
      : 'Apply rule 5: cover each supported must-have once in TECHNICAL SKILLS and once in an evidence bullet; skip unsupported ones; no keyword more than twice.',
  ].filter(Boolean)
  return lines.join('\n') + '\n\n'
}

export function buildUserMessage(
  data: ResumeData,
  profile: Profile | null,
  jobDescription: string,
  keywords: JdKeywords | null = null,
  retrieval: RetrievalResult | null = null,
  bulletBonus = 0,
): string {
  const profileContext = buildProfileContext(data, profile, retrieval)
  const hasSummary = Boolean(profile?.summary?.trim())
  const allocation = computeBulletAllocation(data, retrieval, hasSummary, bulletBonus)
  return (
    `Here is the candidate's full profile:\n\n${profileContext}\n\n` +
    `---\n\nTarget job description:\n\n${jobDescription}\n\n` +
    `---\n\n` +
    keywordsBlock(keywords) +
    evidenceBlock(data, retrieval) +
    `${pageFillInstruction(data, hasSummary, bulletBonus, allocation)}\n\n` +
    `Write the tailored resume in the exact tagged format specified.`
  )
}

export function buildRefineMessage(
  data: ResumeData,
  profile: Profile | null,
  jobDescription: string,
  currentResume: string,
  instructions: string,
  keywords: JdKeywords | null = null,
  retrieval: RetrievalResult | null = null,
): string {
  const profileContext = buildProfileContext(data, profile)
  // The edit target is the model-owned body only: header and education are
  // static (assembleResume re-adds them), and showing them would tempt the
  // model to echo content it must never output. Citations were stripped at
  // assembly, so unchanged bullets legitimately carry none. The draft's own
  // bullet count is the page-fill spec — the draft already fills the page, so
  // preserving its count preserves the layout (buildUserMessage's
  // pageFillInstruction would be wrong here: it budgets for whatever entry
  // set it is handed, not for the entries actually on the page).
  const draft = stripStaticTags(currentResume).trim()
  const draftBullets = (draft.match(/^\[BULLET\]/gm) ?? []).length
  const refinementNote = instructions.trim()
    || 'Polish the wording of the existing bullets in place: strengthen weak verbs and vague claims into concrete, grounded impact. Keep every entry, every bullet count, and the order exactly as they are.'
  return (
    `Here is the candidate's full profile (source data for citations):\n\n${profileContext}\n\n` +
    `---\n\nTarget job description:\n\n${jobDescription}\n\n` +
    `---\n\n` +
    keywordsBlock(keywords, true) +
    evidenceBlock(data, retrieval, true) +
    `CURRENT RESUME — the edit target. Its ${draftBullets} [BULLET] lines fill the page exactly; keep that total unless the request changes what content exists:\n\n${draft}\n\n` +
    `---\n\nREFINEMENT REQUEST: ${refinementNote}\n\n` +
    `Output the complete updated resume now. Reproduce every line the request does not affect exactly as it appears above.`
  )
}

// Strips [S1], [S1,S3], [Sdesc] citation tags the model appends to bullets for grounding.
export function stripCitations(text: string): string {
  return text
    .split('\n')
    .map(line =>
      line.startsWith('[BULLET]')
        ? line.replace(/\s*\[S(?:desc|\d+)(?:[,\s]+S(?:desc|\d+))*\]\s*$/, '')
        : line
    )
    .join('\n')
}


// ─── Post-processing: enforce chronological order ────────────────────────────
// Deterministic fallback — re-sorts WORK EXPERIENCE, EDUCATION, and PROJECTS
// sections by the start dates the AI embedded in the output, so ordering is
// correct even when the model drifts.

function parseMmYyyy(s: string): Date {
  s = s.trim().replace(/^[\w\s]+:\s*/i, '') // strip "Expected:", "Incoming:", etc.
  if (!s || /^present$/i.test(s)) return new Date(9999, 11)
  // MM/YYYY
  const slash = s.match(/^(\d{1,2})\/(\d{4})/)
  if (slash) return new Date(parseInt(slash[2]), parseInt(slash[1]) - 1)
  // "Mon YYYY" (e.g. "Jan 2023")
  const MONTHS = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec']
  const named = s.toLowerCase().match(/([a-z]+)\s+(\d{4})/)
  if (named) {
    const mi = MONTHS.indexOf(named[1].slice(0, 3))
    if (mi >= 0) return new Date(parseInt(named[2]), mi)
  }
  // bare year
  const yr = s.match(/\d{4}/)
  if (yr) return new Date(parseInt(yr[0]), 0)
  return new Date(0)
}

// Extract the right-hand column (after \t), falling back to the full line
function rightCol(line: string): string {
  return line.includes('\t') ? line.split('\t').slice(1).join('\t') : line
}

function startDateFromRight(right: string): Date {
  const parts = right.split(/\s*[–—\-]\s*/)
  return parseMmYyyy(parts[0])
}

function endDateFromRight(right: string): Date {
  // "Present" anywhere in the right column means the role is active
  if (/\bpresent\b/i.test(right)) return new Date(9999, 11)
  const parts = right.split(/\s*[–—\-]\s*/)
  return parseMmYyyy(parts[1] ?? parts[0])
}

type Entry = { lines: string[]; start: Date; end: Date }

function sortEntries(entries: Entry[]): Entry[] {
  return [...entries].sort((a, b) => {
    // Primary: most recent end date first (Present = 9999)
    const endDiff = b.end.getTime() - a.end.getTime()
    if (endDiff !== 0) return endDiff
    // Tiebreak: most recent start date first
    return b.start.getTime() - a.start.getTime()
  })
}

export function enforceChronologicalOrder(text: string): string {
  try { return _enforceChronologicalOrder(text) } catch { return text }
}

function _enforceChronologicalOrder(text: string): string {
  const lines = text.split('\n')
  const out: string[] = []
  let i = 0

  function collectEntries(headerPrefix: string, dateLinePrefix?: string): Entry[] {
    const entries: Entry[] = []
    let cur: string[] = []
    let start = new Date(0)
    let end = new Date(0)

    while (i < lines.length && !lines[i].startsWith('[SECTION]')) {
      const l = lines[i]
      if (l.startsWith(headerPrefix)) {
        if (cur.length > 0) entries.push({ lines: cur, start, end })
        cur = [l]
        // For jobs, date comes from JOB_ROLE; for others, date is on this line
        if (!dateLinePrefix) {
          const right = rightCol(l)
          start = startDateFromRight(right)
          end   = endDateFromRight(right)
        } else {
          start = new Date(0); end = new Date(0)
        }
      } else if (dateLinePrefix && l.startsWith(dateLinePrefix)) {
        cur.push(l)
        const right = rightCol(l)
        start = startDateFromRight(right)
        end   = endDateFromRight(right)
      } else {
        cur.push(l)
      }
      i++
    }
    if (cur.length > 0) entries.push({ lines: cur, start, end })
    return entries
  }

  while (i < lines.length) {
    const line = lines[i]
    if (line.startsWith('[SECTION]')) {
      const name = line.slice(9).trim().toUpperCase()
      out.push(line)
      i++
      let entries: Entry[]
      if (name === 'WORK EXPERIENCE') {
        entries = collectEntries('[JOB_CO]', '[JOB_ROLE]')
      } else if (name === 'PROJECTS') {
        entries = collectEntries('[PROJECT]')
      } else if (name === 'EDUCATION') {
        // Jake's layout: dates sit on the [EDU_DEG] line (location on [EDU_INST])
        entries = collectEntries('[EDU_INST]', '[EDU_DEG]')
      } else {
        while (i < lines.length && !lines[i].startsWith('[SECTION]')) {
          out.push(lines[i++])
        }
        continue
      }
      for (const e of sortEntries(entries)) out.push(...e.lines)
    } else {
      out.push(line)
      i++
    }
  }

  return out.join('\n')
}

