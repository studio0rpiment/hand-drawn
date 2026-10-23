// Fine tuning for a logo, on the scanned ink just before it is traced:
// a little rotation to straighten a drawing, a sub-pixel change of line
// weight, and an optional square artboard. Pure, no DOM.

import type { Mask } from './image'

export interface FineTune {
  /** Degrees, clockwise. */
  rotate: number
  /** Pixels, −1 to 1: how far every edge moves out (negative: in). */
  spread: number
  /** Centre the drawing on a square. */
  square: boolean
}

export const NO_TUNE: FineTune = { rotate: 0, spread: 0, square: false }

/**
 * The ink as coverage 0–1, turned by `rotate` about its centre (bilinear) on a
 * canvas big enough to hold it, with `margin` pixels to spare all round.
 */
function rotated(m: Mask, deg: number, margin: number): { width: number; height: number; data: Float32Array } {
  const t = (deg * Math.PI) / 180
  const cos = Math.cos(t)
  const sin = Math.sin(t)
  const width = Math.ceil(Math.abs(m.width * cos) + Math.abs(m.height * sin)) + 2 * margin
  const height = Math.ceil(Math.abs(m.width * sin) + Math.abs(m.height * cos)) + 2 * margin
  const data = new Float32Array(width * height)
  const cx = m.width / 2
  const cy = m.height / 2
  const at = (x: number, y: number) => (x >= 0 && y >= 0 && x < m.width && y < m.height ? m.data[y * m.width + x] : 0)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      // Back from the output pixel's centre into the source.
      const dx = x + 0.5 - width / 2
      const dy = y + 0.5 - height / 2
      const sx = cos * dx + sin * dy + cx - 0.5
      const sy = -sin * dx + cos * dy + cy - 0.5
      const x0 = Math.floor(sx)
      const y0 = Math.floor(sy)
      const fx = sx - x0
      const fy = sy - y0
      data[y * width + x] =
        (at(x0, y0) * (1 - fx) + at(x0 + 1, y0) * fx) * (1 - fy) + (at(x0, y0 + 1) * (1 - fx) + at(x0 + 1, y0 + 1) * fx) * fy
    }
  }
  return { width, height, data }
}

/** A 3 × 3 box blur: across an edge, coverage then runs from 0 to 1 over three pixels. */
function blur3(c: { width: number; height: number; data: Float32Array }): Float32Array {
  const { width: w, height: h, data } = c
  const tmp = new Float32Array(w * h)
  const out = new Float32Array(w * h)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x
      tmp[i] = (data[i] + (x > 0 ? data[i - 1] : 0) + (x < w - 1 ? data[i + 1] : 0)) / 3
    }
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x
      out[i] = (tmp[i] + (y > 0 ? tmp[i - w] : 0) + (y < h - 1 ? tmp[i + w] : 0)) / 3
    }
  }
  return out
}

export function fineTune(m: Mask, f: FineTune): Mask {
  let out = m
  if (f.rotate || f.spread) {
    const c = rotated(m, f.rotate, 2)
    const cover = f.spread ? blur3(c) : c.data
    // On a blurred edge, a threshold of 0.5 − s/3 moves the edge s pixels out.
    const cut = 0.5 - f.spread / 3
    const data = new Uint8Array(c.width * c.height)
    for (let i = 0; i < data.length; i++) data[i] = cover[i] > cut ? 1 : 0
    out = { width: c.width, height: c.height, data }
  }
  if (f.square && out.width !== out.height) {
    const side = Math.max(out.width, out.height)
    const ox = Math.floor((side - out.width) / 2)
    const oy = Math.floor((side - out.height) / 2)
    const data = new Uint8Array(side * side)
    for (let y = 0; y < out.height; y++) data.set(out.data.subarray(y * out.width, (y + 1) * out.width), (y + oy) * side + ox)
    out = { width: side, height: side, data }
  }
  return out
}
