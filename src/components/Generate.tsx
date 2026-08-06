import { useState, useEffect, useRef } from 'react'
import {
  Sparkles, Copy, Check, Wifi, WifiOff, ChevronRight,
  FileDown, Link, Loader2, Bookmark, BookmarkCheck, Trash2, FileText, RefreshCw,
} from 'lucide-react'
import { useSection } from '../hooks/useSection'
import { useSettings } from '../hooks/useSettings'
import { streamCompletion, checkConnection } from '../llm'
import {
  SYSTEM_PROMPT, SELECTION_SYSTEM_PROMPT,
  buildUserMessage, buildRefineMessage, buildSelectionMessage, parseSelectionIds,
  enforceChronologicalOrder, stripCitations, trimToPageFit,
} from '../prompts'
import { Button, Card } from './ui'
import type { Job, EducationEntry, Project, Skill, SavedResume, Profile } from '../types'

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit',
  })
}

export default function Generate() {
  const { settings } = useSettings()
  const { items: jobs }      = useSection<Job>('/jobs')
  const { items: education } = useSection<EducationEntry>('/education')
  const { items: projects }  = useSection<Project>('/projects')
  const { items: skills }    = useSection<Skill>('/skills')
  const { items: saved, add: saveResume, remove: deleteResume } = useSection<SavedResume>('/saved-resumes')
  const [profile, setProfile] = useState<Profile | null>(null)

  useEffect(() => {
    fetch('/api/profile').then(r => r.json()).then((d: Profile & { id?: number }) => {
      const { id: _id, ...rest } = d
      setProfile(rest as Profile)
    }).catch(() => {})
  }, [])

  const [jobDescription, setJobDescription] = useState('')
  const [urlInput, setUrlInput] = useState('')
  const [urlLoading, setUrlLoading] = useState(false)
  const [urlError, setUrlError] = useState('')
  const [output, setOutput] = useState('')
  const [loading, setLoading] = useState(false)
  const [streaming, setStreaming] = useState(false)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)
  const [pdfLoading, setPdfLoading] = useState(false)
  const [justSaved, setJustSaved] = useState(false)
  const [connected, setConnected] = useState<boolean | null>(null)
  const [refineInstructions, setRefineInstructions] = useState('')
  const [phase, setPhase] = useState<'idle' | 'selecting' | 'generating'>('idle')

  // Live PDF preview
  const [pdfPreviewUrl, setPdfPreviewUrl] = useState<string | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [previewError, setPreviewError] = useState('')
  const previewBlobUrl = useRef<string | null>(null)
  const previewDebounce = useRef<ReturnType<typeof setTimeout> | null>(null)
  const previewSeq = useRef(0)

  useEffect(() => {
    checkConnection(settings.llamaEndpoint).then(setConnected)
  }, [settings.llamaEndpoint])

  // Regenerate PDF preview whenever output changes (debounced)
  useEffect(() => {
    if (!output) {
      if (previewBlobUrl.current) { URL.revokeObjectURL(previewBlobUrl.current); previewBlobUrl.current = null }
      setPdfPreviewUrl(null)
      return
    }
    if (previewDebounce.current) clearTimeout(previewDebounce.current)
    // LaTeX compiles take ~1-2s (vs pdfkit's ~10ms), so debounce generously
    const delay = streaming ? 4000 : 1200
    previewDebounce.current = setTimeout(async () => {
      const seq = ++previewSeq.current
      setPreviewLoading(true)
      try {
        const blob = await getPdfBlob(output)
        if (seq !== previewSeq.current) return // a newer preview request superseded this one
        if (previewBlobUrl.current) URL.revokeObjectURL(previewBlobUrl.current)
        const url = URL.createObjectURL(blob)
        previewBlobUrl.current = url
        setPdfPreviewUrl(url)
        setPreviewError('')
      } catch (e) {
        if (seq === previewSeq.current) setPreviewError(e instanceof Error ? e.message : 'PDF generation failed')
      } finally {
        if (seq === previewSeq.current) setPreviewLoading(false)
      }
    }, delay)
    return () => { if (previewDebounce.current) clearTimeout(previewDebounce.current) }
  }, [output, streaming])

  // Cleanup blob on unmount
  useEffect(() => () => { if (previewBlobUrl.current) URL.revokeObjectURL(previewBlobUrl.current) }, [])

  const profileEmpty = jobs.length === 0 && education.length === 0 && projects.length === 0 && skills.length === 0

  async function fetchFromUrl() {
    const url = urlInput.trim()
    if (!url) return
    setUrlError('')
    setUrlLoading(true)
    try {
      const res = await fetch('/api/fetch-jd', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      })
      const data = await res.json() as { text?: string; error?: string }
      if (!res.ok || data.error) { setUrlError(data.error ?? 'Failed to fetch page'); return }
      setJobDescription(data.text ?? '')
      setUrlInput('')
    } catch { setUrlError('Failed to fetch URL') }
    finally { setUrlLoading(false) }
  }

  async function generate() {
    if (!jobDescription.trim()) { setError('Paste a job description first.'); return }
    if (profileEmpty) { setError('Add some experience in the other sections first.'); return }
    setError(''); setOutput(''); setJustSaved(false); setLoading(true); setStreaming(false)

    // ── Phase 1: select relevant entries ─────────────────────────────────────
    setPhase('selecting')
    const skillCatCount = new Set(skills.map(s => s.category || 'General')).size

    // Default fallback: all entries sorted by recency
    const jobsByRecency     = [...jobs].sort((a, b) =>
      (b.current ? '9999' : b.endDate || '').localeCompare(a.current ? '9999' : a.endDate || ''))
    const projectsByRecency = [...projects].sort((a, b) =>
      (b.endDate || '9999').localeCompare(a.endDate || '9999'))

    // Job/project arrays in the order we'll pass to trimToPageFit (most-relevant first)
    let orderedJobs     = jobsByRecency
    let orderedProjects = projectsByRecency

    if (jobs.length > 0 || projects.length > 0) {
      try {
        const selMsg = buildSelectionMessage({ jobs, education, projects, skills }, jobDescription)
        let selText = ''
        for await (const chunk of streamCompletion({
          endpoint: settings.llamaEndpoint, model: settings.modelName,
          messages: [{ role: 'user', content: selMsg }],
          temperature: 0.1, maxTokens: 512,
          system: SELECTION_SYSTEM_PROMPT,
        })) { selText += chunk }

        const { jobIds, projectIds } = parseSelectionIds(selText, jobs.map(j => j.id), projects.map(p => p.id))
        // Preserve model's relevance ordering (most relevant first) for trimToPageFit
        orderedJobs     = jobIds.map(id => jobs.find(j => j.id === id)!).filter(Boolean)
        orderedProjects = projectIds.map(id => projects.find(p => p.id === id)!).filter(Boolean)
      } catch {
        // Fallback already set to recency order above
      }
    }

    // ── Page-fit trim: drop least-relevant entries until bullet budget is comfortable ──
    const { jobIds: fitJobIds, projectIds: fitProjectIds } = trimToPageFit(
      orderedJobs.map(j => j.id),
      orderedProjects.map(p => p.id),
      education.length,
      skillCatCount,
    )
    const selectedJobs     = orderedJobs.filter(j => fitJobIds.includes(j.id))
    const selectedProjects = orderedProjects.filter(p => fitProjectIds.includes(p.id))

    // ── Phase 2: generate resume with selected entries ────────────────────────
    setPhase('generating')
    setStreaming(true)
    try {
      const selectedData = { jobs: selectedJobs, education, projects: selectedProjects, skills }
      const userMessage = buildUserMessage(selectedData, profile, jobDescription)
      const gen = streamCompletion({
        endpoint: settings.llamaEndpoint, model: settings.modelName,
        messages: [{ role: 'user', content: userMessage }],
        temperature: settings.temperature, maxTokens: settings.maxTokens,
        system: SYSTEM_PROMPT,
      })
      for await (const chunk of gen) setOutput(prev => prev + chunk)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to connect to model server.')
      setConnected(false)
    } finally {
      setOutput(prev => stripCitations(enforceChronologicalOrder(prev)))
      setLoading(false)
      setStreaming(false)
      setPhase('idle')
    }
  }

  async function refine() {
    if (!output.trim()) return
    if (!jobDescription.trim()) { setError('Job description required to refine.'); return }
    setError(''); setJustSaved(false); setLoading(true); setStreaming(true)
    const snapshot = output
    setOutput('')
    try {
      const userMessage = buildRefineMessage(
        { jobs, education, projects, skills },
        profile,
        jobDescription,
        snapshot,
        refineInstructions,
      )
      const gen = streamCompletion({
        endpoint: settings.llamaEndpoint, model: settings.modelName,
        messages: [{ role: 'user', content: userMessage }],
        temperature: settings.temperature, maxTokens: settings.maxTokens,
        system: SYSTEM_PROMPT,
      })
      for await (const chunk of gen) setOutput(prev => prev + chunk)
    } catch (e) {
      setOutput(snapshot)
      setError(e instanceof Error ? e.message : 'Failed to connect to model server.')
      setConnected(false)
    } finally {
      setOutput(prev => stripCitations(enforceChronologicalOrder(prev)))
      setLoading(false)
      setStreaming(false)
    }
  }

  async function copy() {
    await navigator.clipboard.writeText(output)
    setCopied(true); setTimeout(() => setCopied(false), 2000)
  }

  async function getPdfBlob(content: string): Promise<Blob> {
    const res = await fetch('/api/pdf', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: content }),
    })
    if (!res.ok) {
      const data = await res.json().catch(() => null) as { error?: string } | null
      throw new Error(data?.error ?? 'PDF generation failed')
    }
    return res.blob()
  }

  async function downloadPdf() {
    setPdfLoading(true)
    try {
      const blob = await getPdfBlob(output)
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a'); a.href = url; a.download = 'resume.pdf'; a.click()
      URL.revokeObjectURL(url)
    } catch (e) { setError(e instanceof Error ? e.message : 'PDF generation failed') }
    finally { setPdfLoading(false) }
  }

  async function handleSave() {
    await saveResume({ jobDescription, content: output, createdAt: new Date().toISOString() })
    setJustSaved(true); setTimeout(() => setJustSaved(false), 2500)
  }

  return (
    <div className="flex gap-0 -m-8 h-screen overflow-hidden">

      {/* ── Left column: controls + editor ── */}
      <div className="flex flex-col w-[52%] border-r border-zinc-800 overflow-y-auto">
        <div className="p-6 flex flex-col gap-4 flex-1">

          {/* Header */}
          <div>
            <h2 className="text-xl font-semibold tracking-tight">Generate Resume</h2>
            <p className="text-sm text-muted-foreground mt-1">Paste a job description to get a tailored resume.</p>
          </div>

          {/* Connection status */}
          <div className="flex items-center gap-2">
            <div className={`flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border ${
              connected === null    ? 'text-zinc-500 border-zinc-700 bg-zinc-900' :
              connected             ? 'text-emerald-400 border-emerald-500/30 bg-emerald-500/5' :
                                      'text-red-400 border-red-500/30 bg-red-500/5'
            }`}>
              {connected === null ? (
                <><div className="w-1.5 h-1.5 rounded-full bg-zinc-500 animate-pulse" /> Checking...</>
              ) : connected ? (
                <><Wifi size={11} /> Connected · {settings.llamaEndpoint}</>
              ) : (
                <><WifiOff size={11} /> Not connected · {settings.llamaEndpoint}</>
              )}
            </div>
            {connected === false && (
              <button onClick={() => checkConnection(settings.llamaEndpoint).then(setConnected)}
                className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors underline">retry</button>
            )}
          </div>

          {/* Job description */}
          <Card>
            <div className="p-3 border-b border-zinc-800">
              <p className="text-sm font-medium text-zinc-300">Job Description</p>
            </div>
            <div className="px-3 pt-2.5 pb-2 border-b border-zinc-800/60">
              <div className="flex gap-2">
                <div className="flex-1 flex items-center gap-2 rounded-lg border border-zinc-700 bg-zinc-900 px-3 h-8 focus-within:border-orange-500/50 transition-colors">
                  <Link size={12} className="text-zinc-600 shrink-0" />
                  <input type="url" value={urlInput}
                    onChange={e => { setUrlInput(e.target.value); setUrlError('') }}
                    onKeyDown={e => e.key === 'Enter' && fetchFromUrl()}
                    placeholder="Paste job URL to auto-fill…"
                    className="flex-1 bg-transparent text-sm text-zinc-300 placeholder-zinc-600 focus:outline-none" />
                </div>
                <button onClick={fetchFromUrl} disabled={urlLoading || !urlInput.trim()}
                  className="flex items-center gap-1.5 px-3 h-8 rounded-lg text-xs font-medium bg-zinc-800 text-zinc-300 hover:bg-zinc-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors shrink-0">
                  {urlLoading ? <Loader2 size={12} className="animate-spin" /> : <Link size={12} />}
                  {urlLoading ? 'Fetching…' : 'Fetch'}
                </button>
              </div>
              {urlError && <p className="text-xs text-red-400 mt-1.5">{urlError}</p>}
            </div>
            <div className="p-3">
              <textarea value={jobDescription} onChange={e => setJobDescription(e.target.value)}
                placeholder="…or paste the job description here directly."
                rows={7}
                className="w-full bg-transparent text-sm text-zinc-300 placeholder-zinc-600 resize-none focus:outline-none leading-relaxed" />
            </div>
          </Card>

          {/* Generate button */}
          <div className="flex items-center gap-3">
            <Button onClick={generate} disabled={loading || !jobDescription.trim() || connected !== true}>
              <Sparkles size={14} className={loading ? 'animate-spin' : ''} />
              {loading
                ? phase === 'selecting' ? 'Selecting…' : 'Generating…'
                : 'Generate Resume'}
              {!loading && <ChevronRight size={13} />}
            </Button>
            {profileEmpty && <p className="text-xs text-amber-400">Add your experience first.</p>}
            {error && <p className="text-xs text-red-400">{error}</p>}
            {loading && phase === 'selecting' && (
              <p className="text-xs text-zinc-500 flex items-center gap-1.5">
                <span className="inline-block w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />
                Selecting relevant experience…
              </p>
            )}
          </div>

          {/* Editable output */}
          {output && (
            <div className="flex flex-col flex-1">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Output</p>
                <div className="flex items-center gap-3">
                  <button onClick={copy} className="flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-200 transition-colors">
                    {copied ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
                    {copied ? 'Copied' : 'Copy'}
                  </button>
                  <button onClick={downloadPdf} disabled={pdfLoading}
                    className="flex items-center gap-1 text-xs text-zinc-500 hover:text-orange-400 transition-colors disabled:opacity-40">
                    <FileDown size={12} />
                    {pdfLoading ? 'Generating…' : 'Download PDF'}
                  </button>
                  <button onClick={handleSave} disabled={justSaved || streaming}
                    className="flex items-center gap-1 text-xs text-zinc-500 hover:text-orange-400 transition-colors disabled:opacity-40">
                    {justSaved ? <BookmarkCheck size={12} className="text-emerald-400" /> : <Bookmark size={12} />}
                    {justSaved ? 'Saved' : 'Save'}
                  </button>
                </div>
              </div>
              <textarea
                value={output}
                onChange={e => setOutput(e.target.value)}
                className="flex-1 min-h-[360px] w-full rounded-xl bg-card ring-1 ring-foreground/8 p-4 text-sm text-zinc-300 font-mono leading-relaxed resize-none focus:outline-none focus:ring-orange-500/30"
                spellCheck={false}
              />
              {streaming && (
                <p className="text-xs text-zinc-600 mt-1.5 flex items-center gap-1.5">
                  <span className="inline-block w-1.5 h-1.5 rounded-full bg-orange-400 animate-pulse" />
                  Generating…
                </p>
              )}
              {!streaming && (
                <div className="mt-4 pt-4 border-t border-zinc-800/60">
                  <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">Refine</p>
                  <div className="flex gap-2">
                    <input
                      value={refineInstructions}
                      onChange={e => setRefineInstructions(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && !loading && refine()}
                      placeholder="What should change? (leave blank to auto-improve bullets)"
                      className="flex-1 h-8 rounded-lg border border-zinc-700 bg-zinc-900 px-3 text-sm text-zinc-300 placeholder-zinc-600 focus:outline-none focus:border-orange-500/50 transition-colors"
                    />
                    <button
                      onClick={refine}
                      disabled={loading || connected !== true}
                      className="flex items-center gap-1.5 px-3 h-8 rounded-lg text-xs font-medium bg-zinc-800 text-zinc-300 hover:bg-zinc-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors shrink-0"
                    >
                      <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
                      {loading ? 'Refining…' : 'Refine'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Resume History */}
          {saved.length > 0 && (
            <div className="mt-2">
              <div className="flex items-center gap-2 mb-3">
                <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">History</p>
                <span className="text-xs text-zinc-700">{saved.length}</span>
              </div>
              <div className="flex flex-col gap-2">
                {saved.map(resume => (
                  <div key={resume.id}
                    className="flex items-center justify-between gap-4 rounded-xl bg-card ring-1 ring-foreground/8 px-3 py-2.5">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <FileText size={13} className="text-zinc-500 shrink-0" />
                      <div className="min-w-0">
                        <p className="text-xs font-medium text-zinc-300">{formatDate(resume.createdAt)}</p>
                        {resume.jobDescription && (
                          <p className="text-xs text-zinc-600 truncate max-w-xs mt-0.5">
                            {resume.jobDescription.slice(0, 100).replace(/\s+/g, ' ')}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button onClick={() => setOutput(resume.content)}
                        className="px-2 py-1 rounded text-xs text-zinc-500 hover:text-orange-400 hover:bg-orange-500/5 transition-colors">
                        Load
                      </button>
                      <button onClick={() => deleteResume(resume.id)}
                        className="p-1 rounded text-zinc-700 hover:text-red-400 transition-colors">
                        <Trash2 size={11} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Right column: live PDF preview ── */}
      <div className="flex-1 flex flex-col bg-zinc-950">
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-zinc-800 shrink-0">
          <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">PDF Preview</p>
          {previewLoading && (
            <span className="flex items-center gap-1.5 text-xs text-zinc-600">
              <Loader2 size={12} className="animate-spin" /> Compiling LaTeX…
            </span>
          )}
        </div>
        {previewError && (
          <div className="px-4 py-2 border-b border-red-500/20 bg-red-500/5 shrink-0">
            <p className="text-xs text-red-400">{previewError}</p>
          </div>
        )}
        <div className="flex-1 overflow-hidden">
          {pdfPreviewUrl ? (
            <iframe key={pdfPreviewUrl} src={pdfPreviewUrl} className="w-full h-full border-none" title="Resume PDF preview" />
          ) : (
            <div className="h-full flex flex-col items-center justify-center gap-3 text-center px-8">
              <div className="size-12 rounded-2xl bg-zinc-900 border border-zinc-800 flex items-center justify-center">
                <FileText size={20} className="text-zinc-600" />
              </div>
              <p className="text-sm font-medium text-zinc-500">No preview yet</p>
              <p className="text-xs text-zinc-700 max-w-xs">Generate a resume or load one from history to see the PDF preview here.</p>
            </div>
          )}
        </div>
      </div>

    </div>
  )
}
