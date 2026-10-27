import { describe, expect, it } from 'vitest'
import { anchor, placeOutline, readingOrder, scales, type Drawing } from '../src/font/freehand'
import { CAP_HEIGHT, X_HEIGHT } from '../src/font/outline'

/** A drawing whose ink fills a w × h block. */
function block(w: number, h: number, source: object, x = 0, y = 0): Drawing {
  return { mask: { width: w, height: h, data: new Uint8Array(w * h).fill(1) }, box: { x, y, width: w, height: h }, source }
}

const ys = (cmds: ReturnType<typeof placeOutline>) => cmds.flatMap((c) => (c.t === 'Z' ? [] : [c.y]))

describe('freehand letters', () => {
  it('read rows from the top, each left to right', () => {
    const page = {}
    const a = block(10, 20, page, 50, 0)
    const b = block(10, 20, page, 0, 5)
    const c = block(10, 20, page, 20, 40)
    expect(readingOrder([c, a, b])).toEqual([b, a, c])
  })

  it('size a photo by its letters and sit them on their lines', () => {
    const page = {}
    const placed = new Map([
      ['A', block(10, 40, page)],
      ['x', block(10, 26, page)],
      ['p', block(10, 30, page)],
    ])
    const f = scales(placed).get(page)!
    expect(f).toBeCloseTo(CAP_HEIGHT / 40, 0)
    const square = 'M0 0L10 0L10 40L0 40Z'
    const capYs = ys(placeOutline('A', placed.get('A')!, square, f))
    expect(Math.min(...capYs)).toBeCloseTo(0)
    expect(Math.max(...capYs)).toBeCloseTo(40 * f)
    // A descender hangs from the x-height.
    const pYs = ys(placeOutline('p', placed.get('p')!, 'M0 0L10 0L10 30L0 30Z', f))
    expect(Math.max(...pYs)).toBeCloseTo(X_HEIGHT)
    expect(Math.min(...pYs)).toBeLessThan(0)
    expect(anchor('-')).toEqual({ middle: X_HEIGHT / 2 })
  })
})
