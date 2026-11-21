import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { Mask } from '../src/image'
import { distinct, moved, ordered, readCollectionJson, unzip, type Placed } from '../src/sketch/collection'
import { inkTone, leaveOut, leftOutMarks, lineUpWith, markAt, moments, place, prepare, shrink } from '../src/sketch/drawing'
import { asCircle, closeGaps, dropFaint, evenWidth, joinEnds, levelMask, polylines, schematic, simplify, skeleton, snapAngles, toneLevels } from '../src/sketch/lines'
import { frameFor, placement, sketchSvg, shapesFor } from '../src/sketch/make'
import { contactSheet, drawingPdf, pathOps, pdfText } from '../src/sketch/pdf'
import { PLAIN, readSketchStyle, sketchFileName } from '../src/sketch/style'
import { zip } from '../src/icon/files'

/** A mask from rows of text: # is ink. */
function mask(rows: string[]): Mask {
  const width = rows[0].length
  const data = new Uint8Array(width * rows.length)
  rows.forEach((r, y) => [...r].forEach((c, x) => (data[y * width + x] = c === '#' ? 1 : 0)))
  return { width, height: rows.length, data }
}

/** A blank mask with rectangles of ink. */
function rects(width: number, height: number, boxes: [number, number, number, number][]): Mask {
  const data = new Uint8Array(width * height)
  for (const [x0, y0, w, h] of boxes) for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) data[y * width + x] = 1
  return { width, height, data }
}

const count = (m: Mask) => m.data.reduce((a, b) => a + b, 0)

describe('sketch style', () => {
  it('reads untrusted JSON into a valid style', () => {
    const s = readSketchStyle({ kind: 'nope', line: { even: 9, traceAs: 'centre' }, schematic: { snap: 30 }, tones: { levels: 9 }, colours: { ink: 'red' } })
    expect(s.kind).toBe(PLAIN.kind)
    expect(s.line.even).toBe(1)
    expect(s.line.traceAs).toBe('centre')
    expect(s.schematic.snap).toBe(PLAIN.schematic.snap)
    expect(s.tones.levels).toBe(5)
    expect(s.colours.ink).toBe(PLAIN.colours.ink)
  })

  it('names files by collection, number, sketch and kind', () => {
    expect(sketchFileName('Chair study', 3, 'Side view', 'line')).toBe('chair-study-03-side-view-line')
    expect(sketchFileName('Chair study', 12, 'Top', 'as-drawn')).toBe('chair-study-12-top-as-drawn')
  })
})

describe('a sketch drawing', () => {
  it('leaves out the marks tapped, and only those', () => {
    const m = mask(['##....', '##....', '......', '....##', '....##'])
    expect(markAt(m, 3, 3, 2)).toEqual({ x: 4, y: 3 })
    expect(markAt(m, 2, 2, 0.5)).toBeNull()
    const gone = leftOutMarks(m, [{ x: 5, y: 4 }])
    expect(count(gone)).toBe(4)
    const kept = leaveOut(m, [{ x: 5, y: 4 }])
    expect(count(kept)).toBe(4)
    expect(kept.data[0]).toBe(1)
  })

  it('keeps pencil tones from the paper level to the darkest ink, only near the ink', () => {
    const m = mask(['......', '.##...', '.##...', '......', '.....#'])
    const gray = { width: 6, height: 5, data: new Uint8Array(30).fill(240) }
    gray.data[7] = 20
    gray.data[8] = 130
    gray.data[29] = 240
    const tone = inkTone(gray, m)
    expect(tone[7]).toBe(255)
    expect(tone[8]).toBeGreaterThan(100)
    expect(tone[8]).toBeLessThan(255)
    // Paper far from the ink stays clear.
    expect(tone[5]).toBe(0)
  })

  it('adds the margin and keeps mask and tones in one frame', () => {
    const m = rects(20, 10, [[2, 2, 16, 6]])
    const gray = { width: 20, height: 10, data: m.data.map((v) => (v ? 30 : 230)) }
    const p = prepare({ gray, mask: m }, { rotate: 0, spread: 0, margin: 0.1, leftOut: [] })
    expect(p.width).toBe(24)
    expect(p.height).toBe(14)
    expect(p.tone.length).toBe(p.mask.data.length)
    const turned = prepare({ gray, mask: m }, { rotate: 10, spread: 0, margin: 0, leftOut: [] })
    expect(turned.tone.length).toBe(turned.width * turned.height)
  })

  it('lines one drawing up with another: same centre, size and direction', () => {
    const a = rects(80, 80, [[10, 30, 20, 6]])
    const b = rects(80, 80, [[30, 20, 40, 12]])
    const ma = moments(a)!
    const mb = moments(b)!
    expect(ma.long).toBeGreaterThan(1.15)
    const move = lineUpWith(ma, mb)
    expect(move.scale).toBeCloseTo(2, 0)
    const p = place({ width: 80, height: 80, mask: a, tone: a.data.map((v) => v * 255) }, 80, 80, move)
    const mp = moments(p.mask)!
    expect(mp.cx).toBeCloseTo(mb.cx, 0)
    expect(mp.cy).toBeCloseTo(mb.cy, 0)
    expect(mp.size).toBeCloseTo(mb.size, -1)
  })

  it('shrinks for the tiles without losing thin lines', () => {
    const m = rects(40, 40, [[0, 10, 40, 1]])
    const { prepared, k } = shrink({ width: 40, height: 40, mask: m, tone: m.data.map((v) => v * 255) }, 10)
    expect(k).toBe(4)
    expect(count(prepared.mask)).toBe(10)
  })
})

