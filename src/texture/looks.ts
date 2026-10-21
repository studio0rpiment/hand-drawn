// The print looks. Each turns the drawing (its grey photo and ink mask) into
// one or two ink-coverage layers, 0–1 per pixel, before colour and layout.

import type { GrayImage, Mask } from '../image'
import { distance2 } from '../icon/shape'
import { fbm, hash } from './noise'
import type { TextureStyle } from './style'

export interface Art {
  /** The straightened, light-evened photo, cropped to the drawing. */
  gray: GrayImage
  /** The cleaned ink, same size. */
  mask: Mask
}

export interface Print {
  width: number
  height: number
  /** First ink's coverage. */
  a: Float32Array
  /** Second ink's coverage (risograph), if printed. */
  b: Float32Array | null
}

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v)

/** Room around the art for ink that spreads, wobbles or is offset past it. */
export function margin(s: TextureStyle): number {
  const stamp = s.look === 'stamp' ? s.stamp.bleed + s.stamp.rough * s.stamp.roughSize * 2 : 0
  const riso = s.look === 'riso' && s.riso.second ? Math.max(Math.abs(s.riso.offsetX), Math.abs(s.riso.offsetY)) : 0
  return Math.ceil(stamp + riso) + 2
}

/** Copy a single-channel image into a larger one with `m` pixels on every side, filled with `fill`. */
function pad<T extends Uint8Array>(img: { data: T; width: number; height: number }, m: number, fill: number) {
  const w = img.width + 2 * m
  const h = img.height + 2 * m
  const data = new Uint8Array(w * h).fill(fill)
  for (let y = 0; y < img.height; y++) data.set(img.data.subarray(y * img.width, (y + 1) * img.width), (y + m) * w + m)
  return { data, width: w, height: h }
}

/** Ink amount from the photo's grey: 1 at or below black, 0 at or above white. */
export function tone(g: number, s: TextureStyle): number {
  const t = clamp01((s.tone.white - g) / (s.tone.white - s.tone.black))
  return s.tone.gamma === 1 ? t : t ** s.tone.gamma
}

/** Mix coverage toward a random on/off screen: the grain of a print. */
function grain(a: Float32Array, w: number, amount: number, seed: number) {
  if (amount <= 0) return
  for (let i = 0; i < a.length; i++) {
    if (a[i] <= 0) continue
    const x = i % w
    const y = (i - x) / w
    const screen = hash(x, y, seed) < a[i] ? 1 : 0
    const tooth = 1 - amount * 0.35 * hash(x, y, seed + 17)
    a[i] = (a[i] * (1 - amount) + screen * amount) * tooth
  }
}

/** The photo's own tones, kept to the drawing and a couple of pixels around it. */
function tonal(art: Art, s: TextureStyle, m: number): Float32Array {
  const gray = pad(art.gray, m, 255)
  const mask = pad(art.mask, m, 0)
  const near = distance2(mask, 1)
  const out = new Float32Array(gray.data.length)
  for (let i = 0; i < out.length; i++) if (near[i] <= 9) out[i] = tone(gray.data[i], s)
  return out
}

function ink(art: Art, s: TextureStyle, m: number): Float32Array {
  const a = tonal(art, s, m)
  grain(a, art.gray.width + 2 * m, s.grain, s.seed)
  return a
}

function stamp(art: Art, s: TextureStyle, m: number): Float32Array {
  const mask = pad(art.mask, m, 0)
  const { width: w, height: h } = mask
  const out = new Float32Array(w * h)
  const outside = distance2(mask, 1)
  const inside = distance2(mask, 0)
  const st = s.stamp
  const big = Math.max(w, h) / 2
  for (let i = 0; i < out.length; i++) {
    const x = i % w
    const y = (i - x) / w
    // Signed distance to the drawn edge: negative inside the ink.
    const signed = mask.data[i] ? 0.5 - Math.sqrt(inside[i]) : Math.sqrt(outside[i]) - 0.5
    const edge = st.bleed + st.rough * st.roughSize * (fbm(x, y, st.roughSize, s.seed) - 0.5) * 2
    let c = clamp01(0.5 + edge - signed)
    if (c === 0) continue
    // Worn patches, with a speckled border.
    if (st.wear > 0) {
      const w2 = 0.8 * fbm(x, y, st.wearSize, s.seed + 5) + 0.2 * hash(x, y, s.seed + 6)
      c *= clamp01((w2 - st.wear * 0.75) * 12)
    }
    // Uneven pressure: lighter regions drop more ink.
    if (st.pressure > 0) {
      const density = 1 - st.pressure * fbm(x, y, big, s.seed + 9)
      if (hash(x, y, s.seed + 10) > density) c *= 0.15
    }
    out[i] = c
  }
  grain(out, w, s.grain, s.seed + 20)
  return out
}

function riso(art: Art, s: TextureStyle, m: number): { a: Float32Array; b: Float32Array | null } {
  const w = art.gray.width + 2 * m
  const base = tonal(art, s, m)
  const a = base.slice()
  grain(a, w, s.grain, s.seed)
  if (!s.riso.second) return { a, b: null }
  // The second drum prints the same art, misregistered, with its own grain.
  const h = base.length / w
  const b = new Float32Array(base.length)
  const dx = Math.round(s.riso.offsetX)
  const dy = Math.round(s.riso.offsetY)
  for (let y = 0; y < h; y++) {
    const sy = y - dy
    if (sy < 0 || sy >= h) continue
    for (let x = 0; x < w; x++) {
      const sx = x - dx
      if (sx >= 0 && sx < w) b[y * w + x] = base[sy * w + sx]
    }
  }
  grain(b, w, s.grain, s.seed + 31)
  return { a, b }
}

