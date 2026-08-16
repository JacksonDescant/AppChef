import { CheckCircle2, AlertTriangle, Wrench } from 'lucide-react'
import type { LintIssue, LintReport, ScoreResult } from '../types'

// Post-generation reflection results: deterministic lint verdicts, what the
// automatic repass fixed, and semantic requirement coverage of the final
// text. Complements the keyword chips above it — the chips answer "is the
// keyword literally present", this panel answers "is the requirement
// evidenced, and did the draft pass the code-verified checks".
export interface ReflectionState {
  lint: LintReport
  fixed: LintIssue[]
  score: ScoreResult | null
  repassRan: boolean
  repassFailed: boolean
}

export default function ReflectionPanel({ reflection }: { reflection: ReflectionState }) {
  const { lint, fixed, score, repassRan, repassFailed } = reflection
  const clean = lint.hard.length === 0 && lint.soft.length === 0
  const scoreColor = score
    ? score.overall >= 75 ? 'text-emerald-400' : score.overall >= 50 ? 'text-amber-400' : 'text-red-400'
    : ''
  const attention = score?.perRequirement.filter(r => r.required && r.verdict !== 'strong') ?? []
  return (
    <div className="mt-4">
      <div className="flex items-baseline gap-2 mb-1.5">
        <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Resume Score</p>
        {score ? (
          <>
            <span className={`text-sm font-semibold ${scoreColor}`}>{score.overall}%</span>
            <span className="text-xs text-zinc-600">
              requirement coverage{score.embeddingsUsed ? '' : ' (keyword matching only)'}
            </span>
          </>
        ) : (
          <span className="text-xs text-zinc-600">semantic scoring unavailable</span>
        )}
      </div>

      {attention.length > 0 && (
        <div className="flex flex-col gap-0.5 mb-2">
          {attention.map(r => (
            <p key={r.text} className="text-xs">
              <span className={r.verdict === 'partial' ? 'text-amber-400' : 'text-red-400'}>
                {r.verdict === 'partial' ? '≈' : '✗'}
              </span>{' '}
              <span className="text-zinc-400">{r.text}</span>
              {r.verdict === 'partial' && r.bestBullet && (
                <span className="text-zinc-600"> — possibly addressed by "{r.bestBullet.slice(0, 60)}…"; verify</span>
              )}
            </p>
          ))}
        </div>
      )}

      {fixed.length > 0 && (
        <div className="mb-2">
          <p className="text-xs text-emerald-400 flex items-center gap-1.5 mb-1">
            <Wrench size={11} /> {fixed.length} issue{fixed.length === 1 ? '' : 's'} auto-fixed
          </p>
          {fixed.map((i, n) => (
            <p key={n} className="text-xs text-zinc-600 line-through ml-4">{i.message}</p>
          ))}
        </div>
      )}

      {repassFailed && (
        <p className="text-xs text-amber-400 mb-2">
          Auto-fix unavailable (model server error) — the issues below are unresolved.
        </p>
      )}

      {lint.hard.length > 0 && (
        <div className="mb-1 flex flex-col gap-0.5">
          {lint.hard.map((i, n) => (
            <p key={n} className="text-xs text-red-400 flex items-start gap-1.5">
              <AlertTriangle size={11} className="mt-0.5 shrink-0" />
              <span>{i.message}</span>
            </p>
          ))}
        </div>
      )}
      {lint.soft.length > 0 && (
        <div className="flex flex-col gap-0.5">
          {lint.soft.map((i, n) => (
            <p key={n} className="text-xs text-zinc-600 ml-4">{i.message}</p>
          ))}
        </div>
      )}
      {clean && !repassFailed && (
        <p className="text-xs text-emerald-400 flex items-center gap-1.5">
          <CheckCircle2 size={11} /> All checks passed{repassRan ? ' after auto-fix' : ''}.
        </p>
      )}
    </div>
  )
}
