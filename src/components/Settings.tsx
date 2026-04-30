import { useState, useEffect } from 'react'
import type { FormEvent } from 'react'
import { Check } from 'lucide-react'
import { useSettings } from '../hooks/useSettings'
import type { AppSettings } from '../types'
import { Button, Input, SectionHeader, Card } from './ui'

export default function Settings() {
  const { settings, saveSettings } = useSettings()
  const [form, setForm] = useState<AppSettings>(settings)
  const [saved, setSaved] = useState(false)

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

        <Card className="p-5">
          <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-4">Generation</p>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-zinc-400">Temperature</label>
              <input
                type="number" min={0} max={2} step={0.1}
                value={form.temperature}
                onChange={e => setForm(prev => ({ ...prev, temperature: parseFloat(e.target.value) }))}
                className="bg-zinc-800 border border-zinc-700 rounded-md px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:border-orange-500 transition-colors"
              />
              <p className="text-xs text-zinc-600">0 = deterministic, 1 = creative</p>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-zinc-400">Max Tokens</label>
              <input
                type="number" min={256} max={65536} step={1024}
                value={form.maxTokens}
                onChange={e => setForm(prev => ({ ...prev, maxTokens: parseInt(e.target.value) }))}
                className="bg-zinc-800 border border-zinc-700 rounded-md px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:border-orange-500 transition-colors"
              />
              <p className="text-xs text-zinc-600">Max length of generated resume</p>
            </div>
          </div>
        </Card>

        <Button type="submit" className="self-start">
          {saved ? <><Check size={13} /> Saved</> : 'Save Settings'}
        </Button>
      </form>
    </div>
  )
}
