import { describe, it, expect } from 'vitest'
import { foregroundMask } from '../src/gl/inpaint'
import { fitWithin } from '../src/loader'

describe('foregroundMask', () => {
  it('marks the near side of a strong depth edge', () => {
    // 8x1 row: left half far (10), right half near (240).
    const w = 8
    const h = 1
    const depth = new Uint8ClampedArray([10, 10, 10, 10, 240, 240, 240, 240])
    const mask = foregroundMask(depth, w, h, { dilate: 0 })
    // The near pixel adjacent to the edge should be masked...
    expect(mask[4]).toBe(1)
    // ...and a far pixel well away from the edge should not.
    expect(mask[0]).toBe(0)
  })

  it('produces an all-zero mask for a flat depth map', () => {
    const depth = new Uint8ClampedArray(16).fill(128)
    const mask = foregroundMask(depth, 4, 4)
    expect([...mask].every((v) => v === 0)).toBe(true)
  })
})

describe('fitWithin', () => {
  it('keeps small images untouched', () => {
    expect(fitWithin(800, 600, 1024)).toEqual({ width: 800, height: 600 })
  })
  it('scales the longest edge to max, preserving aspect', () => {
    expect(fitWithin(2048, 1024, 1024)).toEqual({ width: 1024, height: 512 })
  })
})
