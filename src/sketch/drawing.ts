// A sketch's drawing, from the scan step's ink to what every output kind
// starts from: marks left out, pencil tones kept as grey, fine tuned (rotate,
// line spread, margin), and lined up with another sketch. Pure, no DOM.

import { fineTune } from '../finetune'
import type { GrayImage, Mask, Point } from '../image'

/**
 * The drawing every output kind starts from, in one frame: `mask` is the
 * ink as black and white (for tracing), `tone` the ink's coverage 0–255
 * with its pencil tones (as photographed).
 */
export interface Prepared {
  width: number
  height: number
  mask: Mask
  tone: Uint8Array
}

/** The ink pixels joined to one (8 neighbours), starting from `start`. */
function component(mask: Mask, start: number, visit: (i: number) => void) {
  const { width: w, height: h, data } = mask
  const seen = new Uint8Array(data.length)
  const stack = [start]
  seen[start] = 1
  while (stack.length) {
    const p = stack.pop()!
    visit(p)
    const x = p % w
    const y = (p - x) / w
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx
        const ny = y + dy
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue
        const q = ny * w + nx
        if (data[q] && !seen[q]) {
          seen[q] = 1
          stack.push(q)
        }
      }
    }
  }
}

/** The ink pixel nearest (x, y), within `reach` pixels, or null when the tap missed every mark. */
export function markAt(mask: Mask, x: number, y: number, reach = 8): Point | null {
  let best: Point | null = null
  let bestD = reach * reach + 1
  const x0 = Math.max(0, Math.floor(x - reach))
  const x1 = Math.min(mask.width - 1, Math.ceil(x + reach))
  const y0 = Math.max(0, Math.floor(y - reach))
  const y1 = Math.min(mask.height - 1, Math.ceil(y + reach))
  for (let py = y0; py <= y1; py++) {
    for (let px = x0; px <= x1; px++) {
      if (!mask.data[py * mask.width + px]) continue
      const d = (px - x) ** 2 + (py - y) ** 2
      if (d < bestD) {
        bestD = d
        best = { x: px, y: py }
      }
    }
  }
  return best
}

/** The marks left out: every mark touched by one of `points`, as a mask of their own. */
export function leftOutMarks(mask: Mask, points: Point[]): Mask {
  const out = new Uint8Array(mask.data.length)
  for (const p of points) {
    const hit = markAt(mask, p.x, p.y)
    if (!hit) continue
    const start = hit.y * mask.width + hit.x
    if (out[start]) continue
    component(mask, start, (i) => (out[i] = 1))
  }
  return { width: mask.width, height: mask.height, data: out }
}

/** The ink without the marks left out. */
export function leaveOut(mask: Mask, points: Point[]): Mask {
  if (!points.length) return mask
  const gone = leftOutMarks(mask, points)
  const data = mask.data.slice()
  for (let i = 0; i < data.length; i++) if (gone.data[i]) data[i] = 0
  return { width: mask.width, height: mask.height, data }
}

/** Grow the ink by `r` pixels (a square reach), for the soft edge round pencil lines. */
function grow(mask: Mask, r: number): Uint8Array {
  const { width: w, height: h, data } = mask
  const tmp = new Uint8Array(data.length)
  const out = new Uint8Array(data.length)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let v = 0
      for (let k = Math.max(0, x - r); k <= Math.min(w - 1, x + r) && !v; k++) v = data[y * w + k]
      tmp[y * w + x] = v
    }
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let v = 0
      for (let k = Math.max(0, y - r); k <= Math.min(h - 1, y + r) && !v; k++) v = tmp[k * w + x]
      out[y * w + x] = v
    }
  }
  return out
}

/**
 * The ink as coverage 0–255 with its pencil tones: the light-evened photo's
 * grey, from the paper's level (0) to the darkest ink (255), kept only on
 * and just round the ink, so specks and marks already taken out stay out.
 */
export function inkTone(gray: GrayImage, mask: Mask): Uint8Array {
  const n = mask.data.length
  const paperHist = new Uint32Array(256)
  const inkHist = new Uint32Array(256)
  for (let i = 0; i < n; i++) (mask.data[i] ? inkHist : paperHist)[gray.data[i]]++
  const at = (hist: Uint32Array, q: number) => {
    const total = hist.reduce((a, b) => a + b, 0)
    if (!total) return -1
    let seen = 0
    for (let v = 0; v < 256; v++) {
      seen += hist[v]
      if (seen >= total * q) return v
    }
    return 255
  }
  const paper = Math.max(at(paperHist, 0.5), 1)
  const dark = Math.max(0, at(inkHist, 0.02))
  const span = Math.max(8, paper - dark)
  const near = grow(mask, 1)
  const out = new Uint8Array(n)
  for (let i = 0; i < n; i++) {
    if (!near[i]) continue
    const c = (paper - gray.data[i]) / span
    out[i] = Math.round(255 * Math.min(1, Math.max(0, c)))
  }
  return out
}

