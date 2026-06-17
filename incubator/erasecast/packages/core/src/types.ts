/**
 * Public type contract for erasecast.
 *
 * Two workflows, mirroring depthcast:
 *
 *  1. Runtime mode — interactive: click/brush to select (SAM2), erase (LaMa),
 *     undo/redo — all in the browser, images never leave the device.
 *  2. Batch mode   — the `erasecast` CLI cleans folders headlessly given masks.
 */

export type ImageSource =
  | HTMLImageElement
  | HTMLCanvasElement
  | HTMLVideoElement
  | ImageBitmap
  | ImageData
  | string // URL
  | File
  | Blob

export type Device = 'webgpu' | 'wasm' | 'auto'

/**
 * High-resolution inpaint strategy — the part erasecast actually owns.
 *
 * - `tiled`       — mask-aware tiling: only inpaint tiles touching the mask, with
 *                   context padding + overlap feather blend. No seams. The default.
 * - `single`      — downscale the whole image to the model size once. Fastest, softest.
 * - `progressive` — instant low-res preview, then refine tiles in the background.
 */
export type Strategy = 'tiled' | 'single' | 'progressive'

export type ProgressStage = 'model' | 'segment' | 'inpaint' | 'composite'

/** A binary mask: 1 byte per pixel, 255 = remove, 0 = keep. */
export interface Mask {
  data: Uint8ClampedArray
  width: number
  height: number
}

export interface EraserOptions {
  /** SAM2 ONNX model id. Default `onnx-community/sam2-hiera-tiny`. */
  samModel?: string
  /** LaMa ONNX model id/url. Default `Carve/LaMa-ONNX`. */
  inpaintModel?: string
  /** Execution backend. Default `auto` (webgpu → wasm). */
  device?: Device
  /** High-res strategy. Default `tiled`. */
  strategy?: Strategy
  /** LaMa tile size (its native input). Default 512. */
  tileSize?: number
  /** Feathered overlap band between adjacent tiles, px. Default 64. */
  overlap?: number
  /** Grow the mask outward before inpainting so object edges are caught, px. Default 16. */
  maskDilation?: number
  /** Soft recomposite band against the untouched original, px. Default 8. */
  feather?: number
  /** Cap working resolution; full-res refine is opt-in. Default 2048. */
  maxResolution?: number
  onProgress?: (stage: ProgressStage, pct: number) => void
}

export interface EraserSession {
  readonly canvas: HTMLCanvasElement
  /** Current composited result (original with erased regions filled). */
  readonly result: ImageData
  /** Current selection mask (union of all clicks/brush strokes). */
  readonly mask: Mask
  mount(container: HTMLElement): this
  /** SAM2 positive click → mask; returns the updated mask. */
  selectAt(x: number, y: number): Promise<Mask>
  /** Add a positive (include) or negative (exclude) point and re-run SAM2. */
  addPoint(x: number, y: number, include: boolean): Promise<Mask>
  /** Manually paint into the mask along a path of points. */
  brush(path: Array<[number, number]>, opts?: { add?: boolean; radius?: number }): void
  /** Clear the current selection. */
  clearSelection(): void
  /** Run inpainting over the current mask and composite the result. */
  erase(): Promise<ImageData>
  undo(): void
  redo(): void
  toBlob(type?: string, quality?: number): Promise<Blob>
  dispose(): void
}
