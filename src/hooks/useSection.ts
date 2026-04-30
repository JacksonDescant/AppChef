import { useState, useEffect, useCallback } from 'react'
import { api } from '../lib/api'

export type SectionState<T> = {
  items: T[]
  loading: boolean
  error: string | null
  add: (item: Omit<T, 'id'>) => Promise<T>
  update: (id: string, changes: Partial<Omit<T, 'id'>>) => Promise<void>
  remove: (id: string) => Promise<void>
  reload: () => void
}

export function useSection<T extends { id: string }>(path: string): SectionState<T> {
  const [items, setItems] = useState<T[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback(() => {
    setLoading(true)
    setError(null)
    api.get<T[]>(path)
      .then(data => setItems(data))
      .catch(e => setError(String(e)))
      .finally(() => setLoading(false))
  }, [path])

  useEffect(() => { reload() }, [reload])

  async function add(item: Omit<T, 'id'>): Promise<T> {
    const created = await api.post<T>(path, item)
    setItems(prev => [...prev, created])
    return created
  }

  async function update(id: string, changes: Partial<Omit<T, 'id'>>): Promise<void> {
    const updated = await api.put<T>(`${path}/${id}`, changes)
    setItems(prev => prev.map(i => i.id === id ? { ...i, ...updated } : i))
  }

  async function remove(id: string): Promise<void> {
    await api.delete(`${path}/${id}`)
    setItems(prev => prev.filter(i => i.id !== id))
  }

  return { items, loading, error, add, update, remove, reload }
}
