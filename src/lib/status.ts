import type { Application, ApplicationStatus } from '../types'

export const STATUSES: ApplicationStatus[] = [
  'applied', 'screening', 'technical_assessment',
  'interview', 'round1', 'round2', 'round3',
  'offer', 'rejected',
]

export const STATUS_META: Record<ApplicationStatus, { label: string; color: string; style: string }> = {
  applied:              { label: 'Applied',              color: '#60a5fa', style: 'text-blue-400    border-blue-500/30    bg-blue-500/5' },
  screening:            { label: 'Screening',            color: '#818cf8', style: 'text-indigo-400  border-indigo-500/30  bg-indigo-500/5' },
  technical_assessment: { label: 'Technical Assessment', color: '#c084fc', style: 'text-purple-400  border-purple-500/30  bg-purple-500/5' },
  interview:            { label: 'Interview',            color: '#fbbf24', style: 'text-yellow-400  border-yellow-500/30  bg-yellow-500/5' },
  round1:               { label: 'Round 1',              color: '#4ade80', style: 'text-orange-300  border-orange-400/30  bg-orange-400/5' },
  round2:               { label: 'Round 2',              color: '#2dd4bf', style: 'text-teal-400    border-teal-500/30    bg-teal-500/5' },
  round3:               { label: 'Round 3',              color: '#22d3ee', style: 'text-cyan-400    border-cyan-500/30    bg-cyan-500/5' },
  offer:                { label: 'Offer',                color: '#10b981', style: 'text-emerald-400 border-emerald-500/30 bg-emerald-500/5' },
  rejected:             { label: 'Rejected',             color: '#52525b', style: 'text-zinc-500    border-zinc-700       bg-zinc-800/50' },
}

export function countByStatus(apps: Pick<Application, 'status'>[]): Record<ApplicationStatus, number> {
  const counts = Object.fromEntries(STATUSES.map(s => [s, 0])) as Record<ApplicationStatus, number>
  for (const a of apps) if (a.status in counts) counts[a.status]++
  return counts
}
