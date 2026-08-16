// ─── Tagged resume text → LaTeX (Jake's Resume template) ─────────────────────
// Pure functions only — no I/O. Compilation lives in ./tectonic.

// ─── Escaping ────────────────────────────────────────────────────────────────

const SPECIALS: Record<string, string> = {
  '\\': '\\textbackslash{}',
  '&': '\\&', '%': '\\%', '$': '\\$', '#': '\\#', '_': '\\_',
  '{': '\\{', '}': '\\}',
  '~': '\\textasciitilde{}',
  '^': '\\textasciicircum{}',
  '|': '\\textbar{}',
  '<': '\\textless{}',
  '>': '\\textgreater{}',
}

// Normalize common LLM unicode to LaTeX-safe ASCII (the template uses legacy
// Computer Modern fonts, where raw unicode glyphs are unreliable), then escape
// LaTeX specials in a single pass so replacements can't be double-escaped.
export function escapeLatex(s: string): string {
  return s
    .replace(/ /g, ' ')
    .replace(/[‘’]/g, "'")
    .replace(/“/g, '``')
    .replace(/”/g, "''")
    .replace(/–/g, '--')
    .replace(/—/g, '---')
    .replace(/•/g, '-')
    .replace(/[\\&%$#_{}~^|<>]/g, ch => SPECIALS[ch])
}

// ─── Intermediate representation ─────────────────────────────────────────────

export type ResumeEntry =
  | { kind: 'edu'; instL: string; instR: string; degL: string; degR: string; bullets: string[] }
  | { kind: 'job'; coL: string; coR: string; roleL: string; roleR: string; bullets: string[] }
  | { kind: 'project'; nameL: string; nameR: string; bullets: string[] }
  | { kind: 'skill'; category: string; items: string }

export interface ResumeSection { title: string; entries: ResumeEntry[] }
export interface ResumeIR { name: string; contact: string; summary: string; sections: ResumeSection[] }

function splitCols(s: string): [string, string] {
  // The LLM is asked for a literal tab but sometimes emits the two characters
  // backslash+t instead — accept either as the column separator.
  const [left, right = ''] = s.split(/\t|\\t/)
  return [left.trim(), right.trim()]
}

// Mirrors the tagged format the LLM emits (see SYSTEM_PROMPT in src/prompts.ts):
// line-oriented, prefix tags, two-column rows split on a literal tab.
// [BULLET] attaches to the most recent entry; [EDU_DEG]/[JOB_ROLE] pair with a
// pending [EDU_INST]/[JOB_CO] but tolerate a missing partner line.
export function parseTagged(text: string): ResumeIR {
  const ir: ResumeIR = { name: '', contact: '', summary: '', sections: [] }

  function section(): ResumeSection {
    if (ir.sections.length === 0) ir.sections.push({ title: '', entries: [] })
    return ir.sections[ir.sections.length - 1]
  }
  function lastEntry(): ResumeEntry | undefined {
    const s = ir.sections[ir.sections.length - 1]
    return s?.entries[s.entries.length - 1]
  }

  for (const raw of text.split('\n')) {
    if (raw.startsWith('[NAME]')) {
      ir.name = raw.slice(6).trim()
    } else if (raw.startsWith('[CONTACT]')) {
      ir.contact = raw.slice(9).trim()
    } else if (raw.startsWith('[SUMMARY]')) {
      // Tolerate the model splitting the summary across several tagged lines.
      const part = raw.slice(9).trim()
      ir.summary = ir.summary ? `${ir.summary} ${part}` : part
    } else if (raw.startsWith('[SECTION]')) {
      ir.sections.push({ title: raw.slice(9).trim(), entries: [] })
    } else if (raw.startsWith('[EDU_INST]')) {
      const [l, r] = splitCols(raw.slice(10))
      section().entries.push({ kind: 'edu', instL: l, instR: r, degL: '', degR: '', bullets: [] })
    } else if (raw.startsWith('[EDU_DEG]')) {
      const [l, r] = splitCols(raw.slice(9))
      const last = lastEntry()
      if (last?.kind === 'edu' && !last.degL && !last.degR) {
        last.degL = l; last.degR = r
      } else {
        section().entries.push({ kind: 'edu', instL: '', instR: '', degL: l, degR: r, bullets: [] })
      }
    } else if (raw.startsWith('[JOB_CO]')) {
      const [l, r] = splitCols(raw.slice(8))
      section().entries.push({ kind: 'job', coL: l, coR: r, roleL: '', roleR: '', bullets: [] })
    } else if (raw.startsWith('[JOB_ROLE]')) {
      const [l, r] = splitCols(raw.slice(10))
      const last = lastEntry()
      if (last?.kind === 'job' && !last.roleL && !last.roleR) {
        last.roleL = l; last.roleR = r
      } else {
        section().entries.push({ kind: 'job', coL: '', coR: '', roleL: l, roleR: r, bullets: [] })
      }
    } else if (raw.startsWith('[PROJECT]')) {
      const [l, r] = splitCols(raw.slice(9))
      section().entries.push({ kind: 'project', nameL: l, nameR: r, bullets: [] })
    } else if (raw.startsWith('[BULLET]')) {
      const last = lastEntry()
      if (last && last.kind !== 'skill') last.bullets.push(raw.slice(8).trim())
    } else if (raw.startsWith('[SKILL]')) {
      const content = raw.slice(7).trim()
      const colonIdx = content.indexOf(':')
      if (colonIdx > 0 && colonIdx < 35) {
        section().entries.push({ kind: 'skill', category: content.slice(0, colonIdx).trim(), items: content.slice(colonIdx + 1).trim() })
      } else {
        section().entries.push({ kind: 'skill', category: '', items: content })
      }
    }
    // Unknown/blank lines are ignored, matching the old renderer.
  }

  ir.sections = ir.sections.filter(s => s.entries.length > 0 || s.title)
  return ir
}

// ─── Spacing knobs / squeeze presets ─────────────────────────────────────────

export interface SqueezeKnobs {
  fontSize: 10 | 11
  sectionPre: number   // \vspace before section title
  sectionPost: number  // \vspace after titlerule
  itemVspace: number   // \vspace inside \resumeItem
  subheadPre: number   // \vspace before \resumeSubheading
  subheadPost: number  // \vspace after subheading/project tabular
  itemSep: number      // itemsep of the bullet list
  listPost: number     // \vspace after a bullet list
}

// Preset 0 is the default look — 10pt base (owner decision 2026-08-15: denser
// page, 5–7 entries) with slight air between bullets and eased section
// boundaries. Later presets progressively tighten spacing for the one-page
// enforcement loop — cramped is their job.
export const SQUEEZE_PRESETS: SqueezeKnobs[] = [
  { fontSize: 10, sectionPre: -4, sectionPost: -4, itemVspace: -2, subheadPre: -3, subheadPost: -7, itemSep: 1, listPost: -5 },
  { fontSize: 10, sectionPre: -6, sectionPost: -7, itemVspace: -3, subheadPre: -4, subheadPost: -8, itemSep: -2, listPost: -7 },
  { fontSize: 10, sectionPre: -8, sectionPost: -8, itemVspace: -4, subheadPre: -5, subheadPost: -9, itemSep: -3, listPost: -8 },
]

// ─── Rendering ───────────────────────────────────────────────────────────────

function preamble(k: SqueezeKnobs): string {
  return `\\documentclass[letterpaper,${k.fontSize}pt]{article}

\\usepackage{latexsym}
% ATS text extraction: upstream Jake's Resume relies on \\input{glyphtounicode}
% + \\pdfgentounicode=1 for a machine-readable text layer, but those are pdfTeX
% primitives that fail under XeTeX (tectonic). The XeTeX equivalent: load the
% OpenType Latin Modern fonts (by filename — tectonic's bundle has no system
% font names) with common ligatures disabled, so "ffi"/"fl" stay separate
% letters and words like "efficient" extract as plain ASCII instead of
% U+FB00-style ligature codepoints that break ATS keyword search.
% Ligatures=TeX keeps the -- and --- dash shorthands emitted by escapeLatex.
% BoldFeatures maps bold small caps (the [NAME] line) to plain bold, matching
% the legacy Computer Modern substitution this template rendered with before.
\\usepackage{fontspec}
\\setmainfont{lmroman10-regular.otf}[
  BoldFont = lmroman10-bold.otf,
  ItalicFont = lmroman10-italic.otf,
  BoldItalicFont = lmroman10-bolditalic.otf,
  SmallCapsFont = lmromancaps10-regular.otf,
  BoldFeatures = {SmallCapsFont = lmroman10-bold.otf},
  Ligatures = {TeX, NoCommon},
]
\\usepackage[empty]{fullpage}
\\usepackage{titlesec}
\\usepackage[usenames,dvipsnames]{color}
\\usepackage{enumitem}
\\usepackage[hidelinks]{hyperref}
\\usepackage{fancyhdr}
\\usepackage{tabularx}

\\pagestyle{fancy}
\\fancyhf{}
\\fancyfoot{}
\\renewcommand{\\headrulewidth}{0pt}
\\renewcommand{\\footrulewidth}{0pt}

\\addtolength{\\oddsidemargin}{-0.5in}
\\addtolength{\\evensidemargin}{-0.5in}
\\addtolength{\\textwidth}{1in}
\\addtolength{\\topmargin}{-.5in}
\\addtolength{\\textheight}{1.0in}

\\urlstyle{same}
\\raggedbottom
\\raggedright
\\setlength{\\tabcolsep}{0in}

\\titleformat{\\section}{
  \\vspace{${k.sectionPre}pt}\\scshape\\raggedright\\large
}{}{0em}{}[\\color{black}\\titlerule \\vspace{${k.sectionPost}pt}]

\\newcommand{\\resumeItem}[1]{
  \\item\\small{
    {#1 \\vspace{${k.itemVspace}pt}}
  }
}

\\newcommand{\\resumeSubheading}[4]{
  \\vspace{${k.subheadPre}pt}\\item
    \\begin{tabular*}{0.97\\textwidth}[t]{l@{\\extracolsep{\\fill}}r}
      \\textbf{#1} & #2 \\\\
      \\textit{\\small#3} & \\textit{\\small #4} \\\\
    \\end{tabular*}\\vspace{${k.subheadPost}pt}
}

\\newcommand{\\resumeProjectHeading}[2]{
    \\item
    \\begin{tabular*}{0.97\\textwidth}{l@{\\extracolsep{\\fill}}r}
      \\small#1 & #2 \\\\
    \\end{tabular*}\\vspace{${k.subheadPost}pt}
}

\\renewcommand\\labelitemii{$\\vcenter{\\hbox{\\tiny$\\bullet$}}$}

\\newcommand{\\resumeSubHeadingListStart}{\\begin{itemize}[leftmargin=0.15in, label={}]}
\\newcommand{\\resumeSubHeadingListEnd}{\\end{itemize}}
\\newcommand{\\resumeItemListStart}{\\begin{itemize}[itemsep=${k.itemSep}pt]}
\\newcommand{\\resumeItemListEnd}{\\end{itemize}\\vspace{${k.listPost}pt}}
`
}

function bulletList(bullets: string[]): string {
  if (bullets.length === 0) return ''
  return [
    '      \\resumeItemListStart',
    ...bullets.map(b => `        \\resumeItem{${escapeLatex(b)}}`),
    '      \\resumeItemListEnd',
  ].join('\n')
}

// Jake's project heading: bold name, then an italic tech list after " | ".
function projectHeading(nameL: string): string {
  const sep = nameL.indexOf(' | ')
  if (sep === -1) return `\\textbf{${escapeLatex(nameL)}}`
  const name = nameL.slice(0, sep).trim()
  const tech = nameL.slice(sep + 3).trim()
  if (!tech) return `\\textbf{${escapeLatex(name)}}`
  return `\\textbf{${escapeLatex(name)}} $|$ \\emph{${escapeLatex(tech)}}`
}

function renderEntry(e: ResumeEntry): string {
  switch (e.kind) {
    // Upstream Jake's Resume row order: education = Institution|Location over
    // Degree|Dates; jobs = Title|Dates (bold) over Company|Location (italic).
    case 'edu':
      return [
        `    \\resumeSubheading{${escapeLatex(e.instL)}}{${escapeLatex(e.instR)}}{${escapeLatex(e.degL)}}{${escapeLatex(e.degR)}}`,
        bulletList(e.bullets),
      ].filter(Boolean).join('\n')
    case 'job':
      return [
        `    \\resumeSubheading{${escapeLatex(e.roleL)}}{${escapeLatex(e.roleR)}}{${escapeLatex(e.coL)}}{${escapeLatex(e.coR)}}`,
        bulletList(e.bullets),
      ].filter(Boolean).join('\n')
    case 'project':
      return [
        `    \\resumeProjectHeading{${projectHeading(e.nameL)}}{${escapeLatex(e.nameR)}}`,
        bulletList(e.bullets),
      ].filter(Boolean).join('\n')
    case 'skill':
      return e.category
        ? `     \\textbf{${escapeLatex(e.category)}:}{ ${escapeLatex(e.items)}} \\\\`
        : `     ${escapeLatex(e.items)} \\\\`
  }
}

function renderSection(s: ResumeSection): string {
  if (s.entries.length === 0) return ''
  const parts: string[] = [`\\section{${escapeLatex(s.title)}}`]

  const skillRows = s.entries.filter(e => e.kind === 'skill')
  const structured = s.entries.filter(e => e.kind !== 'skill')

  if (structured.length > 0) {
    parts.push('  \\resumeSubHeadingListStart')
    parts.push(...structured.map(renderEntry))
    parts.push('  \\resumeSubHeadingListEnd')
  }
  if (skillRows.length > 0) {
    const rows = skillRows.map(renderEntry).join('\n')
    // Trailing \\ on the last row leaves a stray blank line — strip it.
    parts.push(
      ' \\begin{itemize}[leftmargin=0.15in, label={}]',
      '    \\small{\\item{',
      rows.replace(/ \\\\$/, ''),
      '    }}',
      ' \\end{itemize}',
    )
  }
  return parts.join('\n')
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const URL_RE = /^(https?:\/\/)?[\w-]+(\.[\w-]+)+(\/\S*)?$/i

// hyperref URL argument: % and # are the characters that break it in practice.
function escapeUrl(u: string): string {
  return u.replace(/%/g, '\\%').replace(/#/g, '\\#')
}

// URL contact parts render as labeled hyperlinks ("GitHub", "Portfolio") —
// never as pasted plain-text URLs. Deliberate tradeoff recorded in
// docs/ats-research.md §5: parsers that index only visible text won't see the
// URL target. Email stays visible (recruiters copy it); location/phone are
// plain text.
const LINK_LABELS: Record<string, string> = {
  'github.com': 'GitHub',
  'gitlab.com': 'GitLab',
  'linkedin.com': 'LinkedIn',
  'stackoverflow.com': 'Stack Overflow',
}

function linkLabel(part: string): string {
  const host = part.replace(/^https?:\/\//i, '').replace(/^www\./i, '').split('/')[0].toLowerCase()
  for (const [key, label] of Object.entries(LINK_LABELS)) {
    if (host === key || host.endsWith(`.${key}`)) return label
  }
  return 'Portfolio'
}

function renderContact(contact: string): string {
  return contact.split('|').map(p => p.trim()).filter(Boolean).map(part => {
    if (/[{}\\]/.test(part)) return escapeLatex(part)
    if (EMAIL_RE.test(part)) return `\\href{mailto:${escapeUrl(part)}}{${escapeLatex(part)}}`
    if (URL_RE.test(part)) {
      const target = /^https?:\/\//i.test(part) ? part : `https://${part}`
      return `\\href{${escapeUrl(target)}}{${escapeLatex(linkLabel(part))}}`
    }
    return escapeLatex(part)
  }).join(' \\textbar{} ')
}

function renderSummary(summary: string, k: SqueezeKnobs): string {
  if (!summary) return ''
  return [
    '\\section{SUMMARY}',
    ' \\begin{itemize}[leftmargin=0.15in, label={}]',
    `    \\small{\\item{${escapeLatex(summary)}}}`,
    // Same trailing correction bullet lists get via \resumeItemListEnd — without
    // it the gap below the summary runs visibly larger than other sections'.
    ` \\end{itemize}\\vspace{${k.listPost}pt}`,
  ].join('\n')
}

export function renderTex(ir: ResumeIR, knobs: SqueezeKnobs): string {
  const body = [
    '\\begin{center}',
    `    \\textbf{\\huge \\scshape ${escapeLatex(ir.name)}} \\\\ \\vspace{1pt}`,
    `    \\small ${renderContact(ir.contact)}`,
    '\\end{center}',
    '',
    [renderSummary(ir.summary, knobs), ...ir.sections.map(renderSection)].filter(Boolean).join('\n\n'),
  ].join('\n')

  // Real page fill for the client's dynamic fill-the-page loop: \par\penalty0
  // forces TeX's page builder to move all recent contributions to the page so
  // \pagetotal reflects the full content height (without it the last
  // paragraphs are still uncontributed and the reading is garbage); \space
  // survives TeX eating the whitespace after \pagetotal.
  return `${preamble(knobs)}\n\\begin{document}\n\n${body}\n\n\\par\\penalty0\n\\typeout{APPCHEF-FILL: \\the\\pagetotal\\space OF \\the\\textheight}\n\\end{document}\n`
}

// ─── Content reduction (for the one-page retry loop) ─────────────────────────

// Removes the least-important piece of content, in priority order:
//   1. last bullet of the bottom-most entry holding >2 bullets (keeps the
//      prompt's minimum-2-bullets rule intact)
//   2. project entries down to one (the projects section should survive)
//   3. job entries — but never the first job in the document
//   4. last resort: the final project, only when the alternative is failing
//      to fit the page at all
// Returns false when nothing more can be dropped. Mutates `ir`.
export function dropOne(ir: ResumeIR): boolean {
  const entries = ir.sections.flatMap(s => s.entries)

  for (let i = entries.length - 1; i >= 0; i--) {
    const e = entries[i]
    if (e.kind !== 'skill' && e.bullets.length > 2) {
      e.bullets.pop()
      return true
    }
  }

  function removeLast(kind: 'project' | 'job', keepAtLeast: number): boolean {
    const found: { section: ResumeSection; index: number }[] = []
    for (const s of ir.sections) {
      s.entries.forEach((e, i) => { if (e.kind === kind) found.push({ section: s, index: i }) })
    }
    if (found.length <= keepAtLeast) return false
    const { section, index } = found[found.length - 1]
    section.entries.splice(index, 1)
    return true
  }

  if (removeLast('project', 1)) return true
  if (removeLast('job', 1)) return true // never drop the first job
  if (removeLast('project', 0)) return true
  return false
}
