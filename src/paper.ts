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
 * Guess the paper's corners from brightness alone: the largest bright region,
 * grown into its shadows, and the largest four-sided shape inside it. Returns null when nothing paper-like stands out,
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

  const quad = regionQuad(label, bestLabel, w, h)
  const sx = gray.width / w
  const sy = gray.height / h
  return quad.map((c) => ({ x: (c.x + 0.5) * sx, y: (c.y + 0.5) * sy })) as Quad
}

/**
 * Find the paper by its colour: paper is nearly grey (white, or grey in
 * shadow), while tables, wood and fabric have colour. The largest such region
 * that is not dark is the sheet; its four corners are those of the largest
 * four-sided shape inside its outline. Returns null when no sheet stands out.
 */
export function findPaperInColour(img: RGBAImage): Quad | null {
  const factor = Math.max(1, Math.floor(Math.max(img.width, img.height) / DETECT_SIZE))
  const w = Math.floor(img.width / factor)
  const h = Math.floor(img.height / factor)
  const paper = new Uint8Array(w * h)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let r = 0
      let g = 0
      let b = 0
      for (let dy = 0; dy < factor; dy++) {
        for (let dx = 0; dx < factor; dx++) {
          const i = ((y * factor + dy) * img.width + x * factor + dx) * 4
          r += img.data[i]
          g += img.data[i + 1]
          b += img.data[i + 2]
        }
      }
      const n = factor * factor
      const mx = Math.max(r, g, b) / n
      const mn = Math.min(r, g, b) / n
      paper[y * w + x] = mx > 70 && (mx - mn) / mx < 0.25 ? 1 : 0
    }
  }
  const label = new Int32Array(w * h).fill(-1)
  const stack = new Int32Array(w * h)
  let best = -1
  let bestArea = 0
  for (let start = 0, next = 0; start < paper.length; start++) {
    if (!paper[start] || label[start] !== -1) continue
    let top = 0
    let area = 0
    stack[top++] = start
    label[start] = next
    while (top > 0) {
      const p = stack[--top]
      area++
      const x = p % w
      const y = (p - x) / w
      for (const q of [x > 0 ? p - 1 : -1, x < w - 1 ? p + 1 : -1, y > 0 ? p - w : -1, y < h - 1 ? p + w : -1]) {
        if (q >= 0 && paper[q] && label[q] === -1) {
          label[q] = next
          stack[top++] = q
        }
      }
    }
    if (area > bestArea) {
      bestArea = area
      best = next
    }
    next++
  }
  if (best < 0 || bestArea < w * h * 0.15) return null
  return regionQuad(label, best, w, h).map((c) => ({ x: (c.x + 0.5) * factor, y: (c.y + 0.5) * factor })) as Quad
}

/** Convex hull (monotone chain), counter-clockwise in screen terms. */
function hull(points: Point[]): Point[] {
  const pts = [...points].sort((a, b) => a.x - b.x || a.y - b.y)
  const cross = (o: Point, a: Point, b: Point) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x)
  const lower: Point[] = []
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop()
    lower.push(p)
  }
  const upper: Point[] = []
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i]
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop()
    upper.push(p)
  }
  return [...lower.slice(0, -1), ...upper.slice(0, -1)]
}

/**
 * The corners of a region: the largest four-sided shape with its corners on
 * the region's convex outline, ordered top left, top right, bottom right,
 * bottom left. Robust where the region's extremes are not its corners (a
 * turned sheet, a nibbled edge).
 */
export function regionQuad(label: Int32Array, which: number, w: number, h: number): Point[] {
  // The outline: each row's leftmost and rightmost pixel.
  const edge: Point[] = []
  for (let y = 0; y < h; y++) {
    let x0 = -1
    let x1 = -1
    for (let x = 0; x < w; x++) {
      if (label[y * w + x] !== which) continue
      if (x0 < 0) x0 = x
      x1 = x
    }
    if (x0 >= 0) edge.push({ x: x0, y }, { x: x1 + 1, y })
  }
  const H = hull(edge)
  const n = H.length
  if (n < 4) return H.concat(H).slice(0, 4)
  const area2 = (a: Point, b: Point, c: Point) => Math.abs((b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x))
  // For each diagonal i–k, the farthest hull point on each side.
  let bestA = -1
  let quad = [0, 1, 2, 3]
  for (let i = 0; i < n; i++) {
    for (let k = i + 2; k < n; k++) {
      let left = 0
      let lj = -1
      for (let j = i + 1; j < k; j++) {
        const a = area2(H[i], H[j], H[k])
        if (a > left) (left = a), (lj = j)
      }
      let right = 0
      let rl = -1
      for (let l = k + 1; l < n + i; l++) {
        const a = area2(H[i], H[k], H[l % n])
        if (a > right) (right = a), (rl = l % n)
      }
      if (lj >= 0 && rl >= 0 && left + right > bestA) {
        bestA = left + right
        quad = [i, lj, k, rl]
      }
    }
  }
  const pts = quad.map((q) => H[q])
  // Order round the centre, starting from the top-left-most.
  const cx = pts.reduce((a, p) => a + p.x, 0) / 4
  const cy = pts.reduce((a, p) => a + p.y, 0) / 4
  pts.sort((a, b) => Math.atan2(a.y - cy, a.x - cx) - Math.atan2(b.y - cy, b.x - cx))
  const start = pts.reduce((bi, p, i) => (p.x + p.y < pts[bi].x + pts[bi].y ? i : bi), 0)
  return [0, 1, 2, 3].map((k) => pts[(start + k) % 4])
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
