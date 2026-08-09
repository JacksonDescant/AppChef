// ATS text-extraction regression check.
//
// Compiles a sample resume through the real pipeline and verifies the PDF's
// text layer maps ligature-prone words ("efficient", "office", "traffic") to
// plain ASCII. The legacy Computer Modern setup emitted ToUnicode CMaps that
// mapped ligature glyphs to Unicode presentation forms (U+FB00–U+FB06), so
// extraction produced "eﬀicient" and ATS keyword search missed the word —
// fixed by the fontspec/Ligatures=NoCommon block in server/latex.ts.
//
// The check inspects the embedded ToUnicode CMaps directly instead of running
// a text extractor: extractor spacing heuristics differ (pypdf inserts a bogus
// space in kerned pairs like "AWS"), while the CMap is the ground truth every
// extractor reads from. Cross-validated against pypdf and pdfminer.six.
//
// Usage:
//   npm run check:pdf-text             compile the sample and check it
//   npx tsx scripts/check-pdf-text.ts <file.pdf>   check an existing PDF
import { readFile } from 'node:fs/promises'
import { inflateSync } from 'node:zlib'
import { compileOnePageResume } from '../server/tectonic'

const SAMPLE = [
  '[NAME]Extraction Check',
  '[CONTACT]Austin, TX | check@example.com | github.com/example',
  '[SUMMARY]Efficient officer offering difficult traffic efficiency, verifying the summary path stays extractable.',
  '[SECTION]EDUCATION',
  '[EDU_INST]University of Efficiency\tAustin, TX',
  '[EDU_DEG]B.S. in Computer Science (GPA: 3.90/4.0)\tAug 2018 – May 2022',
  '[SECTION]WORK EXPERIENCE',
  '[JOB_CO]Trafficly\tAustin, TX',
  '[JOB_ROLE]Efficiency Officer (Office Effluent Analyst)\tJun 2022 – Present',
  '[BULLET]Built efficient CI/CD workflows in the office, cutting difficult traffic-shaping rollouts',
  '[BULLET]Led an efficiency initiative across five offices with affluent traffic profiling',
  '[SECTION]PROJECTS',
  '[PROJECT]TrafficKit | Python, Kafka\tJan 2024 – Mar 2024',
  '[BULLET]Shipped an efficient offline toolkit for difficult traffic studies',
  '[BULLET]Profiled office networks across affluent regions',
  '[SECTION]TECHNICAL SKILLS',
  '[SKILL]Cloud: Amazon Web Services (AWS), Cloudflare, Kafka',
].join('\n')

interface ScanResult { ligatureCodeUnits: string[]; toUnicodeStreams: number }

// Finds every FlateDecode stream that is a ToUnicode CMap and collects any
// destination UTF-16 code units in the Unicode presentation-forms ligature
// range (U+FB00 ﬀ … U+FB06 ﬆ).
function scanToUnicode(pdf: Buffer): ScanResult {
  const raw = pdf.toString('latin1')
  const hits = new Set<string>()
  let toUnicodeStreams = 0

  for (const m of raw.matchAll(/stream\r?\n([\s\S]*?)endstream/g)) {
    let text: string
    try {
      text = inflateSync(Buffer.from(m[1], 'latin1')).toString('latin1')
    } catch {
      continue // not a Flate stream (or not compressed) — not a ToUnicode CMap
    }
    if (!/beginbf(char|range)/.test(text)) continue
    toUnicodeStreams++

    const blocks = text.match(/beginbfchar[\s\S]*?endbfchar|beginbfrange[\s\S]*?endbfrange/g) ?? []
    for (const block of blocks) {
      // bfchar lines: <src> <dst…>; bfrange lines: <lo> <hi> <dst…> — only
      // destination groups hold Unicode code units.
      const srcGroups = block.startsWith('beginbfrange') ? 2 : 1
      for (const line of block.split('\n')) {
        const groups = [...line.matchAll(/<([0-9A-Fa-f]+)>/g)].map(g => g[1])
        for (const dst of groups.slice(srcGroups)) {
          for (let i = 0; i + 4 <= dst.length; i += 4) {
            const cu = dst.slice(i, i + 4).toUpperCase()
            if (cu >= 'FB00' && cu <= 'FB06') hits.add(cu)
          }
        }
      }
    }
  }
  return { ligatureCodeUnits: [...hits].sort(), toUnicodeStreams }
}

async function main(): Promise<void> {
  const pdfArg = process.argv[2]
  const pdf = pdfArg ? await readFile(pdfArg) : await compileOnePageResume(SAMPLE)
  const label = pdfArg ?? 'sample resume'

  const { ligatureCodeUnits, toUnicodeStreams } = scanToUnicode(pdf)

  if (toUnicodeStreams === 0) {
    console.error(`FAIL ${label}: no ToUnicode CMaps found — PDF text is not reliably extractable`)
    process.exit(1)
  }
  if (ligatureCodeUnits.length > 0) {
    console.error(
      `FAIL ${label}: ToUnicode maps glyphs to ligature presentation forms ` +
      `(U+${ligatureCodeUnits.join(', U+')}) — words like "efficient" will not ` +
      `extract as plain ASCII for ATS parsers`,
    )
    process.exit(1)
  }
  console.log(`OK ${label}: ${toUnicodeStreams} ToUnicode CMap(s), no ligature presentation forms`)
}

main().catch((e: unknown) => {
  console.error(e)
  process.exit(1)
})
