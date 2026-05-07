import { callCloudTTS } from './cloud-tts-client'
import { loadAudio, saveAudio, deleteByPrefix } from './idb-cache'
import { playStatic, prefetchStatic } from './static-loader'
import { getAudioContext, playBufferAt } from './audio-context'
import { buildSsml } from './ssml-builder'
import { calculateEffectiveStart } from './playback-utils'
import { getCloudTtsApiKey } from './env'
import { LOG_TAG as TAG, DEFAULT_CLICK_BREAK_TIME, DEFAULT_VOICE_NAME, DEFAULT_LANGUAGE_CODE } from './constants'
import type { TtsAddonConfig } from '../types'

/** Compute a short hash of text to detect note changes for cache invalidation. */
function textHash(text: string): string {
  return btoa(encodeURIComponent(text)).slice(0, 10)
}

/** In-session memory cache storing decoded audio buffers and timepoints. */
const sessionCache = new Map<string, {
  audioBuffer: AudioBuffer
  timemap: Record<string, number>
}>()


export async function play(
  page: number,
  click: number,
  sections: string[],
  config: TtsAddonConfig,
  resumeFromSec?: number,
): Promise<void> {
  // --- pre-generated mode ---
  // fall back to on-demand if config is empty (headmatter unavailable) but an API key exists
  const apiKey = getCloudTtsApiKey()
  const apiKeyAvailable = !!apiKey
  const usePregenerated = config.usePregenerated !== false && !(!Object.keys(config).length && apiKeyAvailable)
  if (usePregenerated) {
    console.log(`${TAG} [static] slide ${page}, click ${click}${resumeFromSec !== undefined ? ` (resume: ${resumeFromSec.toFixed(2)}s)` : ''}`)
    await playStatic(page, click, resumeFromSec)
    return
  }

  // --- on-demand mode (per slide) ---
  if (!apiKey) {
    console.error(`${TAG} VITE_CLOUD_TTS_API_KEY is not set`)
    return
  }

  const breakTime = config.clickBreakTime ?? DEFAULT_CLICK_BREAK_TIME
  const voiceName = config.voiceName ?? DEFAULT_VOICE_NAME
  const languageCode = config.languageCode ?? DEFAULT_LANGUAGE_CODE
  const allText = sections.join('\n')
  const cacheKey = `cloud-${page}-${textHash(allText)}`

  // check in-session memory cache
  let cached = sessionCache.get(cacheKey)

  if (!cached) {
    const ctx = getAudioContext()

    // check IndexedDB for cached audio
    const storedBuffer = await loadAudio(cacheKey)

    if (storedBuffer) {
      // audio is cached but timepoints are needed, so call the API for timepoints only
      console.log(`${TAG} [on-demand] audio cached, fetching timepoints: slide ${page}`)
      const timemap: Record<string, number> = {}
      try {
        const { ssml } = buildSsml([{ page, sections }], breakTime)
        const response = await callCloudTTS({ ssml, voiceName, languageCode, apiKey, useOggOpus: true })
        for (const { markName, timeSeconds } of (response.timepoints ?? [])) {
          timemap[markName] = timeSeconds
        }
      } catch (err) {
        console.warn(`${TAG} [on-demand] timepoints fetch failed, playing cache without seek: slide ${page}`, err)
        // timemap stays empty — playback starts at position 0 without per-click seeking
      }
      try {
        const audioBuffer = await ctx.decodeAudioData(storedBuffer.slice(0))
        cached = { audioBuffer, timemap }
        sessionCache.set(cacheKey, cached)
      } catch (err) {
        console.error(`${TAG} [on-demand] failed to decode cached audio: slide ${page}`, err)
        return
      }
    } else {
      // neither audio nor timepoints are cached — call the API
      console.log(`${TAG} [on-demand] calling Cloud TTS API: slide ${page}`)
      try {
        const { ssml } = buildSsml([{ page, sections }], breakTime)
        const response = await callCloudTTS({ ssml, voiceName, languageCode, apiKey, useOggOpus: true })
        const timemap: Record<string, number> = {}
        for (const { markName, timeSeconds } of (response.timepoints ?? [])) {
          timemap[markName] = timeSeconds
        }
        const arrayBuffer = Uint8Array.from(atob(response.audioContent), c => c.charCodeAt(0)).buffer
        await saveAudio(cacheKey, arrayBuffer)
        const audioBuffer = await ctx.decodeAudioData(arrayBuffer.slice(0))
        cached = { audioBuffer, timemap }
        sessionCache.set(cacheKey, cached)
        console.log(`${TAG} [on-demand] generated and cached: slide ${page}, ${Object.keys(timemap).length} marks`)
      } catch (err) {
        console.error(`${TAG} [on-demand] API error: slide ${page}`, err)
        return
      }
    }
  }

  const { audioBuffer, timemap } = cached

  // resolve playback start/end from timepoints
  const markName = click === 0 ? `slide_${page}` : `slide_${page}_click_${click}`
  const startSec = timemap[markName] ?? 0
  const allTimes = Object.values(timemap).sort((a, b) => a - b)
  const idx = allTimes.indexOf(startSec)
  const endSec = allTimes[idx + 1] ?? null

  const effectiveStart = calculateEffectiveStart(resumeFromSec, startSec, endSec)

  console.log(`${TAG} [on-demand] playing slide ${page}, click ${click} (${effectiveStart.toFixed(2)}s ~ ${endSec ?? 'EOF'}s)`)
  await playBufferAt(audioBuffer, effectiveStart, endSec)
}

/**
 * Delete the cache for the specified page.
 * @param page slide number
 * @param includeIdb true (default) = also delete from IDB; false = sessionCache only
 *
 * includeIdb=false is used when leaving a slide to free memory while keeping IDB intact.
 * includeIdb=true is used during hot reload to prevent stale entry accumulation.
 */
export function clearPageCache(page: number, { includeIdb = true } = {}): void {
  const prefix = `cloud-${page}-`
  for (const key of sessionCache.keys()) {
    if (key.startsWith(prefix)) sessionCache.delete(key)
  }
  if (includeIdb) deleteByPrefix(prefix).catch(() => {})
}

export function prefetch(page: number, config: TtsAddonConfig): void {
  if (config.prefetch === false) return
  if (config.usePregenerated !== false) {
    prefetchStatic(page).catch(() => {})
  }
}
