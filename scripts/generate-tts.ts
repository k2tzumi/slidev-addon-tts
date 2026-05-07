#!/usr/bin/env tsx
import { readFileSync, writeFileSync, mkdirSync, existsSync, unlinkSync } from 'fs'
import { resolve, join } from 'path'
import { execFileSync, execSync } from 'child_process'
import { tmpdir } from 'os'
import dotenv from 'dotenv'
import { buildSsml } from '../lib/ssml-builder.js'
import type { SlideNote } from '../lib/ssml-builder.js'
import type { TtsManifest, TtsSlideEntry } from '../lib/manifest.js'
import type { CloudTtsResponse } from '../lib/cloud-tts-client.js'

dotenv.config({ path: resolve(process.cwd(), '.env.local') })
dotenv.config({ path: resolve(process.cwd(), '.env') })

const slidesArgIdx = process.argv.findIndex(a => a === '--slides')
const slidesArg    = slidesArgIdx !== -1 ? process.argv[slidesArgIdx + 1] : undefined

const SLIDES_FILE = slidesArg
  ? resolve(process.cwd(), slidesArg)
  : resolve(process.cwd(), process.env.SLIDES_FILE ?? 'slides.md')
const OUTPUT_DIR  = resolve(process.cwd(), 'public/tts')
const API_KEY     = process.env.VITE_CLOUD_TTS_API_KEY
const FORCE       = process.argv.includes('--force')

// -------- frontmatter ttsConfig extraction --------
function parseFrontmatterTtsConfig(filePath: string): { voiceName?: string; languageCode?: string; clickBreakTime?: string } {
  try {
    const md = readFileSync(filePath, 'utf-8')
    const parts = md.split(/^---$/m)
    if (parts.length < 2) return {}
    const fm = parts[1]
    const block = fm.match(/^ttsConfig:\s*\n((?:[ \t]+.+\n?)*)/m)?.[1] ?? ''
    const get = (key: string) => block.match(new RegExp(`^\\s+${key}:\\s*["']?([^"'\\n]+)["']?`, 'm'))?.[1]?.trim()
    return { voiceName: get('voiceName'), languageCode: get('languageCode'), clickBreakTime: get('clickBreakTime') }
  } catch {
    return {}
  }
}

const fmConfig   = parseFrontmatterTtsConfig(SLIDES_FILE)
const VOICE      = process.env.TTS_VOICE      ?? fmConfig.voiceName      ?? 'ja-JP-Neural2-B'
const LANG       = process.env.TTS_LANG       ?? fmConfig.languageCode   ?? 'ja-JP'
const BREAK_TIME = process.env.TTS_BREAK_TIME ?? fmConfig.clickBreakTime ?? '500ms'

if (!API_KEY) { console.error('❌ VITE_CLOUD_TTS_API_KEY is not set (define it in .env.local or .env)'); process.exit(1) }

// -------- ffmpeg detection --------
function isFfmpegAvailable(): boolean {
  try { execSync('ffmpeg -version', { stdio: 'ignore' }); return true } catch { return false }
}

// -------- WAV → OGG Opus conversion --------
function wavToOggOpus(wavBuffer: Buffer, outPath: string): void {
  const tmp = join(tmpdir(), `tts-${Date.now()}.wav`)
  writeFileSync(tmp, wavBuffer)
  try {
    execFileSync('ffmpeg', [
      '-i', tmp,
      '-c:a', 'libopus', '-b:a', '24k', '-vbr', 'on', '-application', 'voip',
      '-y', outPath,
    ], { stdio: 'ignore' })
  } finally {
    try { unlinkSync(tmp) } catch {}
  }
}

// -------- slides.md parsing --------

/**
 * Determine whether a block is a slide-specific frontmatter (layout:, transition:, etc.).
 * In Slidev, YAML blocks delimited by --- serve both as slide boundaries and slide-specific FM,
 * so FM blocks must be excluded from the page count.
 *
 * Heuristic: treat the block as FM when it contains no HTML comments, Markdown headings,
 * code fences, or HTML tags, and every non-empty line looks like a YAML key: value pair.
 */
