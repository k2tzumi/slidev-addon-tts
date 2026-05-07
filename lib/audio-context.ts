let _ctx: AudioContext | null = null
let _currentSource: AudioBufferSourceNode | null = null

// playback position tracking for remaining-seconds calculation
let _startedAt = 0        // AudioContext.currentTime at source.start()
let _startSec = 0         // start offset within the buffer
let _endSec: number | null = null  // end position within the buffer (null = EOF)
let _bufferDuration = 0   // total buffer duration, used as fallback when _endSec is null

export function getAudioContext(): AudioContext {
  if (!_ctx) _ctx = new AudioContext()
  return _ctx
}

export async function resumeAudioContext(): Promise<void> {
  const ctx = getAudioContext()
  if (ctx.state === 'suspended') await ctx.resume()
}

/**
 * Seek-play an AudioBuffer from the specified position and wait for completion.
 * Tracking currentSource allows stopCurrentPlayback() to interrupt playback.
 */
export async function playBufferAt(
  buffer: AudioBuffer,
  startSec: number,
  endSec: number | null,
): Promise<void> {
  await resumeAudioContext()
  const ctx = getAudioContext()
  return new Promise(resolve => {
    const source = ctx.createBufferSource()
    source.buffer = buffer
    source.connect(ctx.destination)
    source.onended = () => {
      if (_currentSource === source) _currentSource = null
      resolve()
    }
    // track playback position
    _startedAt = ctx.currentTime
    _startSec = startSec
    _endSec = endSec
    _bufferDuration = buffer.duration
    _currentSource = source
    const duration = endSec !== null ? endSec - startSec : undefined
    source.start(0, startSec, duration)
  })
}

/** Return the current playback position (seconds) within the buffer, or null if not playing. */
export function getCurrentBufferPosition(): number | null {
  if (!_currentSource) return null
  const ctx = getAudioContext()
  return _startSec + (ctx.currentTime - _startedAt)
}

/** Return remaining seconds for the currently playing section, or null if not playing. */
export function getRemainingSeconds(): number | null {
  if (!_currentSource) return null
  const ctx = getAudioContext()
  const elapsed = ctx.currentTime - _startedAt
  const effectiveEnd = _endSec ?? _bufferDuration
  return Math.max(0, effectiveEnd - _startSec - elapsed)
}

/** Stop the currently playing audio immediately. Fires onended and resolves the Promise. */
export function stopCurrentPlayback(): void {
  if (_currentSource) {
    try { _currentSource.stop() } catch {}
    _currentSource = null
  }
}
