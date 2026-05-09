export interface TtsClickEntry {
  /** Playback start time (seconds from batch file start) */
  start: number
  /** Playback end time (seconds from batch file start), or null to play to end of the batch file */
  end: number | null
}

export interface TtsSlideEntry {
  file: string                        // audio file name (e.g. "batch-1.ogg")
  clicks: Record<string, TtsClickEntry> // clicks["0"], clicks["1"], ...
}

export interface TtsManifest {
  version: 2
  slides: Record<string, TtsSlideEntry>  // slides["1"], slides["2"], ...
}

let manifestCache: TtsManifest | null = null

function ttsBase(): string {
  const base = import.meta.env.BASE_URL ?? '/'
  return base.endsWith('/') ? base : `${base}/`
}

export async function loadManifest(): Promise<TtsManifest> {
  if (manifestCache) return manifestCache
  const res = await fetch(`${ttsBase()}tts/manifest.json`)
  if (!res.ok) throw new Error('manifest.json not found')
  const contentType = res.headers.get('content-type') ?? ''
  if (!contentType.includes('application/json')) {
    throw new Error('manifest.json not found (received non-JSON response)')
  }
  manifestCache = await res.json()
  return manifestCache!
}

/**
 * Return the audio file path and start/end times for the specified slide and click.
 * start/end are pre-calculated in manifest.json, enabling O(1) lookup.
 */
export function resolvePosition(
  manifest: TtsManifest,
  page: number,
  click: number,
): { file: string; startSec: number; endSec: number | null } | null {
  const slideEntry = manifest.slides?.[String(page)]
  if (!slideEntry) return null

  const clickEntry = slideEntry.clicks?.[String(click)]
  if (!clickEntry) return null

  return {
    file: `${ttsBase()}tts/${slideEntry.file}`,
    startSec: clickEntry.start,
    endSec: clickEntry.end,
  }
}
