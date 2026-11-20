// The surface a set of PBR maps is made from: the photo's colour, its
// light-evened grey and the ink, all one size. Plus the plain image maths the
// maps share (blur, levels) and the seamless tile. No DOM, so it runs in tests.

export interface Surface {
  width: number
  height: number
  /** The straightened photo, RGBA. */
  colour: Uint8ClampedArray
  /** The light-evened grey from the scan step, 0–255. */
  gray: Uint8Array
  /** Ink coverage, 0–255 (the scan's ink mask, smoothed when resized). */
  ink: Uint8Array
}

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v)

/** One pass of a box blur along rows (`along` 1) or columns (`along` = width). */
function boxPass(src: Float32Array, dst: Float32Array, n: number, lines: number, along: number, across: number, r: number, wrap: boolean) {
  const len = 2 * r + 1
  const edge = (i: number) => (wrap ? ((i % n) + n) % n : i < 0 ? 0 : i >= n ? n - 1 : i)
  for (let l = 0; l < lines; l++) {
    const base = l * across
    let sum = 0
    for (let i = -r; i <= r; i++) sum += src[base + edge(i) * along]
    for (let i = 0; i < n; i++) {
      dst[base + i * along] = sum / len
      const add = i + r + 1
      const drop = i - r
      // Inside the line the indices need no wrapping or clamping.
      sum += src[base + (add < n ? add : edge(add)) * along] - src[base + (drop >= 0 ? drop : edge(drop)) * along]
    }
  }
}

/**
 * A near-Gaussian blur of radius about `r` pixels (three box passes each way).
 * `wrap`: the image is a tile, so the blur reads across the opposite edge.
 */
export function blur(src: Float32Array, w: number, h: number, r: number, wrap = false): Float32Array {
  const out = Float32Array.from(src)
  const box = Math.max(0, Math.round(r / Math.sqrt(3)))
  if (box < 1) return out
  const tmp = new Float32Array(src.length)
  for (let k = 0; k < 3; k++) {
    boxPass(out, tmp, w, h, 1, w, box, wrap)
    boxPass(tmp, out, h, w, w, 1, box, wrap)
  }
  return out
}

/** Stretch values so the `lo` and `hi` shares (e.g. 0.01, 0.99) land on 0 and 1. */
export function levels(v: Float32Array, lo = 0.01, hi = 0.99): Float32Array {
  const out = new Float32Array(v.length)
  if (!v.length) return out
  let min = Infinity
  let max = -Infinity
  for (let i = 0; i < v.length; i++) {
    if (v[i] < min) min = v[i]
    if (v[i] > max) max = v[i]
  }
  if (max - min < 1e-6) return out.fill(0.5)
  // The shares from a fine histogram rather than a sort.
  const BINS = 4096
  const hist = new Uint32Array(BINS)
  const k = (BINS - 1) / (max - min)
  for (let i = 0; i < v.length; i++) hist[Math.round((v[i] - min) * k)]++
  const at = (share: number) => {
    const want = share * (v.length - 1)
    let seen = 0
    for (let b = 0; b < BINS; b++) {
      seen += hist[b]
      if (seen > want) return min + b / k
    }
    return max
  }
  const a = at(lo)
  const b = Math.max(at(hi), a + 1e-6)
  for (let i = 0; i < v.length; i++) out[i] = clamp01((v[i] - a) / (b - a))
  return out
}

/** Brightness 0–1 per pixel of an RGBA image (Rec. 709 weights). */
export function luminance(rgba: Uint8ClampedArray): Float32Array {
  const out = new Float32Array(rgba.length / 4)
  for (let i = 0, j = 0; i < out.length; i++, j += 4) out[i] = (0.2126 * rgba[j] + 0.7152 * rgba[j + 1] + 0.0722 * rgba[j + 2]) / 255
  return out
}

