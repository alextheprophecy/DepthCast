/**
 * SAM2 selection adapter. Isolates onnxruntime-web so the session never touches
 * the model directly and SAM2 can be swapped for another segmenter.
 *
 * SAM2 splits into a heavy image encoder (run once per image, ~134 MB, fixed
 * 1024²) and a tiny prompt decoder (run per click — fast). We cache the encoder
 * embedding so interactive clicking only re-runs the cheap decoder.
 */
import type { Device, Mask } from './types'

export const DEFAULT_SAM_MODEL = 'onnx-community/sam2-hiera-tiny'

export interface Point {
  x: number
  y: number
  /** true = include (foreground), false = exclude (background). */
  include: boolean
}

export interface SegmenterOptions {
  model?: string
  device?: Device
  onModelProgress?: (pct: number) => void
}

export class Sam2Segmenter {
  private readonly width: number
  private readonly height: number

  constructor(width: number, height: number, _options: SegmenterOptions = {}) {
    this.width = width
    this.height = height
  }

  /**
   * Run the image encoder once and cache the embedding.
   * TODO(impl): preprocess to 1024², run the encoder session, store the embedding.
   */
  async encode(_rgba: Uint8ClampedArray): Promise<void> {
    throw new Error('erasecast: Sam2Segmenter.encode not wired yet — see PLAN.md §4 (segment).')
  }

  /**
   * Decode a mask from prompt points using the cached embedding (cheap).
   * TODO(impl): build point/label tensors, run the decoder, threshold logits,
   * resize to (width,height). Returns a binary Mask (255 = selected).
   */
  async decode(_points: Point[]): Promise<Mask> {
    void this.width
    void this.height
    throw new Error('erasecast: Sam2Segmenter.decode not wired yet — see PLAN.md §4 (segment).')
  }

  dispose(): void {}
}
