/**
 * LaMa inpainting adapter + the high-res orchestrator.
 *
 * The model runs at a fixed size (512²). `inpaintImage` wires the chosen
 * `Strategy`: `single` (downscale once) or `tiled`/`progressive` (drive the
 * pure compositor in tiler.ts, calling LaMa per dirty tile). Model I/O is the
 * only piece left for the first implementation PR; the composite is real.
 */
import {
  compositeMasked,
  dilateMask,
  planTiles,
  type Tile,
} from './tiler'
import type { Device, Mask, Strategy } from './types'

export const DEFAULT_INPAINT_MODEL = 'Carve/LaMa-ONNX'

/**
 * LaMa session wrapper. Provides an `InpaintTileFn` bound to a cached ORT session.
 * TODO(impl): create the onnxruntime-web session (WebGPU→WASM), resize each crop to
 * 512², run, and resize the result back — see PLAN.md §4 (inpaint).
 */
export class LamaInpainter {
  constructor(private readonly options: { model?: string; device?: Device } = {}) {}

  async load(_onProgress?: (pct: number) => void): Promise<void> {
    void this.options
    throw new Error('erasecast: LamaInpainter.load not wired yet — see PLAN.md §4 (inpaint).')
  }

  /** Bound per-tile inpaint suitable to pass into `inpaintImage`. */
  readonly tile: InpaintTileFn = async () => {
    throw new Error('erasecast: LamaInpainter.tile not wired yet — see PLAN.md §4 (inpaint).')
  }

  dispose(): void {}
}

export interface InpaintOptions {
  model?: string
  device?: Device
  strategy?: Strategy
  tileSize?: number
  overlap?: number
  maskDilation?: number
  feather?: number
  onModelProgress?: (pct: number) => void
  onProgress?: (pct: number) => void
}

/** A single LaMa call over one RGBA crop + its mask, returning the filled crop. */
export type InpaintTileFn = (
  rgba: Uint8ClampedArray,
  mask: Uint8ClampedArray,
  width: number,
  height: number,
) => Promise<Uint8ClampedArray>

function cropRegion(
  src: Uint8ClampedArray,
  width: number,
  t: Tile,
  channels: number,
): Uint8ClampedArray {
  const out = new Uint8ClampedArray(t.cw * t.ch * channels)
  for (let y = 0; y < t.ch; y++) {
    const srcRow = ((t.cy + y) * width + t.cx) * channels
    const dstRow = y * t.cw * channels
    out.set(src.subarray(srcRow, srcRow + t.cw * channels), dstRow)
  }
  return out
}

function pasteRegion(
  dst: Uint8ClampedArray,
  width: number,
  t: Tile,
  patch: Uint8ClampedArray,
  channels: number,
): void {
  for (let y = 0; y < t.ch; y++) {
    const dstRow = ((t.cy + y) * width + t.cx) * channels
    const srcRow = y * t.cw * channels
    dst.set(patch.subarray(srcRow, srcRow + t.cw * channels), dstRow)
  }
}

/**
 * Inpaint `rgba` over `mask`, returning a full-resolution composited RGBA buffer.
 * Outside the (dilated, feathered) mask the original pixels are preserved exactly.
 */
export async function inpaintImage(
  rgba: Uint8ClampedArray,
  mask: Mask,
  options: InpaintOptions,
  inpaintTile: InpaintTileFn,
): Promise<Uint8ClampedArray> {
  const { width, height } = mask
  const tileSize = options.tileSize ?? 512
  const overlap = options.overlap ?? 64
  const dilation = options.maskDilation ?? 16
  const feather = options.feather ?? 8

  const grown = dilateMask(mask.data, width, height, dilation)

  if (options.strategy === 'single') {
    // One pass over the whole image (caller's inpaintTile handles down/up-scaling).
    const filled = await inpaintTile(rgba, grown, width, height)
    return compositeMasked(rgba, filled, grown, width, height, feather)
  }

  // tiled / progressive: only touch tiles intersecting the mask.
  const tiles = planTiles(grown, width, height, tileSize, overlap)
  const filledFull = rgba.slice()
  let done = 0
  for (const t of tiles) {
    const cropRgba = cropRegion(filledFull, width, t, 4)
    const cropMask = cropRegion(grown, width, t, 1)
    const out = await inpaintTile(cropRgba, cropMask, t.cw, t.ch)
    pasteRegion(filledFull, width, t, out, 4)
    options.onProgress?.((++done / tiles.length) * 100)
  }
  return compositeMasked(rgba, filledFull, grown, width, height, feather)
}
