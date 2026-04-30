import { useState } from 'react'
import type { ChangeEvent, Dispatch, SetStateAction } from 'react'
import { FolderGit2, Pencil, Trash2, Plus, ExternalLink } from 'lucide-react'
import { useSection } from '../hooks/useSection'
import type { Project, Skill } from '../types'
import { Button, Input, Textarea, SectionHeader, EmptyState, Card, FormCard, MonthYearPicker, formatMonthYear } from './ui'

type ProjectForm = Omit<Project, 'id'>

const empty: ProjectForm = {
  name: '', description: '', technologies: '',
  url: '', startDate: '', endDate: '', bullets: '',
}

type StringKey = keyof ProjectForm

function field(form: ProjectForm, setForm: Dispatch<SetStateAction<ProjectForm>>, key: StringKey) {
  return {
    value: form[key],
    onChange: (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm(prev => ({ ...prev, [key]: e.target.value })),
  }
}

export default function Projects() {
  const { items: projects, loading, add, update, remove } = useSection<Project>('/projects')
  const { items: skills, add: addSkill } = useSection<Skill>('/skills')
  const [editing, setEditing] = useState<string | null>(null)
  const [form, setForm] = useState<ProjectForm>(empty)

  function startAdd() { setForm(empty); setEditing('new') }
  function startEdit(p: Project) { setForm(p); setEditing(p.id) }
  function cancel() { setEditing(null); setForm(empty) }

  async function save() {
    if (!form.name.trim()) return
    if (editing === 'new') {
      await add(form)
    } else if (editing) {
      await update(editing, form)
    }

    // Auto-add new technologies to Skills (case-insensitive dedup)
    const techs = form.technologies.split(',').map(t => t.trim()).filter(Boolean)
    const existingNames = new Set(skills.map(s => s.name.toLowerCase()))
    for (const tech of techs) {
      if (!existingNames.has(tech.toLowerCase())) {
        await addSkill({ name: tech, category: '', level: '' })
        existingNames.add(tech.toLowerCase())
      }
    }

    cancel()
  }

  const f = (key: StringKey) => field(form, setForm, key)

  return (
    <div>
      <SectionHeader
        title="Projects"
        description="Side projects, open source contributions, and demos."
        action={<Button onClick={startAdd} size="sm"><Plus size={13} /> Add Project</Button>}
      />

      {editing === 'new' && <ProjectForm form={form} setForm={setForm} f={f} onSave={save} onCancel={cancel} />}

      {!loading && projects.length === 0 && editing !== 'new' ? (
        <EmptyState
          icon={<FolderGit2 size={22} />}
          title="No projects added yet"
          description="Add projects that showcase your skills."
          action={<Button onClick={startAdd} size="sm"><Plus size={13} /> Add Project</Button>}
        />
      ) : (
        <div className="flex flex-col gap-3">
          {projects.map(project => (
            editing === project.id ? (
              <div key={project.id}>
                <ProjectForm form={form} setForm={setForm} f={f} onSave={save} onCancel={cancel} saveLabel="Update" />
              </div>
            ) : (
              <Card key={project.id} className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold text-zinc-100">{project.name}</p>
                      {project.url && (
                        <a href={project.url} target="_blank" rel="noreferrer" className="text-zinc-600 hover:text-orange-400 transition-colors">
                          <ExternalLink size={12} />
                        </a>
                      )}
                    </div>
                    {(project.startDate || project.endDate) && (
                      <p className="text-xs text-zinc-600 mt-0.5">
                        {formatMonthYear(project.startDate)}{project.startDate && project.endDate ? ' – ' : ''}{formatMonthYear(project.endDate)}
                      </p>
                    )}
                    {project.technologies && (
                      <div className="flex flex-wrap gap-1 mt-1.5">
                        {project.technologies.split(',').map(t => t.trim()).filter(Boolean).map(t => (
                          <span key={t} className="text-xs px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400 border border-zinc-700">{t}</span>
                        ))}
                      </div>
                    )}
                    {project.description && (
                      <p className="text-xs text-zinc-500 mt-2 line-clamp-2">{project.description}</p>
                    )}
                    {project.bullets && (
                      <ul className="mt-2 space-y-0.5">
                        {project.bullets.split('\n').filter(Boolean).slice(0, 3).map((b, i) => (
                          <li key={i} className="text-xs text-zinc-500 pl-3 relative before:absolute before:left-0 before:content-['•'] before:text-zinc-700">
                            {b}
                          </li>
                        ))}
                        {project.bullets.split('\n').filter(Boolean).length > 3 && (
                          <li className="text-xs text-zinc-700">+{project.bullets.split('\n').filter(Boolean).length - 3} more</li>
                        )}
                      </ul>
                    )}
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <Button variant="ghost" size="sm" onClick={() => startEdit(project)}><Pencil size={12} /></Button>
                    <Button variant="ghost" size="sm" onClick={() => remove(project.id)}><Trash2 size={12} className="text-red-400" /></Button>
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
  form: ProjectForm
  setForm: Dispatch<SetStateAction<ProjectForm>>
  f: (key: StringKey) => ReturnType<typeof field>
  onSave: () => void
  onCancel: () => void
  saveLabel?: string
}

function ProjectForm({ form, setForm, f, onSave, onCancel, saveLabel }: FormProps) {
  return (
    <FormCard onSave={onSave} onCancel={onCancel} saveLabel={saveLabel}>
      <Input label="Project Name *" placeholder="My Awesome App" {...f('name')} />
      <Input label="URL (optional)" placeholder="https://github.com/you/project" {...f('url')} />
      <MonthYearPicker label="Start Date (optional)" value={form.startDate} onChange={val => setForm(prev => ({ ...prev, startDate: val }))} />
      <MonthYearPicker label="End Date (optional)" value={form.endDate} onChange={val => setForm(prev => ({ ...prev, endDate: val }))} />
      <div className="col-span-2">
        <Input label="Technologies (comma-separated)" placeholder="React, TypeScript, PostgreSQL" {...f('technologies')} />
      </div>
      <div className="col-span-2">
        <Textarea label="Description" placeholder="What does this project do and why did you build it?" rows={2} {...f('description')} />
      </div>
      <div className="col-span-2">
        <Textarea label="Bullet Points (one per line)" placeholder={'Built REST API serving 10k+ requests/day\nReduced bundle size by 35% with code splitting'} rows={4} {...f('bullets')} />
      </div>
    </FormCard>
  )
}
