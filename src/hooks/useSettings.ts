import { useState, useEffect } from 'react'
import { api } from '../lib/api'
import type { AppSettings } from '../types'

const fallback: AppSettings = {
  llamaEndpoint: 'http://localhost:8080',
  modelName: '',
  temperature: 0.7,
  maxTokens: 32000,
}

export function useSettings() {
  const [settings, setSettings] = useState<AppSettings>(fallback)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.get<AppSettings>('/settings')
      .then(data => { if (data) setSettings(data) })
      .catch(() => { /* server not yet up; keep defaults */ })
      .finally(() => setLoading(false))
  }, [])

  async function saveSettings(patch: Partial<AppSettings>): Promise<void> {
    const updated = await api.put<AppSettings>('/settings', patch)
    setSettings(updated)
  }

  return { settings, loading, saveSettings }
}
