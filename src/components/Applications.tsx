import { useState, useRef, useMemo } from 'react'
import { ClipboardList, Plus, Download, ExternalLink, ArrowUp, ArrowDown } from 'lucide-react'
import { ResponsiveSankey } from '@nivo/sankey'
import { useSection } from '../hooks/useSection'
import type { Application, ApplicationStatus } from '../types'
import { Button, SectionHeader, EmptyState } from './ui'

const STATUSES: ApplicationStatus[] = [
  'applied', 'screening', 'technical_assessment',
  'interview', 'round1', 'round2', 'round3',
  'offer', 'rejected',
]

const STATUS_LABELS: Record<ApplicationStatus, string> = {
  applied:              'Applied',
  screening:            'Screening',
  technical_assessment: 'Technical Assessment',
  interview:            'Interview',
  round1:               'Round 1',
  round2:               'Round 2',
  round3:               'Round 3',
  offer:                'Offer',
  rejected:             'Rejected',
}

const STATUS_STYLES: Record<ApplicationStatus, string> = {
  applied:              'text-blue-400    border-blue-500/30    bg-blue-500/5',
  screening:            'text-indigo-400  border-indigo-500/30  bg-indigo-500/5',
  technical_assessment: 'text-purple-400  border-purple-500/30  bg-purple-500/5',
  interview:            'text-yellow-400  border-yellow-500/30  bg-yellow-500/5',
  round1:               'text-orange-300  border-orange-400/30  bg-orange-400/5',
  round2:               'text-teal-400    border-teal-500/30    bg-teal-500/5',
  round3:               'text-cyan-400    border-cyan-500/30    bg-cyan-500/5',
  offer:                'text-emerald-400 border-emerald-500/30 bg-emerald-500/5',
  rejected:             'text-zinc-500    border-zinc-700       bg-zinc-800/50',
}

type ColKey = 'company' | 'role' | 'status' | 'appliedAt' | 'url' | 'notes'
type ColType = 'text' | 'date' | 'url' | 'status'
type ActiveCell = { rowId: string; col: ColKey }
type SortState = { col: ColKey; dir: 'asc' | 'desc' }

interface ColDef { key: ColKey; label: string; width?: string; type: ColType }

const COLS: ColDef[] = [
  { key: 'company',   label: 'Company', width: '160px', type: 'text' },
  { key: 'role',      label: 'Role',    width: '160px', type: 'text' },
  { key: 'status',    label: 'Status',  width: '120px', type: 'status' },
  { key: 'appliedAt', label: 'Applied', width: '120px', type: 'date' },
  { key: 'url',       label: 'URL',     width: '180px', type: 'url' },
  { key: 'notes',     label: 'Notes',   type: 'text' },
]

const EMPTY_APP = {
  company: '', role: '', url: '',
  appliedAt: new Date().toISOString().slice(0, 10),
  status: 'applied' as ApplicationStatus,
  notes: '',
  createdAt: '',
}

