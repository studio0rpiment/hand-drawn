// Seeded noise, so a texture style prints the same way every time.

/** Hash two integers and a seed to a float in [0, 1). */
export function hash(x: number, y: number, seed: number): number {
  let h = Math.imul(x | 0, 0x27d4eb2d) ^ Math.imul(y | 0, 0x165667b1) ^ Math.imul(seed | 0, 0x9e3779b1)
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b)
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35)
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296
}

/** Smooth value noise in [0, 1) with features about `size` pixels across. */
export function valueNoise(x: number, y: number, size: number, seed: number): number {
  const fx = x / size
  const fy = y / size
  const x0 = Math.floor(fx)
  const y0 = Math.floor(fy)
  const sx = fx - x0
  const sy = fy - y0
  const u = sx * sx * (3 - 2 * sx)
  const v = sy * sy * (3 - 2 * sy)
  const a = hash(x0, y0, seed)
  const b = hash(x0 + 1, y0, seed)
  const c = hash(x0, y0 + 1, seed)
  const d = hash(x0 + 1, y0 + 1, seed)
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v
}

/** Three octaves of value noise, normalised to [0, 1). */
export function fbm(x: number, y: number, size: number, seed: number): number {
  return (
    (valueNoise(x, y, size, seed) * 4 + valueNoise(x, y, size / 2, seed + 1) * 2 + valueNoise(x, y, size / 4, seed + 2)) / 7
  )
}

/** A small seeded random-number generator (mulberry32) for layout choices. */
export function random(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
