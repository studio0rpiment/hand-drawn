// Turning a straightened photo of a drawing into a clean ink mask.

import type { GrayImage, Mask } from './image'

/**
 * Even out lighting by dividing by an estimate of the bare paper.
 * The paper estimate is the brightest value in coarse blocks (thin ink drops out),
 * spread a little to cover thicker strokes, smoothed and scaled back up.
 * `strength` 0 leaves the image alone, 1 flattens it fully.
 */
export function flattenLight(gray: GrayImage, strength: number): GrayImage {
  const { width, height, data } = gray
  if (strength <= 0) return gray
  const block = Math.max(4, Math.round(Math.max(width, height) / 40))
  const bw = Math.ceil(width / block)
  const bh = Math.ceil(height / block)
  let bg = new Float32Array(bw * bh)
  for (let y = 0; y < height; y++) {
    const by = Math.floor(y / block) * bw
    for (let x = 0; x < width; x++) {
      const i = by + Math.floor(x / block)
      const v = data[y * width + x]
      if (v > bg[i]) bg[i] = v
    }
  }
  // A median rather than a maximum: it ignores strokes thicker than a block
  // without dragging brighter paper from the lit side into the shaded side.
  bg = medianFilter(bg, bw, bh, 2)
  bg = boxBlur(boxBlur(bg, bw, bh, 1), bw, bh, 1)

  const out = new Uint8Array(width * height)
  for (let y = 0; y < height; y++) {
    const fy = Math.min(Math.max((y + 0.5) / block - 0.5, 0), bh - 1)
    const y0 = Math.floor(fy)
    const y1 = Math.min(y0 + 1, bh - 1)
    const ay = fy - y0
    for (let x = 0; x < width; x++) {
      const fx = Math.min(Math.max((x + 0.5) / block - 0.5, 0), bw - 1)
      const x0 = Math.floor(fx)
      const x1 = Math.min(x0 + 1, bw - 1)
      const ax = fx - x0
      const top = bg[y0 * bw + x0] + (bg[y0 * bw + x1] - bg[y0 * bw + x0]) * ax
      const bot = bg[y1 * bw + x0] + (bg[y1 * bw + x1] - bg[y1 * bw + x0]) * ax
      const paper = Math.max(1, top + (bot - top) * ay)
      const v = data[y * width + x]
      const flat = Math.min(255, (v / paper) * 255)
      out[y * width + x] = Math.round(v + (flat - v) * strength)
    }
  }
  return { data: out, width, height }
}

/** Pixels at or below `level` become ink (Otsu returns the last level of the dark class). */
export function threshold(gray: GrayImage, level: number): Mask {
  const out = new Uint8Array(gray.data.length)
  for (let i = 0; i < out.length; i++) out[i] = gray.data[i] <= level ? 1 : 0
  return { data: out, width: gray.width, height: gray.height }
}

/** Clear a border of `fraction` of the shorter side, where table edges and shadows creep in. */
export function trimEdges(mask: Mask, fraction: number): Mask {
  const { width, height } = mask
  const m = Math.round(Math.min(width, height) * fraction)
  if (m <= 0) return mask
  const out = mask.data.slice()
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (x < m || y < m || x >= width - m || y >= height - m) out[y * width + x] = 0
    }
  }
  return { data: out, width, height }
}

/** Thicken (positive) or thin (negative) the ink by `px` pixels. */
export function lineWeight(mask: Mask, px: number): Mask {
  if (px === 0) return mask
  const { width, height } = mask
  const src = new Float32Array(mask.data.length)
  // Thinning the ink is thickening the paper.
  for (let i = 0; i < src.length; i++) src[i] = px > 0 ? mask.data[i] : 1 - mask.data[i]
  const grown = maxFilter(src, width, height, Math.abs(px))
  const out = new Uint8Array(src.length)
  for (let i = 0; i < out.length; i++) out[i] = px > 0 ? grown[i] : 1 - grown[i]
  return { data: out, width, height }
}

/**
 * Remove ink specks smaller than `minArea` pixels, and fill pinholes in the
 * ink smaller than `minArea` too.
 */
export function despeckle(mask: Mask, minArea: number): Mask {
  if (minArea <= 1) return mask
  const once = removeSmall(mask.data, mask.width, mask.height, 1, minArea)
  const filled = removeSmall(once, mask.width, mask.height, 0, minArea)
  return { data: filled, width: mask.width, height: mask.height }
}

