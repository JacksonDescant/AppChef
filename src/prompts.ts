import type { Job, EducationEntry, Project, Skill, Profile } from './types'

export const SYSTEM_PROMPT = `You are an expert resume writer and career strategist. Produce a tailored, one-page resume using ONLY the exact tagged format below. Output nothing else — no preamble, no explanation, no markdown fences.

OUTPUT FORMAT:

[NAME]Full Name
[CONTACT]City, State | email | website (only include fields that were provided; omit blanks)

[SECTION]EDUCATION
[EDU_INST]Institution Name\tDate label — still enrolled: "Expected: Month YYYY"; completed degree: "Month YYYY" (no prefix)
[EDU_DEG]Degree, Field of Study, Minor if any\tGPA: X.XX/4.0
(omit the GPA right-column if not provided; repeat EDU_INST + EDU_DEG for each entry, most recent first)

[SECTION]WORK EXPERIENCE
[JOB_CO]Company Name\tCity, State
[JOB_ROLE]Job Title\tMM/YYYY – MM/YYYY (or "Present" instead of the end date. Always include the start date)
[BULLET]Achievement-focused bullet reframed from candidate's source data [S1]
(minimum 2 bullets per job, up to 3 for recent/high-relevance roles; most recent first; omit irrelevant jobs entirely rather than giving them fewer than 2 bullets)

[SECTION]PROJECTS
[PROJECT]Project Name\tMM/YYYY – MM/YYYY
[BULLET]What you built and its measurable impact [S2]
(minimum 2 bullets per project; most relevant projects only; omit a project entirely rather than giving it fewer than 2 bullets)

[SECTION]TECHNICAL SKILLS
[SKILL]Category: skill1, skill2, skill3
(3–5 rows; prioritize skills that match the target job description)

RULES:
1. Use ONLY the tagged lines above. No other text or blank lines between tags.
2. The \\t in two-column lines is a literal tab character separating left content from right content.
3. Bullets must be concise — one line each. Quantify impact wherever the source data supports it.
4. GROUNDING — CITATIONS REQUIRED: Every [BULLET] line must end with a citation tag: [S1] for a single source, [S1,S3] when synthesizing across multiple. The numbers correspond to [S#] labels in the candidate's profile data. If a bullet draws from an entry's Description field (not a numbered bullet), use [Sdesc]. Citations are stripped from the final resume output — they exist only to enforce factual grounding. You MAY: reframe and strengthen language, change emphasis to match the role, synthesize across multiple source bullets, and highlight the natural significance and implications of the candidate's actual work — even if the source phrasing is plain. You MAY NOT: introduce specific numbers, metrics, team sizes, dollar figures, dates, or concrete outcomes that are not present in the cited source(s). If source [S2] says "improved performance", you may write "drove critical performance improvements [S2]" — but NOT "improved performance by 40% [S2]" unless 40% appears in [S2].
5. Mirror keywords and technical terms from the job description naturally and truthfully.
6. ORDERING IS MANDATORY: every section must appear in strict reverse-chronological order by END DATE — most recent end date first. "Present" is the most recent possible end date. This cannot be changed for any reason, including relevance to the job. Recency weighting affects bullet count and detail, not the order entries appear. The candidate's entries are pre-sorted — output them in the EXACT ORDER they are provided.
7. The entire output must represent one page of content — be selective and concise but always use the full page.
8. Never fabricate or exaggerate. Reframe truthfully to match the role.
9. NEVER invent, modify, or estimate any date. Copy dates exactly as given in the candidate's profile data. If a date was not provided, omit it entirely rather than guessing.
10. MINIMUM BULLETS: Every work experience entry and every project entry that appears in the resume MUST have at least 2 [BULLET] lines. If page space is tight, drop an entire entry rather than leaving any entry with only 1 bullet.`

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

// ─── Page budget calculator ───────────────────────────────────────────────────
// Mirrors PDF renderer constants (MT=40, MB=36, FS=10, LG=1.0). Values in pts.
// Constants are intentionally conservative: section headers include their
// preceding moveDown, skill rows assume likely wrapping, and a 0.80 safety
// factor covers bullets that wrap to a second line.
const PDF = {
  pageH: 792, mt: 40, mb: 36,
  header: 44,       // name + contact + gap
  sectionHdr: 20,   // bold title + rule + gap + preceding moveDown
  eduEntry: 30,     // EDU_INST + EDU_DEG (two ~15pt lines)
  eduGap: 5,        // gap between edu entries
  jobHdr: 30,       // JOB_CO + JOB_ROLE
  jobGap: 5,        // moveDown before each job
  projectHdr: 25,   // PROJECT row + gap
  skillRow: 18,     // one SKILL line (generous for wrapping)
  bullet: 14,       // one BULLET line (generous for wrapping)
}

function bulletBudget(nJobs: number, nEdus: number, nProjects: number, nSkillCats: number): number {
  const usable = PDF.pageH - PDF.mt - PDF.mb
  const fixed =
    PDF.header +
    4 * PDF.sectionHdr +
    nEdus     * PDF.eduEntry  + Math.max(0, nEdus - 1)  * PDF.eduGap +
    nJobs     * PDF.jobHdr    + Math.max(0, nJobs - 1)  * PDF.jobGap +
    nProjects * PDF.projectHdr +
    nSkillCats * PDF.skillRow
  // 0.80 safety factor accounts for bullets/skill rows that wrap to a second line; +2 corrects observed underbudget
  return Math.max(4, Math.floor((usable - fixed) / PDF.bullet * 0.80) + 2)
}