describe('lines', () => {
  it('thins a thick stroke to one pixel and follows it as one polyline', () => {
    const m = rects(40, 12, [[4, 3, 32, 5]])
    const skel = skeleton(m)
    expect(count(skel)).toBeLessThan(40)
    const lines = polylines(skel)
    expect(lines.length).toBe(1)
    expect(Math.abs(lines[0][0].x - lines[0][lines[0].length - 1].x)).toBeGreaterThan(20)
  })

  it('follows a closed loop', () => {
    const ring = new Uint8Array(30 * 30)
    for (let y = 0; y < 30; y++) for (let x = 0; x < 30; x++) {
      const r = Math.hypot(x - 15, y - 15)
      ring[y * 30 + x] = r > 8 && r < 11 ? 1 : 0
    }
    const lines = polylines(skeleton({ width: 30, height: 30, data: ring }))
    expect(lines.length).toBe(1)
    expect(asCircle(lines[0])).not.toBeNull()
  })

  it('drops faint lines and closes small gaps', () => {
    const m = rects(20, 5, [[0, 2, 8, 1], [10, 2, 8, 1]])
    const tone = m.data.map((v, i) => (v ? (i % 20 < 9 ? 250 : 40) : 0))
    expect(count(dropFaint(m, tone, 0.3))).toBe(8)
    expect(count(closeGaps(m, 4))).toBeGreaterThan(count(m))
  })

  it('makes line widths even', () => {
    const m = rects(60, 30, [[5, 5, 50, 2], [5, 15, 50, 9]])
    const even = evenWidth(m, 1)
    const thick = (y0: number, y1: number) => {
      let n = 0
      for (let y = y0; y < y1; y++) n += even.data[y * 60 + 30]
      return n
    }
    expect(Math.abs(thick(0, 12) - thick(12, 30))).toBeLessThanOrEqual(2)
  })

  it('simplifies, snaps angles and joins ends', () => {
    const line = Array.from({ length: 21 }, (_, i) => ({ x: i, y: i % 2 ? 0.3 : 0 }))
    expect(simplify(line, 1)).toHaveLength(2)
    const snapped = snapAngles([{ x: 0, y: 0 }, { x: 10, y: 1 }, { x: 11, y: 11 }], 90)
    expect(snapped[1].y).toBeCloseTo(snapped[0].y, 5)
    expect(snapped[2].x).toBeCloseTo(snapped[1].x, 5)
    const joined = joinEnds([[{ x: 0, y: 0 }, { x: 10, y: 0 }], [{ x: 11, y: 1 }, { x: 20, y: 10 }]], 3)
    expect(joined[0][1]).toEqual(joined[1][0])
    const sc = schematic([[{ x: 0, y: 0 }, { x: 5, y: 0.4 }, { x: 10, y: 0 }]], { straighten: 1, snap: 45, join: 0, grid: 5 })
    expect(sc.lines[0]).toEqual([{ x: 0, y: 0 }, { x: 10, y: 0 }])
  })

  it('cuts tones into levels', () => {
    const tone = new Uint8Array([0, 60, 130, 200, 255])
    const levels = toneLevels(tone, 5, 1, 3, 0)
    expect([...levels]).toEqual([0, 1, 2, 2, 3])
    expect(count(levelMask(levels, 5, 1, 2))).toBe(2)
  })
})

