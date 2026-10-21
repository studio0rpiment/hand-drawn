import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { Mask } from '../src/image'
import { crc32, ico, zip } from '../src/icon/files'
import { close, distance2, fillEmptyHoles, fillHoles, iconMasks, placeOnSquare } from '../src/icon/shape'
import { HAND_ICONS, effectivePadding, readStyle, slug } from '../src/icon/style'
import { directionTransform, faviconSvg, sprite, standaloneSvg } from '../src/icon/svg'

function draw(w: number, h: number, ink: (x: number, y: number) => boolean): Mask {
  const data = new Uint8Array(w * h)
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) data[y * w + x] = ink(x, y) ? 1 : 0
  return { data, width: w, height: h }
}

const count = (m: Mask) => m.data.reduce((n, v) => n + v, 0)

/** A ring of the given radius and thickness, with a gap of `gap` px cut out at the right. */
function ring(size: number, r: number, thick: number, gap: number): Mask {
  const c = size / 2
  return draw(size, size, (x, y) => {
    const d = Math.hypot(x - c, y - c)
    return Math.abs(d - r) <= thick / 2 && !(x > c && Math.abs(y - c) < gap / 2)
  })
}

describe('style', () => {
  it('keeps valid fields and falls back for the rest', () => {
    const s = readStyle({
      name: '  Badge ',
      padding: 0.9,
      stroke: 'thick',
      variants: ['fill', 'bogus'],
      directions: [],
      container: { shape: 'circle' },
      light: { ink: '#B53519', bg: 'red' },
      prefix: 'Not Valid',
    })
    expect(s.name).toBe('Badge')
    expect(s.padding).toBe(0.4)
    expect(s.stroke).toBe(HAND_ICONS.stroke)
    expect(s.variants).toEqual(['fill'])
    expect(s.directions).toEqual(HAND_ICONS.directions)
    expect(s.container).toEqual({ shape: 'circle', radius: HAND_ICONS.container.radius })
    expect(s.light).toEqual({ ink: '#b53519', bg: HAND_ICONS.light.bg })
    expect(s.prefix).toBe('hi')
  })

  it('round-trips the hand-icons preset unchanged', () => {
    expect(readStyle(JSON.parse(JSON.stringify(HAND_ICONS)))).toEqual(HAND_ICONS)
  })

  it('uses the wider padding when a 45° turn is included', () => {
    expect(effectivePadding(HAND_ICONS)).toBeCloseTo(0.12)
    expect(effectivePadding({ ...HAND_ICONS, directions: ['base', 'r45'] })).toBeCloseTo(0.16)
  })

  it('measures padding inside a circle container', () => {
    const p = effectivePadding({ ...HAND_ICONS, container: { shape: 'circle', radius: 0 } })
    // The padded mark box is the inscribed square's inner 76%.
    expect(1 - 2 * p).toBeCloseTo(Math.SQRT1_2 * 0.76)
  })

  it('slugs names for ids', () => {
    expect(slug('Ulrike’s Note — Grüße!')).toBe('ulrike-s-note-grusse')
    expect(slug('***')).toBe('mark')
  })
})

describe('shape', () => {
  it('centres the mark inside the padding', () => {
    const m = placeOnSquare(draw(50, 20, () => true), 100, 0.1)
    // 80 px inner square: 80 × 32, centred.
    const xs: number[] = []
    const ys: number[] = []
    m.data.forEach((v, i) => v && (xs.push(i % 100), ys.push(Math.floor(i / 100))))
    expect([Math.min(...xs), Math.max(...xs)]).toEqual([10, 89])
    expect([Math.min(...ys), Math.max(...ys)]).toEqual([34, 65])
  })

  it('measures true Euclidean distance', () => {
    const d = distance2(draw(9, 9, (x, y) => x === 0 && y === 0), 1)
    expect(d[4 * 9 + 3]).toBe(25)
  })

  // Closing bridges gaps well under its size when strokes are thin, which is
  // why hand-icons' bridge values (41–141) are larger than the gaps they close.
  it('bridges a small gap at the hand-icons default, not a wide one', () => {
    const filled = (gap: number, d: number) => count(fillHoles(close(ring(200, 60, 8, gap), d)))
    const disc = Math.PI * 60 * 60
    expect(filled(12, 41)).toBeGreaterThan(disc * 0.9)
    expect(filled(40, 41)).toBeLessThan(disc * 0.5)
    expect(filled(12, 5)).toBeLessThan(disc * 0.5)
  })

  it('fills closed shapes only in the solid mask, and leaves the outside alone', () => {
    const { ink, solid } = iconMasks(ring(200, 60, 8, 0), { pinholes: 150, fillClosed: true, bridge: 41 })
    expect(count(solid)).toBeGreaterThan(count(ink) * 3)
    expect(solid.data[0]).toBe(0)
    const plain = iconMasks(ring(200, 60, 8, 0), { pinholes: 150, fillClosed: false, bridge: 41 })
    expect(plain.solid).toBe(plain.ink)
  })
})

