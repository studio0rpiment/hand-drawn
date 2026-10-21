import { parse } from 'opentype.js'
import { describe, expect, it } from 'vitest'
import { ASCENDER, assemble, outlines } from '../src/font/assemble'
import { CAP_HEIGHT, X_HEIGHT, bbox, dotless, fromTraced, placeMark, shapeGlyph, space, type Cmd } from '../src/font/outline'
import { BASELINE_PX, READ_BOX, RES, dropSpill, readSheet } from '../src/font/read'
import { GUIDES, MARKER, MARKERS, PAGE2_FLAG, SHEETS, UNITS, cellOrigin, sheetSvg } from '../src/font/sheet'
import { AS_DRAWN, BUILT_IN, readFontStyle } from '../src/font/style'
import type { GrayImage } from '../src/image'

/** A box outline from (x0, y0) to (x1, y1) in font units. */
const rect = (x0: number, y0: number, x1: number, y1: number): Cmd[] => [
  { t: 'M', x: x0, y: y0 },
  { t: 'L', x: x1, y: y0 },
  { t: 'L', x: x1, y: y1 },
  { t: 'L', x: x0, y: y1 },
  { t: 'Z' },
]

/**
 * A photographed page: mm → px through a slight shear and offset, with the
 * markers, optionally the page-2 flag, and a solid block drawn in box 0
 * from cap height to the baseline.
 */
function photo(page2: boolean): GrayImage {
  const w = 900
  const h = 1250
  const toPx = (x: number, y: number) => ({ x: 4.15 * x + 0.03 * y + 8, y: 4.12 * y + 0.02 * x + 6 })
  const data = new Uint8Array(w * h).fill(245)
  const fill = (x0: number, y0: number, x1: number, y1: number) => {
    for (let y = y0; y < y1; y += 0.1) {
      for (let x = x0; x < x1; x += 0.1) {
        const p = toPx(x, y)
        data[Math.floor(p.y) * w + Math.floor(p.x)] = 20
      }
    }
  }
  for (const m of MARKERS) fill(m.x - MARKER.size / 2, m.y - MARKER.size / 2, m.x + MARKER.size / 2, m.y + MARKER.size / 2)
  if (page2) fill(PAGE2_FLAG.x - 2.5, PAGE2_FLAG.y - 2.5, PAGE2_FLAG.x + 2.5, PAGE2_FLAG.y + 2.5)
  const o = cellOrigin(0)
  fill(o.x + 4, o.y + GUIDES.cap, o.x + 13, o.y + GUIDES.baseline)
  return { data, width: w, height: h }
}

describe('sheet', () => {
  it('has a box for every character and draws them all', () => {
    expect(SHEETS[0].length).toBeLessThanOrEqual(70)
    expect(SHEETS[1].length).toBeLessThanOrEqual(70)
    const svg = sheetSvg(1)
    expect(svg).toContain('width="210mm"')
    expect(svg).toContain('ß')
    expect(svg).toContain('´ acute')
    expect((svg.match(/<rect/g) ?? []).length).toBe(1 + 4 + 1 + SHEETS[1].length)
  })

  it('maps cap height to 700 units', () => {
    expect(CAP_HEIGHT).toBeCloseTo(700)
    expect(UNITS * (GUIDES.baseline - GUIDES.x)).toBeCloseTo(X_HEIGHT)
  })
})

describe('readSheet', () => {
  it('finds the markers, the page and the drawing in its box', () => {
    for (const page2 of [false, true]) {
      const r = readSheet(photo(page2))
      expect(r.markers).toBe(4)
      expect(r.page).toBe(page2 ? 1 : 0)
      expect(r.cells.length).toBe(SHEETS[r.page].length)
      const c = r.cells[0]
      const at = (xmm: number, ymm: number) => c.data[Math.round((ymm - READ_BOX.y) * RES) * c.width + Math.round((xmm - READ_BOX.x) * RES)]
      // Inside the block, and well clear of it above, below and beside.
      expect(at(8.5, 17)).toBeLessThan(60)
      expect(at(8.5, GUIDES.cap + 0.6)).toBeLessThan(60)
      expect(at(8.5, GUIDES.baseline - 0.6)).toBeLessThan(60)
      expect(at(8.5, 6)).toBeGreaterThan(200)
      expect(at(8.5, 28)).toBeGreaterThan(200)
      expect(at(2, 17)).toBeGreaterThan(200)
      expect(r.cells[1].data.every((v) => v > 200)).toBe(true)
    }
  })
})

describe('dropSpill', () => {
  it('drops thin slivers at the side edges, keeps letters and wide overruns', () => {
    const w = 150
    const h = 100
    const data = new Uint8Array(w * h)
    const fill = (x0: number, y0: number, x1: number, y1: number) => {
      for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) data[y * w + x] = 1
    }
    fill(140, 10, 150, 40) // 1 mm sliver at the right edge
    fill(50, 20, 90, 80) // a letter in the middle
    fill(0, 60, 45, 70) // a wide stroke running off the left edge
    const out = dropSpill({ data, width: w, height: h })
    expect(out.data[20 * w + 145]).toBe(0)
    expect(out.data[50 * w + 70]).toBe(1)
    expect(out.data[65 * w + 5]).toBe(1)
  })
})

