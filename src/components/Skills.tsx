import { useState } from 'react'
import { Wrench, Pencil, Trash2, Plus } from 'lucide-react'
import { useSection } from '../hooks/useSection'
import type { Skill } from '../types'
import { Button, Input, Select, SectionHeader, EmptyState, FormCard } from './ui'

const LEVELS = ['Beginner', 'Intermediate', 'Advanced', 'Expert']
const CATEGORIES = ['Frontend', 'Backend', 'DevOps', 'Mobile', 'Data', 'Languages', 'Tools', 'Design', 'Other']

type SkillForm = Omit<Skill, 'id'>
const empty: SkillForm = { name: '', category: '', level: '' }

export default function Skills() {
  const { items: skills, loading, add, update, remove } = useSection<Skill>('/skills')
  const [editing, setEditing] = useState<string | null>(null)
  const [form, setForm] = useState<SkillForm>(empty)

  function startAdd() { setForm(empty); setEditing('new') }
  function startEdit(s: Skill) { setForm(s); setEditing(s.id) }
  function cancel() { setEditing(null); setForm(empty) }

  async function save() {
    if (!form.name.trim()) return
    if (editing === 'new') {
      await add(form)
    } else if (editing) {
      await update(editing, form)
    }
    cancel()
  }

  const byCategory = skills.reduce<Record<string, Skill[]>>((acc, s) => {
    const cat = s.category || 'Other'
    if (!acc[cat]) acc[cat] = []
    acc[cat].push(s)
    return acc
  }, {})

  return (
    <div>
      <SectionHeader
        title="Skills"
        description="Technical skills, tools, and technologies."
        action={<Button onClick={startAdd} size="sm"><Plus size={13} /> Add Skill</Button>}
      />

      {editing === 'new' && <SkillFormCard form={form} setForm={setForm} onSave={save} onCancel={cancel} />}

      {!loading && skills.length === 0 && editing !== 'new' ? (
        <EmptyState
          icon={<Wrench size={22} />}
          title="No skills added yet"
          description="Add your technical skills and tools."
          action={<Button onClick={startAdd} size="sm"><Plus size={13} /> Add Skill</Button>}
        />
      ) : (
        <div className="flex flex-col gap-4">
          {Object.entries(byCategory).map(([category, categorySkills]) => (
            <div key={category}>
              <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">{category}</p>
              <div className="flex flex-wrap gap-2">
                {categorySkills.map(skill => (
                  editing === skill.id ? (
                    <div key={skill.id} className="w-full">
                      <SkillFormCard form={form} setForm={setForm} onSave={save} onCancel={cancel} saveLabel="Update" />
                    </div>
                  ) : (
                    <div key={skill.id} className="group flex items-center gap-1.5 px-2.5 py-1.5 bg-zinc-900 border border-zinc-800 rounded-lg">
                      <span className="text-sm text-zinc-200">{skill.name}</span>
                      {skill.level && <span className="text-xs text-zinc-600">{skill.level}</span>}
                      <div className="hidden group-hover:flex items-center gap-0.5 ml-1">
                        <button onClick={() => startEdit(skill)} className="text-zinc-600 hover:text-zinc-300 transition-colors"><Pencil size={10} /></button>
                        <button onClick={() => remove(skill.id)} className="text-zinc-600 hover:text-red-400 transition-colors"><Trash2 size={10} /></button>
                      </div>
                    </div>
                  )
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

interface SkillFormProps {
  form: SkillForm
  setForm: (fn: (prev: SkillForm) => SkillForm) => void
  onSave: () => void
  onCancel: () => void
  saveLabel?: string
}

function SkillFormCard({ form, setForm, onSave, onCancel, saveLabel }: SkillFormProps) {
  return (
    <FormCard onSave={onSave} onCancel={onCancel} saveLabel={saveLabel}>
      <Input
        label="Skill Name *" placeholder="TypeScript"
        value={form.name}
        onChange={e => setForm(prev => ({ ...prev, name: e.target.value }))}
      />
      <Select
        label="Category" options={CATEGORIES} value={form.category}
        onChange={e => setForm(prev => ({ ...prev, category: e.target.value }))}
      />
      <Select
        label="Proficiency Level" options={LEVELS} value={form.level}
        onChange={e => setForm(prev => ({ ...prev, level: e.target.value }))}
      />
    </FormCard>
  )
}
