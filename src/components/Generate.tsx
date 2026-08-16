import { useState, useEffect, useMemo, useRef } from 'react'
import {
  Sparkles, Copy, Check, Wifi, WifiOff, ChevronRight,
  FileDown, Link, Loader2, Bookmark, BookmarkCheck, Trash2, FileText, RefreshCw,
} from 'lucide-react'
import { useSection } from '../hooks/useSection'
import { useSettings } from '../hooks/useSettings'
import { streamCompletion, checkConnection } from '../llm'
import {
  SYSTEM_PROMPT, REFINE_SYSTEM_PROMPT, EXTRACTION_SYSTEM_PROMPT, SHORTLIST_SYSTEM_PROMPT,
  buildUserMessage, buildRefineMessage, buildExtractionMessage, buildShortlistMessage,
  buildSkillLines, computeBulletAllocation, parseExtraction, parseShortlist, skillRowCount,
  assembleResume, buildEducationLines, buildHeaderLines, expandToPageFit, pageFillCount, trimToPageFit,
} from '../prompts'
import type { JdKeywords, ResumeData } from '../prompts'
import { computeCoverage } from '../lib/coverage'
import { buildLintInstruction, runLint } from '../lib/lint'
import ReflectionPanel from './ReflectionPanel'
import type { ReflectionState } from './ReflectionPanel'
import { Button, Card } from './ui'
import type { Job, EducationEntry, Project, Skill, SavedResume, Profile, LintIssue, RequirementInput, RetrievalResult, ScoreResult } from '../types'

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
  const [phase, setPhase] = useState<'idle' | 'extracting' | 'scoring' | 'shortlisting' | 'generating' | 'filling' | 'reflecting' | 'repassing'>('idle')
  const [keywords, setKeywords] = useState<JdKeywords | null>(null)
  const [retrieval, setRetrieval] = useState<RetrievalResult | null>(null)
  const [reflection, setReflection] = useState<ReflectionState | null>(null)
  const runSeq = useRef(0) // orphans stale reflection continuations (same pattern as previewSeq)

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

  const coverage = useMemo(
    () => (keywords && output && !streaming ? computeCoverage(output, keywords) : null),
    [keywords, output, streaming],
  )

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
    const runId = ++runSeq.current
    setError(''); setOutput(''); setJustSaved(false); setLoading(true); setStreaming(false)
    setKeywords(null); setRetrieval(null); setReflection(null)

    const skillCatCount = skillRowCount(skills) // composed skills render ≤4 rows
    const hasSummary = Boolean(profile?.summary?.trim())
    let jdKeywords: JdKeywords | null = null
    let retrievalResult: RetrievalResult | null = null

    // Default fallback: all entries sorted by recency
    const jobsByRecency     = [...jobs].sort((a, b) =>
      (b.current ? '9999' : b.endDate || '').localeCompare(a.current ? '9999' : a.endDate || ''))
    const projectsByRecency = [...projects].sort((a, b) =>
      (b.endDate || '9999').localeCompare(a.endDate || '9999'))

    // Job/project arrays in the order we'll pass to trimToPageFit (most-relevant first)
    let orderedJobs     = jobsByRecency
    let orderedProjects = projectsByRecency

    // ── Phase 1: extract requirements from the JD (small, JD-only prompt) ────
    setPhase('extracting')
    try {
      let extText = ''
      for await (const chunk of streamCompletion({
        endpoint: settings.llamaEndpoint, model: settings.modelName,
        messages: [{ role: 'user', content: buildExtractionMessage(jobDescription) }],
        // noThink: reasoning buys nothing on a tiny JSON answer and costs
        // real seconds. (Historically its thinking also starved this call's
        // token cap, silently collapsing the pipeline to the recency
        // fallback — caps are gone now, but the latency point stands.)
        temperature: 0.1, noThink: true,
        system: EXTRACTION_SYSTEM_PROMPT,
      })) { extText += chunk }
      jdKeywords = parseExtraction(extText)
      setKeywords(jdKeywords)
    } catch {
      // extraction unavailable — recency fallback below still works
    }

    // ── Phase 2: deterministic hybrid scoring on the server ──────────────────
    // BM25 + embeddings, RRF-fused per requirement (docs/retrieval-research.md)
    if (jdKeywords && (jobs.length > 0 || projects.length > 0)) {
      setPhase('scoring')
      try {
        const requirements: RequirementInput[] = [
          ...jdKeywords.mustHave.map(text => ({ text, required: true })),
          ...jdKeywords.niceToHave.map(text => ({ text, required: false })),
        ]
        // Fresh seed per click: near-tied entries/bullets may swap between
        // generations, so regenerating explores the tie space. Clearly-better
        // entries always win — the jitter is bounded server-side.
        const seed = crypto.getRandomValues(new Uint32Array(1))[0]
        const res = await fetch('/api/retrieve', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ requirements, seed }),
        })
        if (res.ok) {
          retrievalResult = await res.json() as RetrievalResult
          setRetrieval(retrievalResult)
          orderedJobs     = retrievalResult.rankedJobs.map(r => jobs.find(j => j.id === r.id)!).filter(Boolean)
          orderedProjects = retrievalResult.rankedProjects.map(r => projects.find(p => p.id === r.id)!).filter(Boolean)
        }
      } catch {
        // server scoring unavailable — recency fallback stands
      }
    }

    // ── Phase 3: LLM listwise confirmation over the scored shortlist ─────────
    if (retrievalResult && (jobs.length > 0 || projects.length > 0)) {
      setPhase('shortlisting')
      try {
        let selText = ''
        for await (const chunk of streamCompletion({
          endpoint: settings.llamaEndpoint, model: settings.modelName,
          messages: [{ role: 'user', content: buildShortlistMessage({ jobs, education, projects, skills }, retrievalResult, jdKeywords) }],
          // noThink for the same reason as extraction: a one-line JSON pick
          // doesn't need a reasoning phase.
          temperature: 0.1, noThink: true,
          system: SHORTLIST_SYSTEM_PROMPT,
        })) { selText += chunk }
        const { jobIds, projectIds } = parseShortlist(
          selText,
          retrievalResult.rankedJobs.map(r => r.id),
          retrievalResult.rankedProjects.map(r => r.id),
        )
        // Bullets are capped (rule 15), so a sparse selection cannot fill the
        // page vertically — re-add next-ranked entries until it can.
        const expanded = expandToPageFit(
          jobIds, projectIds,
          retrievalResult.rankedJobs.map(r => r.id),
          retrievalResult.rankedProjects.map(r => r.id),
          education.length, skillCatCount, hasSummary,
        )
        orderedJobs     = expanded.jobIds.map(id => jobs.find(j => j.id === id)!).filter(Boolean)
        orderedProjects = expanded.projectIds.map(id => projects.find(p => p.id === id)!).filter(Boolean)
      } catch {
        // confirmation unavailable — the engine's ranking stands
      }
    }

    // ── Page-fit trim: drop least-relevant entries until bullet budget is comfortable ──
    const { jobIds: fitJobIds, projectIds: fitProjectIds } = trimToPageFit(
      orderedJobs.map(j => j.id),
      orderedProjects.map(p => p.id),
      education.length,
      skillCatCount,
      hasSummary,
    )
    const selectedJobs     = orderedJobs.filter(j => fitJobIds.includes(j.id))
    const selectedProjects = orderedProjects.filter(p => fitProjectIds.includes(p.id))

    // ── Phase 4: generate, then dynamically fill real page space ─────────────
    // Header and education are deterministic profile data — composed here,
    // never generated. The model streams in after them; assembleResume puts
    // the summary and sections in final order.
    setStreaming(true)
    const header = buildHeaderLines(profile)
    const eduLines = buildEducationLines(education)
    // Skills are composed deterministically per JD (relevance-ordered rows) —
    // the model never writes the TECHNICAL SKILLS section.
    const skillLines = buildSkillLines(skills, jdKeywords, retrievalResult)
    const staticPrefix = [header, eduLines].filter(Boolean).map(s => s + '\n').join('')

    const runGeneration = async (selJobs: Job[], selProjects: Project[], bulletBonus: number): Promise<{ final: string; rawBody: string }> => {
      setOutput(staticPrefix)
      let raw = staticPrefix
      let final = ''
      const userMessage = buildUserMessage(
        { jobs: selJobs, education, projects: selProjects, skills },
        profile, jobDescription, jdKeywords, retrievalResult, bulletBonus,
      )
      try {
        const gen = streamCompletion({
          endpoint: settings.llamaEndpoint, model: settings.modelName,
          messages: [{ role: 'user', content: userMessage }],
          system: SYSTEM_PROMPT,
        })
        for await (const chunk of gen) {
          raw += chunk
          setOutput(prev => prev + chunk)
        }
      } finally {
        final = assembleResume(header, eduLines, raw.slice(staticPrefix.length), skillLines)
        setOutput(final)
      }
      // rawBody keeps the model's citations — assembleResume strips them, and
      // the lint pass needs both views.
      return { final, rawBody: raw.slice(staticPrefix.length) }
    }

    // One entry from the ranked pool, mirroring expandToPageFit's preference
    const growSelection = (selJ: Job[], selP: Project[]): { jobs: Job[], projects: Project[] } => {
      if (!retrievalResult) return { jobs: selJ, projects: selP }
      const jPool = retrievalResult.rankedJobs.map(r => jobs.find(j => j.id === r.id)!)
        .filter(Boolean).filter(j => !selJ.some(s => s.id === j.id))
      const pPool = retrievalResult.rankedProjects.map(r => projects.find(p => p.id === r.id)!)
        .filter(Boolean).filter(p => !selP.some(s => s.id === p.id))
      if (pPool.length > 0 && (selP.length < 2 || jPool.length === 0)) {
        return { jobs: selJ, projects: [...selP, pPool[0]] }
      }
      if (jPool.length > 0) return { jobs: [...selJ, jPool[0]], projects: selP }
      return { jobs: selJ, projects: selP }
    }

    try {
      setPhase('generating')
      let selJobs = selectedJobs
      let selProjects = selectedProjects
      let bonusUsed = 0
      let current = await runGeneration(selJobs, selProjects, 0)

      // ── Dynamic fill: measure the REAL compiled page, not the estimate. ────
      // If meaningfully short and more ranked content exists (or caps aren't
      // binding), add the next entry and regenerate once with the measured
      // shortfall folded into the bullet target.
      if (current.final && retrievalResult) {
        const fill = await fetchPageFill(current.final)
        if (fill !== null && fill < 90) {
          // usable page ≈ 45 bullet-heights; convert missing % into bullets
          const deficitBullets = Math.ceil(((97 - fill) / 100) * 45)
          const grown = growSelection(selJobs, selProjects)
          const before = pageFillCount({ jobs: selJobs, education, projects: selProjects, skills }, hasSummary)
          const after = pageFillCount({ jobs: grown.jobs, education, projects: grown.projects, skills }, hasSummary, deficitBullets)
          if (after > before) {
            setPhase('filling')
            selJobs = grown.jobs
            selProjects = grown.projects
            bonusUsed = deficitBullets
            current = await runGeneration(selJobs, selProjects, deficitBullets)
          }
        }
      }

      // ── Reflection: code-verified checks, one targeted auto-fix, scoring ───
      // The critic is deterministic (lint + embeddings); the model only
      // executes fixes it is handed, through the refine edit contract. The
      // repass preserves the draft's bullet count by contract, so page fill
      // is not re-measured. Best-effort: a reflection failure must never
      // cost a good generation.
      if (current.final && jdKeywords && runId === runSeq.current) {
        try {
          setPhase('reflecting')
          const selData: ResumeData = { jobs: selJobs, education, projects: selProjects, skills }
          const allocation = computeBulletAllocation(selData, retrievalResult, hasSummary, bonusUsed)
          const lintBefore = runLint({
            rawBody: current.rawBody, final: current.final, data: selData,
            retrieval: retrievalResult, keywords: jdKeywords, allocation, requireCitations: true,
          })
          let lint = lintBefore
          let fixed: LintIssue[] = []
          let repassRan = false
          let repassFailed = false
          if (lintBefore.hard.length > 0) {
            setPhase('repassing')
            const fullData: ResumeData = { jobs, education, projects, skills }
            const result = await runRefine({
              instructions: buildLintInstruction(lintBefore.hard),
              snapshot: current.final,
              data: fullData,
              keywords: jdKeywords,
              retrieval: retrievalResult,
            })
            repassRan = true
            if (result) {
              current = result
              // Refine legitimately leaves copied bullets uncited, and its
              // prompt numbers sources over the full profile — re-lint with
              // matching expectations. One repass max, structurally.
              lint = runLint({
                rawBody: result.rawBody, final: result.final, data: fullData,
                retrieval: retrievalResult, keywords: jdKeywords, allocation, requireCitations: false,
              })
              fixed = lintBefore.hard.filter(h => !lint.issues.some(i => i.kind === h.kind && i.message === h.message))
            } else {
              repassFailed = true
            }
          }
          const score = await fetchScore(current.final, jdKeywords)
          if (runId === runSeq.current) setReflection({ lint, fixed, score, repassRan, repassFailed })
        } catch {
          // reflection is advisory — keep the generated resume regardless
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to connect to model server.')
      setConnected(false)
    } finally {
      setLoading(false)
      setStreaming(false)
      setPhase('idle')
    }
  }

  // Parameter-driven refine core, shared by the Refine button and the
  // reflection auto-repass. Reads NO component state that generate() sets
  // mid-flight (fresh state isn't re-rendered into this closure yet) —
  // everything arrives as arguments. Returns null on error, snapshot restored.
  async function runRefine(args: {
    instructions: string
    snapshot: string
    data: ResumeData
    keywords: JdKeywords | null
    retrieval: RetrievalResult | null
  }): Promise<{ final: string; rawBody: string } | null> {
    const header = buildHeaderLines(profile)
    const eduLines = buildEducationLines(args.data.education)
    const skillLines = buildSkillLines(args.data.skills, args.keywords, args.retrieval)
    const staticPrefix = [header, eduLines].filter(Boolean).map(s => s + '\n').join('')
    setOutput(staticPrefix)
    let raw = staticPrefix
    try {
      const userMessage = buildRefineMessage(
        args.data, profile, jobDescription, args.snapshot, args.instructions, args.keywords, args.retrieval,
      )
      const gen = streamCompletion({
        endpoint: settings.llamaEndpoint, model: settings.modelName,
        messages: [{ role: 'user', content: userMessage }],
        // Refine must reproduce untouched lines verbatim — a low fixed
        // temperature keeps copying fidelity high
        temperature: 0.3,
        system: REFINE_SYSTEM_PROMPT,
      })
      for await (const chunk of gen) {
        raw += chunk
        setOutput(prev => prev + chunk)
      }
      const rawBody = raw.slice(staticPrefix.length)
      const final = assembleResume(header, eduLines, rawBody, skillLines)
      setOutput(final)
      return { final, rawBody }
    } catch (e) {
      setOutput(args.snapshot)
      setError(e instanceof Error ? e.message : 'Failed to connect to model server.')
      setConnected(false)
      return null
    }
  }

  async function refine() {
    if (!output.trim()) return
    if (!jobDescription.trim()) { setError('Job description required to refine.'); return }
    setError(''); setJustSaved(false); setLoading(true); setStreaming(true)
    setReflection(null) // a manual edit invalidates the panel's verdicts
    try {
      await runRefine({
        instructions: refineInstructions,
        snapshot: output,
        data: { jobs, education, projects, skills },
        keywords,
        retrieval,
      })
    } finally {
      setLoading(false)
      setStreaming(false)
    }
  }

  async function copy() {
    await navigator.clipboard.writeText(output)
    setCopied(true); setTimeout(() => setCopied(false), 2000)
  }

  // Compiles via /api/pdf and reads the real page-fill header; the compile is
  // cached server-side, so the preview's request for the same text is free.
  async function fetchPageFill(content: string): Promise<number | null> {
    try {
      const res = await fetch('/api/pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: content }),
      })
      if (!res.ok) return null
      await res.blob()
      const fill = res.headers.get('X-Appchef-Fill')
      return fill ? parseInt(fill, 10) : null
    } catch {
      return null
    }
  }

  // Semantic requirement coverage of the final text — feeds the reflection
  // panel; non-fatal on any failure.
  async function fetchScore(content: string, kw: JdKeywords): Promise<ScoreResult | null> {
    try {
      const bullets = content.split('\n')
        .filter(l => l.startsWith('[BULLET]') || l.startsWith('[SUMMARY]'))
        .map(l => l.replace(/^\[(?:BULLET|SUMMARY)\]/, '').trim())
        .filter(Boolean)
      const requirements: RequirementInput[] = [
        ...kw.mustHave.map(text => ({ text, required: true })),
        ...kw.niceToHave.map(text => ({ text, required: false })),
      ]
      if (bullets.length === 0 || requirements.length === 0) return null
      const res = await fetch('/api/score', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bullets, requirements }),
      })
      if (!res.ok) return null
      return await res.json() as ScoreResult
    } catch {
      return null
    }
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
                ? phase === 'extracting' ? 'Analyzing…'
                : phase === 'scoring' ? 'Scoring…'
                : phase === 'shortlisting' ? 'Selecting…'
                : phase === 'filling' ? 'Filling…'
                : phase === 'reflecting' ? 'Reviewing…'
                : phase === 'repassing' ? 'Fixing…'
                : 'Generating…'
                : 'Generate Resume'}
              {!loading && <ChevronRight size={13} />}
            </Button>
            {profileEmpty && <p className="text-xs text-amber-400">Add your experience first.</p>}
            {error && <p className="text-xs text-red-400">{error}</p>}
            {loading && phase !== 'generating' && phase !== 'idle' && (
              <p className="text-xs text-zinc-500 flex items-center gap-1.5">
                <span className="inline-block w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />
                {phase === 'extracting' ? 'Reading job requirements…'
                  : phase === 'scoring' ? 'Scoring your experience against the posting…'
                  : phase === 'filling' ? 'Page has room — adding more of your experience…'
                  : phase === 'reflecting' ? 'Checking the draft against the job requirements…'
                  : phase === 'repassing' ? 'Auto-fixing flagged issues…'
                  : 'Choosing the strongest entries…'}
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
              {coverage && coverage.items.length > 0 && (
                <div className="mt-3">
                  <div className="flex items-baseline gap-2 mb-1.5">
                    <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Keyword Coverage</p>
                    {coverage.mustHavePct !== null && (
                      <span className={`text-xs font-medium ${
                        coverage.mustHavePct >= 75 ? 'text-emerald-400' :
                        coverage.mustHavePct >= 50 ? 'text-amber-400' : 'text-red-400'
                      }`}>
                        {coverage.mustHaveCovered}/{coverage.mustHaveTotal} must-haves ({coverage.mustHavePct}%)
                      </span>
                    )}
                    {retrieval && !retrieval.embeddingsUsed && (
                      <span className="text-xs text-zinc-600">keyword matching only — semantic model still loading</span>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {coverage.items.map(item => {
                      const full = item.inSkills && item.inBullets
                      const partial = !full && (item.inSkills || item.inBullets)
                      const evidence = retrieval?.requirements.find(
                        r => r.text.toLowerCase() === item.keyword.toLowerCase())
                      const style = full    ? 'text-emerald-400 border-emerald-500/30 bg-emerald-500/5'
                                  : partial ? 'text-amber-400 border-amber-500/30 bg-amber-500/5'
                                  : item.required ? 'text-zinc-500 border-zinc-700 bg-zinc-900 line-through'
                                  : 'text-zinc-600 border-zinc-800 bg-zinc-900/50 line-through'
                      const where = full ? 'In skills + evidence bullet'
                                  : item.inSkills ? 'In skills only — no evidence bullet'
                                  : item.inBullets ? 'In a bullet — not in skills'
                                  : evidence?.covered === false
                                    ? 'No supporting experience found in your profile — add real experience there'
                                  : evidence?.covered
                                    ? 'Your profile has evidence for this but it did not make the resume — try Refine'
                                  : 'Not covered — your profile may lack support for this'
                      return (
                        <span key={item.keyword}
                          title={`${where}${item.required ? '' : ' (nice-to-have)'}`}
                          className={`px-2 py-0.5 rounded-full text-xs border cursor-default ${style}`}>
                          {item.keyword}
                        </span>
                      )
                    })}
                  </div>
                  <p className="text-xs text-zinc-700 mt-1.5">
                    ~75–80% of must-haves is the sweet spot. Missing keywords usually mean the profile lacks
                    support — add real experience in the profile sections rather than forcing them in.
                  </p>
                </div>
              )}
              {reflection && !streaming && <ReflectionPanel reflection={reflection} />}
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
