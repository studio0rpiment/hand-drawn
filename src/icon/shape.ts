// Preparing the ink mask for an icon: centred on a square canvas, cleaned and,
// for the fill variants, with closed shapes made solid. Mirrors hand-icons'
// split.py and vectorize.py.

import type { Mask } from '../image'

/**
 * Scale the mask to fit a size × size canvas inside `pad` (fraction per side),
 * centred. Area-averaged, so thin lines survive shrinking.
 */
export function placeOnSquare(mask: Mask, size: number, pad: number): Mask {
  const inner = Math.max(1, Math.round(size * (1 - 2 * pad)))
  const s = inner / Math.max(mask.width, mask.height)
  const w = Math.max(1, Math.round(mask.width * s))
  const h = Math.max(1, Math.round(mask.height * s))
  const ox = Math.floor((size - w) / 2)
  const oy = Math.floor((size - h) / 2)
  const out = new Uint8Array(size * size)
  for (let y = 0; y < h; y++) {
    const sy0 = y / s
    const sy1 = Math.min(mask.height, (y + 1) / s)
    for (let x = 0; x < w; x++) {
      const sx0 = x / s
      const sx1 = Math.min(mask.width, (x + 1) / s)
      // Coverage of the source pixels under this target pixel.
      let ink = 0
      let area = 0
      for (let yy = Math.floor(sy0); yy < Math.ceil(sy1); yy++) {
        const fy = Math.min(yy + 1, sy1) - Math.max(yy, sy0)
        for (let xx = Math.floor(sx0); xx < Math.ceil(sx1); xx++) {
          const f = fy * (Math.min(xx + 1, sx1) - Math.max(xx, sx0))
          area += f
          ink += f * mask.data[yy * mask.width + xx]
        }
      }
      out[(oy + y) * size + ox + x] = area > 0 && ink / area >= 0.5 ? 1 : 0
    }
  }
  return { data: out, width: size, height: size }
}

/** Squared Euclidean distance from every pixel to the nearest pixel whose mask value is `site`. */
export function distance2(mask: Mask, site: 0 | 1): Float64Array {
  const { width: w, height: h, data } = mask
  const INF = 1e20
  const d = new Float64Array(w * h)
  for (let i = 0; i < d.length; i++) d[i] = data[i] === site ? 0 : INF
  const n = Math.max(w, h)
  const f = new Float64Array(n)
  const out = new Float64Array(n)
  const v = new Int32Array(n)
  const z = new Float64Array(n + 1)
  // Felzenszwalb & Huttenlocher: 1-D lower envelope of parabolas, columns then rows.
  const pass = (len: number) => {
    let k = 0
    v[0] = 0
    z[0] = -Infinity
    z[1] = Infinity
    for (let q = 1; q < len; q++) {
      let s = (f[q] + q * q - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k])
      while (s <= z[k]) {
        k--
        s = (f[q] + q * q - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k])
      }
      k++
      v[k] = q
      z[k] = s
      z[k + 1] = Infinity
    }
    k = 0
    for (let q = 0; q < len; q++) {
      while (z[k + 1] < q) k++
      out[q] = (q - v[k]) ** 2 + f[v[k]]
    }
  }
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) f[y] = d[y * w + x]
    pass(h)
    for (let y = 0; y < h; y++) d[y * w + x] = out[y]
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) f[x] = d[y * w + x]
    pass(w)
    for (let x = 0; x < w; x++) d[y * w + x] = out[x]
  }
  return d
}

/** Morphological closing with a disc of the given diameter: bridges gaps up to about that wide. */
export function close(mask: Mask, diameter: number): Mask {
  const r = diameter / 2
  if (r < 0.5) return mask
  const r2 = r * r
  const toInk = distance2(mask, 1)
  const grown: Mask = { ...mask, data: Uint8Array.from(toInk, (d) => (d <= r2 ? 1 : 0)) }
  const toPaper = distance2(grown, 0)
  return { ...mask, data: Uint8Array.from(toPaper, (d) => (d > r2 ? 1 : 0)) }
}

/**
 * Fill enclosed paper regions (not touching the edge). With `maxArea` only
 * holes smaller than that are filled; without it every hole is.
 */
