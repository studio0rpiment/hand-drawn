// Finding the sheet of paper in a phone photo and straightening it.

import { otsu, shrinkGray, type GrayImage, type Point, type Quad, type RGBAImage } from './image'

const DETECT_SIZE = 320

export function fullFrame(width: number, height: number): Quad {
  return [
    { x: 0, y: 0 },
    { x: width, y: 0 },
    { x: width, y: height },
    { x: 0, y: height },
  ]
}

/**
 * Guess the paper's corners: the largest bright region, and its extreme points
 * along the two diagonals. Returns null when nothing paper-like stands out,
 * so the caller can fall back to the whole frame and let the person drag.
 */
export function findPaper(gray: GrayImage): Quad | null {
  const factor = Math.max(1, Math.floor(Math.max(gray.width, gray.height) / DETECT_SIZE))
  const small = shrinkGray(gray, factor)
  const { width: w, height: h, data } = small
  const t = otsu(small)

  const label = new Int32Array(w * h).fill(-1)
  const stack = new Int32Array(w * h)
  let bestLabel = -1
  let bestArea = 0
  let next = 0
  for (let start = 0; start < data.length; start++) {
    if (data[start] <= t || label[start] !== -1) continue
    let top = 0
    let area = 0
    stack[top++] = start
    label[start] = next
    while (top > 0) {
      const p = stack[--top]
      area++
      const x = p % w
      const y = (p - x) / w
      const around = [x > 0 ? p - 1 : -1, x < w - 1 ? p + 1 : -1, y > 0 ? p - w : -1, y < h - 1 ? p + w : -1]
      for (const q of around) {
        if (q >= 0 && data[q] > t && label[q] === -1) {
          label[q] = next
          stack[top++] = q
        }
      }
    }
    if (area > bestArea) {
      bestArea = area
      bestLabel = next
    }
    next++
  }

  if (bestLabel < 0 || bestArea < w * h * 0.15) return null

  // Shadows darken parts of the sheet below the cut-off. Grow the sheet into
  // touching pixels that are still clearly lighter than the table.
  let darkSum = 0
  let darkN = 0
  for (const v of data) if (v <= t) (darkSum += v), darkN++
  const low = darkN ? (darkSum / darkN + t) / 2 : t
  let top = 0
  for (let p = 0; p < label.length; p++) if (label[p] === bestLabel) stack[top++] = p
  while (top > 0) {
    const p = stack[--top]
    const x = p % w
    const y = (p - x) / w
    const around = [x > 0 ? p - 1 : -1, x < w - 1 ? p + 1 : -1, y > 0 ? p - w : -1, y < h - 1 ? p + w : -1]
    for (const q of around) {
      if (q >= 0 && label[q] !== bestLabel && data[q] > low) {
        label[q] = bestLabel
        stack[top++] = q
      }
    }
  }

  let tl = { s: Infinity, x: 0, y: 0 }
  let br = { s: -Infinity, x: 0, y: 0 }
  let tr = { s: -Infinity, x: 0, y: 0 }
  let bl = { s: Infinity, x: 0, y: 0 }
  for (let p = 0; p < label.length; p++) {
    if (label[p] !== bestLabel) continue
    const x = p % w
    const y = (p - x) / w
    if (x + y < tl.s) tl = { s: x + y, x, y }
    if (x + y > br.s) br = { s: x + y, x, y }
    if (x - y > tr.s) tr = { s: x - y, x, y }
    if (x - y < bl.s) bl = { s: x - y, x, y }
  }
  const sx = gray.width / w
  const sy = gray.height / h
  const scale = (c: { x: number; y: number }): Point => ({ x: (c.x + 0.5) * sx, y: (c.y + 0.5) * sy })
  return [scale(tl), scale(tr), scale(br), scale(bl)]
}

/** Output size for a quad: the longer of each pair of opposite edges. */
export function quadSize(q: Quad, maxSide: number): { width: number; height: number } {
  const d = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y)
  let width = Math.max(d(q[0], q[1]), d(q[3], q[2]))
  let height = Math.max(d(q[0], q[3]), d(q[1], q[2]))
  const s = Math.min(1, maxSide / Math.max(width, height))
  width = Math.max(1, Math.round(width * s))
  height = Math.max(1, Math.round(height * s))
  return { width, height }
}

/**
 * Homography taking the rectangle (0,0)-(w,h) onto quad `q`, as the 8
 * coefficients a..h of x' = (ax + by + c) / (gx + hy + 1), y' = (dx + ey + f) / (gx + hy + 1).
 */
export function rectToQuad(w: number, h: number, q: Quad): number[] {
  const src: Point[] = [
    { x: 0, y: 0 },
    { x: w, y: 0 },
    { x: w, y: h },
    { x: 0, y: h },
  ]
  const A: number[][] = []
  const b: number[] = []
  for (let i = 0; i < 4; i++) {
    const { x, y } = src[i]
    const { x: u, y: v } = q[i]
    A.push([x, y, 1, 0, 0, 0, -u * x, -u * y])
    b.push(u)
    A.push([0, 0, 0, x, y, 1, -v * x, -v * y])
    b.push(v)
  }
  return solve(A, b)
}

export function applyHomography(H: number[], x: number, y: number): Point {
  const den = H[6] * x + H[7] * y + 1
  return { x: (H[0] * x + H[1] * y + H[2]) / den, y: (H[3] * x + H[4] * y + H[5]) / den }
}

/** Gaussian elimination with partial pivoting. */
function solve(A: number[][], b: number[]): number[] {
  const n = b.length
  const M = A.map((row, i) => [...row, b[i]])
  for (let col = 0; col < n; col++) {
    let pivot = col
    for (let r = col + 1; r < n; r++) if (Math.abs(M[r][col]) > Math.abs(M[pivot][col])) pivot = r
    ;[M[col], M[pivot]] = [M[pivot], M[col]]
    const p = M[col][col]
    if (Math.abs(p) < 1e-12) throw new Error('The corners are in a line; drag them apart.')
    for (let r = 0; r < n; r++) {
      if (r === col) continue
      const f = M[r][col] / p
      for (let c = col; c <= n; c++) M[r][c] -= f * M[col][c]
    }
  }
  return M.map((row, i) => row[n] / row[i])
}

/** Straighten the quad in `src` into a width × height image (bilinear sampling). */
export function warp(src: RGBAImage, q: Quad, width: number, height: number): RGBAImage {
  const H = rectToQuad(width, height, q)
  const out = new Uint8ClampedArray(width * height * 4)
  const sw = src.width
  const sh = src.height
  const s = src.data
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const p = applyHomography(H, x + 0.5, y + 0.5)
      const fx = Math.min(Math.max(p.x - 0.5, 0), sw - 1)
      const fy = Math.min(Math.max(p.y - 0.5, 0), sh - 1)
      const x0 = Math.floor(fx)
      const y0 = Math.floor(fy)
      const x1 = Math.min(x0 + 1, sw - 1)
      const y1 = Math.min(y0 + 1, sh - 1)
      const ax = fx - x0
      const ay = fy - y0
      const i00 = (y0 * sw + x0) * 4
      const i10 = (y0 * sw + x1) * 4
      const i01 = (y1 * sw + x0) * 4
      const i11 = (y1 * sw + x1) * 4
      const o = (y * width + x) * 4
      for (let c = 0; c < 4; c++) {
        const top = s[i00 + c] + (s[i10 + c] - s[i00 + c]) * ax
        const bot = s[i01 + c] + (s[i11 + c] - s[i01 + c]) * ax
        out[o + c] = top + (bot - top) * ay
      }
    }
  }
  return { data: out, width, height }
}
