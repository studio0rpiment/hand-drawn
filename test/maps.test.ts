import { describe, expect, it } from 'vitest'
import { addHeightSource, heightSource, heightSourceIds } from '../src/texture/height'
import { litSphere } from '../src/texture/lit'
import { aoMap, makeMaps, mapSizes, normalMap, type MapOptions } from '../src/texture/pbr'
import { blur, cropRect, seamless, type Surface } from '../src/texture/surface'
import { BUILT_IN, STAMP, readTextureStyle } from '../src/texture/style'

/** A w × h surface whose colour and grey run left to right, with a seam at the edges. */
function ramp(w: number, h: number): Surface {
  const colour = new Uint8ClampedArray(w * h * 4)
  const gray = new Uint8Array(w * h)
  const ink = new Uint8Array(w * h)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x
      const v = Math.round((x / (w - 1)) * 255)
      gray[i] = v
      ink[i] = 255 - v
      colour.set([v, (y / (h - 1)) * 255, 128, 255], i * 4)
    }
  }
  return { width: w, height: h, colour, gray, ink }
}

const OPTIONS: MapOptions = { ...STAMP.maps }

describe('seamless', () => {
  it('meets itself across both edges', () => {
    const s = ramp(64, 48)
    // Untiled, left and right edges are 255 apart.
    expect(Math.abs(s.gray[0] - s.gray[63])).toBe(255)
    const t = seamless(s, { width: 0.2, ragged: 1, seed: 3 })
    for (let y = 0; y < 48; y++) expect(Math.abs(t.gray[y * 64] - t.gray[y * 64 + 63])).toBeLessThanOrEqual(12)
    for (let x = 0; x < 64; x++) expect(Math.abs(t.colour[x * 4 + 1] - t.colour[(47 * 64 + x) * 4 + 1])).toBeLessThanOrEqual(12)
  })

  it('keeps the offset image away from the cross', () => {
    const s = ramp(64, 64)
    const t = seamless(s, { width: 0.1, ragged: 0, seed: 1 })
    // Pixel (2, 2) of the result is the source's (34, 34): offset by half.
    expect(t.gray[2 * 64 + 2]).toBe(s.gray[34 * 64 + 34])
  })
})

describe('surface maths', () => {
  it('blurs without losing the average, and wraps when asked', () => {
    const v = new Float32Array(100)
    v[0] = 100
    const clamped = blur(v, 10, 10, 3)
    const wrapped = blur(v, 10, 10, 3, true)
    const sum = (a: Float32Array) => a.reduce((x, y) => x + y, 0)
    expect(sum(wrapped)).toBeCloseTo(100, 3)
    // Wrapped, the corner spreads to the opposite corner too.
    expect(wrapped[99]).toBeGreaterThan(0)
    expect(clamped[99]).toBe(0)
  })

  it('cuts the output’s proportions from the middle after the trim', () => {
    expect(cropRect(200, 100, 0, 50, 50)).toEqual({ x: 50, y: 0, width: 100, height: 100 })
    const r = cropRect(200, 200, 0.1, 100, 50)
    expect(r.width).toBeCloseTo(160)
    expect(r.height).toBeCloseTo(80)
  })
})

describe('maps', () => {
  it('turns a slope into normals leaning away from it, in either green convention', () => {
    const w = 8
    const h = new Float32Array(w * w)
    for (let y = 0; y < w; y++) for (let x = 0; x < w; x++) h[y * w + x] = y / w // rising downward
    const gl = normalMap(h, w, w, 4, 'gl', false)
    const dx = normalMap(h, w, w, 4, 'dx', false)
    const i = (4 * w + 4) * 4
    expect(gl[i]).toBe(128) // flat across
    expect(gl[i + 1]).toBeGreaterThan(140) // OpenGL: leans up, away from the rise
    expect(dx[i + 1]).toBeLessThan(116)
    expect(gl[i + 2]).toBeGreaterThan(128)
  })

  it('darkens ambient occlusion in a pit, not on flat ground', () => {
    const w = 32
    const h = new Float32Array(w * w).fill(1)
    h[16 * w + 16] = 0
    const ao = aoMap(h, w, w, 6, 1, false)
    expect(ao[16 * w + 16]).toBeLessThan(0.9)
    expect(ao[2 * w + 2]).toBe(1)
  })

  it('makes all five maps the surface’s size, with ink standing high', async () => {
    const s = ramp(40, 30)
    const m = await makeMaps(s, { ...OPTIONS, height: 'ink-scan', darkHigh: true, detail: 0 }, { seamless: false, seam: 0.15, ragged: 0, seed: 1 }, { ink: '#000000', paper: '#ffffff' })
    for (const img of Object.values(m.images)) expect(img.length).toBe(40 * 30 * 4)
    // Ink is heaviest on the left: higher there.
    expect(m.heights[15 * 40 + 2]).toBeGreaterThan(m.heights[15 * 40 + 37])
  })

  it('takes a height source added later, such as a model', async () => {
    addHeightSource({ id: 'flat-test', estimate: async (s) => new Float32Array(s.width * s.height).fill(0.5) })
    expect(heightSourceIds()).toContain('flat-test')
    expect(heightSource('nothing-by-this-name')).toBe(heightSource('ink-scan'))
    const m = await makeMaps(ramp(16, 16), { ...OPTIONS, height: 'flat-test' }, { seamless: false, seam: 0.1, ragged: 0, seed: 1 }, { ink: '#000000', paper: '#ffffff' })
    // A flat height: the normal points straight out.
    expect(m.images.normal[0]).toBe(128)
    expect(m.images.normal[1]).toBe(128)
  })

  it('shades a sphere, dark outside the disc', async () => {
    const m = await makeMaps(ramp(16, 16), OPTIONS, { seamless: true, seam: 0.1, ragged: 0, seed: 1 }, { ink: '#000000', paper: '#ffffff' })
    const img = litSphere(m, 20, { x: 0, y: 0, z: 1 }, 'gl')
    expect(img[3]).toBe(0) // corner: outside
    expect(img[(10 * 20 + 10) * 4 + 3]).toBe(255)
  })
})

describe('texture style with maps', () => {
  it('reads the maps presets back unchanged, and old styles as printed looks', () => {
    for (const b of BUILT_IN) expect(readTextureStyle(b)).toEqual(b)
    expect(BUILT_IN[0].make).toBe('maps')
    const old = readTextureStyle({ name: 'Old', look: 'riso' })
    expect(old.make).toBe('print')
    expect(readTextureStyle({ file: { width: 99999, format: 'gif' }, maps: { height: 'nope' } }).file).toEqual({ ...STAMP.file, width: 4096 })
  })
})

describe('mapSizes', () => {
  it('halves the chosen size down to 256 on the longer side', () => {
    expect(mapSizes(4096, 4096).map((z) => z.width)).toEqual([4096, 2048, 1024, 512, 256])
    expect(mapSizes(2048, 1024)).toEqual([
      { width: 2048, height: 1024 },
      { width: 1024, height: 512 },
      { width: 512, height: 256 },
      { width: 256, height: 128 },
    ])
  })
  it('keeps a small size as it is', () => {
    expect(mapSizes(200, 100)).toEqual([{ width: 200, height: 100 }])
  })
})
