export { createDepthcast } from './scene'
export { estimateDepth, getDepthPipeline, DEFAULT_MODEL, type RawDepth } from './depth'
export { loadImage, fitWithin, type LoadedImage } from './loader'
export { normalizeDepthToGray, grayToImageData, imageDataToGray } from './normalize'
export { createCameraPath, resolveCameraPath } from './camera'
export { foregroundMask, inpaintBackground, blurBackground } from './gl/inpaint'
export { Controls, requestGyroPermission } from './controls'

export type {
  DepthScene,
  DepthcastOptions,
  ImageSource,
  DepthSource,
  Device,
  Quality,
  EdgeHandling,
  ControlMode,
  ProgressStage,
  CameraPath,
  CameraPreset,
  ExportOptions,
  DepthResult,
} from './types'

/**
 * Compute a depth map in the browser and return it as a PNG-ready ImageData.
 * Useful for the precompute workflow without spinning up a full scene.
 */
import { loadImage as _loadImage } from './loader'
import { estimateDepth as _estimateDepth } from './depth'
import { grayToImageData as _grayToImageData } from './normalize'
import type { DepthcastOptions, DepthResult, ImageSource } from './types'

export async function precomputeDepth(
  input: ImageSource,
  options: Pick<
    DepthcastOptions,
    'model' | 'device' | 'quality' | 'maxResolution' | 'depthNearIsBright' | 'onProgress'
  > = {},
): Promise<DepthResult> {
  const loaded = await _loadImage(input, options.maxResolution ?? 1024)
  const raw = await _estimateDepth(
    { data: loaded.imageData.data, width: loaded.width, height: loaded.height },
    {
      model: options.model,
      device: options.device,
      quality: options.quality,
      nearIsBright: options.depthNearIsBright ?? true,
      onModelProgress: (p) => options.onProgress?.('model', p),
      onInference: (p) => options.onProgress?.('inference', p),
    },
  )
  return {
    depth: _grayToImageData(raw.gray, raw.width, raw.height),
    width: raw.width,
    height: raw.height,
  }
}
