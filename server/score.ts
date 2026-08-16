// ─── Output scoring (docs/retrieval-research.md §7) ──────────────────────────
// Scores the GENERATED resume's prose lines against the JD requirements using
// the same measures selection used: exact word-boundary hits + embedding
// cosine at the calibrated thresholds. The critic is code + embeddings by
// design — a local model grading its own output is unreliable (Huang et al.,
// arXiv:2310.01798) — so the LLM never participates in scoring. Feeds the
// reflection panel only; never gates generation.

import { cosine, embedDocuments, embedQueries } from './embeddings'
import { keywordRegex } from '../src/lib/coverage'
import type { RequirementInput, ScoreRequirement, ScoreResult } from '../src/types'

// Calibrated on the real profile's bullets (2026-08-15): nomic query→bullet
// cosines run hot and the true/false distributions OVERLAP around 0.55–0.65
// (true paraphrase "REST APIs"→0.59 vs absent "GraphQL"→0.60), so these sit
// deliberately above retrieval's 0.55 gate. strong = clear margin over the
// worst observed false positive; partial = ambiguous band, meaning "possibly
// addressed — verify", never claimed as coverage. Exact word-boundary hits
// are strong regardless — that path catches most genuine coverage.
const STRONG_TAU = 0.65
const PARTIAL_TAU = 0.58

export async function scoreResume(bullets: string[], requirements: RequirementInput[]): Promise<ScoreResult> {
  const bulletVecs = bullets.length > 0 ? await embedDocuments(bullets) : null
  const reqVecs = bulletVecs && requirements.length > 0 ? await embedQueries(requirements.map(r => r.text)) : null
  const embeddingsUsed = Boolean(bulletVecs && reqVecs)

  const perRequirement: ScoreRequirement[] = requirements.map((r, i) => {
    const re = keywordRegex(r.text)
    const exact = re ? bullets.some(b => re.test(b)) : false
    let bestCosine: number | null = null
    let bestBullet: string | null = null
    if (embeddingsUsed) {
      for (let j = 0; j < bullets.length; j++) {
        const c = cosine(reqVecs![i], bulletVecs![j])
        if (bestCosine === null || c > bestCosine) {
          bestCosine = c
          bestBullet = bullets[j]
        }
      }
    }
    const verdict: ScoreRequirement['verdict'] =
      exact || (bestCosine ?? 0) >= STRONG_TAU ? 'strong'
        : (bestCosine ?? 0) >= PARTIAL_TAU ? 'partial'
        : 'absent'
    return { text: r.text, required: r.required, exact, bestCosine, bestBullet, verdict }
  })

  const weight = (r: ScoreRequirement) => (r.required ? 1 : 0.4)
  const wsum = perRequirement.reduce((a, r) => a + weight(r), 0)
  const points = perRequirement.reduce(
    (a, r) => a + weight(r) * (r.verdict === 'strong' ? 1 : r.verdict === 'partial' ? 0.5 : 0),
    0,
  )
  return {
    perRequirement,
    overall: wsum > 0 ? Math.round((points / wsum) * 100) : 0,
    embeddingsUsed,
  }
}
