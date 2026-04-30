import { useState } from 'react'
import type { ChangeEvent, Dispatch, SetStateAction } from 'react'
import { Briefcase, Pencil, Trash2, Plus } from 'lucide-react'
import { useSection } from '../hooks/useSection'
import type { Job } from '../types'
import { Button, Input, Textarea, Checkbox, SectionHeader, EmptyState, Card, FormCard, MonthYearPicker, formatMonthYear } from './ui'

type JobForm = Omit<Job, 'id'>

const empty: JobForm = {
  company: '', title: '', location: '',
  startDate: '', endDate: '', current: false,
  description: '', bullets: '',
}

type StringKey = { [K in keyof JobForm]: JobForm[K] extends string ? K : never }[keyof JobForm]

function field(form: JobForm, setForm: Dispatch<SetStateAction<JobForm>>, key: StringKey) {
  return {
    value: form[key],
    onChange: (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm(prev => ({ ...prev, [key]: e.target.value })),
  }
}

export default function Jobs() {
  const { items: jobs, loading, add, update, remove } = useSection<Job>('/jobs')
  const [editing, setEditing] = useState<string | null>(null)
  const [form, setForm] = useState<JobForm>(empty)

  function startAdd() { setForm(empty); setEditing('new') }
  function startEdit(job: Job) { setForm(job); setEditing(job.id) }
  function cancel() { setEditing(null); setForm(empty) }

  async function save() {
    if (!form.company.trim() || !form.title.trim()) return
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
        title="Work Experience"
        description="Your jobs, internships, and freelance work."
        action={<Button onClick={startAdd} size="sm"><Plus size={13} /> Add Job</Button>}
      />

      {editing === 'new' && <JobForm form={form} setForm={setForm} f={f} onSave={save} onCancel={cancel} />}

      {!loading && jobs.length === 0 && editing !== 'new' ? (
        <EmptyState
          icon={<Briefcase size={22} />}
          title="No jobs added yet"
          description="Add your work history to generate tailored resumes."
          action={<Button onClick={startAdd} size="sm"><Plus size={13} /> Add Job</Button>}
        />
      ) : (
        <div className="flex flex-col gap-3">
          {jobs.map(job => (
            editing === job.id ? (
              <div key={job.id}>
                <JobForm form={form} setForm={setForm} f={f} onSave={save} onCancel={cancel} saveLabel="Update" />
              </div>
            ) : (
              <Card key={job.id} className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-zinc-100">{job.title}</p>
                    <p className="text-sm text-zinc-400">{job.company}{job.location ? ` · ${job.location}` : ''}</p>
                    <p className="text-xs text-zinc-600 mt-0.5">
                      {formatMonthYear(job.startDate)} – {job.current ? 'Present' : formatMonthYear(job.endDate)}
                    </p>
                    {job.description && (
                      <p className="text-xs text-zinc-500 mt-2 line-clamp-2">{job.description}</p>
                    )}
                    {job.bullets && (
                      <ul className="mt-2 space-y-0.5">
                        {job.bullets.split('\n').filter(Boolean).slice(0, 3).map((b, i) => (
                          <li key={i} className="text-xs text-zinc-500 pl-3 relative before:absolute before:left-0 before:content-['•'] before:text-zinc-700">
                            {b}
                          </li>
                        ))}
                        {job.bullets.split('\n').filter(Boolean).length > 3 && (
                          <li className="text-xs text-zinc-700">+{job.bullets.split('\n').filter(Boolean).length - 3} more</li>
                        )}
                      </ul>
                    )}
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <Button variant="ghost" size="sm" onClick={() => startEdit(job)}><Pencil size={12} /></Button>
                    <Button variant="ghost" size="sm" onClick={() => remove(job.id)}><Trash2 size={12} className="text-red-400" /></Button>
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
  form: JobForm
  setForm: Dispatch<SetStateAction<JobForm>>
  f: (key: StringKey) => ReturnType<typeof field>
  onSave: () => void
  onCancel: () => void
  saveLabel?: string
}

function JobForm({ form, setForm, f, onSave, onCancel, saveLabel }: FormProps) {
  return (
    <FormCard onSave={onSave} onCancel={onCancel} saveLabel={saveLabel}>
      <Input label="Job Title *" placeholder="Software Engineer" {...f('title')} />
      <Input label="Company *" placeholder="Acme Corp" {...f('company')} />
      <Input label="Location" placeholder="San Francisco, CA" {...f('location')} />
      <div />
      <MonthYearPicker label="Start Date" value={form.startDate} onChange={val => setForm(prev => ({ ...prev, startDate: val }))} />
      <div className="flex flex-col gap-2">
        <MonthYearPicker label="End Date" value={form.endDate} disabled={form.current} onChange={val => setForm(prev => ({ ...prev, endDate: val }))} />
        <Checkbox
          label="I currently work here"
          checked={form.current}
          onChange={e => setForm(prev => ({ ...prev, current: e.target.checked }))}
        />
      </div>
      <div className="col-span-2">
        <Textarea label="Summary (optional)" placeholder="Brief overview of your role..." rows={2} {...f('description')} />
      </div>
      <div className="col-span-2">
        <Textarea label="Bullet Points (one per line)" placeholder={'Led a team of 5 engineers to ship X\nReduced latency by 40% with Y'} rows={4} {...f('bullets')} />
      </div>
    </FormCard>
  )
}
