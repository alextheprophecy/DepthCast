/**
 * Pure depth-map math. No DOM, no GL — easy to unit test.
 *
 * Depth Anything V2 outputs *relative inverse depth*: larger raw value = closer
 * to camera. We normalize to 8-bit grayscale with a consistent convention:
 *
 *     near  -> 255 (bright)
 *     far   -> 0   (dark)
 */

/**
 * Min–max normalize a float depth buffer into a 0..255 Uint8 grayscale buffer.
 * `nearIsBright` controls the output convention (defaults to bright = near).
 */
export function normalizeDepthToGray(
  data: ArrayLike<number>,
  options: { nearIsBright?: boolean } = {},
): Uint8ClampedArray {
  const { nearIsBright = true } = options
  const n = data.length
  const out = new Uint8ClampedArray(n)
  if (n === 0) return out

  let min = Infinity
  let max = -Infinity
  for (let i = 0; i < n; i++) {
    const v = data[i] as number
    if (v < min) min = v
    if (v > max) max = v
  }

  const range = max - min
  if (range === 0) {
    out.fill(128)
    return out
  }

  const scale = 255 / range
  for (let i = 0; i < n; i++) {
    const norm = ((data[i] as number) - min) * scale // 0 (far) .. 255 (near), since raw is inverse depth
    out[i] = nearIsBright ? norm : 255 - norm
  }
  return out
}

/** Expand a single-channel gray buffer to packed RGBA ImageData. */
export function grayToImageData(gray: ArrayLike<number>, width: number, height: number): ImageData {
  const rgba = new Uint8ClampedArray(width * height * 4)
  for (let i = 0; i < width * height; i++) {
    const g = gray[i] as number
    const o = i * 4
    rgba[o] = g
    rgba[o + 1] = g
    rgba[o + 2] = g
    rgba[o + 3] = 255
  }
  return new ImageData(rgba, width, height)
}

/** Read the luminance (depth) channel out of an RGBA depth ImageData. */
export function imageDataToGray(image: ImageData): Uint8ClampedArray {
  const { data, width, height } = image
  const out = new Uint8ClampedArray(width * height)
  for (let i = 0; i < width * height; i++) {
    // Depth maps are grayscale; the red channel is sufficient.
    out[i] = data[i * 4] as number
  }
  return out
}
