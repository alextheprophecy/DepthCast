import { describe, it, expect } from 'vitest'
import { foregroundMask, inpaintBackground } from '../src/gl/inpaint'
import { fitWithin } from '../src/loader'

// The Node test env has no DOM ImageData; a minimal shim is enough for inpaint.
if (typeof (globalThis as { ImageData?: unknown }).ImageData === 'undefined') {
  ;(globalThis as { ImageData?: unknown }).ImageData = class {
    data: Uint8ClampedArray
    width: number
    height: number
    constructor(data: Uint8ClampedArray, width: number, height: number) {
      this.data = data
      this.width = width
      this.height = height
    }
  }
}

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

describe('inpaintBackground', () => {
  // 8x8 darker background with a bright 2x2 square in the centre that is masked
  // out. The fill must reconstruct the *background*, not blow out to white.
  const W = 8
  const H = 8
  const BG = [70, 100, 130] as const // background colour
  const isCentre = (x: number, y: number) => x >= 3 && x <= 4 && y >= 3 && y <= 4

  function build() {
    const data = new Uint8ClampedArray(W * H * 4)
    const mask = new Uint8Array(W * H)
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const i = y * W + x
        const o = i * 4
        const bright = isCentre(x, y)
        data[o] = bright ? 250 : BG[0]
        data[o + 1] = bright ? 250 : BG[1]
        data[o + 2] = bright ? 250 : BG[2]
        data[o + 3] = 255
        mask[i] = bright ? 1 : 0
      }
    }
    return { image: new ImageData(data, W, H), mask }
  }

  it('fills a removed bright region toward the background, not blown-out white', () => {
    const { image, mask } = build()
    const out = inpaintBackground(image, mask)
    const centre = (4 * W + 4) * 4 // a masked pixel
    // The additive-push bug produced 250 + 70 -> clamp 255 here. The fix yields ~70.
    expect(out.data[centre]).toBeLessThan(160)
    expect(out.data[centre]).toBeGreaterThan(20)
    expect(out.data[centre]).toBeCloseTo(BG[0], -1) // within ~tens of the bg
  })

  it('leaves known (unmasked) pixels untouched', () => {
    const { image, mask } = build()
    const out = inpaintBackground(image, mask)
    const corner = 0
    expect(out.data[corner]).toBe(BG[0])
    expect(out.data[corner + 1]).toBe(BG[1])
    expect(out.data[corner + 2]).toBe(BG[2])
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
