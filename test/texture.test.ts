import { describe, expect, it } from 'vitest'
import { plan } from '../src/texture/layout'
import { margin, printArt, resizeArt, tone, type Art } from '../src/texture/looks'
import { fbm, hash, random } from '../src/texture/noise'
import { BUILT_IN, STAMP, readTextureStyle, type TextureStyle } from '../src/texture/style'

/** A 60 × 40 solid block of ink on paper, as both grey photo and mask. */
function block(): Art {
  const w = 100
  const h = 80
  const gray = new Uint8Array(w * h).fill(250)
  const mask = new Uint8Array(w * h)
  for (let y = 20; y < 60; y++) {
    for (let x = 20; x < 80; x++) {
      gray[y * w + x] = 30
      mask[y * w + x] = 1
    }
  }
  return { gray: { data: gray, width: w, height: h }, mask: { data: mask, width: w, height: h } }
}

const sum = (a: Float32Array) => a.reduce((n, v) => n + v, 0)
const style = (patch: (s: TextureStyle) => TextureStyle) => patch(structuredClone(STAMP))

describe('noise', () => {
  it('is repeatable and stays in range', () => {
    expect(hash(3, 4, 5)).toBe(hash(3, 4, 5))
    expect(hash(3, 4, 5)).not.toBe(hash(3, 4, 6))
    for (let i = 0; i < 200; i++) {
      const v = fbm(i * 3.7, i * 1.3, 10, 1)
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThan(1)
    }
    const a = random(9)
    const b = random(9)
    expect([a(), a(), a()]).toEqual([b(), b(), b()])
  })
})

describe('style', () => {
  it('reads every built-in back unchanged', () => {
    for (const s of BUILT_IN) expect(readTextureStyle(JSON.parse(JSON.stringify(s)))).toEqual(s)
  })

  it('clamps and falls back', () => {
    const s = readTextureStyle({ look: 'woodcut', tone: { black: 200, white: 100 }, colors: { ink: '#ABCDEF', paper: 'cream' }, layout: { count: 500 } })
    expect(s.look).toBe(STAMP.look)
    expect(s.tone.black).toBe(200)
    expect(s.tone.white).toBe(201)
    expect(s.colors.ink).toBe('#abcdef')
    expect(s.colors.paper).toBe(STAMP.colors.paper)
    expect(s.layout.count).toBe(60)
  })

  it('maps grey to ink between black and white points', () => {
    const s = STAMP
    expect(tone(10, s)).toBe(1)
    expect(tone(250, s)).toBe(0)
    expect(tone((s.tone.black + s.tone.white) / 2, s)).toBeCloseTo(0.5)
  })
})

describe('looks', () => {
  it('keeps the drawing’s tones for ink, leaving paper empty', () => {
    const s = style((s) => ({ ...s, look: 'ink', grain: 0 }))
    const p = printArt(block(), s)
    const m = margin(s)
    expect(p.a[(40 + m) * p.width + 50 + m]).toBe(1)
    expect(p.a[(5 + m) * p.width + 5 + m]).toBe(0)
    expect(p.b).toBeNull()
  })

  it('spreads stamp ink by the bleed', () => {
    const plain = (bleed: number) =>
      style((s) => ({ ...s, grain: 0, stamp: { ...s.stamp, bleed, rough: 0, wear: 0, pressure: 0 } }))
    const tight = sum(printArt(block(), plain(0)).a)
    const spread = sum(printArt(block(), plain(4)).a)
    expect(tight).toBeCloseTo(60 * 40, -2)
    // About 4 px all round a 60 × 40 block.
    expect(spread - tight).toBeGreaterThan(0.8 * 4 * 200)
    expect(spread - tight).toBeLessThan(1.2 * (4 * 200 + 64))
  })

  it('wears ink away with wear and pressure', () => {
    const base = style((s) => ({ ...s, grain: 0, stamp: { ...s.stamp, rough: 0, wear: 0, pressure: 0 } }))
    const worn = style((s) => ({ ...s, grain: 0, stamp: { ...s.stamp, rough: 0, wear: 0.6, pressure: 0.6 } }))
    expect(sum(printArt(block(), worn).a)).toBeLessThan(sum(printArt(block(), base).a) * 0.85)
  })

  it('prints the second riso drum offset from the first', () => {
    const s = style((s) => ({ ...s, look: 'riso', grain: 0, riso: { offsetX: 6, offsetY: -4, second: true } }))
    const p = printArt(block(), s)
    const at = (x: number, y: number) => y * p.width + x
    for (const [x, y] of [[30, 30], [60, 50], [10, 70], [90, 20]]) {
      expect(p.b![at(x + 6, y - 4)]).toBe(p.a[at(x, y)])
    }
  })

  it('covers about the tone’s share with halftone dots', () => {
    // A flat 50% grey field.
    const w = 120
    const art: Art = {
      gray: { data: new Uint8Array(w * w).fill(130), width: w, height: w },
      mask: { data: new Uint8Array(w * w).fill(1), width: w, height: w },
    }
    const s = style((s) => ({ ...s, look: 'halftone', grain: 0, tone: { black: 30, white: 230, gamma: 1 }, halftone: { cell: 8, angle: 30, shape: 'dot' } }))
    const p = printArt(art, s)
    // Away from the borders, where the blur sees paper.
    let n = 0
    let c = 0
    for (let y = 30; y < p.height - 30; y++) for (let x = 30; x < p.width - 30; x++) (c += p.a[y * p.width + x]), n++
    expect(c / n).toBeGreaterThan(0.42)
    expect(c / n).toBeLessThan(0.58)
  })
})