describe('fillEmptyHoles', () => {
  it('fills an empty ring but not one with a mark inside', () => {
    const empty = ring(200, 60, 8, 0)
    expect(fillEmptyHoles(empty).data[100 * 200 + 100]).toBe(1)
    const withDot = { ...empty, data: empty.data.map((v, i) => (Math.hypot((i % 200) - 100, Math.floor(i / 200) - 100) < 10 ? 1 : v)) }
    const out = fillEmptyHoles(withDot)
    expect(out.data[100 * 200 + 130]).toBe(0)
    expect(out.data[100 * 200 + 100]).toBe(1)
  })
})

describe('svg', () => {
  const p = { ink: 'M0 0L10 0L10 10Z', solid: 'M0 0L20 0L20 20Z' }

  it('rotates about the centre and mirrors across it', () => {
    expect(directionTransform('r90', 1024)).toBe('rotate(90 512 512)')
    expect(directionTransform('mh', 1024)).toBe('translate(1024 0) scale(-1 1)')
    expect(directionTransform('base', 1024)).toBe('')
  })

  it('names sprite symbols the hand-icons way', () => {
    const s = { ...HAND_ICONS, directions: ['base', 'r90'] as const }
    const { svg, entry } = sprite('note', p, { ...s, directions: [...s.directions] })
    expect(entry.symbols).toEqual({
      base: { line: 'hi-note-line', fill: 'hi-note-fill' },
      r90: { line: 'hi-note-line-r90', fill: 'hi-note-fill-r90' },
    })
    expect(svg).toContain('<path id="hi-p-note-solid"')
    expect(svg).toContain('<symbol id="hi-note-fill-r90" viewBox="0 0 1024 1024"><use href="#hi-p-note-solid" fill="currentColor" fill-rule="evenodd" transform="rotate(90 512 512)"/>')
    expect(svg).toContain('stroke-width="6"')
  })

  it('draws containers and colours', () => {
    const s = { ...HAND_ICONS, container: { shape: 'circle' as const, radius: 0.2 } }
    const out = standaloneSvg('fill', 'base', p, s, { scheme: { ink: '#b53519', bg: '#f5f4ed' } })
    expect(out).toContain('<circle cx="512" cy="512" r="512" fill="#f5f4ed"/>')
    expect(out).toContain('fill="#b53519"')
    expect(standaloneSvg('line', 'base', p, s, { scheme: null })).toContain('stroke="currentColor"')
  })

  it('switches favicon colours with the colour scheme', () => {
    const out = faviconSvg(p, { ...HAND_ICONS, favicon: { variant: 'line', small: 'fill' } })
    expect(out).toContain('@media (prefers-color-scheme:dark){.bg{fill:#000000}.ink{fill:#ffffff}.ink-line{fill:none;stroke:#ffffff}}')
    expect(out).toContain('class="ink-line"')
    expect(out).not.toContain('currentColor')
  })
})

describe('files', () => {
  it('computes the standard CRC-32', () => {
    expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf43926)
  })

  it('writes an .ico directory pointing at each PNG', () => {
    const a = new Uint8Array([1, 2, 3])
    const b = new Uint8Array([4, 5])
    const out = ico([{ size: 16, png: a }, { size: 256, png: b }])
    const v = new DataView(out.buffer)
    expect(v.getUint16(4, true)).toBe(2)
    expect(out[6]).toBe(16)
    expect(out[22]).toBe(0)
    expect(v.getUint32(6 + 12, true)).toBe(38)
    expect([...out.subarray(38, 41)]).toEqual([1, 2, 3])
    expect([...out.subarray(41)]).toEqual([4, 5])
  })

  it('writes a zip that unzip accepts', () => {
    const dir = mkdtempSync(join(tmpdir(), 'stm-'))
    const file = join(dir, 'pack.zip')
    writeFileSync(file, zip([
      { path: 'a/hello.txt', data: 'hello' },
      { path: 'a/b/bytes.bin', data: new Uint8Array([0, 255, 7]) },
    ]))
    expect(execFileSync('unzip', ['-tq', file]).toString()).toContain('No errors')
    execFileSync('unzip', ['-q', file, '-d', dir])
    expect(readFileSync(join(dir, 'a/hello.txt'), 'utf8')).toBe('hello')
    expect([...readFileSync(join(dir, 'a/b/bytes.bin'))]).toEqual([0, 255, 7])
  })
})
