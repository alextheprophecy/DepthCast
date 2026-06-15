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
        this.attachPointer(false)
        break
      case 'orbit':
        this.attachPointer(true)
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

  private attachPointer(dragOnly: boolean): void {
    const el = this.element
    const update = (clientX: number, clientY: number) => {
      const rect = el.getBoundingClientRect()
      const x = ((clientX - rect.left) / rect.width) * 2 - 1
      const y = ((clientY - rect.top) / rect.height) * 2 - 1
      this.target.x = clamp(x)
      this.target.y = clamp(-y)
    }
    if (dragOnly) {
      this.on(el, 'pointerdown', (e: PointerEvent) => {
        this.dragging = true
        el.setPointerCapture?.(e.pointerId)
      })
      this.on(el, 'pointermove', (e: PointerEvent) => {
        if (this.dragging) update(e.clientX, e.clientY)
      })
      this.on(el, 'pointerup', () => (this.dragging = false))
      this.on(el, 'pointercancel', () => (this.dragging = false))
    } else {
      this.on(el, 'pointermove', (e: PointerEvent) => update(e.clientX, e.clientY))
      this.on(el, 'pointerleave', () => {
        this.target.x = 0
        this.target.y = 0
      })
    }
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
    this.on(window, 'deviceorientation', (e: DeviceOrientationEvent) => {
      const gamma = e.gamma ?? 0 // left/right [-90,90]
      const beta = e.beta ?? 0 // front/back [-180,180]
      this.target.x = clamp(gamma / 35)
      this.target.y = clamp(-(beta - 45) / 35)
    })
  }

  detach(): void {
    for (const off of this.detachers) off()
    this.detachers = []
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