/** Periodic value noise along a line of `n` pixels, about `size` pixels a feature; wraps at `n`. */
function loopNoise(n: number, size: number, seed: number): Float32Array {
  const k = Math.max(1, Math.round(n / size))
  const knots = Array.from({ length: k }, (_, i) => {
    let x = Math.imul(i + 1, 0x9e3779b1) ^ Math.imul(seed + 7, 0x85ebca6b)
    x = Math.imul(x ^ (x >>> 15), 0x2c1b3c6d)
    return ((x ^ (x >>> 13)) >>> 0) / 4294967296
  })
  const out = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    const f = (i / n) * k
    const a = Math.floor(f)
    const t = f - a
    const s = t * t * (3 - 2 * t)
    out[i] = knots[a % k] * (1 - s) + knots[(a + 1) % k] * s
  }
  return out
}

export interface SeamOptions {
  /** Blend band either side of the seam, as a share of the side (0–1/3). */
  width: number
  /** How far the band's edge wanders, 0–1: a ragged edge hides a blend better than a straight one. */
  ragged: number
  seed: number
}

/**
 * The weight of the copies whose seam is at the tile's edge, across a line of
 * `n` pixels: 1 on the centre line (where the offset copy's seam is), 0 at the edges.
 */
function seamWeight(n: number, pos: number, wander: number, o: SeamOptions): number {
  const half = n / 2
  // At most a third of the side: with the widest wander the band still stops short of the edge.
  const band = Math.max(1, Math.min(o.width, 1 / 3) * n)
  const d = Math.abs(pos - half) + wander * band * o.ragged
  const t = clamp01(1 - d / band)
  return t * t * (3 - 2 * t)
}

/**
 * Make the surface repeat without seams, as by hand: offset it by half its
 * width and height with wrap-around, so the edges meet in the middle, then
 * cover that cross with the same surface un-offset, where it is continuous.
 * Four copies (offset or not, across and down) are mixed so that no copy
 * shows where its own seam is.
 */
export function seamless(s: Surface, o: SeamOptions): Surface {
  const { width: w, height: h } = s
  const n = w * h
  const colour = new Uint8ClampedArray(n * 4)
  const gray = new Uint8Array(n)
  const ink = new Uint8Array(n)
  // The band's wander: along the vertical seam it varies with y, along the horizontal with x.
  const wanderY = loopNoise(h, Math.max(8, h / 12), o.seed)
  const wanderX = loopNoise(w, Math.max(8, w / 12), o.seed + 1)
  const hw = Math.floor(w / 2)
  const hh = Math.floor(h / 2)
  const wx = new Float32Array(n)
  const wy = new Float32Array(n)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x
      wx[i] = seamWeight(w, x + 0.5, wanderY[y] - 0.5, o)
      wy[i] = seamWeight(h, y + 0.5, wanderX[x] - 0.5, o)
    }
  }
  for (let y = 0; y < h; y++) {
    const ys = (y + hh) % h
    for (let x = 0; x < w; x++) {
      const xs = (x + hw) % w
      const i = y * w + x
      const a = (1 - wx[i]) * (1 - wy[i]) // offset both ways: the offset image itself
      const c = (1 - wx[i]) * wy[i] // offset across only
      const b = wx[i] * (1 - wy[i]) // offset down only
      const d = wx[i] * wy[i] // not offset
      const ia = ys * w + xs
      const ic = y * w + xs
      const ib = ys * w + x
      const id = i
      gray[i] = Math.round(a * s.gray[ia] + b * s.gray[ib] + c * s.gray[ic] + d * s.gray[id])
      ink[i] = Math.round(a * s.ink[ia] + b * s.ink[ib] + c * s.ink[ic] + d * s.ink[id])
      for (let k = 0; k < 4; k++) {
        colour[i * 4 + k] = a * s.colour[ia * 4 + k] + b * s.colour[ib * 4 + k] + c * s.colour[ic * 4 + k] + d * s.colour[id * 4 + k]
      }
    }
  }
  return { width: w, height: h, colour, gray, ink }
}

/**
 * The part of a `w` × `h` image a map of `outW` × `outH` is cut from: `crop`
 * (a share of each side) trimmed off every edge, then the largest centred
 * rectangle of the output's proportions, so nothing is stretched.
 */
export function cropRect(w: number, h: number, crop: number, outW: number, outH: number) {
  const cw = w * (1 - 2 * crop)
  const ch = h * (1 - 2 * crop)
  const want = outW / outH
  const fw = Math.min(cw, ch * want)
  const fh = fw / want
  return { x: (w - fw) / 2, y: (h - fh) / 2, width: fw, height: fh }
}