function isSlideSpecificFrontmatter(block: string): boolean {
  const trimmed = block.trim()
  if (!trimmed) return false
  if (trimmed.includes('<!--')) return false     // contains HTML comment (speaker note) → slide body
  if (/^#{1,6}\s/m.test(trimmed)) return false   // contains Markdown heading → slide body
  if (/^```/m.test(trimmed)) return false         // contains code fence → slide body
  if (/^<[a-zA-Z]/m.test(trimmed)) return false  // contains HTML/Vue component → slide body
  if (/^\|/m.test(trimmed)) return false          // contains table → slide body

  // treat as FM if every non-empty line matches YAML key: value
  const lines = trimmed.split('\n').map(l => l.trim()).filter(Boolean)
  return lines.length > 0 && lines.every(l => /^[\w-]+\s*:/.test(l) || /^\s/.test(l))
}

function extractLastComment(block: string): string {
  // strip fenced code blocks before searching for HTML comments
  const withoutCodeBlocks = block.replace(/```[\s\S]*?```/g, '')
  const matches = [...withoutCodeBlocks.matchAll(/<!--([\s\S]*?)-->/g)]
  return matches.length > 0 ? matches[matches.length - 1][1].trim() : ''
}

function parseSlides(md: string): SlideNote[] {
  const parts = md.split(/^---$/m)
  const result: SlideNote[] = []
  let page = 0

  // parts[0] = before global FM (empty), parts[1] = global FM, parts[2]+ = slides
  for (let i = 2; i < parts.length; i++) {
    const block = parts[i]

    // skip slide-specific FM blocks (do not count as a page)
    if (isSlideSpecificFrontmatter(block)) continue

    page++
    const raw = extractLastComment(block)
    if (!raw) continue  // no notes — skip (page is already counted)

    const sections = raw.split(/\[click\]/i).map(s => s.trim()).filter(Boolean)
    if (sections.length > 0) result.push({ page, sections })
  }

  return result
}

// -------- batch splitting by byte size --------
// Returns SlideNote[][] (not SsmlBuildResult[]) so buildBatchSlideEntries can access per-slide sections.
function splitIntoBatches(slides: SlideNote[], maxBytes = 4500): SlideNote[][] {
  const batches: SlideNote[][] = []
  let current: SlideNote[] = []
  let currentBytes = 0

  for (const slide of slides) {
    const { ssml } = buildSsml([slide], BREAK_TIME)
    const bytes = Buffer.byteLength(ssml, 'utf-8')
    if (current.length > 0 && currentBytes + bytes > maxBytes) {
      batches.push(current)
      current = []
      currentBytes = 0
    }
    current.push(slide)
    currentBytes += bytes
  }
  if (current.length > 0) batches.push(current)
  return batches
}

// -------- Cloud TTS API call --------
const MAX_RETRIES = 5
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

async function callCloudTTS(ssml: string): Promise<CloudTtsResponse> {
  if (!API_KEY) throw new Error('VITE_CLOUD_TTS_API_KEY is not set')
  const url = `https://texttospeech.googleapis.com/v1beta1/text:synthesize?key=${API_KEY}`

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        input: { ssml },
        voice: { languageCode: LANG, name: VOICE },
        audioConfig: { audioEncoding: 'LINEAR16', sampleRateHertz: 24000 },
        enableTimePointing: ['SSML_MARK'],
      }),
    })

    if (res.ok) {
      return res.json() as Promise<CloudTtsResponse>
    }

    const body = await res.text()

    if (res.status === 429 && attempt < MAX_RETRIES) {
      const retryMs = parseRetryDelay(body) ?? Math.min(60000 * attempt, 300000)
      const retrySec = Math.ceil(retryMs / 1000)
      console.warn(`  ⏳ rate limit (429). Retrying in ${retrySec}s... (${attempt}/${MAX_RETRIES})`)
      await sleep(retryMs + 1000)
      continue
    }

    throw new Error(`Cloud TTS API error: ${res.status} ${body}`)
  }

  throw new Error(`Cloud TTS API: exceeded MAX_RETRIES (${MAX_RETRIES})`)
}

function parseRetryDelay(errorBody: string): number | null {
  try {
    const json = JSON.parse(errorBody)
    const retryInfo = json?.error?.details?.find(
      (d: { '@type': string; retryDelay?: string }) => d['@type'] === 'type.googleapis.com/google.rpc.RetryInfo'
    )
    if (retryInfo?.retryDelay) {
      return Math.ceil(parseFloat(retryInfo.retryDelay)) * 1000
    }
  } catch {}
  return null
}

