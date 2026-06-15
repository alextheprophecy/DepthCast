import {
  pipeline,
  RawImage,
  type DepthEstimationPipeline,
  type ProgressCallback,
} from '@huggingface/transformers'
import { normalizeDepthToGray } from './normalize'
import type { Device, Quality } from './types'

export const DEFAULT_MODEL = 'onnx-community/depth-anything-v2-small'

/** Raw single-channel depth, near = bright. Cross-environment (no DOM types). */
export interface RawDepth {
  gray: Uint8ClampedArray
  width: number
  height: number
}

export interface DepthPipelineOptions {
  model?: string
  device?: Device
  quality?: Quality
  nearIsBright?: boolean
  onModelProgress?: (pct: number) => void
}

const DTYPE_BY_QUALITY: Record<Quality, 'q8' | 'fp16' | 'fp32'> = {
  low: 'q8',
  medium: 'fp16',
  high: 'fp32',
}

const pipelineCache = new Map<string, Promise<DepthEstimationPipeline>>()

/** Lazily create (and cache) a depth-estimation pipeline, webgpu→wasm fallback. */
export async function getDepthPipeline(
  options: DepthPipelineOptions = {},
): Promise<DepthEstimationPipeline> {
  const { model = DEFAULT_MODEL, device = 'auto', quality = 'medium', onModelProgress } = options
  const dtype = DTYPE_BY_QUALITY[quality]

  const progress_callback: ProgressCallback | undefined = onModelProgress
    ? (e: any) => {
        if (e?.status === 'progress' && typeof e.progress === 'number') onModelProgress(e.progress)
        if (e?.status === 'ready' || e?.status === 'done') onModelProgress(100)
      }
    : undefined

  const order: Device[] = device === 'auto' ? ['webgpu', 'wasm'] : [device]

  let lastError: unknown
  for (const dev of order) {
    const key = `${model}::${dev}::${dtype}`
    let pending = pipelineCache.get(key)
    if (!pending) {
      pending = pipeline('depth-estimation', model, {
        device: dev === 'wasm' ? undefined : dev,
        dtype,
        progress_callback,
      }) as Promise<DepthEstimationPipeline>
      pipelineCache.set(key, pending)
    }
    try {
      return await pending
    } catch (err) {
      lastError = err
      pipelineCache.delete(key) // don't cache a failed init
      // fall through to next device in `order`
    }
  }
  throw new Error(
    `depthcast: failed to initialize depth model "${model}". ` +
      `Last error: ${lastError instanceof Error ? lastError.message : String(lastError)}`,
  )
}

/**
 * Core depth estimation. Accepts raw RGBA pixels (browser) or a RawImage
 * (Node/CLI). Returns normalized 8-bit depth at the requested output size.
 */
export async function estimateDepth(
  input: { data: Uint8ClampedArray | Uint8Array; width: number; height: number } | RawImage,
  options: DepthPipelineOptions & { onInference?: (pct: number) => void } = {},
): Promise<RawDepth> {
  const { nearIsBright = true, onInference } = options
  const pipe = await getDepthPipeline(options)

  const image =
    input instanceof RawImage
      ? input
      : new RawImage(Uint8ClampedArray.from(input.data), input.width, input.height, 4)

  onInference?.(10)
  const out = await pipe(image)
  onInference?.(90)

  const result = Array.isArray(out) ? out[0] : out
  const predicted = result.predicted_depth

  // predicted_depth dims are [...,H,W]; data is a flat Float32Array.
  const dims = predicted.dims
  const ph = dims[dims.length - 2] as number
  const pw = dims[dims.length - 1] as number
  const gray = normalizeDepthToGray(predicted.data as Float32Array, { nearIsBright })

  // Resize depth back to the input image size (RawImage resize works in both envs).
  const depthImage = await new RawImage(gray, pw, ph, 1).resize(image.width, image.height)
  onInference?.(100)

  return {
    gray: Uint8ClampedArray.from(depthImage.data),
    width: depthImage.width,
    height: depthImage.height,
  }
}
