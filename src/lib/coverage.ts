import type { JdKeywords } from '../prompts'

// Deterministic keyword-coverage check over the tagged resume text — the
// counterpart to enforceChronologicalOrder for rule 5. Research basis
// (docs/ats-research.md §2): coverage of must-haves matters, frequency does
// not; the directional target is ~75–80% of must-have hard skills.

export interface KeywordStatus {
  keyword: string
  required: boolean
  inSkills: boolean
  inBullets: boolean  // includes [SUMMARY] — any evidence-carrying prose line
}

export interface CoverageReport {
  items: KeywordStatus[]
  mustHaveCovered: number
  mustHaveTotal: number
  /** 0–100, or null when the JD had no extracted must-haves */
  mustHavePct: number | null
}

// Word-boundary test that survives non-word tech terms ("C++", "React.js",
// ".NET"): the match must not be flanked by letters or digits, so "Java"
// doesn't hit "JavaScript" but "C++" and "CI/CD" still match.
function containsKeyword(haystack: string, keyword: string): boolean {
  const escaped = keyword.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  if (!escaped) return false
  const re = new RegExp(`(?<![A-Za-z0-9])${escaped}(?![A-Za-z0-9])`, 'i')
  return re.test(haystack)
}

export function computeCoverage(taggedResume: string, keywords: JdKeywords): CoverageReport {
  const lines = taggedResume.split('\n')
  const skillsText = lines.filter(l => l.startsWith('[SKILL]')).join('\n')
  const bulletsText = lines.filter(l => l.startsWith('[BULLET]') || l.startsWith('[SUMMARY]')).join('\n')

  const toStatus = (keyword: string, required: boolean): KeywordStatus => ({
    keyword,
    required,
    inSkills: containsKeyword(skillsText, keyword),
    inBullets: containsKeyword(bulletsText, keyword),
  })

  const items = [
    ...keywords.mustHave.map(kw => toStatus(kw, true)),
    ...keywords.niceToHave.map(kw => toStatus(kw, false)),
  ]

  const must = items.filter(i => i.required)
  const mustHaveCovered = must.filter(i => i.inSkills || i.inBullets).length
  return {
    items,
    mustHaveCovered,
    mustHaveTotal: must.length,
    mustHavePct: must.length > 0 ? Math.round((mustHaveCovered / must.length) * 100) : null,
  }
}
