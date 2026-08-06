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
export interface ResumeIR { name: string; contact: string; sections: ResumeSection[] }

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
  const ir: ResumeIR = { name: '', contact: '', sections: [] }

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

// Preset 0 is faithful to upstream Jake's Resume; later presets progressively
// tighten spacing, then drop to 10pt, for the one-page enforcement loop.
export const SQUEEZE_PRESETS: SqueezeKnobs[] = [
  { fontSize: 11, sectionPre: -4, sectionPost: -5, itemVspace: -2, subheadPre: -2, subheadPost: -7, itemSep: 0, listPost: -5 },
  { fontSize: 11, sectionPre: -6, sectionPost: -7, itemVspace: -3, subheadPre: -4, subheadPost: -8, itemSep: -2, listPost: -7 },
  { fontSize: 10, sectionPre: -6, sectionPost: -7, itemVspace: -3, subheadPre: -4, subheadPost: -8, itemSep: -2, listPost: -7 },
]

// ─── Rendering ───────────────────────────────────────────────────────────────

function preamble(k: SqueezeKnobs): string {
  return `\\documentclass[letterpaper,${k.fontSize}pt]{article}

\\usepackage{latexsym}
\\usepackage[empty]{fullpage}
\\usepackage{titlesec}
\\usepackage[usenames,dvipsnames]{color}
\\usepackage{enumitem}
\\usepackage[hidelinks]{hyperref}
\\usepackage{fancyhdr}
\\usepackage{tabularx}
% Upstream Jake's Resume also uses \\input{glyphtounicode} + \\pdfgentounicode=1,
% omitted here: they are pdfTeX primitives and fail under XeTeX (tectonic).

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

function renderEntry(e: ResumeEntry): string {
  switch (e.kind) {
    case 'edu':
      return [
        `    \\resumeSubheading{${escapeLatex(e.instL)}}{${escapeLatex(e.instR)}}{${escapeLatex(e.degL)}}{${escapeLatex(e.degR)}}`,
        bulletList(e.bullets),
      ].filter(Boolean).join('\n')
    case 'job':
      return [
        `    \\resumeSubheading{${escapeLatex(e.coL)}}{${escapeLatex(e.coR)}}{${escapeLatex(e.roleL)}}{${escapeLatex(e.roleR)}}`,
        bulletList(e.bullets),
      ].filter(Boolean).join('\n')
    case 'project':
      return [
        `    \\resumeProjectHeading{\\textbf{${escapeLatex(e.nameL)}}}{${escapeLatex(e.nameR)}}`,
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

export function renderTex(ir: ResumeIR, knobs: SqueezeKnobs): string {
  const body = [
    '\\begin{center}',
    `    \\textbf{\\Huge \\scshape ${escapeLatex(ir.name)}} \\\\ \\vspace{1pt}`,
    `    \\small ${escapeLatex(ir.contact)}`,
    '\\end{center}',
    '',
    ir.sections.map(renderSection).filter(Boolean).join('\n\n'),
  ].join('\n')

  return `${preamble(knobs)}\n\\begin{document}\n\n${body}\n\n\\end{document}\n`
}

// ─── Content reduction (for the one-page retry loop) ─────────────────────────

// Removes the least-important piece of content, in priority order:
//   1. last bullet of the bottom-most entry holding >2 bullets (keeps the
//      prompt's minimum-2-bullets rule intact)
//   2. the last project entry
//   3. the last job entry — but never the first job in the document
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

  function removeLast(kind: 'project' | 'job'): boolean {
    const found: { section: ResumeSection; index: number }[] = []
    for (const s of ir.sections) {
      s.entries.forEach((e, i) => { if (e.kind === kind) found.push({ section: s, index: i }) })
    }
    if (found.length === 0) return false
    if (kind === 'job' && found.length === 1) return false // never drop the first job
    const { section, index } = found[found.length - 1]
    section.entries.splice(index, 1)
    return true
  }

  if (removeLast('project')) return true
  if (removeLast('job')) return true
  return false
}