describe('output', () => {
  it('places the drawing in a frame and writes an SVG', () => {
    const f = frameFor(100, 50, { ...PLAIN, size: { ...PLAIN.size, fit: false, width: 200, height: 200 } })
    expect(placement(f)).toEqual({ scale: 2, x: 0, y: 50 })
    const svg = sketchSvg({ type: 'stroke', paths: ['M0 0L10 0'], circles: [{ cx: 5, cy: 5, r: 2 }], width: 3, round: true }, f, '#000000', '#ffffff')
    expect(svg).toContain('viewBox="0 0 200 200"')
    expect(svg).toContain('stroke-width="3"')
    expect(svg).toContain('<circle')
    expect(svg).toContain('translate(0 50) scale(2)')
  })

  it('gives each kind its shapes', () => {
    const m = rects(40, 20, [[4, 8, 32, 4]])
    const p = { width: 40, height: 20, mask: m, tone: m.data.map((v) => v * 255) }
    expect(shapesFor(p, PLAIN).type).toBe('fill')
    expect(shapesFor(p, { ...PLAIN, kind: 'schematic' }).type).toBe('stroke')
    const tones = shapesFor(p, { ...PLAIN, kind: 'tones', tones: { levels: 4, smoothness: 0 } })
    expect(tones.type === 'fill' && tones.layers.length).toBe(4)
    const centre = shapesFor(p, { ...PLAIN, kind: 'line', line: { ...PLAIN.line, traceAs: 'centre' } })
    expect(centre.type === 'stroke' && centre.paths.length).toBe(1)
  })

  it('writes PDF paths with y turned up', () => {
    const ops = pathOps('M1 2l3 0c1 1 2 2 3 3Z', (x, y) => [x, 10 - y])
    expect(ops).toBe('1 8 m\n4 8 l\n5 7 6 6 7 5 c\nh')
    expect(pdfText('a (b) \\ ★')).toBe('a \\(b\\) \\\\ ?')
  })

  it('writes PDFs whose cross-reference table points at their objects', () => {
    const f = frameFor(100, 100, PLAIN)
    const jpeg = readFileSync(join(__dirname, '../public/sample-drawing.jpg'))
    const files = {
      'drawing.pdf': drawingPdf({ type: 'stroke', paths: ['M10 10L90 90', 'M10 90C30 10 70 10 90 90'], circles: [{ cx: 50, cy: 50, r: 20 }], width: 3, round: true }, f, '#1d1a24', null, 72),
      'sheet.pdf': contactSheet('Chair study', [1, 2, 3].map((n) => ({ image: { jpeg, width: 1104, height: 1600 }, n, name: `side view ${n}`, favourite: n === 2 }))),
    }
    for (const [name, bytes] of Object.entries(files)) {
      const text = new TextDecoder('latin1').decode(bytes)
      const xref = Number(/startxref\n(\d+)/.exec(text)![1])
      expect(text.slice(xref, xref + 4)).toBe('xref')
      const offsets = [...text.slice(xref).matchAll(/^(\d{10}) 00000 n $/gm)].map((m) => Number(m[1]))
      offsets.forEach((o, i) => expect(text.slice(o, o + 8), `${name} object ${i + 1}`).toBe(`${i + 1} 0 obj`.padEnd(8, '\n').slice(0, 8)))
      if (process.env.SKETCH_PDF_OUT) writeFileSync(join(process.env.SKETCH_PDF_OUT, name), bytes)
    }
  })
})

describe('collections', () => {
  const s = (name: string, added: number, extra: Partial<Placed> = {}): Placed => ({ name, added, place: added, favourite: false, date: null, ...extra })

  it('orders sketches as uploaded, by name, favourites first, by date and as arranged', () => {
    const list = [s('b', 0, { date: 30, place: 1 }), s('a 10', 1, { favourite: true, place: 2 }), s('a 2', 2, { date: 10, place: 0 })]
    expect(ordered(list, 'uploaded').map((x) => x.name)).toEqual(['b', 'a 10', 'a 2'])
    expect(ordered(list, 'name').map((x) => x.name)).toEqual(['a 2', 'a 10', 'b'])
    expect(ordered(list, 'favourites').map((x) => x.name)).toEqual(['a 10', 'b', 'a 2'])
    expect(ordered(list, 'date').map((x) => x.name)).toEqual(['a 2', 'b', 'a 10'])
    expect(ordered(list, 'own').map((x) => x.name)).toEqual(['a 2', 'b', 'a 10'])
    expect(moved([1, 2, 3, 4], 0, 2)).toEqual([2, 3, 1, 4])
    expect(distinct(['Side view', 'side-view', 'Top'])).toEqual(['Side view', 'side-view 2', 'Top'])
  })

  it('reads its zip back (stored entries) and its collection.json', () => {
    const json = { app: 'hand-drawn', kind: 'sketch-collection', version: 1, name: 'Chair', order: 'name', sketches: [{ n: 1, name: 'one', photo: 'IMG_1', file: 'photos/01-one.jpg', date: null, favourite: true, tune: { rotate: 2, leftOut: [{ x: 1, y: 2 }, { x: 'no' }] }, lineUp: null }] }
    const bytes = zip([
      { path: 'chair/collection.json', data: JSON.stringify(json) },
      { path: 'chair/photos/01-one.jpg', data: new Uint8Array([1, 2, 3]) },
    ])
    const files = unzip(bytes)
    expect([...files.get('chair/photos/01-one.jpg')!]).toEqual([1, 2, 3])
    const read = readCollectionJson(JSON.parse(new TextDecoder().decode(files.get('chair/collection.json'))))!
    expect(read.order).toBe('name')
    expect(read.sketches[0].tune).toEqual({ rotate: 2, spread: 0, margin: 0.04, leftOut: [{ x: 1, y: 2 }] })
    expect(readCollectionJson({ app: 'other' })).toBeNull()
  })
})
