/**
 * createEraser — the one-call entry point for the interactive workflow.
 *
 * Orchestrates: load → SAM2 encode → (click/brush → mask) → LaMa inpaint over
 * the tiled compositor → composite, with an undo/redo history. The orchestration,
 * mask bookkeeping and history are real; the two model leaves (SAM2, LaMa) live
 * behind `Sam2Segmenter` and `LamaInpainter`, filled by the first impl PR.
 */
import { loadImage } from './loader'
import { Sam2Segmenter, DEFAULT_SAM_MODEL, type Point } from './segment'
import { LamaInpainter, inpaintImage, DEFAULT_INPAINT_MODEL } from './inpaint'
import type { EraserOptions, EraserSession, ImageSource, Mask } from './types'

const DEFAULTS = {
  samModel: DEFAULT_SAM_MODEL,
  inpaintModel: DEFAULT_INPAINT_MODEL,
  device: 'auto' as const,
  strategy: 'tiled' as const,
  tileSize: 512,
  overlap: 64,
  maskDilation: 16,
  feather: 8,
  maxResolution: 2048,
}

function emptyMask(width: number, height: number): Mask {
  return { data: new Uint8ClampedArray(width * height), width, height }
}

function toImageData(rgba: Uint8ClampedArray, width: number, height: number): ImageData {
  return new ImageData(rgba, width, height)
}

export async function createEraser(
  input: ImageSource,
  options: EraserOptions = {},
): Promise<EraserSession> {
  const opts = { ...DEFAULTS, ...options }
  const { imageData, width, height } = await loadImage(input, opts.maxResolution)
  const original = imageData.data.slice()

  const canvas = Object.assign(document.createElement('canvas'), { width, height })
  const ctx = canvas.getContext('2d')!
  ctx.putImageData(new ImageData(original.slice(), width, height), 0, 0)

  const segmenter = new Sam2Segmenter(width, height, {
    model: opts.samModel,
    device: opts.device,
    onModelProgress: (p) => opts.onProgress?.('model', p),
  })
  const lama = new LamaInpainter({ model: opts.inpaintModel, device: opts.device })

  let mask = emptyMask(width, height)
  let points: Point[] = []
  let result = imageData
  const history: ImageData[] = [result]
  let historyIndex = 0
  let encoded = false

  const ensureEncoded = async () => {
    if (!encoded) {
      await segmenter.encode(original)
      encoded = true
    }
  }

  const repaint = (img: ImageData) => ctx.putImageData(img, 0, 0)

  const session: EraserSession = {
    canvas,
    get result() {
      return result
    },
    get mask() {
      return mask
    },
    mount(container) {
      container.appendChild(canvas)
      return this
    },
    async selectAt(x, y) {
      points = [{ x, y, include: true }]
      await ensureEncoded()
      mask = await segmenter.decode(points)
      return mask
    },
    async addPoint(x, y, include) {
      points.push({ x, y, include })
      await ensureEncoded()
      mask = await segmenter.decode(points)
      return mask
    },
    brush(path, brushOpts) {
      const r = brushOpts?.radius ?? 12
      const add = brushOpts?.add ?? true
      for (const [px, py] of path)
        for (let dy = -r; dy <= r; dy++)
          for (let dx = -r; dx <= r; dx++) {
            if (dx * dx + dy * dy > r * r) continue
            const xx = Math.round(px + dx)
            const yy = Math.round(py + dy)
            if (xx < 0 || yy < 0 || xx >= width || yy >= height) continue
            mask.data[yy * width + xx] = add ? 255 : 0
          }
    },
    clearSelection() {
      mask = emptyMask(width, height)
      points = []
    },
    async erase() {
      opts.onProgress?.('inpaint', 0)
      await lama.load((p) => opts.onProgress?.('model', p))
      const filled = await inpaintImage(
        result.data,
        mask,
        {
          model: opts.inpaintModel,
          device: opts.device,
          strategy: opts.strategy,
          tileSize: opts.tileSize,
          overlap: opts.overlap,
          maskDilation: opts.maskDilation,
          feather: opts.feather,
          onProgress: (p) => opts.onProgress?.('composite', p),
        },
        lama.tile,
      )
      result = toImageData(filled, width, height)
      repaint(result)
      // push onto history (drop any redo tail)
      history.splice(historyIndex + 1)
      history.push(result)
      historyIndex = history.length - 1
      session.clearSelection()
      return result
    },
    undo() {
      if (historyIndex > 0) {
        historyIndex--
        result = history[historyIndex]!
        repaint(result)
      }
    },
    redo() {
      if (historyIndex < history.length - 1) {
        historyIndex++
        result = history[historyIndex]!
        repaint(result)
      }
    },
    toBlob(type = 'image/png', quality) {
      return new Promise((resolve, reject) =>
        canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob failed'))), type, quality),
      )
    },
    dispose() {
      segmenter.dispose()
      lama.dispose()
    },
  }
  return session
}
