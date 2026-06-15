import type { CameraPath, CameraPreset } from './types'

const TAU = Math.PI * 2

/** Built-in looping camera paths used by `play()` and `exportVideo()`. */
export function createCameraPath(preset: CameraPreset, duration = 6): CameraPath {
  switch (preset) {
    case 'orbit':
      return {
        duration,
        sample: (t) => ({ x: Math.sin(t * TAU), y: Math.cos(t * TAU), zoom: 1 }),
      }
    case 'sway':
      return {
        duration,
        sample: (t) => ({ x: Math.sin(t * TAU), y: 0.25 * Math.sin(t * TAU * 2), zoom: 1 }),
      }
    case 'dolly':
      return {
        duration,
        sample: (t) => ({ x: 0, y: 0, zoom: 1 + 0.15 * (0.5 - 0.5 * Math.cos(t * TAU)) }),
      }
    case 'float':
      return {
        duration,
        sample: (t) => ({
          x: 0.6 * Math.sin(t * TAU),
          y: 0.4 * Math.sin(t * TAU * 1.5 + 1),
          zoom: 1 + 0.05 * Math.sin(t * TAU),
        }),
      }
  }
}

export function resolveCameraPath(path: CameraPath | CameraPreset | undefined): CameraPath {
  if (!path) return createCameraPath('orbit')
  return typeof path === 'string' ? createCameraPath(path) : path
}

/** Critically-damped smoothing toward a target — the feel of good parallax. */
export function damp(current: number, target: number, smoothing: number, dt: number): number {
  // smoothing in 0..1; higher = floatier. Frame-rate independent.
  if (smoothing <= 0) return target
  const t = 1 - Math.pow(smoothing, dt * 60)
  return current + (target - current) * t
}
