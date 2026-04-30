import { useMemo } from 'react'
import { TrendingUp, Send, Activity, Trophy, BarChart2 } from 'lucide-react'
import { useSection } from '../hooks/useSection'
import type { Application, ApplicationStatus } from '../types'
import {
  BarChart, Bar, XAxis, YAxis,
  AreaChart, Area, CartesianGrid,
} from 'recharts'
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart'
import type { ChartConfig } from '@/components/ui/chart'

const STATUSES: ApplicationStatus[] = [
  'applied', 'screening', 'technical_assessment',
  'interview', 'round1', 'round2', 'round3',
  'offer', 'rejected',
]

const STATUS_META: Record<ApplicationStatus, { label: string; color: string }> = {
  applied:              { label: 'Applied',               color: '#60a5fa' },
  screening:            { label: 'Screening',             color: '#818cf8' },
  technical_assessment: { label: 'Technical Assessment',  color: '#c084fc' },
  interview:            { label: 'Interview',             color: '#fbbf24' },
  round1:               { label: 'Round 1',               color: '#4ade80' },
  round2:               { label: 'Round 2',               color: '#2dd4bf' },
  round3:               { label: 'Round 3',               color: '#22d3ee' },
  offer:                { label: 'Offer',                 color: '#10b981' },
  rejected:             { label: 'Rejected',              color: '#52525b' },
}

const chartConfig: ChartConfig = {
  count: { label: 'Applications', color: 'var(--primary)' },
  ...Object.fromEntries(
    STATUSES.map(s => [s, { label: STATUS_META[s].label, color: STATUS_META[s].color }])
  ),
}

