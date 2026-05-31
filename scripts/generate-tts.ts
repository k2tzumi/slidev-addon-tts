#!/usr/bin/env tsx
import { readFileSync, writeFileSync, mkdirSync, existsSync, unlinkSync, realpathSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync, execSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import dotenv from 'dotenv'
import { buildSsml } from '../lib/ssml-builder.js'
import { parseFrontmatterTtsConfig, parseSlides } from '../lib/slides-parser.js'
import type { SlideNote } from '../lib/slides-parser.js'
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

// -------- ffmpeg detection --------
function isFfmpegAvailable(): boolean {
  try { execSync('ffmpeg -version', { stdio: 'ignore' }); return true } catch { return false }
}

// -------- WAV → AAC (M4A) conversion --------
function wavToAac(wavBuffer: Buffer, outPath: string): void {
  const tmp = join(tmpdir(), `tts-${Date.now()}.wav`)
  writeFileSync(tmp, wavBuffer)
  try {
    execFileSync('ffmpeg', [
      '-i', tmp,
      '-c:a', 'aac', '-b:a', '64k',
      '-y', outPath,
    ], { stdio: 'ignore' })
  } finally {
    try { unlinkSync(tmp) } catch {}
  }
}

// -------- batch splitting by byte size --------
// Returns SlideNote[][] so buildBatchSlideEntries can access per-slide sections.
function splitIntoBatches(slides: SlideNote[], breakTime: string, maxBytes = 4500): SlideNote[][] {
  const batches: SlideNote[][] = []
  let current: SlideNote[] = []
  let currentBytes = 0

  for (const slide of slides) {
    const { ssml } = buildSsml([slide], breakTime)
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

async function callCloudTTS(ssml: string, apiKey: string, lang: string, voice: string): Promise<CloudTtsResponse> {
  const url = `https://texttospeech.googleapis.com/v1beta1/text:synthesize?key=${apiKey}`

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        input: { ssml },
        voice: { languageCode: lang, name: voice },
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

export function parseRetryDelay(errorBody: string): number | null {
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
export function buildBatchSlideEntries(
  batchSlides: SlideNote[],
  timepoints: CloudTtsResponse['timepoints'],
  audioFile: string,
): Record<string, TtsSlideEntry> {
  const timemap: Record<string, number> = {}
  for (const { markName, timeSeconds } of timepoints) {
    timemap[markName] = timeSeconds
  }

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

  return entries
}

// -------- load existing manifest.json (preserved when skipping) --------
function loadExistingManifest(outputDir: string): TtsManifest {
  const manifestPath = resolve(outputDir, 'manifest.json')
  if (!existsSync(manifestPath)) return { version: 2, slides: {} }
  try {
    return JSON.parse(readFileSync(manifestPath, 'utf-8')) as TtsManifest
  } catch {
    return { version: 2, slides: {} }
  }
}

// -------- main --------
export async function main(): Promise<void> {
  if (!API_KEY) { console.error('❌ VITE_CLOUD_TTS_API_KEY is not set (define it in .env.local or .env)'); process.exit(1) }

  const fmConfig   = parseFrontmatterTtsConfig(SLIDES_FILE)
  const VOICE      = process.env.TTS_VOICE      ?? fmConfig.voiceName      ?? 'ja-JP-Neural2-B'
  const LANG       = process.env.TTS_LANG       ?? fmConfig.languageCode   ?? 'ja-JP'
  const BREAK_TIME = process.env.TTS_BREAK_TIME ?? fmConfig.clickBreakTime ?? '500ms'

  const useFfmpeg = isFfmpegAvailable()
  const ext = useFfmpeg ? 'm4a' : 'wav'
  console.log(`ffmpeg: ${useFfmpeg ? '✅ AAC (M4A) output' : '⚠️ WAV fallback'}`)
  console.log(`voice:  ${VOICE} / lang: ${LANG} / breakTime: ${BREAK_TIME}${fmConfig.voiceName ? ' (from frontmatter)' : ''}`)

  mkdirSync(OUTPUT_DIR, { recursive: true })

  const slides = parseSlides(readFileSync(SLIDES_FILE, 'utf-8'))
  const batches = splitIntoBatches(slides, BREAK_TIME, undefined, fmConfig.dictionary ?? [])

  console.log(`\nSlides: ${slides.length}, batches: ${batches.length}`)

  const existingManifest = loadExistingManifest(OUTPUT_DIR)
  const allSlides: Record<string, TtsSlideEntry> = {}

  for (const [i, batchSlides] of batches.entries()) {
    const audioFileName = `batch-${i + 1}.${ext}`
    const outPath = resolve(OUTPUT_DIR, audioFileName)
    const pageRange = `slide ${batchSlides[0].page}–${batchSlides.at(-1)!.page}`

    if (existsSync(outPath) && !FORCE) {
      console.log(`  ⏭ skip:  batch ${i + 1} (${pageRange})`)
      for (const { page } of batchSlides) {
        const existing = existingManifest.slides?.[String(page)]
        if (existing) allSlides[String(page)] = existing
      }
      continue
    }

    console.log(`  🎙 gen:   batch ${i + 1} (${pageRange})`)

    const { ssml } = buildSsml(batchSlides, BREAK_TIME, fmConfig.dictionary ?? [])
    const { audioContent, timepoints } = await callCloudTTS(ssml, API_KEY, LANG, VOICE)

    const wavBuffer = Buffer.from(audioContent, 'base64')

    if (useFfmpeg) {
      wavToAac(wavBuffer, outPath)
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

if (realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(err => { console.error(err); process.exit(1) })
}
