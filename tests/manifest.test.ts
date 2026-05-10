import { describe, it, expect } from 'vitest'
import { resolvePosition } from '../lib/manifest.js'
import type { TtsManifest } from '../lib/manifest.js'

const sampleManifest: TtsManifest = {
  version: 2,
  slides: {
    '1': {
      file: 'batch-1.m4a',
      clicks: {
        '0': { start: 0.0, end: 2.5 },
        '1': { start: 2.5, end: 5.0 },
      },
    },
    '2': {
      file: 'batch-1.m4a',
      clicks: {
        '0': { start: 5.0, end: null },
      },
    },
  },
}

describe('resolvePosition', () => {
  it('returns startSec and endSec for a known slide and click', () => {
    const result = resolvePosition(sampleManifest, 1, 0)
    expect(result).not.toBeNull()
    expect(result!.startSec).toBe(0.0)
    expect(result!.endSec).toBe(2.5)
  })

  it('resolves click 1 correctly', () => {
    const result = resolvePosition(sampleManifest, 1, 1)
    expect(result).not.toBeNull()
    expect(result!.startSec).toBe(2.5)
    expect(result!.endSec).toBe(5.0)
  })

  it('returns endSec as null for the last click in the batch', () => {
    const result = resolvePosition(sampleManifest, 2, 0)
    expect(result).not.toBeNull()
    expect(result!.endSec).toBeNull()
  })

  it('includes the audio file name in the returned file path', () => {
    const result = resolvePosition(sampleManifest, 1, 0)
    expect(result!.file).toContain('batch-1.m4a')
  })

  it('returns null for an unknown slide', () => {
    expect(resolvePosition(sampleManifest, 99, 0)).toBeNull()
  })

  it('returns null for an unknown click on a known slide', () => {
    expect(resolvePosition(sampleManifest, 1, 5)).toBeNull()
  })

  it('returns null when slides record is empty', () => {
    const empty: TtsManifest = { version: 2, slides: {} }
    expect(resolvePosition(empty, 1, 0)).toBeNull()
  })
})
