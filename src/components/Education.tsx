import { useState } from 'react'
import type { ChangeEvent, Dispatch, SetStateAction } from 'react'
import { GraduationCap, Pencil, Trash2, Plus } from 'lucide-react'
import { useSection } from '../hooks/useSection'
import type { EducationEntry } from '../types'
import { Button, Input, Textarea, Checkbox, SectionHeader, EmptyState, Card, FormCard, MonthYearPicker, formatMonthYear } from './ui'

type EduForm = Omit<EducationEntry, 'id'>

const empty: EduForm = {
  institution: '', degree: '', field: '', location: '',
  startDate: '', endDate: '', current: false,
  gpa: '', minor: '', description: '',
}

type StringKey = { [K in keyof EduForm]: EduForm[K] extends string ? K : never }[keyof EduForm]

function field(form: EduForm, setForm: Dispatch<SetStateAction<EduForm>>, key: StringKey) {
  return {
    value: form[key],
    onChange: (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm(prev => ({ ...prev, [key]: e.target.value })),
  }
}

export default function Education() {
  const { items: education, loading, add, update, remove } = useSection<EducationEntry>('/education')
  const [editing, setEditing] = useState<string | null>(null)
  const [form, setForm] = useState<EduForm>(empty)

  function startAdd() { setForm(empty); setEditing('new') }
  function startEdit(entry: EducationEntry) { setForm(entry); setEditing(entry.id) }
  function cancel() { setEditing(null); setForm(empty) }

  async function save() {
    if (!form.institution.trim() || !form.degree.trim()) return
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
        title="Education"
        description="Degrees, certifications, and courses."
        action={<Button onClick={startAdd} size="sm"><Plus size={13} /> Add Education</Button>}
      />

      {editing === 'new' && <EduForm form={form} setForm={setForm} f={f} onSave={save} onCancel={cancel} />}

      {!loading && education.length === 0 && editing !== 'new' ? (
        <EmptyState
          icon={<GraduationCap size={22} />}
          title="No education added yet"
          description="Add your degrees and certifications."
          action={<Button onClick={startAdd} size="sm"><Plus size={13} /> Add Education</Button>}
        />
      ) : (
        <div className="flex flex-col gap-3">
          {education.map(edu => (
            editing === edu.id ? (
              <div key={edu.id}>
                <EduForm form={form} setForm={setForm} f={f} onSave={save} onCancel={cancel} saveLabel="Update" />
              </div>
            ) : (
              <Card key={edu.id} className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-zinc-100">
                      {edu.degree}{edu.field ? ` in ${edu.field}` : ''}{edu.minor ? ` · Minor in ${edu.minor}` : ''}
                    </p>
                    <p className="text-sm text-zinc-400">{edu.institution}{edu.location ? ` · ${edu.location}` : ''}</p>
                    <p className="text-xs text-zinc-600 mt-0.5">
                      {formatMonthYear(edu.startDate)} – {edu.current ? 'Present' : formatMonthYear(edu.endDate)}
                      {edu.gpa ? ` · GPA ${edu.gpa}` : ''}
                    </p>
                    {edu.description && (
                      <p className="text-xs text-zinc-500 mt-2 line-clamp-2">{edu.description}</p>
                    )}
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <Button variant="ghost" size="sm" onClick={() => startEdit(edu)}><Pencil size={12} /></Button>
                    <Button variant="ghost" size="sm" onClick={() => remove(edu.id)}><Trash2 size={12} className="text-red-400" /></Button>
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
  form: EduForm
  setForm: Dispatch<SetStateAction<EduForm>>
  f: (key: StringKey) => ReturnType<typeof field>
  onSave: () => void
  onCancel: () => void
  saveLabel?: string
}

function EduForm({ form, setForm, f, onSave, onCancel, saveLabel }: FormProps) {
  return (
    <FormCard onSave={onSave} onCancel={onCancel} saveLabel={saveLabel}>
      <Input label="Institution *" placeholder="MIT" {...f('institution')} />
      <Input label="Degree *" placeholder="Bachelor of Science" {...f('degree')} />
      <Input label="Field of Study" placeholder="Computer Science" {...f('field')} />
      <Input label="Location" placeholder="Cambridge, MA" {...f('location')} />
      <MonthYearPicker label="Start Date" value={form.startDate} onChange={val => setForm(prev => ({ ...prev, startDate: val }))} />
      <div className="flex flex-col gap-2">
        <MonthYearPicker label="End Date" value={form.endDate} disabled={form.current} onChange={val => setForm(prev => ({ ...prev, endDate: val }))} />
        <Checkbox
          label="Currently attending"
          checked={form.current}
          onChange={e => setForm(prev => ({ ...prev, current: e.target.checked }))}
        />
      </div>
      <Input label="GPA (optional)" placeholder="3.8 / 4.0" {...f('gpa')} />
      <Input label="Minor (optional)" placeholder="Mathematics" {...f('minor')} />
      <div className="col-span-2">
        <Textarea label="Description (optional)" placeholder="Relevant coursework, honors, activities..." rows={3} {...f('description')} />
      </div>
    </FormCard>
  )
}
