import { getAudioContext, playBufferAt } from './audio-context'
import { loadManifest, resolvePosition } from './manifest'

const bufferCache = new Map<string, AudioBuffer>()

async function loadFile(filePath: string): Promise<AudioBuffer> {
  if (bufferCache.has(filePath)) return bufferCache.get(filePath)!
  const res = await fetch(filePath)
  if (!res.ok) throw new Error(`Audio file not found: ${filePath}`)
  const ctx = getAudioContext()
  const buf = await ctx.decodeAudioData(await res.arrayBuffer())
  bufferCache.set(filePath, buf)
  return buf
}

export async function playStatic(page: number, click: number, resumeFromSec?: number): Promise<void> {
  const manifest = await loadManifest()
  const position = resolvePosition(manifest, page, click)
  if (!position) return

  const { file, startSec, endSec } = position
  const audioBuffer = await loadFile(file)
  // resume from the saved position if it falls within this section, otherwise start from the beginning
  const effectiveStart = (resumeFromSec !== undefined && resumeFromSec > startSec && (endSec === null || resumeFromSec < endSec))
    ? resumeFromSec
    : startSec
  await playBufferAt(audioBuffer, effectiveStart, endSec)
}

export async function prefetchStatic(page: number): Promise<void> {
  const manifest = await loadManifest()
  const position = resolvePosition(manifest, page, 0)
  if (!position) return
  loadFile(position.file).catch(() => {})
}