function StatCard({ label, value, sub, icon: Icon, accent = false }: {
  label: string; value: string | number; sub?: string
  icon: React.ComponentType<{ size?: number; className?: string }>
  accent?: boolean
}) {
  return (
    <div className="rounded-xl bg-card ring-1 ring-foreground/8 shadow-sm p-5 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{label}</p>
        <div className={`size-7 rounded-lg flex items-center justify-center ${accent ? 'bg-primary/15 text-primary' : 'bg-muted text-muted-foreground'}`}>
          <Icon size={13} />
        </div>
      </div>
      <div>
        <p className="text-3xl font-semibold tracking-tight">{value}</p>
        {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
      </div>
    </div>
  )
}

export default function Dashboard() {
  const { items: apps } = useSection<Application>('/applications')

  const counts = useMemo(() =>
    STATUSES.reduce<Record<ApplicationStatus, number>>((acc, s) => {
      acc[s] = apps.filter(a => a.status === s).length
      return acc
    }, { applied: 0, screening: 0, technical_assessment: 0, interview: 0, round1: 0, round2: 0, round3: 0, offer: 0, rejected: 0 }),
    [apps]
  )

  const total = apps.length
  const active = total - counts.rejected
  const responseRate = total > 0
    ? Math.round(((counts.screening + counts.technical_assessment + counts.interview + counts.round1 + counts.round2 + counts.round3 + counts.offer) / total) * 100)
    : 0
  const offerRate = total > 0 ? Math.round((counts.offer / total) * 100) : 0

  // Status distribution data
  const statusData = STATUSES.map(s => ({
    name: STATUS_META[s].label,
    count: counts[s],
    fill: STATUS_META[s].color,
  })).filter(d => d.count > 0)

  // Applications over time — group by month
  const timelineData = useMemo(() => {
    const byMonth: Record<string, number> = {}
    for (const app of apps) {
      const month = app.appliedAt?.slice(0, 7) ?? ''
      if (month) byMonth[month] = (byMonth[month] ?? 0) + 1
    }
    return Object.entries(byMonth)
      .sort(([a], [b]) => a.localeCompare(b))
      .reduce<{ month: string; count: number; cumulative: number }[]>((acc, [month, count]) => {
        const prev = acc[acc.length - 1]?.cumulative ?? 0
        acc.push({ month: month.slice(0, 7), count, cumulative: prev + count })
        return acc
      }, [])
  }, [apps])

  if (total === 0) {
    return (
      <div>
        <div className="mb-7">
          <h2 className="text-xl font-semibold tracking-tight">Dashboard</h2>
          <p className="text-sm text-muted-foreground mt-1">Track your job search progress at a glance.</p>
        </div>
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <div className="size-12 rounded-2xl bg-card ring-1 ring-foreground/8 flex items-center justify-center text-muted-foreground mb-4">
            <BarChart2 size={22} />
          </div>
          <p className="text-sm font-medium">No applications yet</p>
          <p className="text-xs text-muted-foreground mt-1.5 max-w-xs">Add applications in the Applications tab to see your progress here.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold tracking-tight">Dashboard</h2>
        <p className="text-sm text-muted-foreground mt-1">Track your job search progress at a glance.</p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard label="Total Applications" value={total} icon={Send} sub={`${active} active`} />
        <StatCard label="Active" value={active} icon={Activity} sub={`${counts.rejected} rejected`} />
        <StatCard label="Response Rate" value={`${responseRate}%`} icon={TrendingUp} sub="screening or beyond" accent />
        <StatCard label="Offer Rate" value={`${offerRate}%`} icon={Trophy} sub={`${counts.offer} offer${counts.offer !== 1 ? 's' : ''}`} accent={counts.offer > 0} />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        {/* Status distribution */}
        <div className="rounded-xl bg-card ring-1 ring-foreground/8 shadow-sm p-5">
          <p className="text-sm font-medium mb-1">Status Breakdown</p>
          <p className="text-xs text-muted-foreground mb-5">Current stage of all applications</p>
          <ChartContainer config={chartConfig} className="h-[200px] w-full">
            <BarChart data={statusData} layout="vertical" margin={{ left: 8, right: 16, top: 0, bottom: 0 }}>
              <YAxis
                type="category" dataKey="name" width={72}
                tick={{ fill: 'var(--muted-foreground)', fontSize: 11 }}
                axisLine={false} tickLine={false}
              />
              <XAxis
                type="number"
                tick={{ fill: 'var(--muted-foreground)', fontSize: 11 }}
                axisLine={false} tickLine={false}
                allowDecimals={false}
              />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Bar dataKey="count" radius={[0, 4, 4, 0]} maxBarSize={20}>
                {statusData.map(entry => (
                  <rect key={entry.name} fill={entry.fill} />
                ))}
              </Bar>
            </BarChart>
          </ChartContainer>
        </div>

        {/* Timeline */}
        <div className="rounded-xl bg-card ring-1 ring-foreground/8 shadow-sm p-5">
          <p className="text-sm font-medium mb-1">Applications Over Time</p>
          <p className="text-xs text-muted-foreground mb-5">Cumulative applications by month</p>
          {timelineData.length < 2 ? (
            <div className="h-[200px] flex items-center justify-center text-xs text-muted-foreground">
              Add more applications to see the trend
            </div>
          ) : (
            <ChartContainer config={chartConfig} className="h-[200px] w-full">
              <AreaChart data={timelineData} margin={{ left: 0, right: 8, top: 4, bottom: 0 }}>
                <defs>
                  <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--primary)" stopOpacity={0.25} />
                    <stop offset="100%" stopColor="var(--primary)" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis
                  dataKey="month"
                  tick={{ fill: 'var(--muted-foreground)', fontSize: 11 }}
                  axisLine={false} tickLine={false}
                />
                <YAxis
                  tick={{ fill: 'var(--muted-foreground)', fontSize: 11 }}
                  axisLine={false} tickLine={false}
                  allowDecimals={false} width={30}
                />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Area
                  type="monotone" dataKey="cumulative"
                  stroke="var(--primary)" strokeWidth={2}
                  fill="url(#areaGrad)"
                  dot={false}
                />
              </AreaChart>
            </ChartContainer>
          )}
        </div>
      </div>

      {/* Status count pills */}
      <div className="flex flex-wrap gap-2">
        {STATUSES.filter(s => counts[s] > 0).map(s => (
          <div
            key={s}
            className="flex items-center gap-2 rounded-lg bg-card ring-1 ring-foreground/8 px-3 py-2"
          >
            <span className="size-2 rounded-full" style={{ background: STATUS_META[s].color }} />
            <span className="text-xs font-medium text-foreground capitalize">{s}</span>
            <span className="text-xs text-muted-foreground">{counts[s]}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
