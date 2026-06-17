/**
 * The genuinely hard problem erasecast owns: seamless, high-resolution inpainting
 * on top of a fixed-size (512²) model.
 *
 * Everything here is pure (raw typed arrays + dimensions, no DOM/GL) so it is
 * unit-tested directly. The session layer wraps these into ImageData and supplies
 * the actual per-tile LaMa call via the `inpaintTile` callback.
 */

export interface Tile {
  /** Output region in the full image. */
  x: number
  y: number
  w: number
  h: number
  /** Context-padded crop region fed to the model (>= the output region). */
  cx: number
  cy: number
  cw: number
  ch: number
}

/**
 * Grow a binary mask outward by `radius` px (chamfer-style two-pass box dilation).
 * Catches the soft edge of an object so the inpaint doesn't leave a halo.
 */
export function dilateMask(
  mask: Uint8ClampedArray,
  width: number,
  height: number,
  radius: number,
): Uint8ClampedArray {
  if (radius < 1) return mask.slice()
  const out = mask.slice()
  // Horizontal then vertical max-filter (separable), repeated is unnecessary for box.
  const passH = (src: Uint8ClampedArray) => {
    const d = new Uint8ClampedArray(src.length)
    for (let y = 0; y < height; y++) {
      const row = y * width
      for (let x = 0; x < width; x++) {
        let m = 0
        for (let k = -radius; k <= radius; k++) {
          const xx = x + k
          if (xx >= 0 && xx < width && src[row + xx]! > m) m = src[row + xx]!
        }
        d[row + x] = m
      }
    }
    return d
  }
  const passV = (src: Uint8ClampedArray) => {
    const d = new Uint8ClampedArray(src.length)
    for (let x = 0; x < width; x++) {
      for (let y = 0; y < height; y++) {
        let m = 0
        for (let k = -radius; k <= radius; k++) {
          const yy = y + k
          if (yy >= 0 && yy < height && src[yy * width + x]! > m) m = src[yy * width + x]!
        }
        d[y * width + x] = m
      }
    }
    return d
  }
  return passV(passH(out))
}

/** Bounding box of nonzero mask pixels, or null if empty. */
export function maskBounds(
  mask: Uint8ClampedArray,
  width: number,
  height: number,
): { x0: number; y0: number; x1: number; y1: number } | null {
  let x0 = width,
    y0 = height,
    x1 = -1,
    y1 = -1
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++)
      if (mask[y * width + x]! > 0) {
        if (x < x0) x0 = x
        if (y < y0) y0 = y
        if (x > x1) x1 = x
        if (y > y1) y1 = y
      }
  return x1 < 0 ? null : { x0, y0, x1, y1 }
}

/**
 * Plan the set of tiles to inpaint: only those whose output region intersects the
 * mask. Each tile is `tileSize` with `overlap` between neighbours, and carries a
 * context pad (so the model sees real surrounding pixels) clamped to the image.
 */
export function planTiles(
  mask: Uint8ClampedArray,
  width: number,
  height: number,
  tileSize: number,
  overlap: number,
): Tile[] {
  const bounds = maskBounds(mask, width, height)
  if (!bounds) return []

  const step = Math.max(1, tileSize - overlap)
  const pad = Math.floor(overlap / 2)
  const tiles: Tile[] = []

  for (let y = 0; y < height; y += step) {
    for (let x = 0; x < width; x += step) {
      const w = Math.min(tileSize, width - x)
      const h = Math.min(tileSize, height - y)
      // Skip tiles whose output region misses the mask bbox entirely.
      if (x > bounds.x1 || x + w <= bounds.x0 || y > bounds.y1 || y + h <= bounds.y0) continue
      // Does any masked pixel fall inside this output region?
      let hit = false
      for (let yy = y; yy < y + h && !hit; yy++)
        for (let xx = x; xx < x + w; xx++)
          if (mask[yy * width + xx]! > 0) {
            hit = true
            break
          }
      if (!hit) continue

      const cx = Math.max(0, x - pad)
      const cy = Math.max(0, y - pad)
      const cw = Math.min(width - cx, w + pad * 2)
      const ch = Math.min(height - cy, h + pad * 2)
      tiles.push({ x, y, w, h, cx, cy, cw, ch })
      if (x + w >= width) break
    }
    if (y + tileSize >= height) break
  }
  return tiles
}

/** Raised-cosine blend weight in 0..1 over a feather band of `n` px. */
export function featherWeight(distFromEdge: number, n: number): number {
  if (n <= 0) return 1
  const t = Math.min(1, Math.max(0, distFromEdge / n))
  return 0.5 - 0.5 * Math.cos(Math.PI * t)
}

/**
 * Composite an inpainted RGBA result over the original, but only inside the mask
 * plus a soft `feather` band — so everything outside the edit stays pixel-for-pixel
 * original (no global softening). Returns a new RGBA buffer.
 */
export function compositeMasked(
  original: Uint8ClampedArray,
  inpainted: Uint8ClampedArray,
  mask: Uint8ClampedArray,
  width: number,
  height: number,
  feather: number,
): Uint8ClampedArray {
  // Distance-to-mask-edge approximation via a blurred mask gives a soft alpha.
  const alpha = softMaskAlpha(mask, width, height, feather)
  const out = original.slice()
  const n = width * height
  for (let i = 0; i < n; i++) {
    const a = alpha[i]!
    if (a <= 0) continue
    for (let c = 0; c < 3; c++) {
      const o = original[i * 4 + c]!
      const p = inpainted[i * 4 + c]!
      out[i * 4 + c] = Math.round(o * (1 - a) + p * a)
    }
  }
  return out
}

/** Mask → soft 0..1 alpha with a `feather`-px ramp at the boundary. */
export function softMaskAlpha(
  mask: Uint8ClampedArray,
  width: number,
  height: number,
  feather: number,
): Float32Array {
  const a = new Float32Array(width * height)
  for (let i = 0; i < a.length; i++) a[i] = mask[i]! > 0 ? 1 : 0
  if (feather <= 0) return a
  // Cheap feather: average the binary mask in a feather-sized window (separable box).
  const tmp = new Float32Array(a.length)
  const r = feather
  const win = r * 2 + 1
  for (let y = 0; y < height; y++) {
    const row = y * width
    let acc = 0
    for (let x = -r; x <= r; x++) acc += a[row + Math.min(width - 1, Math.max(0, x))]!
    for (let x = 0; x < width; x++) {
      tmp[row + x] = acc / win
      acc += a[row + Math.min(width - 1, x + r + 1)]! - a[row + Math.max(0, x - r)]!
    }
  }
  const out = new Float32Array(a.length)
  for (let x = 0; x < width; x++) {
    let acc = 0
    for (let y = -r; y <= r; y++) acc += tmp[Math.min(height - 1, Math.max(0, y)) * width + x]!
    for (let y = 0; y < height; y++) {
      out[y * width + x] = acc / win
      acc +=
        tmp[Math.min(height - 1, y + r + 1) * width + x]! - tmp[Math.max(0, y - r) * width + x]!
    }
  }
  // Keep fully-masked pixels at 1 so the object core is always replaced.
  for (let i = 0; i < out.length; i++) if (a[i] === 1) out[i] = 1
  return out
}
