import type { ImageSource } from './types'

export interface LoadedImage {
  /** Downscaled RGBA pixels, ready for upload as a texture / depth inference. */
  imageData: ImageData
  width: number
  height: number
  /** A canvas holding the same pixels (handy for transformers.js + texture upload). */
  canvas: HTMLCanvasElement
}

function makeCanvas(width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  return canvas
}

/** Fit (w,h) so the longest edge is <= max, preserving aspect ratio. */
export function fitWithin(w: number, h: number, max: number): { width: number; height: number } {
  const longest = Math.max(w, h)
  if (longest <= max) return { width: w, height: h }
  const scale = max / longest
  return { width: Math.round(w * scale), height: Math.round(h * scale) }
}

async function toBitmapSource(
  input: ImageSource,
): Promise<{ source: CanvasImageSource | ImageData; w: number; h: number }> {
  if (typeof input === 'string') {
    const img = await loadHtmlImage(input)
    return { source: img, w: img.naturalWidth, h: img.naturalHeight }
  }
  if (input instanceof Blob) {
    // covers File too
    const bitmap = await createImageBitmap(input)
    return { source: bitmap, w: bitmap.width, h: bitmap.height }
  }
  if (input instanceof ImageData) {
    return { source: input, w: input.width, h: input.height }
  }
  if (typeof HTMLImageElement !== 'undefined' && input instanceof HTMLImageElement) {
    if (!input.complete) await input.decode().catch(() => undefined)
    return {
      source: input,
      w: input.naturalWidth || input.width,
      h: input.naturalHeight || input.height,
    }
  }
  if (typeof HTMLVideoElement !== 'undefined' && input instanceof HTMLVideoElement) {
    return { source: input, w: input.videoWidth, h: input.videoHeight }
  }
  if (typeof HTMLCanvasElement !== 'undefined' && input instanceof HTMLCanvasElement) {
    return { source: input, w: input.width, h: input.height }
  }
  if (typeof ImageBitmap !== 'undefined' && input instanceof ImageBitmap) {
    return { source: input, w: input.width, h: input.height }
  }
  throw new TypeError('depthcast: unsupported image input')
}

function loadHtmlImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error(`depthcast: failed to load image "${url}"`))
    img.src = url
  })
}

/** Normalize any supported input to downscaled RGBA pixels + a canvas. */
export async function loadImage(input: ImageSource, maxResolution = 1024): Promise<LoadedImage> {
  const { source, w, h } = await toBitmapSource(input)
  if (!w || !h) throw new Error('depthcast: image has zero dimensions (not yet loaded?)')

  const { width, height } = fitWithin(w, h, maxResolution)
  const canvas = makeCanvas(width, height)
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) throw new Error('depthcast: could not acquire 2D context')

  if (source instanceof ImageData) {
    if (source.width === width && source.height === height) {
      ctx.putImageData(source, 0, 0)
    } else {
      const tmp = makeCanvas(source.width, source.height)
      tmp.getContext('2d')!.putImageData(source, 0, 0)
      ctx.drawImage(tmp, 0, 0, width, height)
    }
  } else {
    ctx.drawImage(source, 0, 0, width, height)
  }

  const imageData = ctx.getImageData(0, 0, width, height)
  return { imageData, width, height, canvas }
}