/** Coverage 0–255 turned by `deg` about its centre, bilinear, on the frame fineTune uses (2 pixels to spare). */
export function turnTone(tone: Uint8Array, width: number, height: number, deg: number): { width: number; height: number; data: Uint8Array } {
  if (!deg) return { width, height, data: tone }
  const t = (deg * Math.PI) / 180
  const cos = Math.cos(t)
  const sin = Math.sin(t)
  const margin = 2
  const w = Math.ceil(Math.abs(width * cos) + Math.abs(height * sin)) + 2 * margin
  const h = Math.ceil(Math.abs(width * sin) + Math.abs(height * cos)) + 2 * margin
  const data = new Uint8Array(w * h)
  const at = (x: number, y: number) => (x >= 0 && y >= 0 && x < width && y < height ? tone[y * width + x] : 0)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const dx = x + 0.5 - w / 2
      const dy = y + 0.5 - h / 2
      const sx = cos * dx + sin * dy + width / 2 - 0.5
      const sy = -sin * dx + cos * dy + height / 2 - 0.5
      const x0 = Math.floor(sx)
      const y0 = Math.floor(sy)
      const fx = sx - x0
      const fy = sy - y0
      data[y * w + x] = Math.round(
        (at(x0, y0) * (1 - fx) + at(x0 + 1, y0) * fx) * (1 - fy) + (at(x0, y0 + 1) * (1 - fx) + at(x0 + 1, y0 + 1) * fx) * fy,
      )
    }
  }
  return { width: w, height: h, data }
}

/** Space round the drawing: `px` pixels on every side. */
function pad<T extends Uint8Array>(data: T, width: number, height: number, px: number): Uint8Array {
  const w = width + 2 * px
  const out = new Uint8Array(w * (height + 2 * px))
  for (let y = 0; y < height; y++) out.set(data.subarray(y * width, (y + 1) * width), (y + px) * w + px)
  return out
}

export interface DrawingTune {
  /** Degrees, clockwise. */
  rotate: number
  /** Pixels, −1 to 1: how far every edge moves out (negative: in). */
  spread: number
  /** Space round the drawing, as a fraction of its longer side. */
  margin: number
  /** Taps on marks to leave out, in the scanned drawing's pixels. */
  leftOut: Point[]
}

export const NO_DRAWING_TUNE: DrawingTune = { rotate: 0, spread: 0, margin: 0.04, leftOut: [] }

/**
 * The scanned drawing ready for every output kind: marks left out, turned,
 * the line spread applied (to the tones as a darker or lighter ink), and the
 * margin added.
 */
export function prepare(art: { gray: GrayImage; mask: Mask }, tune: DrawingTune): Prepared {
  const m = leaveOut(art.mask, tune.leftOut)
  const mask = fineTune(m, { rotate: tune.rotate, spread: tune.spread, square: false })
  let tone = turnTone(inkTone(art.gray, m), m.width, m.height, tune.rotate).data
  if (tune.spread) {
    // Wider lines read darker: a gamma on the tones rather than a halo round them.
    const g = 1 / (1 + tune.spread)
    const lut = Array.from({ length: 256 }, (_, v) => Math.round(255 * (v / 255) ** g))
    tone = tone.map((v) => lut[v])
  }
  const px = Math.round(Math.max(0, tune.margin) * Math.max(mask.width, mask.height))
  if (!px) return { width: mask.width, height: mask.height, mask, tone }
  const width = mask.width + 2 * px
  const height = mask.height + 2 * px
  return { width, height, mask: { width, height, data: pad(mask.data, mask.width, mask.height, px) }, tone: pad(tone, mask.width, mask.height, px) }
}

// ---- Lining up one sketch with another ----

export interface Moments {
  /** The ink's centre. */
  cx: number
  cy: number
  /** Its spread: the root mean square distance from the centre. */
  size: number
  /** The direction of its long axis, radians. */
  angle: number
  /** How much longer than wide (1: no clear direction). */
  long: number
}

