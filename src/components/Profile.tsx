import { useState, useEffect } from 'react'
import { User } from 'lucide-react'
import { Button, Input, Textarea, SectionHeader } from './ui'
import type { Profile as ProfileType } from '../types'

const EMPTY: ProfileType = {
  name: '', email: '', phone: '', location: '',
  website: '', linkedin: '', github: '', summary: '',
}

export default function Profile() {
  const [form, setForm] = useState<ProfileType>(EMPTY)
  const [saved, setSaved] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/profile')
      .then(r => r.json())
      .then((data: ProfileType & { id?: number }) => {
        const { id: _id, ...rest } = data as ProfileType & { id?: number }
        setForm({ ...EMPTY, ...rest })
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  function set(key: keyof ProfileType) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm(prev => ({ ...prev, [key]: e.target.value }))
  }

  async function save() {
    await fetch('/api/profile', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  if (loading) return null

  return (
    <div>
      <SectionHeader
        title="Profile"
        description="Your contact info and headline — used at the top of every generated resume."
        action={
          <Button onClick={save} size="sm">
            <User size={13} />
            {saved ? 'Saved!' : 'Save'}
          </Button>
        }
      />

      <div className="rounded-xl bg-card ring-1 ring-primary/25 shadow-[0_0_0_1px_color-mix(in_oklch,var(--primary)_8%,transparent),0_2px_8px_rgba(0,0,0,0.4)] p-5">
        <div className="grid grid-cols-2 gap-4">
          <Input label="Full Name" placeholder="Jane Smith" value={form.name} onChange={set('name')} />
          <Input label="Location" placeholder="San Francisco, CA" value={form.location} onChange={set('location')} />
          <Input label="Email" type="email" placeholder="jane@example.com" value={form.email} onChange={set('email')} />
          <Input label="Phone (optional)" type="tel" placeholder="+1 (555) 000-0000" value={form.phone} onChange={set('phone')} />
          <Input label="Website (optional)" type="url" placeholder="https://janesmith.dev" value={form.website} onChange={set('website')} />
          <Input label="LinkedIn (optional)" placeholder="linkedin.com/in/janesmith" value={form.linkedin} onChange={set('linkedin')} />
          <Input label="GitHub (optional)" placeholder="github.com/janesmith" value={form.github} onChange={set('github')} />
          <div />
          <div className="col-span-2">
            <Textarea
              label="Professional Summary (optional)"
              placeholder="2–3 sentence overview of your background and what you're looking for."
              rows={3}
              value={form.summary}
              onChange={set('summary')}
            />
          </div>
        </div>
        <div className="flex gap-2 mt-5 pt-4 border-t border-border">
          <Button onClick={save}>{saved ? 'Saved!' : 'Save Changes'}</Button>
        </div>
      </div>
    </div>
  )
}
