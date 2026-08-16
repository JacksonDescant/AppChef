import { useState, useEffect, useRef } from 'react'
import type { FormEvent } from 'react'
import { Check, Download, Upload, Loader2 } from 'lucide-react'
import { useSettings } from '../hooks/useSettings'
import type { AppSettings } from '../types'
import { Button, Input, SectionHeader, Card } from './ui'

const DATA_KEYS = ['jobs', 'education', 'projects', 'skills'] as const

export default function Settings() {
  const { settings, saveSettings } = useSettings()
  const [form, setForm] = useState<AppSettings>(settings)
  const [saved, setSaved] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const [importing, setImporting] = useState(false)
  const [dataMsg, setDataMsg] = useState('')
  const [dataErr, setDataErr] = useState('')

  // Sync form when settings load from API
  useEffect(() => { setForm(settings) }, [settings])

  function field(key: keyof Pick<AppSettings, 'llamaEndpoint' | 'modelName'>) {
    return {
      value: form[key],
      onChange: (e: React.ChangeEvent<HTMLInputElement>) =>
        setForm(prev => ({ ...prev, [key]: e.target.value })),
    }
  }

  async function save(e: FormEvent) {
    e.preventDefault()
    await saveSettings(form)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  async function exportData() {
    setDataErr(''); setDataMsg('')
    try {
      const res = await fetch('/api/export')
      if (!res.ok) throw new Error(`Export failed (${res.status})`)
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `appchef-resume-${new Date().toISOString().slice(0, 10)}.json`
      a.click()
      URL.revokeObjectURL(url)
      setDataMsg('Backup downloaded.')
    } catch (e) {
      setDataErr(e instanceof Error ? e.message : 'Export failed')
    }
  }

  async function importData(file: File) {
    setDataErr(''); setDataMsg('')
    let parsed: Record<string, unknown>
    try {
      parsed = JSON.parse(await file.text()) as Record<string, unknown>
    } catch {
      setDataErr('Not a valid JSON file.')
      return
    }
    if (!parsed || parsed.app !== 'appchef') {
      setDataErr('Not an AppChef backup file.')
      return
    }
    const summary = DATA_KEYS
      .filter(k => Array.isArray(parsed[k]))
      .map(k => `${(parsed[k] as unknown[]).length} ${k}`)
      .join(', ')
    const ok = window.confirm(
      `Replace your current data with this backup?\n\nIt contains: ${summary || 'no sections'}.\n\nThis cannot be undone.`,
    )
    if (!ok) return
    setImporting(true)
    try {
      const res = await fetch('/api/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(parsed),
      })
      const data = await res.json().catch(() => null) as { error?: string } | null
      if (!res.ok) throw new Error(data?.error ?? `Import failed (${res.status})`)
      window.location.reload() // every section refetches its restored data
    } catch (e) {
      setDataErr(e instanceof Error ? e.message : 'Import failed')
      setImporting(false)
    }
  }

  return (
    <div>
      <SectionHeader
        title="Settings"
        description="Configure your local model server connection."
      />

      <form onSubmit={save} className="max-w-lg flex flex-col gap-4">
        <Card className="p-5">
          <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-4">Model Server</p>
          <div className="flex flex-col gap-3">
            <Input label="Endpoint URL" placeholder="http://localhost:8080" {...field('llamaEndpoint')} />
            <p className="text-xs text-zinc-600 -mt-1">
              llama.cpp: <code className="text-zinc-500">http://localhost:8080</code> ·
              Ollama: <code className="text-zinc-500">http://localhost:11434</code> ·
              LM Studio: <code className="text-zinc-500">http://localhost:1234</code>
            </p>
            <Input label="Model Name (optional)" placeholder="llama-3-8b-instruct" {...field('modelName')} />
            <p className="text-xs text-zinc-600 -mt-1">
              Most local servers accept any string here. Leave blank to use server default.
            </p>
          </div>
        </Card>

        <Button type="submit" className="self-start">
          {saved ? <><Check size={13} /> Saved</> : 'Save Settings'}
        </Button>
      </form>

      <div className="max-w-lg mt-4">
        <Card className="p-5">
          <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1">Resume Data</p>
          <p className="text-xs text-zinc-600 mb-4">
            Back up your resume data — profile, work experience, education, projects, and skills —
            to a JSON file, or restore from one. Importing replaces your current resume data.
            Applications, target roles, and saved-resume history stay put.
          </p>
          <div className="flex items-center gap-2">
            <Button type="button" variant="ghost" onClick={exportData}>
              <Download size={13} /> Export JSON
            </Button>
            <Button type="button" variant="ghost" onClick={() => fileRef.current?.click()} disabled={importing}>
              {importing ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />}
              {importing ? 'Importing…' : 'Import JSON'}
            </Button>
            <input
              ref={fileRef}
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={e => {
                const f = e.target.files?.[0]
                e.target.value = '' // allow re-selecting the same file
                if (f) importData(f)
              }}
            />
          </div>
          {dataMsg && <p className="text-xs text-emerald-400 mt-3">{dataMsg}</p>}
          {dataErr && <p className="text-xs text-red-400 mt-3">{dataErr}</p>}
        </Card>
      </div>
    </div>
  )
}