describe('resizeArt', () => {
  it('scales to the working size both ways, keeping the ink', () => {
    const big = resizeArt(block(), 50)
    expect([big.gray.width, big.gray.height]).toEqual([50, 40])
    expect(big.mask.data.reduce((n, v) => n + v, 0)).toBe(30 * 20)
    expect(big.gray.data[20 * 50 + 25]).toBe(30)
    const up = resizeArt(block(), 200)
    expect([up.gray.width, up.gray.height]).toEqual([200, 160])
    expect(up.mask.data.reduce((n, v) => n + v, 0)).toBe(120 * 80)
  })
})

describe('layout', () => {
  it('sizes a single print by the art plus margins', () => {
    const p = plan(style((s) => ({ ...s, layout: { ...s.layout, mode: 'single', scale: 1, margin: 20, jitter: 0 } })), 200, 100)
    expect([p.width, p.height, p.wrap, p.items.length]).toEqual([240, 140, false, 1])
  })

  it('fits a whole number of grid cells in a tile, so edges meet', () => {
    const s = style((s) => ({ ...s, layout: { ...s.layout, mode: 'half-drop', tile: 1000, scale: 0.3, gap: 0.35 } }))
    const p = plan(s, 300, 200)
    const xs = [...new Set(p.items.map((i) => i.x))].sort((a, b) => a - b)
    const step = xs[1] - xs[0]
    expect(1000 / step).toBeCloseTo(Math.round(1000 / step))
    expect(p.wrap).toBe(true)
    // Odd columns drop by half a cell.
    const col1 = p.items.filter((i) => i.x === xs[1]).map((i) => i.y).sort((a, b) => a - b)
    expect(col1[0]).toBeCloseTo(step)
  })

  it('spreads scattered prints out, even across the wrap', () => {
    const s = style((s) => ({ ...s, layout: { ...s.layout, mode: 'scatter', tile: 1000, count: 9 } }))
    const items = plan(s, 100, 100).items
    let min = Infinity
    for (const a of items) {
      for (const b of items) {
        if (a === b) continue
        const dx = Math.min(Math.abs(a.x - b.x), 1000 - Math.abs(a.x - b.x))
        const dy = Math.min(Math.abs(a.y - b.y), 1000 - Math.abs(a.y - b.y))
        min = Math.min(min, Math.hypot(dx, dy))
      }
    }
    // A perfect 3 × 3 grid would give 333; pure random often gives under 50.
    expect(min).toBeGreaterThan(180)
  })

  it('scatters the same way for the same seed', () => {
    const s = style((s) => ({ ...s, layout: { ...s.layout, mode: 'scatter', count: 5, jitter: 30 } }))
    expect(plan(s, 100, 100)).toEqual(plan(s, 100, 100))
    expect(plan({ ...s, seed: s.seed + 1 }, 100, 100)).not.toEqual(plan(s, 100, 100))
  })
})
