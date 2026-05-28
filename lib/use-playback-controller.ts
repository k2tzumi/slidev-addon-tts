import { ref, computed, watch } from 'vue'
import { play, prefetch, clearPageCache } from './tts-manager'
import { resumeAudioContext, stopCurrentPlayback, getRemainingSeconds, getCurrentBufferPosition } from './audio-context'
import { isPlaying } from './state'
import { LOG_TAG, REMAINING_THRESHOLD } from './constants'
import type { TtsAddonConfig } from '../types'

type AudioState = 'idle' | 'playing' | 'done'
type StopInfo = { page: number; click: number; positionSec: number }

export function usePlaybackController(nav: any, config: TtsAddonConfig, isTtsEnabled: boolean) {
  const { currentSlideNo, clicksContext, slides } = nav
  const currentClicks = computed(() => clicksContext.value.current)
  const currentNoteRaw = computed(() =>
    (slides.value[currentSlideNo.value - 1]?.meta as any)?.slide?.note ?? ''
  )

  const audioState = ref<AudioState>('idle')

  let desired = { page: 1, click: 0 }
  let isLoopRunning = false
  let stoppedByUser = false
  let manuallyPaused = true
  let stopInfo: StopInfo | null = null

  function getSections(page: number): string[] {
    const slideInfo = (slides.value[page - 1]?.meta as any)?.slide
    const raw: string | undefined = slideInfo?.note

    // In production builds Slidev strips the raw note (meta.slide.note = "").
    // Fall back to noteHTML to count [click] boundaries so hasCurrentNotes and
    // the play-loop guard remain correct.
    if (raw) {
      return raw.split(/\[click\]/i).map((s: string) => s.trim()).filter(Boolean)
    }

    const noteHTML: string | undefined = slideInfo?.noteHTML
    if (!noteHTML) return []

    // Count click markers injected by Slidev's note renderer.
    const clickCount = (noteHTML.match(/class="slidev-note-click-mark"/g) ?? []).length
    // Return one placeholder per section (0..clickCount).
    // Pregenerated mode ignores section content; on-demand mode has raw note available.
    return Array.from({ length: clickCount + 1 }, () => 'pregenerated')
  }

  function normalizeDictionaryEntries(value: unknown): Array<{ from: string; to: string }> {
    if (!Array.isArray(value)) return []
    return value
      .map(item => {
        if (typeof item !== 'object' || item === null) return null
        const from = (item as any).from
        const to = (item as any).to
        if (typeof from !== 'string' || typeof to !== 'string') return null
        return { from, to }
      })
      .filter((entry): entry is { from: string; to: string } => entry !== null)
  }

  function getSlideDictionary(page: number): Array<{ from: string; to: string }> {
    const slideInfo = (slides.value[page - 1]?.meta as any)?.slide
    const frontmatter = slideInfo?.frontmatter ?? (slideInfo as any)?.frontmatter ?? null
    if (!frontmatter) return []

    return [
      ...normalizeDictionaryEntries(frontmatter.ttsDict),
      ...normalizeDictionaryEntries(frontmatter.tts?.dictionary),
    ]
  }

  const hasCurrentNotes = computed(() => {
    const sections = getSections(currentSlideNo.value)
    return sections.length > 0 && !!sections[currentClicks.value]
  })

  function resetAudioState() {
    audioState.value = 'idle'
  }

  function requestPlay(page: number, click: number) {
    desired = { page, click }
    stoppedByUser = false
    if (stopInfo && (stopInfo.page !== page || stopInfo.click !== click)) {
      stopInfo = null
    }

    if (isLoopRunning && isPlaying.value) {
      const remaining = getRemainingSeconds()
      if (remaining !== null && remaining >= REMAINING_THRESHOLD) {
        stopCurrentPlayback()
      }
      return
    }

    if (!isLoopRunning) startPlayLoop()
  }

  async function startPlayLoop() {
    isLoopRunning = true
    while (true) {
      const target = { ...desired }
      const sections = getSections(target.page)

      if (!sections.length || !sections[target.click]) break

      audioState.value = 'playing'
      isPlaying.value = true
      const resumeFromSec = (stopInfo?.page === target.page && stopInfo?.click === target.click)
        ? stopInfo.positionSec
        : undefined
      stopInfo = null
      let playFailed = false
      try {
        console.log(`${LOG_TAG} requestPlay slide ${target.page}, click ${target.click}${resumeFromSec !== undefined ? ` (resume: ${resumeFromSec.toFixed(2)}s)` : ''}`)
        await play(target.page, target.click, sections, config, resumeFromSec, getSlideDictionary(target.page))
      } catch (err) {
        console.error(`${LOG_TAG} play error:`, err)
        playFailed = true
      } finally {
        isPlaying.value = false
      }

      if (stoppedByUser || playFailed) {
        audioState.value = 'idle'
        stoppedByUser = false
        break
      }

      if (desired.page === target.page && desired.click === target.click) {
        audioState.value = 'done'
        break
      }
    }
    isLoopRunning = false
  }

  function handleIndicatorClick() {
    if (isPlaying.value) {
      const pos = getCurrentBufferPosition()
      if (pos !== null) {
        stopInfo = { page: currentSlideNo.value, click: currentClicks.value, positionSec: pos }
      }
      stoppedByUser = true
      manuallyPaused = true
      stopCurrentPlayback()
    } else {
      manuallyPaused = false
      resumeAudioContext()
      requestPlay(currentSlideNo.value, currentClicks.value)
    }
  }

  watch(currentSlideNo, (page: number, prevPage: number) => {
    if (!isTtsEnabled) return
    if (prevPage && prevPage !== page && config.usePregenerated === false) {
      clearPageCache(prevPage, { includeIdb: false })
    }
    resetAudioState()
    if (manuallyPaused) return
    resumeAudioContext()
    requestPlay(page, 0)
    prefetch(page + 1, config)
  })

  watch(currentClicks, (newClicks: number) => {
    if (!isTtsEnabled) return
    resetAudioState()
    if (manuallyPaused) return
    resumeAudioContext()
    requestPlay(currentSlideNo.value, newClicks)
  })

  // hot reload support (on-demand mode only)
  watch([currentSlideNo, currentNoteRaw] as const, ([newPage, newNote]: [number, string], [oldPage, oldNote]: [number, string]) => {
    if (!isTtsEnabled) return
    if (config.usePregenerated !== false) return
    if (newPage !== oldPage) return
    if (!newNote || newNote === oldNote) return
    console.log(`${LOG_TAG} note changed (hot reload) — replaying slide ${currentSlideNo.value}`)
    clearPageCache(currentSlideNo.value)
    stopInfo = null
    resetAudioState()
    if (!manuallyPaused) {
      requestPlay(currentSlideNo.value, currentClicks.value)
    }
  })

  return { audioState, hasCurrentNotes, handleIndicatorClick }
}
