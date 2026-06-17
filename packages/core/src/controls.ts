import type { ControlMode } from './types'

export interface ControlsTarget {
  x: number
  y: number
}

/**
 * Translates a chosen input device into a normalized parallax target (-1..1).
 * The render loop reads `.target` each frame and smooths toward it.
 */
export class Controls {
  readonly target: ControlsTarget = { x: 0, y: 0 }
  private mode: ControlMode
  private element: HTMLElement
  private detachers: Array<() => void> = []
  private dragging = false
  private prevTouchAction = ''

  constructor(element: HTMLElement, mode: ControlMode) {
    this.element = element
    this.mode = mode
    this.attach()
  }

  setMode(mode: ControlMode): void {
    if (mode === this.mode) return
    this.detach()
    this.mode = mode
    this.target.x = 0
    this.target.y = 0
    this.attach()
  }

  private on<K extends keyof HTMLElementEventMap>(
    el: HTMLElement | Window,
    type: K | string,
    handler: (e: any) => void,
    opts?: AddEventListenerOptions,
  ): void {
    el.addEventListener(type, handler as EventListener, opts)
    this.detachers.push(() => el.removeEventListener(type, handler as EventListener, opts))
  }

  private attach(): void {
    switch (this.mode) {
      case 'pointer':
        this.attachPointer()
        break
      case 'orbit':
        this.attachOrbit()
        break
      case 'scroll':
        this.attachScroll()
        break
      case 'gyro':
        this.attachGyro()
        break
      case 'none':
        break
    }
  }

  /** Absolute hover mapping — good for a desktop mouse. */
  private attachPointer(): void {
    const el = this.element
    const update = (clientX: number, clientY: number) => {
      const rect = el.getBoundingClientRect()
      const x = ((clientX - rect.left) / rect.width) * 2 - 1
      const y = ((clientY - rect.top) / rect.height) * 2 - 1
      this.target.x = clamp(x)
      this.target.y = clamp(-y)
    }
    this.on(el, 'pointermove', (e: PointerEvent) => update(e.clientX, e.clientY))
    this.on(el, 'pointerleave', () => {
      this.target.x = 0
      this.target.y = 0
    })
  }

  /**
   * Relative drag — the view follows your finger/cursor by the *delta* since
   * grab, instead of snapping to the absolute pointer position. Works on touch
   * because we disable native touch gestures on the element.
   */
  private attachOrbit(): void {
    const el = this.element
    this.prevTouchAction = el.style.touchAction
    el.style.touchAction = 'none' // let touch-drag produce pointermove, not scroll

    const SENS = 3.0
    let startX = 0
    let startY = 0
    let baseX = 0
    let baseY = 0

    this.on(el, 'pointerdown', (e: PointerEvent) => {
      this.dragging = true
      startX = e.clientX
      startY = e.clientY
      baseX = this.target.x
      baseY = this.target.y
      el.setPointerCapture?.(e.pointerId)
      e.preventDefault()
    })
    this.on(el, 'pointermove', (e: PointerEvent) => {
      if (!this.dragging) return
      const rect = el.getBoundingClientRect()
      const dx = (e.clientX - startX) / rect.width
      const dy = (e.clientY - startY) / rect.height
      this.target.x = clamp(baseX + dx * SENS)
      this.target.y = clamp(baseY - dy * SENS)
      e.preventDefault()
    })
    const end = () => (this.dragging = false)
    this.on(el, 'pointerup', end)
    this.on(el, 'pointercancel', end)
  }

  private attachScroll(): void {
    const handler = () => {
      const rect = this.element.getBoundingClientRect()
      const center = rect.top + rect.height / 2
      const progress = center / window.innerHeight // 1 (below) .. 0 (above)
      this.target.y = clamp((0.5 - progress) * 2)
      this.target.x = 0
    }
    this.on(window, 'scroll', handler, { passive: true })
    handler()
  }

  private attachGyro(): void {
    // Treat the first reading as "neutral" so it centres on however the phone
    // is currently held, then react to tilt deltas from there.
    let baseBeta: number | null = null
    let baseGamma: number | null = null
    const landscape = () =>
      typeof screen !== 'undefined' && Math.abs(screen.orientation?.angle ?? 0) === 90
    this.on(window, 'deviceorientation', (e: DeviceOrientationEvent) => {
      const gamma = e.gamma ?? 0 // left/right tilt
      const beta = e.beta ?? 0 // front/back tilt
      if (baseBeta === null) {
        baseBeta = beta
        baseGamma = gamma
      }
      let dx = (gamma - (baseGamma as number)) / 28
      let dy = -(beta - (baseBeta as number)) / 28
      if (landscape()) [dx, dy] = [dy, -dx]
      this.target.x = clamp(dx)
      this.target.y = clamp(dy)
    })
  }

  detach(): void {
    for (const off of this.detachers) off()
    this.detachers = []
    this.dragging = false
    if (this.element.style.touchAction === 'none') {
      this.element.style.touchAction = this.prevTouchAction
    }
  }

  dispose(): void {
    this.detach()
  }
}

/** Request iOS gyroscope permission (must be called from a user gesture). */
export async function requestGyroPermission(): Promise<boolean> {
  const anyOrientation = DeviceOrientationEvent as unknown as {
    requestPermission?: () => Promise<'granted' | 'denied'>
  }
  if (typeof anyOrientation?.requestPermission === 'function') {
    try {
      return (await anyOrientation.requestPermission()) === 'granted'
    } catch {
      return false
    }
  }
  return true
}

function clamp(v: number): number {
  return v < -1 ? -1 : v > 1 ? 1 : v
}
