/**
 * Background synthesis for disocclusion fill.
 *
 * When the camera moves, regions behind foreground objects become visible.
 * A naive displaced mesh stretches ("rubber-sheets") there. Instead we
 * pre-render a background layer where foreground silhouettes have been
 * removed and filled with surrounding background colour, then draw it behind
 * the displaced foreground. Revealed gaps then show plausible background.
 *
 * The fill uses a **push–pull** image pyramid (Gortler et al. style): repeated
 * weighted downsampling (pull) collapses known colour into coarse levels, then
 * upsampling (push) bleeds it back into the holes. Handles large holes in O(n).
 */

/** Build a "remove the foreground" mask from a depth map. */
export function foregroundMask(
  depth: Uint8ClampedArray,
  width: number,
  height: number,
  options: { edgeThreshold?: number; dilate?: number } = {},
): Uint8Array {
  const { edgeThreshold = 18, dilate = Math.max(2, Math.round(Math.min(width, height) * 0.012)) } =
    options
  const mask = new Uint8Array(width * height)

  // Mark the *near* side of strong depth discontinuities.
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x
      const d = depth[i] as number
      let maxDrop = 0
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx
          const ny = y + dy
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue
          const drop = d - (depth[ny * width + nx] as number) // positive => we are nearer
          if (drop > maxDrop) maxDrop = drop
        }
      }
      if (maxDrop > edgeThreshold) mask[i] = 1
    }
  }

  return dilateMask(mask, width, height, dilate)
}

function dilateMask(mask: Uint8Array, width: number, height: number, radius: number): Uint8Array {
  if (radius <= 0) return mask
  // Separable max filter (horizontal then vertical) for a square dilation.
  const tmp = new Uint8Array(width * height)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let v = 0
      for (let dx = -radius; dx <= radius; dx++) {
        const nx = x + dx
        if (nx < 0 || nx >= width) continue
        if (mask[y * width + nx]) {
          v = 1
          break
        }
      }
      tmp[y * width + x] = v
    }
  }
  const out = new Uint8Array(width * height)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let v = 0
      for (let dy = -radius; dy <= radius; dy++) {
        const ny = y + dy
        if (ny < 0 || ny >= height) continue
        if (tmp[ny * width + x]) {
          v = 1
          break
        }
      }
      out[y * width + x] = v
    }
  }
  return out
}

interface Level {
  w: number
  h: number
  /** premultiplied rgb + weight, length w*h*4 */
  data: Float32Array
}

function pull(fine: Level): Level {
  const w = Math.max(1, fine.w >> 1)
  const h = Math.max(1, fine.h >> 1)
  const data = new Float32Array(w * h * 4)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let r = 0
      let g = 0
      let b = 0
      let wsum = 0
      for (let dy = 0; dy < 2; dy++) {
        for (let dx = 0; dx < 2; dx++) {
          const sx = Math.min(fine.w - 1, x * 2 + dx)
          const sy = Math.min(fine.h - 1, y * 2 + dy)
          const o = (sy * fine.w + sx) * 4
          const wt = fine.data[o + 3] as number
          r += (fine.data[o] as number) * wt
          g += (fine.data[o + 1] as number) * wt
          b += (fine.data[o + 2] as number) * wt
          wsum += wt
        }
      }
      const o = (y * w + x) * 4
      const inv = wsum > 0 ? 1 / wsum : 0
      data[o] = r * inv
      data[o + 1] = g * inv
      data[o + 2] = b * inv
      data[o + 3] = Math.min(1, wsum) // confidence saturates at 1
    }
  }
  return { w, h, data }
}

function push(coarse: Level, fine: Level): void {
  for (let y = 0; y < fine.h; y++) {
    for (let x = 0; x < fine.w; x++) {
      const o = (y * fine.w + x) * 4
      const known = fine.data[o + 3] as number
      if (known >= 1) continue // already fully known
      const cx = Math.min(coarse.w - 1, x >> 1)
      const cy = Math.min(coarse.h - 1, y >> 1)
      const co = (cy * coarse.w + cx) * 4
      const fill = 1 - known
      fine.data[o] = (fine.data[o] as number) + (coarse.data[co] as number) * fill
      fine.data[o + 1] = (fine.data[o + 1] as number) + (coarse.data[co + 1] as number) * fill
      fine.data[o + 2] = (fine.data[o + 2] as number) + (coarse.data[co + 2] as number) * fill
      fine.data[o + 3] = 1
    }
  }
}

/**
 * Remove the masked (foreground) pixels and fill with surrounding colour.
 * Returns a new ImageData suitable as the background layer texture.
 */
export function inpaintBackground(image: ImageData, mask: Uint8Array): ImageData {
  const { width, height, data } = image
  const base: Level = { w: width, h: height, data: new Float32Array(width * height * 4) }
  for (let i = 0; i < width * height; i++) {
    const known = mask[i] ? 0 : 1
    const o = i * 4
    base.data[o] = (data[o] as number) / 255
    base.data[o + 1] = (data[o + 1] as number) / 255
    base.data[o + 2] = (data[o + 2] as number) / 255
    base.data[o + 3] = known
  }

  // Build pyramid (pull).
  const levels: Level[] = [base]
  while (levels[levels.length - 1]!.w > 1 && levels[levels.length - 1]!.h > 1) {
    levels.push(pull(levels[levels.length - 1]!))
  }
  // Bleed back down (push).
  for (let i = levels.length - 2; i >= 0; i--) {
    push(levels[i + 1]!, levels[i]!)
  }

  const out = new Uint8ClampedArray(width * height * 4)
  for (let i = 0; i < width * height; i++) {
    const o = i * 4
    out[o] = (base.data[o] as number) * 255
    out[o + 1] = (base.data[o + 1] as number) * 255
    out[o + 2] = (base.data[o + 2] as number) * 255
    out[o + 3] = 255
  }
  return new ImageData(out, width, height)
}

/** Cheap fallback background: a heavy box blur of the image (for `feather`). */
export function blurBackground(image: ImageData, radius = 12): ImageData {
  const { width, height, data } = image
  const out = new Uint8ClampedArray(data.length)
  const tmp = new Float32Array(data.length)
  // Horizontal then vertical box blur (separable).
  for (let y = 0; y < height; y++) {
    for (let c = 0; c < 3; c++) {
      let acc = 0
      for (let x = -radius; x <= radius; x++) {
        acc += data[(y * width + clamp(x, 0, width - 1)) * 4 + c] as number
      }
      const div = radius * 2 + 1
      for (let x = 0; x < width; x++) {
        tmp[(y * width + x) * 4 + c] = acc / div
        const add = data[(y * width + clamp(x + radius + 1, 0, width - 1)) * 4 + c] as number
        const sub = data[(y * width + clamp(x - radius, 0, width - 1)) * 4 + c] as number
        acc += add - sub
      }
    }
  }
  for (let x = 0; x < width; x++) {
    for (let c = 0; c < 3; c++) {
      let acc = 0
      for (let y = -radius; y <= radius; y++) {
        acc += tmp[(clamp(y, 0, height - 1) * width + x) * 4 + c] as number
      }
      const div = radius * 2 + 1
      for (let y = 0; y < height; y++) {
        out[(y * width + x) * 4 + c] = acc / div
        const add = tmp[(clamp(y + radius + 1, 0, height - 1) * width + x) * 4 + c] as number
        const sub = tmp[(clamp(y - radius, 0, height - 1) * width + x) * 4 + c] as number
        acc += add - sub
      }
      for (let y = 0; y < height; y++) out[(y * width + x) * 4 + 3] = 255
    }
  }
  return new ImageData(out, width, height)
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v
}