export function fillHoles(mask: Mask, maxArea = Infinity): Mask {
  const { width: w, height: h, data } = mask
  const out = data.slice()
  const seen = new Uint8Array(data.length)
  const stack = new Int32Array(data.length)
  const region: number[] = []
  for (let start = 0; start < data.length; start++) {
    if (data[start] || seen[start]) continue
    let top = 0
    let edge = false
    region.length = 0
    stack[top++] = start
    seen[start] = 1
    while (top > 0) {
      const p = stack[--top]
      region.push(p)
      const x = p % w
      const y = (p - x) / w
      if (x === 0 || y === 0 || x === w - 1 || y === h - 1) edge = true
      if (x > 0 && !data[p - 1] && !seen[p - 1]) (seen[p - 1] = 1), (stack[top++] = p - 1)
      if (x < w - 1 && !data[p + 1] && !seen[p + 1]) (seen[p + 1] = 1), (stack[top++] = p + 1)
      if (y > 0 && !data[p - w] && !seen[p - w]) (seen[p - w] = 1), (stack[top++] = p - w)
      if (y < h - 1 && !data[p + w] && !seen[p + w]) (seen[p + w] = 1), (stack[top++] = p + w)
    }
    if (!edge && region.length < maxArea) for (const p of region) out[p] = 1
  }
  return { ...mask, data: out }
}

/**
 * Fill only the enclosed spaces with nothing else drawn inside: a hole whose
 * border touches one ink shape. A ring around a note keeps its inside open.
 */
export function fillEmptyHoles(mask: Mask): Mask {
  const { width: w, height: h, data } = mask
  // Label the ink shapes (8-connected, as a pen stroke joins diagonally).
  const ink = new Int32Array(data.length).fill(-1)
  const stack = new Int32Array(data.length)
  let shapes = 0
  for (let start = 0; start < data.length; start++) {
    if (!data[start] || ink[start] !== -1) continue
    let top = 0
    stack[top++] = start
    ink[start] = shapes
    while (top > 0) {
      const p = stack[--top]
      const x = p % w
      const y = (p - x) / w
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx
          const ny = y + dy
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue
          const q = ny * w + nx
          if (data[q] && ink[q] === -1) {
            ink[q] = shapes
            stack[top++] = q
          }
        }
      }
    }
    shapes++
  }
  // Walk each paper region (4-connected), noting which shapes it borders.
  const out = data.slice()
  const seen = new Uint8Array(data.length)
  const region: number[] = []
  for (let start = 0; start < data.length; start++) {
    if (data[start] || seen[start]) continue
    let top = 0
    let edge = false
    const borders = new Set<number>()
    region.length = 0
    stack[top++] = start
    seen[start] = 1
    while (top > 0) {
      const p = stack[--top]
      region.push(p)
      const x = p % w
      const y = (p - x) / w
      if (x === 0 || y === 0 || x === w - 1 || y === h - 1) edge = true
      for (const q of [x > 0 ? p - 1 : -1, x < w - 1 ? p + 1 : -1, y > 0 ? p - w : -1, y < h - 1 ? p + w : -1]) {
        if (q < 0) continue
        if (data[q]) borders.add(ink[q])
        else if (!seen[q]) {
          seen[q] = 1
          stack[top++] = q
        }
      }
    }
    if (!edge && borders.size === 1) for (const p of region) out[p] = 1
  }
  return { ...mask, data: out }
}

export interface IconMasks {
  /** The ink as drawn: traced for the line variant. */
  ink: Mask
  /** The ink with closed shapes filled: traced for fill and tint. */
  solid: Mask
}

/**
 * hand-icons' clean-up: close 7 px, fill pinholes, then bridge and fill closed
 * shapes. Unlike hand-icons, a closed shape with other drawing inside stays open.
 */
export function iconMasks(placed: Mask, opts: { pinholes: number; fillClosed: boolean; bridge: number }): IconMasks {
  const ink = fillHoles(close(placed, 7), opts.pinholes)
  if (!opts.fillClosed) return { ink, solid: ink }
  const interiors = fillEmptyHoles(close(ink, opts.bridge))
  const solid = { ...ink, data: ink.data.map((v, i) => v | interiors.data[i]) }
  return { ink, solid }
}
