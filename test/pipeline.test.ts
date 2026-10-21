import { describe, expect, it } from 'vitest'
import { cropMask, despeckle, flattenLight, inkBox, lineWeight, threshold } from '../src/clean'
import { otsu, type GrayImage, type Mask, type Quad } from '../src/image'
import { applyHomography, findPaper, rectToQuad, warp } from '../src/paper'
import { toPixels } from '../src/svgpath'

function gray(w: number, h: number, f: (x: number, y: number) => number): GrayImage {
  const data = new Uint8Array(w * h)
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) data[y * w + x] = f(x, y)
  return { data, width: w, height: h }
}

function mask(rows: string[]): Mask {
  const w = rows[0].length
  return { data: Uint8Array.from(rows.join('').split(''), (c) => (c === '#' ? 1 : 0)), width: w, height: rows.length }
}

function rows(m: Mask): string[] {
  const out: string[] = []
  for (let y = 0; y < m.height; y++) {
    out.push([...m.data.subarray(y * m.width, (y + 1) * m.width)].map((v) => (v ? '#' : '.')).join(''))
  }
  return out
}

/** Is (x, y) inside the convex quad? */
function inside(q: Quad, x: number, y: number) {
  for (let i = 0; i < 4; i++) {
    const a = q[i]
    const b = q[(i + 1) % 4]
    if ((b.x - a.x) * (y - a.y) - (b.y - a.y) * (x - a.x) < 0) return false
  }
  return true
}

describe('otsu', () => {
  it('splits two clusters between them', () => {
    const t = otsu(gray(10, 10, (x) => (x < 5 ? 40 : 210)))
    expect(t).toBeGreaterThanOrEqual(40)
    expect(t).toBeLessThan(210)
  })
})

describe('homography', () => {
  it('sends the rectangle corners onto the quad', () => {
    const q: Quad = [
      { x: 12, y: 30 },
      { x: 410, y: 5 },
      { x: 380, y: 300 },
      { x: 40, y: 260 },
    ]
    const H = rectToQuad(200, 100, q)
    const corners = [
      [0, 0],
      [200, 0],
      [200, 100],
      [0, 100],
    ]
    corners.forEach(([x, y], i) => {
      const p = applyHomography(H, x, y)
      expect(p.x).toBeCloseTo(q[i].x, 6)
      expect(p.y).toBeCloseTo(q[i].y, 6)
    })
  })

  it('warps an axis-aligned crop exactly', () => {
    const w = 8
    const h = 6
    const data = new Uint8ClampedArray(w * h * 4)
    for (let i = 0; i < w * h; i++) data.fill(i, i * 4, i * 4 + 4)
    const q: Quad = [
      { x: 2, y: 1 },
      { x: 6, y: 1 },
      { x: 6, y: 4 },
      { x: 2, y: 4 },
    ]
    const out = warp({ data, width: w, height: h }, q, 4, 3)
    expect(out.data[0]).toBe(1 * w + 2)
    expect(out.data[(2 * 4 + 3) * 4]).toBe(3 * w + 5)
  })
})

describe('findPaper', () => {
  it('finds a tilted bright sheet on a dark table', () => {
    const sheet: Quad = [
      { x: 180, y: 90 },
      { x: 820, y: 140 },
      { x: 860, y: 700 },
      { x: 120, y: 650 },
    ]
    const img = gray(1000, 800, (x, y) => (inside(sheet, x, y) ? 230 - (x / 1000) * 60 : 50))
    const found = findPaper(img)!
    expect(found).not.toBeNull()
    found.forEach((p, i) => {
      expect(Math.hypot(p.x - sheet[i].x, p.y - sheet[i].y)).toBeLessThan(15)
    })
  })

  it('gives up when nothing stands out', () => {
    expect(findPaper(gray(400, 300, (x, y) => ((x * 7 + y * 13) % 17) * 10))).toBeNull()
  })
})

describe('flattenLight', () => {
  it('lifts a shaded paper to an even white while ink stays dark', () => {
    // Paper fades from 240 to 120; a thin dark line runs down the middle.
    const img = gray(400, 300, (x) => (x >= 198 && x <= 201 ? 30 : Math.round(240 - (x / 400) * 120)))
    const flat = flattenLight(img, 1)
    expect(flat.data[150 * 400 + 20]).toBeGreaterThan(245)
    expect(flat.data[150 * 400 + 380]).toBeGreaterThan(240)
    expect(flat.data[150 * 400 + 199]).toBeLessThan(80)
    // With one threshold the shaded paper no longer reads as ink.
    const m = threshold(flat, otsu(flat))
    expect(m.data[150 * 400 + 380]).toBe(0)
    expect(m.data[150 * 400 + 199]).toBe(1)
  })
})

describe('mask cleanup', () => {
  const m = mask([
    '..........',
    '.#....###.',
    '......#.#.',
    '......###.',
    '..........',
  ])

  it('removes small specks and fills small holes', () => {
    expect(rows(despeckle(m, 2))).toEqual([
      '..........',
      '......###.',
      '......###.',
      '......###.',
      '..........',
    ])
  })

  it('never fills the open paper', () => {
    expect(rows(despeckle(m, 1000)).join('')).not.toContain('#'.repeat(10))
  })

  it('thickens and thins lines', () => {
    const dot = mask(['.....', '.....', '..#..', '.....', '.....'])
    expect(rows(lineWeight(dot, 1))).toEqual(['.....', '.###.', '.###.', '.###.', '.....'])
    expect(rows(lineWeight(lineWeight(dot, 1), -1))).toEqual(rows(dot))
  })

  it('crops to the ink with padding', () => {
    const box = inkBox(m, 1)!
    expect(box).toEqual({ x: 0, y: 0, width: 10, height: 5 })
    const tight = inkBox(despeckle(m, 2), 0)!
    expect(tight).toEqual({ x: 6, y: 1, width: 3, height: 3 })
    expect(rows(cropMask(m, tight))).toEqual(['###', '#.#', '###'])
  })
})

describe('toPixels', () => {
  it('undoes potrace’s tenth-pixel, y-up coordinates', () => {
    // A 10×6 box at (5, 2) in a 20 px tall image, as potrace writes it.
    const d = 'M50 150 c0 -29 1 -30 50 -30 l0 -30z'
    expect(toPixels(d, 20)).toBe('M5 5c0 2.9 0.1 3 5 3l0 3z')
  })
})

describe('findPaper with a shadow', () => {
  it('keeps a shaded corner on the sheet', () => {
    const sheet: Quad = [
      { x: 100, y: 100 },
      { x: 900, y: 100 },
      { x: 900, y: 700 },
      { x: 100, y: 700 },
    ]
    // The bottom-right of the sheet sinks to 110 under a shadow; the table is 45.
    const img = gray(1000, 800, (x, y) => {
      if (!inside(sheet, x, y)) return 45
      const shade = Math.max(0, (x + y - 1000) / 600)
      return Math.round(225 - shade * 115)
    })
    const found = findPaper(img)!
    expect(Math.hypot(found[2].x - 900, found[2].y - 700)).toBeLessThan(15)
  })
})
