export { createEraser } from './session'
export { Sam2Segmenter, DEFAULT_SAM_MODEL, type Point, type SegmenterOptions } from './segment'
export {
  LamaInpainter,
  inpaintImage,
  DEFAULT_INPAINT_MODEL,
  type InpaintOptions,
  type InpaintTileFn,
} from './inpaint'
export {
  dilateMask,
  maskBounds,
  planTiles,
  featherWeight,
  softMaskAlpha,
  compositeMasked,
  type Tile,
} from './tiler'
export { loadImage, fitWithin, type LoadedImage } from './loader'

export type {
  EraserSession,
  EraserOptions,
  ImageSource,
  Mask,
  Device,
  Strategy,
  ProgressStage,
} from './types'
