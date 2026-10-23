import { describe, expect, it } from 'vitest'
import { flipLightness, hexHsl, hslHex, measureColours } from '../src/colour'

describe('HSL', () => {
  it('round-trips colours', () => {
    for (const hex of ['#000000', '#ffffff', '#fdda24', '#1d1a24', '#5cf25c', '#ff2fb4', '#808080']) {
      expect(hslHex(hexHsl(hex))).toBe(hex)
    }
  })

  it('reads known colours', () => {
    expect(hexHsl('#ff0000')).toEqual({ h: 0, s: 100, l: 50 })
    expect(hexHsl('#ffffff').l).toBe(100)
  })

  it('turns lightness over', () => {
    expect(flipLightness('#000000')).toBe('#ffffff')
    expect(hexHsl(flipLightness('#1d1a24')).l).toBeCloseTo(100 - hexHsl('#1d1a24').l, 0)
  })
})

describe('measureColours', () => {
  it('finds ink and paper, ignoring blended edges', () => {
    const w = 60
    const h = 60
    const data = new Uint8ClampedArray(w * h * 4)
    const mask = { width: w, height: h, data: new Uint8Array(w * h) }
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x
        const inInk = x >= 20 && x < 40
        const edge = x === 20 || x === 39
        const c = inInk ? (edge ? [140, 100, 120] : [30, 20, 90]) : [240, 235, 220]
        data.set([...c, 255], i * 4)
        mask.data[i] = inInk ? 1 : 0
      }
    }
    const got = measureColours({ width: w, height: h, data }, mask, 1)!
    expect(got.ink.map(Math.round)).toEqual([30, 20, 90])
    expect(got.paper.map(Math.round)).toEqual([240, 235, 220])
  })
})
