import { describe, expect, it } from 'vitest'
import type { Mask } from '../src/image'
import { padBox, splitDrawings } from '../src/split'

/** A blank page with filled rectangles [x, y, w, h]. */
function page(w: number, h: number, rects: number[][]): Mask {
  const data = new Uint8Array(w * h)
  for (const [x0, y0, rw, rh] of rects) for (let y = y0; y < y0 + rh; y++) for (let x = x0; x < x0 + rw; x++) data[y * w + x] = 1
  return { data, width: w, height: h }
}

describe('splitDrawings', () => {
  it('finds each drawing, in reading order', () => {
    // Two rows of two, given out of order, plus a speck.
    const m = page(300, 200, [
      [180, 120, 50, 40],
      [20, 20, 60, 40],
      [200, 25, 40, 30],
      [30, 125, 40, 40],
      [150, 100, 2, 2],
    ])
    const boxes = splitDrawings(m, 10, 20)
    expect(boxes.map((b) => [b.x, b.y])).toEqual([
      [20, 20],
      [200, 25],
      [30, 125],
      [180, 120],
    ])
    expect(boxes[0]).toEqual({ x: 20, y: 20, width: 60, height: 40 })
  })

  it('keeps nearby parts together, like the dot on an i', () => {
    const m = page(200, 200, [
      [50, 60, 10, 60], // stem
      [50, 40, 10, 10], // dot, 10 px above
      [140, 60, 10, 60],
    ])
    expect(splitDrawings(m, 16, 20).length).toBe(2)
    expect(splitDrawings(m, 6, 20).length).toBe(3)
  })

  it('keeps a mark inside a drawing with it, however far from its lines', () => {
    // A square ring 100 px across with a dot in the middle, 40 px from the ring.
    const m = page(300, 200, [
      [20, 20, 100, 6],
      [20, 114, 100, 6],
      [20, 20, 6, 100],
      [114, 20, 6, 100],
      [65, 65, 10, 10],
      [200, 40, 50, 50],
    ])
    const boxes = splitDrawings(m, 10, 20)
    expect(boxes.length).toBe(2)
    expect(boxes[0]).toEqual({ x: 20, y: 20, width: 100, height: 100 })
  })

  it('keeps small drawings beside a big one apart, even inside its box', () => {
    // An L 120 px each way; three small drawings sit in its open corner, 30 px from its lines.
    const m = page(300, 200, [
      [20, 20, 6, 120],
      [20, 134, 120, 6],
      [80, 30, 12, 12],
      [110, 30, 12, 12],
      [80, 60, 12, 12],
    ])
    expect(splitDrawings(m, 10, 20).length).toBe(4)
  })

  it('pads a box without leaving the page', () => {
    expect(padBox({ x: 5, y: 10, width: 20, height: 20 }, 8, 30, 100)).toEqual({ x: 0, y: 2, width: 30, height: 36 })
  })
})
