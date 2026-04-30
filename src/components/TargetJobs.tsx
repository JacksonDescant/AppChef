import { useState } from 'react'
import type { ChangeEvent, Dispatch, SetStateAction } from 'react'
import { Target, Pencil, Trash2, Plus, MapPin } from 'lucide-react'
import { useSection } from '../hooks/useSection'
import type { TargetJob } from '../types'
import { Button, Input, Textarea, Select, SectionHeader, EmptyState, Card, FormCard } from './ui'

type TargetForm = Omit<TargetJob, 'id'>

const empty: TargetForm = {
  title: '', industry: '', locationType: '', location: '',
  minSalary: null, maxSalary: null, notes: '',
}

const LOCATION_TYPES = ['Remote', 'Hybrid', 'Onsite']
const INDUSTRIES = ['Technology', 'Finance', 'Healthcare', 'Education', 'E-commerce', 'Media', 'Government', 'Consulting', 'Other']

type StringKey = { [K in keyof TargetForm]: TargetForm[K] extends string ? K : never }[keyof TargetForm]

function field(form: TargetForm, setForm: Dispatch<SetStateAction<TargetForm>>, key: StringKey) {
  return {
    value: form[key],
    onChange: (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm(prev => ({ ...prev, [key]: e.target.value })),
  }
}

const LOCATION_TYPE_COLORS: Record<string, string> = {
  Remote: 'text-emerald-400 border-emerald-500/30 bg-emerald-500/5',
  Hybrid: 'text-blue-400 border-blue-500/30 bg-blue-500/5',
  Onsite: 'text-orange-400 border-orange-500/30 bg-orange-500/5',
}

export default function TargetJobs() {
  const { items: targets, loading, add, update, remove } = useSection<TargetJob>('/target-jobs')
  const [editing, setEditing] = useState<string | null>(null)
  const [form, setForm] = useState<TargetForm>(empty)

  function startAdd() { setForm(empty); setEditing('new') }
  function startEdit(t: TargetJob) { setForm(t); setEditing(t.id) }
  function cancel() { setEditing(null); setForm(empty) }

  async function save() {
    if (!form.title.trim()) return
    if (editing === 'new') {
      await add(form)
    } else if (editing) {
      await update(editing, form)
    }
    cancel()
  }

  const f = (key: StringKey) => field(form, setForm, key)

  return (
    <div>
      <SectionHeader
        title="Target Roles"
        description="Define what you're looking for — used to match and filter job postings."
        action={<Button onClick={startAdd} size="sm"><Plus size={13} /> Add Target</Button>}
      />

      {editing === 'new' && <TargetForm form={form} setForm={setForm} f={f} onSave={save} onCancel={cancel} />}

      {!loading && targets.length === 0 && editing !== 'new' ? (
        <EmptyState
          icon={<Target size={22} />}
          title="No target roles defined"
          description="Add roles you're actively looking for to power future job search."
          action={<Button onClick={startAdd} size="sm"><Plus size={13} /> Add Target</Button>}
        />
      ) : (
        <div className="flex flex-col gap-3">
          {targets.map(t => (
            editing === t.id ? (
              <div key={t.id}>
                <TargetForm form={form} setForm={setForm} f={f} onSave={save} onCancel={cancel} saveLabel="Update" />
              </div>
            ) : (
              <Card key={t.id} className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-semibold text-zinc-100">{t.title}</p>
                      {t.locationType && (
                        <span className={`text-xs px-1.5 py-0.5 rounded-full border ${LOCATION_TYPE_COLORS[t.locationType] ?? 'text-zinc-400 border-zinc-700'}`}>
                          {t.locationType}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                      {t.industry && <p className="text-xs text-zinc-500">{t.industry}</p>}
                      {t.location && (
                        <p className="text-xs text-zinc-500 flex items-center gap-1">
                          <MapPin size={10} />{t.location}
                        </p>
                      )}
                      {(t.minSalary || t.maxSalary) && (
                        <p className="text-xs text-zinc-500">
                          {t.minSalary ? `$${t.minSalary.toLocaleString()}` : '?'}
                          {' – '}
                          {t.maxSalary ? `$${t.maxSalary.toLocaleString()}` : '?'}
                        </p>
                      )}
                    </div>
                    {t.notes && <p className="text-xs text-zinc-600 mt-1.5 line-clamp-1">{t.notes}</p>}
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <Button variant="ghost" size="sm" onClick={() => startEdit(t)}><Pencil size={12} /></Button>
                    <Button variant="ghost" size="sm" onClick={() => remove(t.id)}><Trash2 size={12} className="text-red-400" /></Button>
                  </div>
                </div>
              </Card>
            )
          ))}
        </div>
      )}
    </div>
  )
}

interface FormProps {
  form: TargetForm
  setForm: Dispatch<SetStateAction<TargetForm>>
  f: (key: StringKey) => ReturnType<typeof field>
  onSave: () => void
  onCancel: () => void
  saveLabel?: string
}

function TargetForm({ form, setForm, f, onSave, onCancel, saveLabel }: FormProps) {
  return (
    <FormCard onSave={onSave} onCancel={onCancel} saveLabel={saveLabel}>
      <Input label="Job Title *" placeholder="Senior Software Engineer" {...f('title')} />
      <Select label="Industry" options={INDUSTRIES} value={form.industry}
        onChange={e => setForm(prev => ({ ...prev, industry: e.target.value }))} />
      <Select label="Work Style" options={LOCATION_TYPES} value={form.locationType}
        onChange={e => setForm(prev => ({ ...prev, locationType: e.target.value }))} />
      <Input label="Location" placeholder="San Francisco, CA or Remote" {...f('location')} />
      <Input label="Min Salary ($)" type="number" placeholder="100000"
        value={form.minSalary ?? ''}
        onChange={e => setForm(prev => ({ ...prev, minSalary: e.target.value ? parseInt(e.target.value) : null }))} />
      <Input label="Max Salary ($)" type="number" placeholder="160000"
        value={form.maxSalary ?? ''}
        onChange={e => setForm(prev => ({ ...prev, maxSalary: e.target.value ? parseInt(e.target.value) : null }))} />
      <div className="col-span-2">
        <Textarea label="Notes (optional)" placeholder="Must have: strong eng culture, 4+ yoe expected, not a startup..." rows={2} {...f('notes')} />
      </div>
    </FormCard>
  )
}