// -------- timepoints → manifest slide entry conversion --------
// pre-calculate start/end from all timepoints in the batch and write to manifest.
// at load time, simply read slides[page].clicks[click].start/.end directly.
function buildBatchSlideEntries(
  batchSlides: SlideNote[],
  timepoints: CloudTtsResponse['timepoints'],
  audioFile: string,
): Record<string, TtsSlideEntry> {
  const timemap: Record<string, number> = {}
  for (const { markName, timeSeconds } of timepoints) {
    timemap[markName] = timeSeconds
  }

  // sort all timepoints in the batch ascending for end-time calculation
  const allStarts = Object.values(timemap).sort((a, b) => a - b)
  const nextTime = (start: number): number | null => {
    const idx = allStarts.indexOf(start)
    return idx >= 0 ? (allStarts[idx + 1] ?? null) : null
  }

  const entries: Record<string, TtsSlideEntry> = {}
  for (const { page, sections } of batchSlides) {
    const clicks: TtsSlideEntry['clicks'] = {}

    const click0Start = timemap[`slide_${page}`] ?? 0
    clicks['0'] = { start: click0Start, end: nextTime(click0Start) }

    for (let i = 1; i < sections.length; i++) {
      const start = timemap[`slide_${page}_click_${i}`]
      if (start !== undefined) {
        clicks[String(i)] = { start, end: nextTime(start) }
      }
    }

    entries[String(page)] = { file: audioFile, clicks }
  }

  return entries  // { "8": { file: "batch-1.ogg", clicks: { "0": {start,end}, ... } }, ... }
}

// -------- load existing manifest.json (preserved when skipping) --------
function loadExistingManifest(): TtsManifest {
  const manifestPath = resolve(OUTPUT_DIR, 'manifest.json')
  if (!existsSync(manifestPath)) return { version: 2, slides: {} }
  try {
    return JSON.parse(readFileSync(manifestPath, 'utf-8')) as TtsManifest
  } catch {
    return { version: 2, slides: {} }
  }
}

// -------- main --------
async function main(): Promise<void> {
  const useFfmpeg = isFfmpegAvailable()
  const ext = useFfmpeg ? 'ogg' : 'wav'
  console.log(`ffmpeg: ${useFfmpeg ? '✅ OGG Opus output' : '⚠️ WAV fallback'}`)
  console.log(`voice:  ${VOICE} / lang: ${LANG} / breakTime: ${BREAK_TIME}${fmConfig.voiceName ? ' (from frontmatter)' : ''}`)

  mkdirSync(OUTPUT_DIR, { recursive: true })

  const slides = parseSlides(readFileSync(SLIDES_FILE, 'utf-8'))
  const batches = splitIntoBatches(slides)

  console.log(`\nSlides: ${slides.length}, batches: ${batches.length}`)

  const existingManifest = loadExistingManifest()
  const allSlides: Record<string, TtsSlideEntry> = {}

  for (const [i, batchSlides] of batches.entries()) {
    const audioFileName = `batch-${i + 1}.${ext}`
    const outPath = resolve(OUTPUT_DIR, audioFileName)
    const pageRange = `slide ${batchSlides[0].page}–${batchSlides.at(-1)!.page}`

    if (existsSync(outPath) && !FORCE) {
      console.log(`  ⏭ skip:  batch ${i + 1} (${pageRange})`)
      // restore entries for these slides from the existing manifest
      for (const { page } of batchSlides) {
        const existing = existingManifest.slides?.[String(page)]
        if (existing) allSlides[String(page)] = existing
      }
      continue
    }

    console.log(`  🎙 gen:   batch ${i + 1} (${pageRange})`)

    const { ssml } = buildSsml(batchSlides, BREAK_TIME)
    const { audioContent, timepoints } = await callCloudTTS(ssml)

    const wavBuffer = Buffer.from(audioContent, 'base64')

    if (useFfmpeg) {
      wavToOggOpus(wavBuffer, outPath)
    } else {
      writeFileSync(outPath, wavBuffer)
    }

    const entries = buildBatchSlideEntries(batchSlides, timepoints, audioFileName)
    Object.assign(allSlides, entries)

    console.log(`     → ${audioFileName} (${timepoints.length} marks)`)

    // rate limit mitigation (300 RPM)
    await sleep(300)
  }

  const manifest: TtsManifest = { version: 2, slides: allSlides }
  writeFileSync(resolve(OUTPUT_DIR, 'manifest.json'), JSON.stringify(manifest, null, 2))
  console.log('\n✅ manifest.json generated')
}

main().catch(err => { console.error(err); process.exit(1) })
