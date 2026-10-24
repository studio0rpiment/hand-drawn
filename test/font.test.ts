import { parse } from 'opentype.js'
import { describe, expect, it } from 'vitest'
import { ASCENDER, assemble, kerning, outlines } from '../src/font/assemble'
import { CAP_HEIGHT, X_HEIGHT, bbox, dotless, fromTraced, placeMark, shapeGlyph, space, type Cmd } from '../src/font/outline'
import { classifySide, opticalCentre, overshoot, profile, tracyRefs, tracyValue, TRACY_CAPS } from '../src/font/metrics'
import type { BuiltGlyph } from '../src/font/assemble'
import { BASELINE_PX, READ_BOX, RES, findSheetMarkers, ownInk, readSheet } from '../src/font/read'
import { FLAG, GUIDES, MARKER, MARKERS, PAGE_FLAGS, SHEETS, UNITS, cellOrigin, sheetSvg } from '../src/font/sheet'
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
function photo(page: number): GrayImage {
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
  for (const x of PAGE_FLAGS[page]) fill(x - FLAG.size / 2, FLAG.y - FLAG.size / 2, x + FLAG.size / 2, FLAG.y + FLAG.size / 2)
  const o = cellOrigin(0)
  fill(o.x + 4, o.y + GUIDES.cap, o.x + 13, o.y + GUIDES.baseline)
  return { data, width: w, height: h }
}

describe('sheet', () => {
  it('has a box for every character and draws them all', () => {
    expect(SHEETS[0].length).toBeLessThanOrEqual(70)
    expect(SHEETS[1].length).toBeLessThanOrEqual(70)
    expect(SHEETS[2].length).toBeLessThanOrEqual(70)
    // No character is asked for twice.
    const all = SHEETS.flat().map((s) => s.char)
    expect(new Set(all).size).toBe(all.length)
    expect((sheetSvg(2).match(/<rect/g) ?? []).length).toBe(1 + 4 + 2 + SHEETS[2].length)
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
    for (const page of [0, 1, 2]) {
      const r = readSheet(photo(page))
      expect(r.markers).toBe(4)
      expect(r.page).toBe(page)
      expect(r.cells.length).toBe(SHEETS[r.page].length)
      const c = r.cells[0]
      const at = (xmm: number, ymm: number) => c.data[Math.round((ymm - READ_BOX.y) * RES) * c.width + r.margin + Math.round((xmm - READ_BOX.x) * RES)]
      // Inside the block, and well clear of it above, below and beside.
      expect(at(8.5, 17)).toBeLessThan(60)
      expect(at(8.5, GUIDES.cap + 0.6)).toBeLessThan(60)
      expect(at(8.5, GUIDES.baseline - 0.6)).toBeLessThan(60)
      expect(at(8.5, 6)).toBeGreaterThan(200)
      expect(at(8.5, 28)).toBeGreaterThan(200)
      expect(at(2, 17)).toBeGreaterThan(200)
      // The second box is empty, apart from the first box's ink reaching into its left margin.
      const c1 = r.cells[1]
      expect(c1.data.every((v, i) => v > 200 || i % c1.width < r.margin)).toBe(true)
    }
  })
})

describe('findSheetMarkers', () => {
  it('finds the four corner squares anywhere in a photo, not the page-2 flag', () => {
    for (const page of [0, 1, 2]) {
      const g = photo(page)
      // The same sheet on a darker table, off-centre in a bigger photo.
      const w = g.width + 300
      const h = g.height + 200
      const data = new Uint8Array(w * h).fill(90)
      for (let y = 0; y < g.height; y++) data.set(g.data.subarray(y * g.width, (y + 1) * g.width), (y + 140) * w + 220)
      const q = findSheetMarkers({ width: w, height: h, data })!
      expect(q).not.toBeNull()
      const expected = MARKERS.map((m) => ({ x: 4.15 * m.x + 0.03 * m.y + 8 + 220, y: 4.12 * m.y + 0.02 * m.x + 6 + 140 }))
      q.forEach((p, i) => {
        expect(Math.abs(p.x - expected[i].x)).toBeLessThan(4)
        expect(Math.abs(p.y - expected[i].y)).toBeLessThan(4)
      })
      expect(readSheet({ width: w, height: h, data }, q).page).toBe(page)
    }
  })
})

