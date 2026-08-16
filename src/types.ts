export interface Job {
  id: string
  company: string
  title: string
  displayTitle: string  // market-standard alias, rendered as "Display Title (Internal Title)"
  location: string
  startDate: string
  endDate: string
  current: boolean
  description: string
  bullets: string
}

export interface EducationEntry {
  id: string
  institution: string
  degree: string
  field: string
  location: string
  startDate: string
  endDate: string
  current: boolean
  gpa: string
  minor: string
  description: string
}

export interface Project {
  id: string
  name: string
  description: string
  technologies: string
  url: string
  startDate: string
  endDate: string
  bullets: string
}

export interface Skill {
  id: string
  name: string
  category: string
  level: string
}

export interface TargetJob {
  id: string
  title: string
  industry: string
  locationType: string  // 'remote' | 'hybrid' | 'onsite'
  location: string
  minSalary: number | null
  maxSalary: number | null
  notes: string
}

export interface Application {
  id: string
  company: string
  role: string
  url: string
  appliedAt: string   // ISO date string
  status: ApplicationStatus
  notes: string
  createdAt: string
}

export type ApplicationStatus =
  | 'applied'
  | 'screening'
  | 'technical_assessment'
  | 'interview'
  | 'round1'
  | 'round2'
  | 'round3'
  | 'offer'
  | 'rejected'

export interface Profile {
  name: string
  email: string
  phone: string
  location: string
  website: string
  linkedin: string
  github: string
  summary: string
}

export interface SavedResume {
  id: string
  createdAt: string
  jobDescription: string
  content: string
}

export interface AppSettings {
  llamaEndpoint: string
  modelName: string
  temperature: number
  maxTokens: number
}

// ─── Retrieval (see docs/retrieval-research.md §5) ───────────────────────────
// Shared between server/retrieval.ts and the Generate flow.

export interface RequirementInput {
  text: string
  required: boolean
}

export interface EvidenceHit {
  chunkId: string
  parentKind: 'job' | 'project' | 'skill'
  parentId: string
  rawText: string     // the bare bullet/skill text (no context template)
  score: number       // fused RRF score
  cosine: number | null
}

export interface RequirementEvidence {
  text: string
  required: boolean
  covered: boolean    // confidence-gated: below threshold ⇒ gap, never force-fit
  topEvidence: EvidenceHit[]
}

export interface RankedEntry {
  id: string
  score: number       // normalized 0–1 within its list (post-jitter when seeded)
  baseScore?: number  // pre-jitter normalized score — diagnostics & near-tie tests
  matched: string[]   // requirement texts this entry evidences
}

export interface BulletRank {
  text: string   // the bullet's raw text
  score: number  // 0–1 relevance to this JD within its entry (0 = no evidence)
}

export interface RetrievalResult {
  requirements: RequirementEvidence[]
  rankedJobs: RankedEntry[]
  rankedProjects: RankedEntry[]
  // per parent entry: bullets ranked for this JD (jittered + MMR-diversified)
  bulletRanks: Record<string, BulletRank[]>
  embeddingsUsed: boolean
  indexedChunks: number
  seed: number | null  // jitter seed applied server-side; null = deterministic
  // skill id → 0–1 relevance to this JD (only skills with any evidence appear)
  skillScores: Record<string, number>
}

// ─── Bullet allocation (src/prompts.ts computeBulletAllocation) ──────────────
// Explicit per-entry bullet counts injected into the generation prompt.

export interface BulletAllocationEntry {
  id: string
  kind: 'job' | 'project'
  label: string  // display label exactly as the prompt shows it
  count: number
}

export interface BulletAllocation {
  entries: BulletAllocationEntry[]  // in resume display order (recency)
  total: number                     // sum of counts — the page-fill target
}

// ─── Reflection: deterministic output lint + requirement scoring ─────────────
// The critic is code + embeddings, never the LLM (docs/retrieval-research.md §7).

export type LintSeverity = 'hard' | 'soft'

export type LintKind =
  | 'missing-citation'
  | 'bad-citation'
  | 'banned-verb'
  | 'duplicate-opener'
  | 'bullet-count'
  | 'missing-entry'
  | 'keyword-overuse'
  | 'untagged-line'
  | 'static-echo'
  | 'number-suspicion'
  | 'missing-covered-keyword'

export interface LintIssue {
  kind: LintKind
  severity: LintSeverity
  message: string      // imperative sentence — doubles as a repass instruction
  entryLabel?: string  // company / project name when attributable
  bulletText?: string  // offending bullet text (for display)
}

export interface LintReport {
  issues: LintIssue[]
  hard: LintIssue[]   // trigger the automatic refine repass
  soft: LintIssue[]   // display only
}

export interface ScoreRequirement {
  text: string
  required: boolean
  exact: boolean             // word-boundary hit in some resume line
  bestCosine: number | null  // null when embeddings unavailable
  bestBullet: string | null
  verdict: 'strong' | 'partial' | 'absent'
}

export interface ScoreResult {
  perRequirement: ScoreRequirement[]
  overall: number       // 0–100 weighted requirement coverage
  embeddingsUsed: boolean
}