function groupSkillsByCategory(skills: Skill[]): Record<string, string[]> {
  return skills.reduce<Record<string, string[]>>((acc, s) => {
    const cat = s.category || 'General'
    if (!acc[cat]) acc[cat] = []
    acc[cat].push(s.level ? `${s.name} (${s.level})` : s.name)
    return acc
  }, {})
}

function buildProfileContext(data: ResumeData, profile: Profile | null): string {
  const { jobs, education, projects, skills } = data
  const sections: string[] = []
  let sourceIdx = 1

  if (profile) {
    const lines = [
      profile.name     && `Name: ${profile.name}`,
      profile.email    && `Email: ${profile.email}`,
      profile.phone    && `Phone: ${profile.phone}`,
      profile.location && `Location: ${profile.location}`,
      profile.website  && `Website: ${profile.website}`,
      profile.linkedin && `LinkedIn: ${profile.linkedin}`,
      profile.github   && `GitHub: ${profile.github}`,
      profile.summary  && `Summary: ${profile.summary}`,
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
        const numberedBullets = bulletLines.map(l => `[S${sourceIdx++}] ${l}`).join('\n')
        return [
          `[#${i + 1}] ${j.title} at ${j.company}${loc} (${dates})${tag}`,
          j.description && `Description: ${j.description}`,
          numberedBullets || undefined,
        ].filter(Boolean).join('\n')
      }).join('\n\n')
    )
  }

  if (education.length > 0) {
    sections.push(
      '## EDUCATION (entries numbered — output in this exact order, #1 first)\n' +
      sortByRecency(education).map((e, i) => {
        const start = formatDate(e.startDate)
        const end = e.current ? 'Present' : formatDate(e.endDate)
        const dates = [start, end].filter(Boolean).join(' – ')
        const degree = [e.degree, e.field].filter(Boolean).join(' in ')
        const minor = e.minor ? `, Minor in ${e.minor}` : ''
        const loc = e.location ? ` | ${e.location}` : ''
        const gpa = e.gpa ? ` | GPA: ${e.gpa}` : ''
        const recency = recencyLabel(e.endDate, e.current)
        const tag = recency ? ` [${recency}]` : ''
        return `[#${i + 1}] ${degree}${minor} — ${e.institution}${loc} (${dates})${tag}${gpa}${e.description ? '\nNotes: ' + e.description : ''}`
      }).join('\n\n')
    )
  }

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
        const numberedBullets = bulletLines.map(l => `[S${sourceIdx++}] ${l}`).join('\n')
        return [
          `[#${i + 1}] ${p.name}${dates}${tech}${url}`,
          p.description && `Description: ${p.description}`,
          numberedBullets || undefined,
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

function pageFillInstruction(data: ResumeData): string {
  const byCategory = groupSkillsByCategory(data.skills)
  const budget = bulletBudget(
    data.jobs.length,
    data.education.length,
    data.projects.length,
    Object.keys(byCategory).length,
  )
  const minRequired = 2 * (data.jobs.length + data.projects.length)
  const effective = Math.max(budget, minRequired)
  return (
    `PAGE FILL REQUIREMENT: Based on the layout, this resume has space for exactly ${effective} bullet points ` +
    `across all work experience and project entries combined. You MUST write exactly that many [BULLET] lines — ` +
    `no more (it will overflow the page) and no fewer (it will leave blank space). ` +
    `Every entry that appears must receive at least 2 bullets. ` +
    `Distribute remaining bullets to recent/relevant positions.`
  )
}

export function buildUserMessage(
  data: ResumeData,
  profile: Profile | null,
  jobDescription: string,
): string {
  const profileContext = buildProfileContext(data, profile)
  return (
    `Here is the candidate's full profile:\n\n${profileContext}\n\n` +
    `---\n\nTarget job description:\n\n${jobDescription}\n\n` +
    `---\n\n` +
    `${pageFillInstruction(data)}\n\n` +
    `Write the tailored resume in the exact tagged format specified.`
  )
}

export function buildRefineMessage(
  data: ResumeData,
  profile: Profile | null,
  jobDescription: string,
  currentResume: string,
  instructions: string,
): string {
  const profileContext = buildProfileContext(data, profile)
  const refinementNote = instructions.trim()
    || 'Improve the quality of all bullets — ensure every entry has at least 2 strong, specific bullets tightly aligned with the job description. Strengthen weak bullets with more concrete impact and relevant keywords.'
  return (
    `Here is the candidate's full profile:\n\n${profileContext}\n\n` +
    `---\n\nTarget job description:\n\n${jobDescription}\n\n` +
    `---\n\nCurrent resume draft to refine:\n\n${currentResume}\n\n` +
    `---\n\nRefinement instructions: ${refinementNote}\n\n` +
    `---\n\n` +
    `${pageFillInstruction(data)}\n\n` +
    `Output the complete revised resume in the exact tagged format. Preserve everything that works well and improve what doesn't.`
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
        entries = collectEntries('[EDU_INST]')
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