describe('outlines', () => {
  it('turns traced pixels into font units on the baseline', () => {
    const cmds = fromTraced(`M${RES} ${BASELINE_PX}l0 -${16 * RES}l${RES} 0z`)
    expect(cmds[0]).toEqual({ t: 'M', x: UNITS, y: 0 })
    expect(cmds[1]).toMatchObject({ t: 'L', x: UNITS })
    expect((cmds[1] as { y: number }).y).toBeCloseTo(700)
    expect(cmds[3]).toEqual({ t: 'Z' })
  })

  it('takes the dot off an i', () => {
    const i = [...rect(100, 0, 160, X_HEIGHT), ...rect(100, X_HEIGHT + 80, 160, X_HEIGHT + 150)]
    expect(bbox(dotless(i))!.yMax).toBe(X_HEIGHT)
  })

  it('centres an accent above the letter with the style’s gap, a cedilla below', () => {
    const e = rect(100, 0, 400, X_HEIGHT)
    const acute = rect(0, 900, 80, 1000)
    const placed = placeMark(e, acute, 'acute', AS_DRAWN).slice(5)
    const b = bbox(placed)!
    expect(b.yMin).toBeCloseTo(X_HEIGHT + AS_DRAWN.marks.gap)
    expect((b.xMin + b.xMax) / 2).toBeCloseTo(250)
    const ced = bbox(placeMark(e, rect(0, 0, 60, 120), 'cedilla', AS_DRAWN).slice(5))!
    expect(ced.yMax).toBeCloseTo(20)
  })

  it('leans, and bounces the same way every time', () => {
    const slanted = shapeGlyph(rect(0, 0, 100, 700), 'A', { ...AS_DRAWN, shape: { ...AS_DRAWN.shape, slant: 45 } })
    expect((slanted[2] as { x: number }).x).toBeCloseTo(100 + 700)
    const s = { ...AS_DRAWN, shape: { ...AS_DRAWN.shape, bounce: 50, seed: 4 } }
    expect(shapeGlyph(rect(0, 0, 100, 700), 'A', s)).toEqual(shapeGlyph(rect(0, 0, 100, 700), 'A', s))
    expect(bbox(shapeGlyph(rect(0, 0, 100, 700), 'A', s))!.yMin).not.toBe(bbox(shapeGlyph(rect(0, 0, 100, 700), 'B', s))!.yMin)
  })

  it('spaces with side bearings, or centres in a fixed width', () => {
    const g = space(rect(300, 0, 500, 700), AS_DRAWN, 0)
    expect(bbox(g.cmds)!.xMin).toBe(AS_DRAWN.spacing.side)
    expect(g.advance).toBe(200 + 2 * AS_DRAWN.spacing.side)
    const m = space(rect(300, 0, 500, 700), { ...AS_DRAWN, spacing: { ...AS_DRAWN.spacing, mono: true } }, 600)
    expect(bbox(m.cmds)!.xMin).toBe(200)
    expect(m.advance).toBe(600)
  })
})

describe('font', () => {
  const drawn = new Map<string, Cmd[]>([
    ['A', rect(0, 0, 500, 700)],
    ['e', rect(0, 0, 400, X_HEIGHT)],
    ['i', [...rect(0, 0, 60, X_HEIGHT), ...rect(0, X_HEIGHT + 80, 60, X_HEIGHT + 150)]],
    ['´', rect(0, 0, 80, 100)],
  ])

  it('makes accented letters from drawn ones', () => {
    const o = outlines(drawn, AS_DRAWN)
    expect(o.get('é')?.composite).toBe(true)
    expect(o.get('í')?.composite).toBe(true)
    expect(bbox(o.get('í')!.cmds)!.yMax).toBeCloseTo(X_HEIGHT + AS_DRAWN.marks.gap + 100)
    expect(o.has('à')).toBe(false)
    expect(o.get('ı')?.composite).toBe(true)
  })

  it('writes an OpenType font that reads back', () => {
    const built = assemble(drawn, AS_DRAWN, { family: 'Test Hand' })
    const f = parse(built.buffer)
    expect(f.unitsPerEm).toBe(1000)
    expect(f.ascender).toBe(ASCENDER + AS_DRAWN.lineGap / 2)
    expect(f.names.windows.fontFamily.en).toBe('Test Hand')
    expect(f.charToGlyph('é').advanceWidth).toBe(400 + 2 * AS_DRAWN.spacing.side)
    expect(f.charToGlyph(' ').advanceWidth).toBe(AS_DRAWN.spacing.space)
    expect(f.charToGlyph('A').path.commands.length).toBeGreaterThan(3)
  })

  it('reads every built-in style back unchanged', () => {
    for (const s of BUILT_IN) expect(readFontStyle(JSON.parse(JSON.stringify(s)))).toEqual(s)
  })
})
