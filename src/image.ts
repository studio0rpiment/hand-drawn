// Plain image shapes, so the processing code runs in tests without a DOM.
// ImageData satisfies RGBAImage.

export interface RGBAImage {
  data: Uint8ClampedArray<ArrayBuffer>
  width: number
  height: number
}

export interface GrayImage {
  data: Uint8Array
  width: number
  height: number
}

/** 1 = ink, 0 = paper. */
export interface Mask {
  data: Uint8Array
  width: number
  height: number
}

export interface Point {
  x: number
  y: number
}

/** Corners in order: top-left, top-right, bottom-right, bottom-left. */
export type Quad = [Point, Point, Point, Point]

export function toGray(img: RGBAImage): GrayImage {
  const { width, height, data } = img
  const out = new Uint8Array(width * height)
  for (let i = 0, j = 0; i < out.length; i++, j += 4) {
    // Rec. 709 luma; transparent pixels count as paper.
    const a = data[j + 3] / 255
    const y = 0.2126 * data[j] + 0.7152 * data[j + 1] + 0.0722 * data[j + 2]
    out[i] = Math.round(y * a + 255 * (1 - a))
  }
  return { data: out, width, height }
}

/** Otsu's threshold: the gray level that best splits the histogram in two. */
export function otsu(gray: GrayImage): number {
  const hist = new Float64Array(256)
  for (const v of gray.data) hist[v]++
  const total = gray.data.length
  let sumAll = 0
  for (let i = 0; i < 256; i++) sumAll += i * hist[i]
  let sumB = 0
  let wB = 0
  let best = 0
  let bestVar = -1
  for (let t = 0; t < 256; t++) {
    wB += hist[t]
    if (wB === 0) continue
    const wF = total - wB
    if (wF === 0) break
    sumB += t * hist[t]
    const mB = sumB / wB
    const mF = (sumAll - sumB) / wF
    const between = wB * wF * (mB - mF) ** 2
    if (between > bestVar) {
      bestVar = between
      best = t
    }
  }
  return best
}

/** Box-filter downscale of a gray image by an integer factor. */
export function shrinkGray(gray: GrayImage, factor: number): GrayImage {
  const w = Math.max(1, Math.floor(gray.width / factor))
  const h = Math.max(1, Math.floor(gray.height / factor))
  const out = new Uint8Array(w * h)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let sum = 0
      for (let dy = 0; dy < factor; dy++) {
        const row = (y * factor + dy) * gray.width
        for (let dx = 0; dx < factor; dx++) sum += gray.data[row + x * factor + dx]
      }
      out[y * w + x] = Math.round(sum / (factor * factor))
    }
  }
  return { data: out, width: w, height: h }
}