/** Where the ink is, how big and which way it runs; null with no ink. */
export function moments(mask: Mask): Moments | null {
  const { width: w, data } = mask
  let n = 0
  let sx = 0
  let sy = 0
  for (let i = 0; i < data.length; i++) {
    if (!data[i]) continue
    n++
    sx += i % w
    sy += Math.floor(i / w)
  }
  if (!n) return null
  const cx = sx / n
  const cy = sy / n
  let xx = 0
  let yy = 0
  let xy = 0
  for (let i = 0; i < data.length; i++) {
    if (!data[i]) continue
    const dx = (i % w) - cx
    const dy = Math.floor(i / w) - cy
    xx += dx * dx
    yy += dy * dy
    xy += dx * dy
  }
  xx /= n
  yy /= n
  xy /= n
  const angle = 0.5 * Math.atan2(2 * xy, xx - yy)
  const d = Math.sqrt(((xx - yy) / 2) ** 2 + xy * xy)
  const major = (xx + yy) / 2 + d
  const minor = Math.max(1e-9, (xx + yy) / 2 - d)
  return { cx, cy, size: Math.sqrt(xx + yy), angle, long: Math.sqrt(major / minor) }
}

/** How to move a sketch onto another: scale, turn (radians) and the two centres. */
export interface LineUp {
  scale: number
  turn: number
  from: { x: number; y: number }
  to: { x: number; y: number }
}

/**
 * The move that puts `from`'s ink where `to`'s is: same centre, same size,
 * and, when both clearly run one way, the same direction (turned at most a
 * quarter turn, since an axis has no head or tail).
 */
export function lineUpWith(from: Moments, to: Moments): LineUp {
  let turn = 0
  if (from.long > 1.15 && to.long > 1.15) {
    turn = to.angle - from.angle
    while (turn > Math.PI / 2) turn -= Math.PI
    while (turn <= -Math.PI / 2) turn += Math.PI
  }
  return { scale: to.size / Math.max(1e-9, from.size), turn, from: { x: from.cx, y: from.cy }, to: { x: to.cx, y: to.cy } }
}

/** `p` drawn into a frame of `width` × `height`, moved by `move`. */
export function place(p: Prepared, width: number, height: number, move: LineUp): Prepared {
  const cos = Math.cos(-move.turn)
  const sin = Math.sin(-move.turn)
  const mask = new Uint8Array(width * height)
  const tone = new Uint8Array(width * height)
  const at = (x: number, y: number) => (x >= 0 && y >= 0 && x < p.width && y < p.height ? p.tone[y * p.width + x] : 0)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      // Back from the frame into the sketch: undo the move.
      const dx = (x - move.to.x) / move.scale
      const dy = (y - move.to.y) / move.scale
      const sx = cos * dx - sin * dy + move.from.x
      const sy = sin * dx + cos * dy + move.from.y
      const rx = Math.round(sx)
      const ry = Math.round(sy)
      const i = y * width + x
      if (rx >= 0 && ry >= 0 && rx < p.width && ry < p.height) mask[i] = p.mask.data[ry * p.width + rx]
      const x0 = Math.floor(sx)
      const y0 = Math.floor(sy)
      const fx = sx - x0
      const fy = sy - y0
      tone[i] = Math.round((at(x0, y0) * (1 - fx) + at(x0 + 1, y0) * fx) * (1 - fy) + (at(x0, y0 + 1) * (1 - fx) + at(x0 + 1, y0 + 1) * fx) * fy)
    }
  }
  return { width, height, mask: { width, height, data: mask }, tone }
}

/** A smaller copy, at most `side` pixels on its longer side (for the collection's tiles), and how much smaller. */
export function shrink(p: Prepared, side: number): { prepared: Prepared; k: number } {
  const k = Math.max(1, Math.ceil(Math.max(p.width, p.height) / side))
  if (k === 1) return { prepared: p, k: 1 }
  const width = Math.max(1, Math.floor(p.width / k))
  const height = Math.max(1, Math.floor(p.height / k))
  const mask = new Uint8Array(width * height)
  const tone = new Uint8Array(width * height)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let m = 0
      let t = 0
      for (let j = 0; j < k; j++) {
        for (let i = 0; i < k; i++) {
          const s = (y * k + j) * p.width + x * k + i
          m += p.mask.data[s]
          t += p.tone[s]
        }
      }
      mask[y * width + x] = m * 4 >= k * k ? 1 : 0
      tone[y * width + x] = Math.round(t / (k * k))
    }
  }
  return { prepared: { width, height, mask: { width, height, data: mask }, tone }, k }
}
