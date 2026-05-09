import { describe, it, expect } from 'vitest'
import { buildBatchSlideEntries, parseRetryDelay } from '../scripts/generate-tts.js'
import type { SlideNote } from '../lib/slides-parser.js'

// ── parseRetryDelay ─────────────────────────────────────────────────────────

describe('parseRetryDelay', () => {
  it('returns null for non-JSON input', () => {
    expect(parseRetryDelay('not json')).toBeNull()
  })

  it('returns null when retryInfo is absent', () => {
    expect(parseRetryDelay(JSON.stringify({ error: { details: [] } }))).toBeNull()
  })

  it('parses retryDelay seconds and converts to milliseconds', () => {
    const body = JSON.stringify({
      error: {
        details: [
          {
            '@type': 'type.googleapis.com/google.rpc.RetryInfo',
            retryDelay: '30s',
          },
        ],
      },
    })
    expect(parseRetryDelay(body)).toBe(30000)
  })

  it('ceils fractional seconds', () => {
    const body = JSON.stringify({
      error: {
        details: [
          {
            '@type': 'type.googleapis.com/google.rpc.RetryInfo',
            retryDelay: '1.5s',
          },
        ],
      },
    })
    expect(parseRetryDelay(body)).toBe(2000)
  })
})

// ── buildBatchSlideEntries ──────────────────────────────────────────────────

describe('buildBatchSlideEntries', () => {
  const slides: SlideNote[] = [
    { page: 1, sections: ['intro', 'detail'] },   // 2 sections → click_0 + click_1
    { page: 2, sections: ['only'] },               // 1 section  → click_0 only
  ]

  const timepoints = [
    { markName: 'slide_1',         timeSeconds: 0.0 },
    { markName: 'slide_1_click_1', timeSeconds: 2.5 },
    { markName: 'slide_2',         timeSeconds: 5.0 },
  ]

  it('builds entries keyed by page number', () => {
    const entries = buildBatchSlideEntries(slides, timepoints, 'batch-1.ogg')
    expect(Object.keys(entries)).toEqual(['1', '2'])
  })

  it('sets the correct audio file for each slide', () => {
    const entries = buildBatchSlideEntries(slides, timepoints, 'batch-1.ogg')
    expect(entries['1'].file).toBe('batch-1.ogg')
    expect(entries['2'].file).toBe('batch-1.ogg')
  })

  it('calculates click_0 start time from slide mark', () => {
    const entries = buildBatchSlideEntries(slides, timepoints, 'batch-1.ogg')
    expect(entries['1'].clicks['0'].start).toBe(0.0)
  })

  it('sets end of click_0 to the next timepoint start', () => {
    const entries = buildBatchSlideEntries(slides, timepoints, 'batch-1.ogg')
    expect(entries['1'].clicks['0'].end).toBe(2.5)
  })

  it('maps click_1 start from slide_N_click_1 mark', () => {
    const entries = buildBatchSlideEntries(slides, timepoints, 'batch-1.ogg')
    expect(entries['1'].clicks['1'].start).toBe(2.5)
    expect(entries['1'].clicks['1'].end).toBe(5.0)
  })

  it('sets end to null for the last timepoint in the batch', () => {
    const entries = buildBatchSlideEntries(slides, timepoints, 'batch-1.ogg')
    expect(entries['2'].clicks['0'].end).toBeNull()
  })

  it('does not add click_1 entry when slide has only one section', () => {
    const entries = buildBatchSlideEntries(slides, timepoints, 'batch-1.ogg')
    expect(entries['2'].clicks['1']).toBeUndefined()
  })

  it('falls back to start=0 when slide mark is missing from timepoints', () => {
    const entries = buildBatchSlideEntries(
      [{ page: 99, sections: ['text'] }],
      [],
      'batch-1.ogg',
    )
    expect(entries['99'].clicks['0'].start).toBe(0)
  })

  it('accepts multiple audio files for different batches', () => {
    const s1 = buildBatchSlideEntries(
      [{ page: 1, sections: ['a'] }],
      [{ markName: 'slide_1', timeSeconds: 0 }],
      'batch-1.ogg',
    )
    const s2 = buildBatchSlideEntries(
      [{ page: 2, sections: ['b'] }],
      [{ markName: 'slide_2', timeSeconds: 0 }],
      'batch-2.ogg',
    )
    expect(s1['1'].file).toBe('batch-1.ogg')
    expect(s2['2'].file).toBe('batch-2.ogg')
  })
})
