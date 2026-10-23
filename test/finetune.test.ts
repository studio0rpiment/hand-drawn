import { describe, expect, it } from 'vitest'
import { fineTune, NO_TUNE } from '../src/finetune'
import type { Mask } from '../src/image'

/** A w × h canvas with a filled rectangle. */
function rect(w: number, h: number, x0: number, y0: number, x1: number, y1: number): Mask {
  const data = new Uint8Array(w * h)
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) data[y * w + x] = 1
  return { width: w, height: h, data }
}
const area = (m: Mask) => m.data.reduce((a, b) => a + b, 0)

describe('fineTune', () => {
  it('leaves the ink alone with no tuning', () => {
    const m = rect(30, 20, 5, 5, 25, 15)
    expect(fineTune(m, NO_TUNE)).toBe(m)
  })

  it('moves edges out and in by about the spread', () => {
    const m = rect(40, 40, 10, 10, 30, 30) // 20 × 20
    const grown = area(fineTune(m, { ...NO_TUNE, spread: 1 }))
    const shrunk = area(fineTune(m, { ...NO_TUNE, spread: -1 }))
    expect(grown).toBeGreaterThan(21 * 21)
    expect(grown).toBeLessThan(23 * 23)
    expect(shrunk).toBeLessThan(19 * 19)
    expect(shrunk).toBeGreaterThan(17 * 17)
  })

  it('turns a bar on its side at 90°', () => {
    const m = rect(40, 10, 0, 0, 40, 10)
    const r = fineTune(m, { ...NO_TUNE, rotate: 90 })
    expect(r.height).toBeGreaterThan(r.width)
    // Resampling may gain or lose one row along the long edge.
    expect(Math.abs(area(r) - 400)).toBeLessThanOrEqual(40)
  })

  it('centres the drawing on a square', () => {
    const r = fineTune(rect(30, 10, 0, 0, 30, 10), { ...NO_TUNE, square: true })
    expect([r.width, r.height]).toEqual([30, 30])
    expect(r.data[10 * 30]).toBe(1)
    expect(r.data[0]).toBe(0)
  })
})
