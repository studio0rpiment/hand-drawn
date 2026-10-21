// Assembling outlines into an OpenType font under a font style.

import { Font, Glyph, Path } from 'opentype.js'
import {
  COMPOSITES,
  X_HEIGHT,
  bbox,
  dotless,
  markChar,
  placeMark,
  shapeGlyph,
  space,
  translate,
  type Cmd,
} from './outline'
import { GUIDES, MARK_CHARS, UNITS, type MarkName } from './sheet'
import type { FontStyle } from './style'

export interface BuiltGlyph {
  char: string
  cmds: Cmd[]
  advance: number
  /** Made from a letter and an accent rather than drawn. */
  composite: boolean
}

export interface BuiltFont {
  glyphs: BuiltGlyph[]
  buffer: ArrayBuffer
}

export const ASCENDER = Math.round((GUIDES.baseline - GUIDES.ascender) * UNITS)
export const DESCENDER = -Math.round((GUIDES.descender - GUIDES.baseline) * UNITS)

function toPath(cmds: Cmd[]): Path {
  const p = new Path()
  const r = Math.round
  for (const c of cmds) {
    if (c.t === 'M') p.moveTo(r(c.x), r(c.y))
    else if (c.t === 'L') p.lineTo(r(c.x), r(c.y))
    else if (c.t === 'C') p.curveTo(r(c.x1), r(c.y1), r(c.x2), r(c.y2), r(c.x), r(c.y))
    else p.close()
  }
  return p
}

const MARK_BY_CHAR = Object.fromEntries(Object.entries(MARK_CHARS).map(([m, c]) => [c, m as MarkName]))

/**
 * Outlines for every character the font will hold: the drawn ones, accented
 * letters made from them, a dotless i, and the accents as spacing marks.
 */
export function outlines(drawn: Map<string, Cmd[]>, s: FontStyle): Map<string, { cmds: Cmd[]; composite: boolean }> {
  const out = new Map<string, { cmds: Cmd[]; composite: boolean }>()
  for (const [char, cmds] of drawn) {
    const mark = MARK_BY_CHAR[char]
    if (!mark) {
      out.set(char, { cmds, composite: false })
      continue
    }
    // A spacing accent sits where it would on a small letter.
    const b = bbox(cmds)
    if (!b) continue
    const dy = mark === 'cedilla' ? 20 - b.yMax : X_HEIGHT + s.marks.gap - b.yMin
    out.set(char, { cmds: translate(cmds, 0, dy), composite: false })
  }
  const i = drawn.get('i')
  if (i && !drawn.has('ı')) out.set('ı', { cmds: dotless(i), composite: true })
  for (const c of COMPOSITES) {
    if (drawn.has(c.char)) continue
    const base = c.base === 'i' ? out.get('ı')?.cmds : drawn.get(c.base)
    const mark = drawn.get(markChar(c.mark))
    if (base && mark) out.set(c.char, { cmds: placeMark(base, mark, c.mark, s), composite: true })
  }
  return out
}

/** Typical letter width plus bearings, for monospaced styles. */
function monoWidth(shaped: Map<string, Cmd[]>, s: FontStyle): number {
  const widths = [...shaped]
    .filter(([c]) => /[A-Za-z]/.test(c))
    .map(([, cmds]) => bbox(cmds))
    .filter((b): b is NonNullable<typeof b> => b !== null)
    .map((b) => b.xMax - b.xMin)
    .sort((a, b) => a - b)
  const typical = widths.length ? widths[Math.floor(widths.length * 0.8)] : 500
  return Math.round(typical + 2 * s.spacing.side)
}

export function assemble(drawn: Map<string, Cmd[]>, s: FontStyle, names: { family: string; designer?: string }): BuiltFont {
  const shaped = new Map<string, { cmds: Cmd[]; composite: boolean }>()
  for (const [char, o] of outlines(drawn, s)) shaped.set(char, { cmds: shapeGlyph(o.cmds, char, s), composite: o.composite })
  const mono = monoWidth(new Map([...shaped].map(([c, o]) => [c, o.cmds])), s)

  const glyphs: BuiltGlyph[] = []
  const chars = [...shaped.keys()].sort((a, b) => a.codePointAt(0)! - b.codePointAt(0)!)
  for (const char of chars) {
    const o = shaped.get(char)!
    const sp = space(o.cmds, s, mono)
    glyphs.push({ char, cmds: sp.cmds, advance: sp.advance, composite: o.composite })
  }

  const spaceWidth = (s.spacing.mono ? mono : s.spacing.space) + s.spacing.tracking
  const notdef = new Path()
  notdef.moveTo(50, 0)
  notdef.lineTo(50, 700)
  notdef.lineTo(450, 700)
  notdef.lineTo(450, 0)
  notdef.close()
  const otGlyphs = [
    new Glyph({ name: '.notdef', advanceWidth: 500, path: notdef }),
    new Glyph({ name: 'space', unicodes: [0x20, 0xa0], advanceWidth: spaceWidth, path: new Path() }),
    ...glyphs.map(
      (g) =>
        new Glyph({
          name: `uni${g.char.codePointAt(0)!.toString(16).toUpperCase().padStart(4, '0')}`,
          unicode: g.char.codePointAt(0),
          advanceWidth: g.advance,
          path: toPath(g.cmds),
        }),
    ),
  ]
  const font = new Font({
    familyName: names.family,
    styleName: s.name,
    designer: names.designer,
    unitsPerEm: 1000,
    // Line spacing comes from ascender − descender; split the style's extra space between them.
    ascender: ASCENDER + Math.round(s.lineGap / 2),
    descender: DESCENDER - Math.round(s.lineGap / 2),
    glyphs: otGlyphs,
  })
  return { glyphs, buffer: font.toArrayBuffer() }
}
