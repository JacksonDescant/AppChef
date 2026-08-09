# ATS Optimization for Tech Resumes — Research Findings

*Researched 2026-08-05 via four parallel deep-dives (ATS mechanics, keyword strategy,
formatting/parsing, tailoring & recruiter behavior) across ~60 fetched sources: ATS vendor
docs, recruiter surveys, large-N application datasets, community standards
(r/EngineeringResumes, Pragmatic Engineer), and academic studies. Claims are tagged by
evidence strength where it matters. Written to guide AppChef's tailoring pipeline.*

---

## 1. The mental model (read this first)

**ATS do not auto-reject resumes.** The famous "75% of resumes are rejected by a robot
before a human sees them" statistic traces to a 2012 sales pitch by Preptel, a
resume-optimization vendor that went out of business in 2013 without ever publishing a
methodology ([theinterviewguys.com](https://blog.theinterviewguys.com/ats-resume-rejection-myth/),
[jobcannon.io](https://jobcannon.io/research/stats/ats-myth-preptel)). In a structured 2025
survey of 25 recruiters across Workday, iCIMS, Greenhouse, Lever, and others, **92% said
their ATS does not auto-reject** on content, formatting, or match scores; recruiters
estimate 90–95% of applications get human review
([enhancv.com](https://enhancv.com/blog/does-ats-reject-resumes/)). Greenhouse's own
candidate blog: applications land in a queue and are reviewed by people; "AI doesn't score
or rank applications, nor does it make any decisions."

What *actually* filters candidates, in order of brutality:

1. **Knockout questions on the application form** — work authorization, sponsorship,
   location, licenses, sometimes salary/experience thresholds. 100% of surveyed recruiters
   use them; a disqualifying answer removes you instantly with no human involved. These
   read the *form*, not the resume.
2. **Recruiter keyword search over the candidate database.** At 250–2,000+ applications
   per tech posting, recruiters don't scroll — they search titles, skills, and tools.
   A resume missing the exact (or stemmed) terms never surfaces. This is the real
   mechanism behind "silently filtered," and it's why keyword matching matters.
3. **Parsing failures.** A resume the parser scrambles isn't rejected — it becomes
   *unsearchable* and shows a blank profile at every review step. Same outcome, no robot
   villain.
4. **AI ranking layers (2024–2026)** that reorder human attention: Workday HiredScore
   grades applicants A–D against the job req and recruiters screen the A's first; iCIMS
   "Role Fit," Greenhouse Talent Matching, and Ashby's criteria-based AI review are
   similar. None of these reject — they decide **who the human looks at first**, which at
   volume is nearly the same power.
5. **The human skim.** Ladders' eye-tracking study: ~7.4 seconds of rejection-triage,
   ~80% of gaze on six fields — name, current title + company, previous title + company,
   dates, education. Survivors get a real read (~1.5–4 minutes).

So "beating the ATS" is a misframe. The goal is: **survive parsing → match the searches
recruiters actually run → win a 7-second human skim → hold up under a real read.**
Everything below serves one of those four steps.

## 2. Keyword strategy — match without stuffing

### Which keywords matter

Priority order, from recruiter-search behavior (Jobscan's Feb–Mar 2025 survey of 384
recruiters: 76.4% filter by **skills**, 59.7% education, 55.3% **job title**, 50.6%
certifications):

1. **Job titles** (the requisition's title and close variants)
2. **Hard skills / tools / platforms** named in requirements (languages, frameworks,
   cloud, databases)
3. **Certifications and degrees**, spelled out
4. **Methodologies and domain terms** (CI/CD, microservices, HIPAA, B2B SaaS)
5. Repeated terms — anything the JD says 2–3 times is a core keyword; requirements-section
   terms outrank company-blurb terms. Treat "preferred" qualifications as required.

**Ignore filler**: "team player," "fast-paced environment," "detail-oriented,"
"results-driven." Soft skills don't register as searchable keywords; evidence them in
bullets instead ("led a five-person team to ship X early" beats "leadership").

### Exact match vs. semantic

Both worlds coexist in 2026 and you must satisfy both:

- **Exact strings still gate**: recruiter database search is literal-or-stemmed
  (Lever stems "collaborating"→"collaborated" but cannot expand acronyms — "Bachelor of
  Science" won't match "B.S."), and even semantic pipelines keep **hard filters** for
  certifications, named platforms, languages, and compliance standards. "'CRM software'
  may score near Salesforce semantically and still fail a hard filter."
- **Semantic layers credit meaning**: HiredScore infers skills not explicitly stated;
  LinkedIn AI-Assisted Search matches qualifications "beyond explicit resume mentions."
  These reward clear factual writing in the JD's vocabulary — and detect stuffing.

Practical rules:

- **Acronyms: use both forms** on first mention — "Amazon Web Services (AWS)" — because
  recruiters search both ways and "if your resume only has one version, you're invisible
  to half the searches." Near-universal consensus across sources.
- **Mirror the JD's exact phrasing** for skills the candidate genuinely has ("React.js"
  if the JD says React.js), and keep multi-word phrases intact ("cross-functional
  collaboration"), since phrases are matched as units.
- Don't copy-paste JD sentences wholesale — both semantic screeners and recruiters flag
  verbatim mirroring. Write original sentences using the JD's vocabulary.

### Where keywords go

Consensus placement: a **dedicated skills section** (plain text, top half of page for the
searchable inventory) **plus** the same high-priority terms **in context inside
accomplishment bullets**. Context-carrying mentions beat list-only mentions with both
algorithms and humans — a tech recruiter on giant skill blocks: "you're not an expert in
all of those." The bullet formula that carries a keyword naturally:
**action verb + JD keyword/tool + quantified result.**

The **job title line is disproportionately powerful**: Jobscan's 2.5M-application dataset
found resumes whose title matched the target title interviewed at **10.6x** the rate
(observational, confounded with fit — but title is also what 17/20 recruiters look at
first). Align honestly: "Market-Standard Title (Internal Title)" is the accepted pattern;
never inflate seniority.

### How much is too much (the anti-stuffing line)

- **Coverage beats frequency.** Address every major JD requirement **once, with proof**.
  Under embedding-based scoring, second and third copies of a phrase add "negligible
  signal"; they displace metrics that actually score. Rough ceiling: a core term appears
  1–3 times total (title/skills + one or two bullets), never more.
- Tools' published targets: Jobscan ~80% ("75% works"), Teal 80%+, ResyMatch 75+,
  Careerflow 55–60% — **note these numbers have no published empirical validation and are
  not comparable across tools**. Treat ~75–80% coverage of *must-have hard skills* as the
  directional target and stop there; chasing 100% measurably degrades readability and
  reads as stuffing.
- **White-text / hidden keywords reliably backfire**: parsers normalize to plain text, so
  hidden keywords appear *in the exact view recruiters read*; consequences include instant
  rejection and persistent blacklisting in that company's ATS. AI-era screeners flag
  hidden text as a manipulation signal.
- **Never claim skills the candidate doesn't have**: 77–81% of resume lies get caught,
  and hiring managers' loudest 2025 complaint is AI-tailored resumes mirroring JDs the
  candidate can't back up. Every mirrored keyword must be interview-defensible.

## 3. Formatting & parsing

Modern parsers (Greenhouse, Lever, Ashby, Workday) handle **text-based PDF and .docx
equally well** — "always send .docx" is Taleo-era folklore. Greenhouse's candidate docs
literally say "Upload a PDF for best results." What still breaks parsing:

| Still breaks parsers | Folklore (fine on modern ATS) |
|---|---|
| Image/scanned PDFs, design-tool exports (Canva/Figma) with fragmented text layers | Text-based PDF vs docx choice |
| Tables and text boxes (contents skipped or scrambled) | Bold, italics, color |
| Contact info in the Word/PDF **header/footer layer** (parsers read body only) | Standard bullets (•, -) |
| Multi-column layouts on the long tail (Workday configs, legacy) — top parsers cope, but you can't know the target, so single column is free insurance | Hyperlinks (but see below) |
| Creative section headings ("My Journey") → misclassification | Standard fonts at ≥10.5pt |
| Unparseable dates (seasons, "'21", "Q1 2022") — these entries drop out of computed years-of-experience | |

Tech-community standards (r/EngineeringResumes wiki, Tech Interview Handbook, Pragmatic
Engineer) converge on: single column; exact headings ("Work Experience," "Education,"
"Skills," "Projects"); "Mon YYYY – Mon YYYY" or MM/YYYY dates with "Present"; 1 page under
~10 years of experience; experience first, education last (reversed for new grads);
skills grouped by category in 2–3 comma-separated lines; **bare plain-text URLs**
(`github.com/name`, not anchor text — parsers keep visible text, not link targets); GPA
only if ≥3.75; no photos, icons, skill bars, or references section.

**Testing parseability**: the plaintext copy-paste test (select-all → paste into a plain
editor; check order, contact info, no � characters), and highest-fidelity: apply through a
real Workday posting and inspect what the "My Experience" pre-fill extracted. Treat
commercial "ATS score" numbers as directional lint — the same resume scores 65–100 across
scanners, and those scores are invented by the checker, not the employer's system.

**LaTeX-specific (verified locally for AppChef)**: LaTeX PDFs parse well *if* the text
layer maps glyphs to Unicode. Jake's Resume upstream uses `\pdfgentounicode=1` for exactly
this; under tectonic/XeTeX that primitive doesn't exist, and the legacy Computer Modern
fonts emitted ToUnicode CMaps with ligature presentation forms — pypdf extracted
"Efficient" as "Eﬀicient" (U+FB00), which breaks keyword search in any parser that doesn't
Unicode-normalize. **Fixed 2026-08-05** in `server/latex.ts` (fontspec + OpenType Latin
Modern + `Ligatures=NoCommon`); `npm run check:pdf-text` guards the regression.

## 4. Tailoring for the humans

- **The 7-second triage concentrates on the top of page one**: name, titles, companies,
  dates. The top third is the "hot zone"; the bottom-right is "essentially invisible."
  Put the strongest, most JD-relevant material where the eyes go: most recent role's top
  bullets, and the skills section's first line.
- **Tailoring = reorder and emphasize, not rewrite.** Per application, change: the
  headline/summary (if any), skills order (must-haves first), which entries appear, and
  the top 2–3 bullets per role. Keep fixed: history, employer titles, dates, facts.
- **Bullets: Google's XYZ formula** — "Accomplished X as measured by Y, by doing Z" —
  with metrics recruiters find credible (%, $, latency, volume, team size). Resumes with
  hard metrics see up to ~40% higher interview odds; 34% of hiring managers reject
  resumes without measurable achievements. Mix in plain responsibility statements so the
  reader knows what the job actually was (ex-Google recruiter guidance).
- **Objectives are dead; summaries are situational.** Recruiters skip objective
  statements. A tight 2–3 line role-tailored summary earns its top-third space for
  seniors and especially **career changers** (it translates the old career into the new
  vocabulary); for most engineers with a clear trajectory, the community default is no
  summary.
- **AI-era differentiation (2024–2026)**: 67% of HR leaders say AI-generated applications
  are slowing hiring; ~half to 62% of hiring managers reject obviously-AI resumes lacking
  personalization; the tell is form-letter sameness ("drove, owned, spearheaded,
  championed" on every line). Specific, human-voiced, verifiable content is now a stated
  differentiator — use AI as analyst/editor, keep the candidate's real facts and voice.

### Does tailoring pay?

All large-N numbers are platform telemetry (observational, plausibly confounded — no
peer-reviewed causal study exists), but they point the same direction:

| Dataset | Finding |
|---|---|
| Huntr, 1.39M applications (2025) | Tailored resumes: 5.75% vs 2.68% application→interview (+115%) |
| Wellfound, 500K+ applications | Tailored: ~2.1x interview conversion; 10–20 quality apps/week beat 100+ spray |
| Jobscan, 2.5M applications | Title match → 10.6x interview rate |
| Meta-analysis, 27 studies / 10M+ apps | Baseline ~42 applications per interview; quality beats volume (30.9% vs 20.4% offer rate) |

Context that keeps this honest: referrals convert ~18x better than cold applications, and
hiring managers report ≤10% of inbound applicants meet basic requirements — tailoring
maximizes the inbound channel but doesn't replace networks.

## 5. What this means for AppChef

### Already right (keep)

- **Single-column Jake's Resume LaTeX, standard headings, one page** — matches every
  community standard; LaTeX text-layer output parses cleanly (post-ligature-fix).
- **Grounding citations (`[S#]`) + "never fabricate" rules** — directly addresses the #1
  hiring-manager complaint about AI resumes and the interview-collapse risk.
- **Selection stage dropping irrelevant entries** — matches "omit rather than dilute."
- **Reverse-chronological order enforced** — recruiters anchor on recency; relevance
  correctly expressed through bullet count, not reordering history.
- **"Mirror keywords naturally and truthfully" (rule 5), skills prioritized to the JD,
  quantified bullets, MM/YYYY + Present dates, plain-text contact URLs.**

### Prompt-level improvements (highest value, cheap) — *implemented 2026-08-08, along with the coverage meter from the product list below*

> **Deliberate deviation (owner's call, 2026-08-08):** contact URLs render as labeled
> hyperlinks ("GitHub", "LinkedIn", "Portfolio") instead of the bare plain-text URLs
> this research recommends. Parsers that index only visible text will see the label but
> not the URL target (it survives only as a PDF link annotation). Email remains visible
> text. Additionally, the name/contact header AND the education section are now composed
> deterministically from the profile rather than LLM-generated (the model is forbidden
> from emitting them and any echoes are stripped), recency weighting is explicit in
> selection and bullet allocation (an older role never gets more bullets than a newer
> one), and entry layout now matches upstream Jake's Resume exactly: jobs render
> Title | Dates over Company | Location (title-first — also the recruiter's #1 fixation
> point), education renders Institution | Location over Degree | Dates with GPA folded
> into the degree text, and project headings carry an italic technology list.

1. **Add an explicit JD keyword-extraction step.** Before generation (either in the
   selection call or a new cheap call), extract: target job title; must-have hard skills
   (weighted by requirements-section placement and repetition); nice-to-haves; certs.
   Feed the list into the generation prompt as `PRIORITY KEYWORDS` with the instruction:
   cover each keyword the candidate can truthfully claim **once in skills and once in a
   bullet with evidence**; skip keywords the profile can't support. This converts rule 5
   from vibes into coverage, and enables a coverage report in the UI.
2. **Acronym duality rule**: first mention of any acronym the JD uses → "Full Name
   (ACRONYM)" (skills section is the natural home); thereafter whichever form the JD uses.
3. **Coverage-not-frequency guardrail**: "No keyword more than twice across the resume;
   address each JD requirement once with proof" — the researched anti-stuffing line.
4. **Top-of-page weighting**: instruct that the most recent role's first bullet carries
   the JD's single most important requirement (the 7-second triage zone), and each
   entry's bullets are ordered by relevance to this JD (order *within* an entry is free;
   entry order stays chronological).
5. **Anti-AI-sameness**: vary action verbs; ban the cliché set ("spearheaded," "drove,"
   "championed," "leveraged") from appearing more than once each; prefer concrete verbs
   from the candidate's own source bullets.
6. **Title alignment support**: profile field for a market-standard alias per job, rendered
   as "Standard Title (Internal Title)" — the honest version of the single biggest
   measured lever. (Never auto-generate the alias; user-entered.)

### Product-level ideas (larger)

- **Match/coverage meter**: show must-have keyword coverage (target ~75–80%, warn above
  ~90% as over-optimization risk) with per-keyword status: in skills / in bullet with
  evidence / missing from profile. "Missing from profile" doubles as a prompt for the user
  to add real experience — not for the LLM to invent it.
- **Plaintext preview tab**: render the resume's extracted text (what a parser sees) —
  builds trust and catches regressions the way the research recommends candidates test.
- **Summary section (conditional)**: support an optional 2–3 line summary only for
  career-changer or senior profiles; default off for typical engineer trajectories.
- **Knockout-question awareness**: when a JD names hard requirements (work authorization,
  location, clearance), surface them to the user — no resume optimization survives a
  failed knockout, and pretending otherwise wastes applications.

## 6. Source quality notes

Strongest sources used: Greenhouse/Ashby/Workday vendor docs; Jobscan State of the Job
Search 2025 (384-recruiter survey + 2.5M applications); Enhancv 25-recruiter survey
(2025); Robert Half survey of 2,000+ hiring managers (2026); Harvard Business School
"Hidden Workers" (2021, 8,000+ workers / 2,250+ executives); Ladders eye-tracking (2018,
n=30, pre-AI-era — triage-stage only); r/EngineeringResumes wiki; Gergely Orosz's *The
Tech Resume Inside Out*; Pragmatic Engineer 2025 hiring-manager survey; Google XYZ formula
(Laszlo Bock). Interview-lift numbers (Huntr, Wellfound, Jobscan) are large-N but
vendor-published and uncontrolled. Match-rate thresholds (75–80%) are tool conventions
with no published validation. "ATS score" numbers from consumer checkers are invented by
the checker. The HBS finding that 88% of executives admit qualified candidates get vetted
out refers to human-configured screens (employment-gap rules, degree requirements), not
secret formatting algorithms — the exclusion is real, the robot villain isn't.
