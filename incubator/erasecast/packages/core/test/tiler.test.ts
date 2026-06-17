import { describe, it, expect } from 'vitest'
import {
  dilateMask,
  maskBounds,
  planTiles,
  featherWeight,
  softMaskAlpha,
  compositeMasked,
} from '../src/tiler'

function maskWithRect(w: number, h: number, x0: number, y0: number, x1: number, y1: number) {
  const m = new Uint8ClampedArray(w * h)
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) m[y * w + x] = 255
  return m
}

describe('maskBounds', () => {
  it('returns null for an empty mask', () => {
    expect(maskBounds(new Uint8ClampedArray(16), 4, 4)).toBeNull()
  })
  it('finds the tight bbox', () => {
    const m = maskWithRect(8, 8, 2, 3, 5, 6)
    expect(maskBounds(m, 8, 8)).toEqual({ x0: 2, y0: 3, x1: 5, y1: 6 })
  })
})

describe('dilateMask', () => {
  it('grows the masked region outward', () => {
    const w = 9,
      h = 9
    const m = maskWithRect(w, h, 4, 4, 4, 4) // single pixel
    const d = dilateMask(m, w, h, 2)
    const before = maskBounds(m, w, h)!
    const after = maskBounds(d, w, h)!
    expect(after.x0).toBeLessThan(before.x0)
    expect(after.x1).toBeGreaterThan(before.x1)
  })
  it('radius 0 is a no-op', () => {
    const m = maskWithRect(8, 8, 1, 1, 2, 2)
    expect(Array.from(dilateMask(m, 8, 8, 0))).toEqual(Array.from(m))
  })
})

describe('planTiles', () => {
  it('returns no tiles for an empty mask', () => {
    expect(planTiles(new Uint8ClampedArray(64), 8, 8, 4, 1)).toEqual([])
  })
  it('only emits tiles that intersect the mask', () => {
    const w = 32,
      h = 32
    const m = maskWithRect(w, h, 0, 0, 3, 3) // top-left corner only
    const tiles = planTiles(m, w, h, 16, 4)
    expect(tiles.length).toBeGreaterThan(0)
    // every emitted tile's output region must touch the mask bbox (top-left)
    for (const t of tiles) {
      expect(t.x).toBeLessThanOrEqual(3)
      expect(t.y).toBeLessThanOrEqual(3)
    }
  })
  it('context pad stays within image bounds', () => {
    const w = 40,
      h = 40
    const m = maskWithRect(w, h, 18, 18, 22, 22)
    for (const t of planTiles(m, w, h, 16, 8)) {
      expect(t.cx).toBeGreaterThanOrEqual(0)
      expect(t.cy).toBeGreaterThanOrEqual(0)
      expect(t.cx + t.cw).toBeLessThanOrEqual(w)
      expect(t.cy + t.ch).toBeLessThanOrEqual(h)
    }
  })
})

describe('featherWeight', () => {
  it('is 0 at the edge and 1 past the band', () => {
    expect(featherWeight(0, 8)).toBeCloseTo(0, 5)
    expect(featherWeight(8, 8)).toBeCloseTo(1, 5)
    expect(featherWeight(4, 8)).toBeCloseTo(0.5, 5)
  })
})

describe('compositeMasked', () => {
  it('keeps pixels outside the mask exactly, replaces inside', () => {
    const w = 8,
      h = 8
    const original = new Uint8ClampedArray(w * h * 4).fill(10)
    const inpainted = new Uint8ClampedArray(w * h * 4).fill(200)
    const mask = maskWithRect(w, h, 3, 3, 4, 4)
    const out = compositeMasked(original, inpainted, mask, w, h, 0)
    // a corner pixel far from the mask is untouched
    expect(out[0]).toBe(10)
    // a fully-masked pixel is replaced
    const i = (3 * w + 3) * 4
    expect(out[i]).toBe(200)
  })
})

describe('softMaskAlpha', () => {
  it('fully-masked core stays at alpha 1', () => {
    const w = 16,
      h = 16
    const m = maskWithRect(w, h, 5, 5, 10, 10)
    const a = softMaskAlpha(m, w, h, 3)
    expect(a[7 * w + 7]!).toBeCloseTo(1, 5)
    // outside, far away, alpha ~0
    expect(a[0]!).toBeCloseTo(0, 5)
  })
})
