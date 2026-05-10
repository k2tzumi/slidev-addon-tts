import { describe, it, expect } from 'vitest'
import { calculateEffectiveStart } from '../lib/playback-utils.js'

describe('calculateEffectiveStart', () => {
  it('returns startSec when resumeFromSec is undefined', () => {
    expect(calculateEffectiveStart(undefined, 1.0, 5.0)).toBe(1.0)
  })

  it('returns startSec when resumeFromSec equals startSec', () => {
    expect(calculateEffectiveStart(1.0, 1.0, 5.0)).toBe(1.0)
  })

  it('returns startSec when resumeFromSec is before startSec', () => {
    expect(calculateEffectiveStart(0.5, 1.0, 5.0)).toBe(1.0)
  })

  it('returns resumeFromSec when it falls between startSec and endSec', () => {
    expect(calculateEffectiveStart(2.5, 1.0, 5.0)).toBe(2.5)
  })

  it('returns startSec when resumeFromSec equals endSec', () => {
    expect(calculateEffectiveStart(5.0, 1.0, 5.0)).toBe(1.0)
  })

  it('returns startSec when resumeFromSec exceeds endSec', () => {
    expect(calculateEffectiveStart(6.0, 1.0, 5.0)).toBe(1.0)
  })

  it('returns resumeFromSec when endSec is null and resumeFromSec > startSec', () => {
    expect(calculateEffectiveStart(3.0, 1.0, null)).toBe(3.0)
  })

  it('returns startSec when endSec is null and resumeFromSec <= startSec', () => {
    expect(calculateEffectiveStart(0.5, 1.0, null)).toBe(1.0)
  })

  it('handles startSec of 0', () => {
    expect(calculateEffectiveStart(1.5, 0, 5.0)).toBe(1.5)
    expect(calculateEffectiveStart(undefined, 0, 5.0)).toBe(0)
  })
})
