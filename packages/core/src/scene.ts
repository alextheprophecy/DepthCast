import { loadImage } from './loader'
import { estimateDepth } from './depth'
import { grayToImageData, imageDataToGray } from './normalize'
import { Renderer } from './gl/renderer'
import { Controls } from './controls'
import { foregroundMask, inpaintBackground, blurBackground } from './gl/inpaint'
import { resolveCameraPath, damp } from './camera'
import { exportVideo } from './export'
import type {
  DepthScene,
  DepthcastOptions,
  ImageSource,
  CameraPath,
  CameraPreset,
  ExportOptions,
} from './types'

const DEFAULTS = {
  model: 'onnx-community/depth-anything-v2-small',
  device: 'auto',
  quality: 'medium',
  depthNearIsBright: true,
  edgeHandling: 'feather',
  intensity: 0.5,
  damping: 0.12,
  controls: 'pointer',
  maxResolution: 1024,
  background: 'blur',
  respectReducedMotion: true,
} as const

function prefersReducedMotion(): boolean {
  return typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches
}

/** Load a BYO depth map and resample it to the working image size. */
async function loadDepthAt(
  source: NonNullable<DepthcastOptions['depthMap']>,
  w: number,
  h: number,
) {
  if (source instanceof ImageData && source.width === w && source.height === h) return source
  const loaded = await loadImage(source as ImageSource, Math.max(w, h))
  if (loaded.width === w && loaded.height === h) return loaded.imageData
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')!
  ctx.drawImage(loaded.canvas, 0, 0, w, h)
  return ctx.getImageData(0, 0, w, h)
}

export async function createDepthcast(
  input: ImageSource,
  options: DepthcastOptions = {},
): Promise<DepthScene> {
  const o = { ...DEFAULTS, ...options }
  const reduced = o.respectReducedMotion && prefersReducedMotion()

  // 1. Load + downscale.
  const loaded = await loadImage(input, o.maxResolution)
  o.onProgress?.('build', 10)

  // 2. Depth (BYO or inference).
  let depthImageData: ImageData
  if (o.depthMap) {
    depthImageData = await loadDepthAt(o.depthMap, loaded.width, loaded.height)
    o.onProgress?.('depth', 100)
  } else {
    const raw = await estimateDepth(
      { data: loaded.imageData.data, width: loaded.width, height: loaded.height },
      {
        model: o.model,
        device: o.device,
        quality: o.quality,
        nearIsBright: o.depthNearIsBright,
        onModelProgress: (p) => o.onProgress?.('model', p),
        onInference: (p) => o.onProgress?.('inference', p),
      },
    )
    depthImageData = grayToImageData(raw.gray, raw.width, raw.height)
  }

  // 3. Background fill layer for disocclusion.
  let background: ImageData | null = null
  if (o.edgeHandling === 'inpaint') {
    const gray = imageDataToGray(depthImageData)
    const mask = foregroundMask(gray, loaded.width, loaded.height)
    // Soften push–pull ringing; the fill is only ever seen in thin disoccluded
    // slivers, so a light blur reads as "background" rather than a sharp ghost.
    background = blurBackground(inpaintBackground(loaded.imageData, mask), 3)
  } else if (o.edgeHandling === 'feather') {
    background = blurBackground(loaded.imageData)
  }
  o.onProgress?.('build', 70)

  // 4. Renderer.
  const clearColor: [number, number, number, number] =
    typeof o.background === 'object' && 'color' in o.background
      ? [...hexToRgb(o.background.color), 1]
      : [0, 0, 0, 0]
  const renderer = new Renderer({
    image: loaded.imageData,
    depth: depthImageData,
    background,
    quality: o.quality,
    intensity: o.intensity,
    edgeHandling: o.edgeHandling,
    clearColor,
  })
  o.onProgress?.('build', 100)

  // 5. State + loop.
  const controls = new Controls(renderer.canvas, reduced ? 'none' : o.controls)
  const current = { x: 0, y: 0, zoom: 1 }
  let manual: { x: number; y: number } | null = null
  let animation: CameraPath | null = null
  let animStart = 0
  let running = false
  let rafId = 0
  let lastTime = 0
  let damping = o.damping
  let resizeObserver: ResizeObserver | null = null
  let container: HTMLElement | null = null

  const frame = (now: number) => {
    if (!running) return
    const dt = lastTime ? Math.min(0.1, (now - lastTime) / 1000) : 1 / 60
    lastTime = now

    let tx = 0
    let ty = 0
    let tz = 1
    if (animation) {
      const t = (((now - animStart) / 1000) % animation.duration) / animation.duration
      const s = animation.sample(t)
      tx = s.x
      ty = s.y
      tz = s.zoom
    } else if (manual) {
      tx = manual.x
      ty = manual.y
    } else {
      tx = controls.target.x
      ty = controls.target.y
    }

    current.x = damp(current.x, tx, damping, dt)
    current.y = damp(current.y, ty, damping, dt)
    current.zoom = damp(current.zoom, tz, damping, dt)
    renderer.render(current.x, current.y, current.zoom)
    rafId = requestAnimationFrame(frame)
  }

  const start = () => {
    if (running) return
    running = true
    lastTime = 0
    rafId = requestAnimationFrame(frame)
  }
  const stop = () => {
    running = false
    if (rafId) cancelAnimationFrame(rafId)
  }

  const scene: DepthScene = {
    canvas: renderer.canvas,
    depthMap: depthImageData,
    mount(el) {
      container = el
      el.appendChild(renderer.canvas)
      renderer.canvas.style.display = 'block'
      renderer.canvas.style.width = '100%'
      renderer.canvas.style.height = '100%'
      const doResize = () => {
        const rect = el.getBoundingClientRect()
        renderer.resize(rect.width || loaded.width, rect.height || loaded.height)
      }
      doResize()
      resizeObserver = new ResizeObserver(doResize)
      resizeObserver.observe(el)
      if (reduced) {
        renderer.render(0, 0, 1) // single static frame
      } else {
        start()
      }
      return scene
    },
    setParallax(x, y) {
      manual = { x: Math.max(-1, Math.min(1, x)), y: Math.max(-1, Math.min(1, y)) }
      animation = null
      if (!running && !reduced) start()
    },
    update(next) {
      if (next.intensity !== undefined) renderer.setIntensity(next.intensity)
      if (next.edgeHandling !== undefined) renderer.setEdgeHandling(next.edgeHandling)
      if (next.damping !== undefined) damping = next.damping
      if (next.controls !== undefined) controls.setMode(next.controls)
    },
    play(anim?: CameraPath | CameraPreset) {
      animation = resolveCameraPath(anim)
      animStart = performance.now()
      manual = null
      start()
    },
    pause() {
      stop()
    },
    exportVideo(opts?: ExportOptions) {
      return exportVideo(renderer.canvas, (x, y, z) => renderer.render(x, y, z), opts)
    },
    dispose() {
      stop()
      resizeObserver?.disconnect()
      controls.dispose()
      renderer.dispose()
      if (container && renderer.canvas.parentElement === container) {
        container.removeChild(renderer.canvas)
      }
    },
  }

  return scene
}

function hexToRgb(hex: string): [number, number, number] {
  const m = hex.replace('#', '')
  const full =
    m.length === 3
      ? m
          .split('')
          .map((c) => c + c)
          .join('')
      : m
  const num = parseInt(full, 16)
  return [((num >> 16) & 255) / 255, ((num >> 8) & 255) / 255, (num & 255) / 255]
}