/** Flip connected regions of `value` smaller than `minArea` to the other value. */
function removeSmall(data: Uint8Array, w: number, h: number, value: number, minArea: number): Uint8Array {
  const out = data.slice()
  const seen = new Uint8Array(data.length)
  const stack = new Int32Array(data.length)
  // Only regions smaller than minArea are ever flipped, so record at most that many pixels;
  // a big region (the open paper) is still walked, to mark it seen, but not stored.
  const region = new Int32Array(Math.max(1, minArea))
  for (let start = 0; start < data.length; start++) {
    if (data[start] !== value || seen[start]) continue
    let top = 0
    let area = 0
    let touchesEdge = false
    stack[top++] = start
    seen[start] = 1
    while (top > 0) {
      const p = stack[--top]
      if (area < minArea) region[area] = p
      area++
      const x = p % w
      const y = (p - x) / w
      if (x === 0 || y === 0 || x === w - 1 || y === h - 1) touchesEdge = true
      if (x > 0 && data[p - 1] === value && !seen[p - 1]) (seen[p - 1] = 1), (stack[top++] = p - 1)
      if (x < w - 1 && data[p + 1] === value && !seen[p + 1]) (seen[p + 1] = 1), (stack[top++] = p + 1)
      if (y > 0 && data[p - w] === value && !seen[p - w]) (seen[p - w] = 1), (stack[top++] = p - w)
      if (y < h - 1 && data[p + w] === value && !seen[p + w]) (seen[p + w] = 1), (stack[top++] = p + w)
    }
    // The open paper around the drawing touches the edge; never fill it in.
    if (area < minArea && !(value === 0 && touchesEdge)) {
      for (let i = 0; i < area; i++) out[region[i]] = 1 - value
    }
  }
  return out
}

export interface Box {
  x: number
  y: number
  width: number
  height: number
}

/** Bounding box of the ink, grown by `pad` pixels and kept inside the image. Null when there is no ink. */
export function inkBox(mask: Mask, pad: number): Box | null {
  const { width, height, data } = mask
  let x0 = width
  let y0 = height
  let x1 = -1
  let y1 = -1
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (!data[y * width + x]) continue
      if (x < x0) x0 = x
      if (x > x1) x1 = x
      if (y < y0) y0 = y
      if (y > y1) y1 = y
    }
  }
  if (x1 < 0) return null
  x0 = Math.max(0, x0 - pad)
  y0 = Math.max(0, y0 - pad)
  x1 = Math.min(width - 1, x1 + pad)
  y1 = Math.min(height - 1, y1 + pad)
  return { x: x0, y: y0, width: x1 - x0 + 1, height: y1 - y0 + 1 }
}

export function cropMask(mask: Mask, box: Box): Mask {
  const out = new Uint8Array(box.width * box.height)
  for (let y = 0; y < box.height; y++) {
    const from = (box.y + y) * mask.width + box.x
    out.set(mask.data.subarray(from, from + box.width), y * box.width)
  }
  return { data: out, width: box.width, height: box.height }
}

function medianFilter(src: Float32Array<ArrayBuffer>, w: number, h: number, r: number): Float32Array<ArrayBuffer> {
  const out = new Float32Array(src.length)
  const win: number[] = []
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      win.length = 0
      for (let ky = Math.max(0, y - r); ky <= Math.min(h - 1, y + r); ky++) {
        for (let kx = Math.max(0, x - r); kx <= Math.min(w - 1, x + r); kx++) win.push(src[ky * w + kx])
      }
      win.sort((a, b) => a - b)
      out[y * w + x] = win[win.length >> 1]
    }
  }
  return out
}

/** Square maximum filter of radius r, done as two 1-D passes. */
function maxFilter(src: Float32Array<ArrayBuffer>, w: number, h: number, r: number): Float32Array<ArrayBuffer> {
  const tmp = new Float32Array(src.length)
  const out = new Float32Array(src.length)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let m = -Infinity
      for (let k = Math.max(0, x - r); k <= Math.min(w - 1, x + r); k++) m = Math.max(m, src[y * w + k])
      tmp[y * w + x] = m
    }
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let m = -Infinity
      for (let k = Math.max(0, y - r); k <= Math.min(h - 1, y + r); k++) m = Math.max(m, tmp[k * w + x])
      out[y * w + x] = m
    }
  }
  return out
}

function boxBlur(src: Float32Array<ArrayBuffer>, w: number, h: number, r: number): Float32Array<ArrayBuffer> {
  const tmp = new Float32Array(src.length)
  const out = new Float32Array(src.length)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let s = 0
      let n = 0
      for (let k = Math.max(0, x - r); k <= Math.min(w - 1, x + r); k++, n++) s += src[y * w + k]
      tmp[y * w + x] = s / n
    }
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let s = 0
      let n = 0
      for (let k = Math.max(0, y - r); k <= Math.min(h - 1, y + r); k++, n++) s += tmp[k * w + x]
      out[y * w + x] = s / n
    }
  }
  return out
}