describe('ownInk', () => {
  it('keeps the box’s letters with their overhang, drops a neighbour’s', () => {
    const margin = 40
    const w = 2 * margin + 150
    const h = 100
    const data = new Uint8Array(w * h)
    const fill = (x0: number, y0: number, x1: number, y1: number) => {
      for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) data[y * w + x] = 1
    }
    fill(margin + 50, 20, margin + 90, 80) // a letter in the box
    fill(margin + 100, 10, margin + 180, 16) // a bar running 30 px past the right edge
    fill(margin - 30, 40, margin + 10, 50) // the left neighbour reaching 10 px in
    const out = ownInk({ data, width: w, height: h }, margin)
    expect(out.data[50 * w + margin + 70]).toBe(1)
    expect(out.data[12 * w + margin + 170]).toBe(1)
    expect(out.data[45 * w + margin + 5]).toBe(0)
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
    // Centred, then an acute nudged right by a third of its width so its thin end sits over the centre (Cheng).
    expect((b.xMin + b.xMax) / 2).toBeCloseTo(250 + 80 / 3)
    const grave = bbox(placeMark(e, acute, 'grave', AS_DRAWN).slice(5))!
    expect((grave.xMin + grave.xMax) / 2).toBeCloseTo(250 - 80 / 3)
    const ced = bbox(placeMark(e, rect(0, 0, 60, 120), 'cedilla', AS_DRAWN).slice(5))!
    expect(ced.yMax).toBeCloseTo(20)
  })

  it('gives capitals a narrower gap and a smaller accent, and lines a dieresis up with the i’s dot', () => {
    const E = rect(100, 0, 400, 700)
    const mark = rect(0, 900, 80, 1000)
    const cap = bbox(placeMark(E, mark, 'acute', AS_DRAWN, { upper: true }).slice(5))!
    expect(cap.yMin).toBeCloseTo(700 + (AS_DRAWN.marks.gap * 2) / 3)
    expect(cap.yMax - cap.yMin).toBeCloseTo(100 * 0.88)
    const u = rect(100, 0, 400, X_HEIGHT)
    const dots = bbox(placeMark(u, mark, 'dieresis', AS_DRAWN, { dotBottom: X_HEIGHT + 90 }).slice(5))!
    expect(dots.yMin).toBeCloseTo(X_HEIGHT + 90)
  })

  it('centres on where the top of a letter is, not its box', () => {
    // A letter whose top is all at the left, like an h’s ascender.
    const h = [...rect(0, 0, 60, 700), ...rect(0, 0, 300, 400)]
    expect(opticalCentre(h, 'top')!).toBeLessThan(60)
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
    // Even spacing here, so the widths are easy to predict.
    const built = assemble(drawn, { ...AS_DRAWN, spacing: { ...AS_DRAWN.spacing, optical: false } }, { family: 'Test Hand' })
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

describe('type design rules (Hochuli, Cheng)', () => {
  const ring = (cx: number, cy: number, r: number, steps = 48): Cmd[] => {
    const out: Cmd[] = []
    for (let i = 0; i <= steps; i++) {
      const a = (i / steps) * Math.PI * 2
      out.push({ t: i ? 'L' : 'M', x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r })
    }
    out.push({ t: 'Z' })
    return out
  }
  const V: Cmd[] = [
    { t: 'M', x: 0, y: 700 },
    { t: 'L', x: 80, y: 700 },
    { t: 'L', x: 250, y: 60 },
    { t: 'L', x: 420, y: 700 },
    { t: 'L', x: 500, y: 700 },
    { t: 'L', x: 290, y: 0 },
    { t: 'L', x: 210, y: 0 },
    { t: 'Z' },
  ]

  it('spaces by Tracy’s method: references from the H and n counters, minimum beside A', () => {
    const r = tracyRefs(300, 200)
    expect(r.H).toBeCloseTo(102)
    expect(r.nLeft).toBeCloseTo(56)
    expect(r.nRight).toBeLessThan(r.nLeft)
    expect(r.O).toBeLessThan(r.H)
    expect(r.o).toBeLessThan(r.nLeft)
    const [l, rr] = TRACY_CAPS.A
    expect(tracyValue(l, true, r)).toBe(r.min)
    expect(tracyValue(rr, true, r)).toBe(r.min)
    expect(tracyValue(TRACY_CAPS.D[1], true, r)).toBe(r.O)
  })

  it('tells straight, round, diagonal and open sides apart', () => {
    const side = (cmds: Cmd[], lo: number, hi: number) => {
      const p = profile(cmds, lo, hi, 24)
      return [classifySide(p.left, -1, hi - lo), classifySide(p.right, 1, hi - lo)]
    }
    expect(side(rect(0, 0, 80, 700), 0, 700)).toEqual(['straight', 'straight'])
    expect(side(ring(300, 350, 350), 0, 700)).toEqual(['round', 'round'])
    expect(side(V, 0, 700)).toEqual(['diagonal', 'diagonal'])
    // An L: straight stem, open right side above the foot.
    const L = [...rect(0, 0, 80, 700), ...rect(0, 0, 400, 80)]
    expect(side(L, 0, 700)[1]).toBe('open')
  })

  it('makes a round letter overshoot its lines, and leaves an odd-sized one alone', () => {
    const o = overshoot(ring(300, 350, 350), 0, 700, 10.5)
    expect(o.changed).toBe(true)
    const b = bbox(o.cmds)!
    expect(b.yMax).toBeCloseTo(710.5, 0)
    expect(b.yMin).toBeCloseTo(-10.5, 0)
    expect(overshoot(ring(300, 200, 150), 0, 700, 10.5).changed).toBe(false)
  })

  it('kerns an open pair tighter, and never lets ink touch', () => {
    const glyphs = [
      { char: 'H', cmds: [...rect(40, 0, 100, 700), ...rect(360, 0, 460, 700)], advance: 500, composite: false },
      { char: 'V', cmds: V.map((c) => (c.t === 'Z' ? c : { ...c, x: c.x + 20 })), advance: 540, composite: false },
      { char: 'A', cmds: V.map((c) => (c.t === 'Z' ? c : { ...c, x: c.x + 20, y: 700 - c.y })), advance: 540, composite: false },
    ] as BuiltGlyph[]
    const pairs = kerning(glyphs)
    const av = pairs.find((p) => p.left === 4 && p.right === 3)
    expect(av?.value).toBeLessThan(0)
    // Applied, the closest approach of A and V is still at least 20 units.
    expect(pairs.every((p) => Math.abs(p.value) <= 120)).toBe(true)
  })

  it('writes the kerning into the font file, where it reads back', () => {
    const font = { ...AS_DRAWN, overshoot: false }
    const withV = new Map<string, Cmd[]>([
      ['n', [...rect(0, 0, 60, X_HEIGHT), ...rect(260, 0, 320, X_HEIGHT), ...rect(0, X_HEIGHT - 60, 320, X_HEIGHT)]],
      ['H', [...rect(0, 0, 80, 700), ...rect(400, 0, 480, 700), ...rect(0, 320, 480, 380)]],
    ])
    withV.set('A', V.map((c) => (c.t === 'Z' ? c : { ...c, y: 700 - c.y })))
    withV.set('V', V)
    const built = assemble(withV, font, { family: 'Test Hand' })
    expect(built.kerns).toBeGreaterThan(0)
    const f = parse(built.buffer)
    expect(f.getKerningValue(f.charToGlyph('A'), f.charToGlyph('V'))).toBeLessThan(0)
  })
})