export default function Applications() {
  const { items: apps, loading, add, update, remove } = useSection<Application>('/applications')

  const [activeCell, setActiveCell] = useState<ActiveCell | null>(null)
  const [editValue, setEditValue] = useState('')
  const [sort, setSort] = useState<SortState>({ col: 'appliedAt', dir: 'desc' })

  // Refs so async commit always reads the latest values without stale closures
  const activeCellRef = useRef<ActiveCell | null>(null)
  const editValueRef = useRef('')
  const suppressBlurRef = useRef(false)

  function setActive(cell: ActiveCell | null) {
    activeCellRef.current = cell
    setActiveCell(cell)
  }
  function setEdit(val: string) {
    editValueRef.current = val
    setEditValue(val)
  }

  const sortedApps = useMemo(() => {
    return [...apps].sort((a, b) => {
      const av = String((a as unknown as Record<string, unknown>)[sort.col] ?? '')
      const bv = String((b as unknown as Record<string, unknown>)[sort.col] ?? '')
      const cmp = av.localeCompare(bv)
      return sort.dir === 'asc' ? cmp : -cmp
    })
  }, [apps, sort])

  const counts = useMemo(() =>
    STATUSES.reduce<Record<ApplicationStatus, number>>((acc, s) => {
      acc[s] = apps.filter(a => a.status === s).length
      return acc
    }, { applied: 0, screening: 0, technical_assessment: 0, interview: 0, round1: 0, round2: 0, round3: 0, offer: 0, rejected: 0 }),
    [apps]
  )

  async function commit() {
    const cell = activeCellRef.current
    if (!cell) return
    const app = apps.find(a => a.id === cell.rowId)
    if (!app) return
    const current = String((app as unknown as Record<string, unknown>)[cell.col] ?? '')
    if (editValueRef.current !== current) {
      await update(cell.rowId, { [cell.col]: editValueRef.current } as Partial<Omit<Application, 'id'>>)
    }
  }

  function activate(rowId: string, col: ColKey) {
    if (activeCellRef.current?.rowId === rowId && activeCellRef.current?.col === col) return
    const app = apps.find(a => a.id === rowId)
    if (!app) return
    const val = String((app as unknown as Record<string, unknown>)[col] ?? '')
    setActive({ rowId, col })
    setEdit(val)
  }

  function handleBlur() {
    if (suppressBlurRef.current) return
    void commit()
    setActive(null)
    setEdit('')
  }

  async function handleKeyDown(e: React.KeyboardEvent, rowId: string, col: ColKey) {
    const rowIdx = sortedApps.findIndex(a => a.id === rowId)
    const ci = COLS.findIndex(c => c.key === col)

    if (e.key === 'Escape') {
      e.preventDefault()
      suppressBlurRef.current = true
      setActive(null)
      setEdit('')
      setTimeout(() => { suppressBlurRef.current = false }, 0)
      return
    }

    if (e.key === 'Tab' || e.key === 'Enter') {
      e.preventDefault()
      suppressBlurRef.current = true
      await commit()
      suppressBlurRef.current = false

      const back = e.key === 'Tab' && e.shiftKey
      let nextCi = ci + (back ? -1 : 1)
      let nextRowIdx = rowIdx

      if (nextCi < 0) {
        nextRowIdx = rowIdx - 1
        nextCi = COLS.length - 1
      } else if (nextCi >= COLS.length) {
        nextRowIdx = rowIdx + 1
        nextCi = 0
      }

      if (nextRowIdx >= 0 && nextRowIdx < sortedApps.length) {
        activate(sortedApps[nextRowIdx].id, COLS[nextCi].key)
      } else {
        setActive(null)
        setEdit('')
      }
    }
  }

  function toggleSort(col: ColKey) {
    setSort(prev => ({ col, dir: prev.col === col && prev.dir === 'asc' ? 'desc' : 'asc' }))
  }

  async function addRow() {
    const app = await add(EMPTY_APP)
    activate(app.id, 'company')
  }

  if (!loading && apps.length === 0) {
    return (
      <div>
        <SectionHeader
          title="Applications"
          description="Track every role you apply to."
          action={<Button onClick={addRow} size="sm"><Plus size={13} /> Log Application</Button>}
        />
        <EmptyState
          icon={<ClipboardList size={22} />}
          title="No applications logged yet"
          description="Track every role you apply to in one place."
          action={<Button onClick={addRow} size="sm"><Plus size={13} /> Log Application</Button>}
        />
      </div>
    )
  }

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <SectionHeader
        title="Applications"
        description="Track every role you apply to."
        action={
          <div className="flex gap-2">
            {apps.length > 0 && (
              <Button variant="secondary" size="sm" onClick={() => window.open('/api/applications/export.csv', '_blank')}>
                <Download size={13} /> Export CSV
              </Button>
            )}
            <Button onClick={addRow} size="sm"><Plus size={13} /> Add Row</Button>
          </div>
        }
      />

      {apps.length > 0 && (
        <div className="flex gap-2 mb-4 flex-wrap">
          {STATUSES.filter(s => counts[s] > 0).map(s => (
            <span key={s} className={`text-xs px-2 py-0.5 rounded-full border ${STATUS_STYLES[s]}`}>
              {counts[s]} {STATUS_LABELS[s]}
            </span>
          ))}
        </div>
      )}

      <div className="rounded-lg border border-zinc-800 overflow-auto flex-1 min-h-0">
        <table className="w-full border-collapse text-xs">
          <thead>
            <tr className="border-b border-zinc-800 bg-zinc-900/60">
              <th className="w-10 border-r border-zinc-800 px-2 py-2 text-zinc-600 font-normal select-none text-center">#</th>
              {COLS.map(col => (
                <th
                  key={col.key}
                  style={col.width ? { width: col.width, minWidth: col.width } : { minWidth: '160px' }}
                  onClick={() => toggleSort(col.key)}
                  className="border-r last:border-r-0 border-zinc-800 px-2 py-2 text-left font-medium text-zinc-400 select-none cursor-pointer hover:text-zinc-200 transition-colors"
                >
                  <span className="inline-flex items-center gap-1">
                    {col.label}
                    {sort.col === col.key && (
                      sort.dir === 'asc'
                        ? <ArrowUp size={10} className="text-orange-400" />
                        : <ArrowDown size={10} className="text-orange-400" />
                    )}
                  </span>
                </th>
              ))}
              <th className="w-8" />
            </tr>
          </thead>
          <tbody>
            {sortedApps.map((app, rowIdx) => (
              <tr key={app.id} className="group border-b last:border-b-0 border-zinc-800/60 hover:bg-zinc-800/20">
                <td className="border-r border-zinc-800/60 h-8 text-zinc-600 select-none text-center align-middle text-[11px]">
                  {rowIdx + 1}
                </td>

                {COLS.map(col => {
                  const isActive = activeCell?.rowId === app.id && activeCell?.col === col.key
                  const rawVal = String((app as unknown as Record<string, unknown>)[col.key] ?? '')

                  return (
                    <td
                      key={col.key}
                      onClick={() => !isActive && activate(app.id, col.key)}
                      className={`border-r last:border-r-0 border-zinc-800/60 h-8 p-0 align-middle ${
                        isActive
                          ? 'ring-1 ring-inset ring-orange-500/70 bg-zinc-800/50'
                          : 'cursor-default'
                      }`}
                    >
                      {/* Active text / date / url cell */}
                      {isActive && col.type !== 'status' && (
                        <input
                          autoFocus
                          type={col.type === 'date' ? 'date' : col.type === 'url' ? 'url' : 'text'}
                          value={editValue}
                          onChange={e => setEdit(e.target.value)}
                          onBlur={handleBlur}
                          onKeyDown={e => handleKeyDown(e, app.id, col.key)}
                          className="w-full h-full px-2 bg-transparent text-zinc-100 outline-none text-xs"
                        />
                      )}

                      {/* Active status cell */}
                      {isActive && col.type === 'status' && (
                        <select
                          autoFocus
                          value={editValue}
                          onChange={async e => {
                            const val = e.target.value as ApplicationStatus
                            suppressBlurRef.current = true
                            setEdit(val)
                            await update(app.id, { status: val })
                            setActive(null)
                            setEdit('')
                            suppressBlurRef.current = false
                          }}
                          onBlur={handleBlur}
                          onKeyDown={e => handleKeyDown(e, app.id, col.key)}
                          className="w-full h-full px-2 bg-zinc-900 text-zinc-100 outline-none text-xs border-0 cursor-pointer"
                        >
                          {STATUSES.map(s => (
                            <option key={s} value={s}>{STATUS_LABELS[s]}</option>
                          ))}
                        </select>
                      )}

                      {/* View: status pill */}
                      {!isActive && col.type === 'status' && (
                        <div className="px-2 h-full flex items-center">
                          <span className={`px-1.5 py-0.5 rounded-full border text-xs ${STATUS_STYLES[app.status]}`}>
                            {STATUS_LABELS[app.status]}
                          </span>
                        </div>
                      )}

                      {/* View: URL with icon */}
                      {!isActive && col.type === 'url' && (
                        <div className="px-2 h-full flex items-center gap-1 overflow-hidden">
                          <span className="truncate text-zinc-400 flex-1 min-w-0">{rawVal}</span>
                          {rawVal && (
                            <a
                              href={rawVal}
                              target="_blank"
                              rel="noreferrer"
                              onClick={e => e.stopPropagation()}
                              className="shrink-0 text-zinc-600 hover:text-orange-400 transition-colors"
                            >
                              <ExternalLink size={10} />
                            </a>
                          )}
                        </div>
                      )}

                      {/* View: plain text */}
                      {!isActive && col.type !== 'status' && col.type !== 'url' && (
                        <div className="px-2 h-full flex items-center overflow-hidden">
                          <span className="truncate text-zinc-300">{rawVal}</span>
                        </div>
                      )}
                    </td>
                  )
                })}

                <td className="w-8 h-8 px-1 align-middle">
                  <button
                    onClick={() => remove(app.id)}
                    className="w-6 h-6 mx-auto flex items-center justify-center rounded text-zinc-600 hover:text-red-400 hover:bg-red-500/10 transition-all opacity-0 group-hover:opacity-100"
                  >
                    ×
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <button
          onClick={addRow}
          className="w-full flex items-center gap-1.5 px-4 py-2 text-xs text-zinc-600 hover:text-zinc-300 hover:bg-zinc-800/40 transition-colors border-t border-zinc-800"
        >
          <Plus size={11} /> Add row
        </button>
      </div>

      {apps.length >= 2 && <ApplicationSankey apps={apps} counts={counts} />}
    </div>
  )
}

// Node colors: red for rejected, greens for late-stage, blues for early-stage
const SANKEY_NODE_COLORS: Record<string, string> = {
  all:                  '#f97316', // orange — starting node
  active:               '#71717a', // neutral gray — active bucket
  rejected:             '#ef4444', // red — rejected
  applied:              '#60a5fa', // blue
  screening:            '#818cf8', // indigo
  technical_assessment: '#c084fc', // purple
  interview:            '#fbbf24', // amber
  round1:               '#4ade80', // light green
  round2:               '#2dd4bf', // teal
  round3:               '#22d3ee', // cyan
  offer:                '#10b981', // emerald green
}

const STAGE_STATUSES: ApplicationStatus[] = [
  'applied', 'screening', 'technical_assessment',
  'interview', 'round1', 'round2', 'round3', 'offer',
]

function ApplicationSankey({ apps, counts }: { apps: Application[]; counts: Record<ApplicationStatus, number> }) {
  const total = apps.length
  const active = total - counts.rejected

  const nodes = [
    { id: 'all', label: 'All Applications' },
    ...(active > 0 ? [{ id: 'active', label: 'Active' }] : []),
    ...(counts.rejected > 0 ? [{ id: 'rejected', label: 'Rejected' }] : []),
    ...STAGE_STATUSES
      .filter(s => counts[s] > 0)
      .map(s => ({ id: s, label: STATUS_LABELS[s] })),
  ]

  const links = [
    ...(active > 0    ? [{ source: 'all',    target: 'active',   value: active }]           : []),
    ...(counts.rejected > 0 ? [{ source: 'all', target: 'rejected', value: counts.rejected }] : []),
    ...STAGE_STATUSES
      .filter(s => counts[s] > 0)
      .map(s => ({ source: 'active', target: s, value: counts[s] })),
  ]

  if (links.length < 2) return null

  return (
    <div className="mt-6 rounded-xl bg-card ring-1 ring-foreground/8 shadow-sm p-5 shrink-0">
      <p className="text-sm font-medium mb-1">Application Funnel</p>
      <p className="text-xs text-muted-foreground mb-4">
        Green links = progressing · Red links = rejected
      </p>
      <div style={{ height: Math.max(240, nodes.length * 32) }}>
        <ResponsiveSankey
          data={{ nodes, links }}
          margin={{ top: 8, right: 140, bottom: 8, left: 140 }}
          align="justify"
          nodeOpacity={1}
          nodeThickness={18}
          nodeInnerPadding={4}
          nodeBorderRadius={4}
          nodeBorderWidth={0}
          colors={node => SANKEY_NODE_COLORS[node.id] ?? '#3f3f46'}
          linkOpacity={0.6}
          linkHoverOpacity={0.9}
          linkBlendMode="normal"
          enableLinkGradient
          labelPosition="outside"
          labelOrientation="horizontal"
          labelPadding={14}
          labelTextColor="#a1a1aa"
          theme={{
            labels: { text: { fontSize: 11, fontFamily: 'Inter, system-ui, sans-serif' } },
            tooltip: {
              container: {
                background: '#18181b',
                border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: 8,
                fontSize: 12,
                color: '#fafafa',
                boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
              },
            },
          }}
        />
      </div>
    </div>
  )
}
