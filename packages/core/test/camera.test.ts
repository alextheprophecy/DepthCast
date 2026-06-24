import { describe, it, expect } from 'vitest'
import { createCameraPath, resolveCameraPath, damp } from '../src/camera'

describe('camera paths', () => {
  it('orbit returns values in range and loops', () => {
    const p = createCameraPath('orbit')
    for (const t of [0, 0.25, 0.5, 0.75, 1]) {
      const s = p.sample(t)
      expect(Math.abs(s.x)).toBeLessThanOrEqual(1.0001)
      expect(Math.abs(s.y)).toBeLessThanOrEqual(1.0001)
    }
    const a = p.sample(0)
    const b = p.sample(1)
    expect(a.x).toBeCloseTo(b.x, 6)
    expect(a.y).toBeCloseTo(b.y, 6)
  })

  it('dolly only changes zoom', () => {
    const p = createCameraPath('dolly')
    const s = p.sample(0.5)
    expect(s.x).toBe(0)
    expect(s.y).toBe(0)
    expect(s.zoom).toBeGreaterThan(1)
  })

  it('resolveCameraPath accepts presets, paths and undefined', () => {
    expect(resolveCameraPath(undefined).duration).toBeGreaterThan(0)
    expect(resolveCameraPath('sway').duration).toBeGreaterThan(0)
    const custom = { duration: 2, sample: () => ({ x: 0, y: 0, zoom: 1 }) }
    expect(resolveCameraPath(custom)).toBe(custom)
  })
})

describe('damp', () => {
  it('moves toward the target and converges', () => {
    let v = 0
    for (let i = 0; i < 240; i++) v = damp(v, 1, 0.12, 1 / 60)
    expect(v).toBeGreaterThan(0.99)
  })

  it('snaps when smoothing is 0', () => {
    expect(damp(0, 1, 0, 1 / 60)).toBe(1)
  })
})