function halftone(art: Art, s: TextureStyle, m: number): Float32Array {
  const w = art.gray.width + 2 * m
  const t = tonal(art, s, m)
  const h = t.length / w
  const { cell, angle, shape } = s.halftone
  // Average tone over about one cell, so dots read the drawing's density, not its pixels.
  const density = boxBlur(t, w, h, Math.max(1, Math.round(cell / 2)))
  const rad = (angle * Math.PI) / 180
  const cos = Math.cos(rad)
  const sin = Math.sin(rad)
  const out = new Float32Array(t.length)
  for (let i = 0; i < out.length; i++) {
    const d = density[i]
    if (d <= 0.01) continue
    const x = i % w
    const y = (i - x) / w
    const u = (x * cos + y * sin) / cell
    const v = (-x * sin + y * cos) / cell
    const fv = (v - Math.floor(v) - 0.5) * cell
    if (shape === 'line') {
      out[i] = clamp01((d * cell) / 2 - Math.abs(fv) + 0.5)
    } else {
      const fu = (u - Math.floor(u) - 0.5) * cell
      const r = cell * Math.sqrt(d / Math.PI)
      out[i] = clamp01(r - Math.hypot(fu, fv) + 0.5)
    }
  }
  grain(out, w, s.grain, s.seed)
  return out
}

function boxBlur(src: Float32Array, w: number, h: number, r: number): Float32Array {
  // Running sums: one pass along rows, one down columns.
  const tmp = new Float32Array(src.length)
  const out = new Float32Array(src.length)
  for (let y = 0; y < h; y++) {
    let sum = 0
    const row = y * w
    for (let x = -r; x <= r; x++) sum += src[row + Math.min(w - 1, Math.max(0, x))]
    for (let x = 0; x < w; x++) {
      tmp[row + x] = sum / (2 * r + 1)
      sum += src[row + Math.min(w - 1, x + r + 1)] - src[row + Math.max(0, x - r)]
    }
  }
  for (let x = 0; x < w; x++) {
    let sum = 0
    for (let y = -r; y <= r; y++) sum += tmp[Math.min(h - 1, Math.max(0, y)) * w + x]
    for (let y = 0; y < h; y++) {
      out[y * w + x] = sum / (2 * r + 1)
      sum += tmp[Math.min(h - 1, y + r + 1) * w + x] - tmp[Math.max(0, y - r) * w + x]
    }
  }
  return out
}

/** Every drawing is printed at this long side, so pixel settings mean the same on any photo. */
export const ART_SIDE = 1200

/** Resample the art to `side` px on its long side, averaging the pixels each new one covers. */
export function resizeArt(art: Art, side = ART_SIDE): Art {
  const { width: sw, height: sh } = art.gray
  const k = side / Math.max(sw, sh)
  const w = Math.max(1, Math.round(sw * k))
  const h = Math.max(1, Math.round(sh * k))
  const gray = new Uint8Array(w * h)
  const mask = new Uint8Array(w * h)
  for (let y = 0; y < h; y++) {
    const y0 = Math.floor(y / k)
    const y1 = Math.max(y0 + 1, Math.min(sh, Math.floor((y + 1) / k)))
    for (let x = 0; x < w; x++) {
      const x0 = Math.floor(x / k)
      const x1 = Math.max(x0 + 1, Math.min(sw, Math.floor((x + 1) / k)))
      let g = 0
      let m = 0
      for (let yy = y0; yy < y1; yy++) {
        for (let xx = x0; xx < x1; xx++) {
          g += art.gray.data[yy * sw + xx]
          m += art.mask.data[yy * sw + xx]
        }
      }
      const n = (y1 - y0) * (x1 - x0)
      gray[y * w + x] = Math.round(g / n)
      mask[y * w + x] = m / n >= 0.5 ? 1 : 0
    }
  }
  return { gray: { data: gray, width: w, height: h }, mask: { data: mask, width: w, height: h } }
}

/** Print the art in the style's look. */
export function printArt(art: Art, s: TextureStyle): Print {
  const m = margin(s)
  const width = art.gray.width + 2 * m
  const height = art.gray.height + 2 * m
  switch (s.look) {
    case 'ink':
      return { width, height, a: ink(art, s, m), b: null }
    case 'stamp':
      return { width, height, a: stamp(art, s, m), b: null }
    case 'riso': {
      const { a, b } = riso(art, s, m)
      return { width, height, a, b }
    }
    case 'halftone':
      return { width, height, a: halftone(art, s, m), b: null }
  }
}

/** The keys of a style that change the print itself (not colour or layout), to know when to reprint. */
export function printKey(s: TextureStyle): string {
  return JSON.stringify([s.look, s.seed, s.tone, s.grain, s.look === 'stamp' && s.stamp, s.look === 'riso' && s.riso, s.look === 'halftone' && s.halftone])
}
