import { describe, it, expect } from 'vitest'
import { normalizeDepthToGray } from '../src/normalize'

describe('normalizeDepthToGray', () => {
  it('maps min→0 and max→255 (near is bright)', () => {
    const out = normalizeDepthToGray([0, 5, 10])
    expect(out[0]).toBe(0)
    expect(out[2]).toBe(255)
    expect(out[1]).toBeGreaterThan(120)
    expect(out[1]).toBeLessThan(135)
  })

  it('inverts when nearIsBright = false', () => {
    const out = normalizeDepthToGray([0, 10], { nearIsBright: false })
    expect(out[0]).toBe(255)
    expect(out[1]).toBe(0)
  })

  it('handles a flat buffer without NaN', () => {
    const out = normalizeDepthToGray([7, 7, 7])
    expect([...out]).toEqual([128, 128, 128])
  })

  it('returns empty for empty input', () => {
    expect(normalizeDepthToGray([]).length).toBe(0)
  })
})
