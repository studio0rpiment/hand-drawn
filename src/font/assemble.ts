// Assembling outlines into an OpenType font under a font style.

import { Font, Glyph, Path } from 'opentype.js'
import { addKerning, type KernPair } from './kern'
import {
  CHENG_PAIRS,
  FIGURE_WIDTH,
  HOCHULI_PAIRS,
  PUNCTUATION_WIDTH,
  TRACY_CAPS,
  TRACY_LOWER,
  classifySide,
  codeForSide,
  counterWidth,
  kernValue,
  opticalCentre,
  overshoot,
  pairGap,
  profile,
  tracyRefs,
  tracyValue,
  type Side,
  type TracyRefs,
} from './metrics'
import {
  CAP_HEIGHT,
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
import { t } from '../text'

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
  // The bottom of the i's dot: what's left of the i once the dotless stem is taken away.
  const stem = out.get('ı')?.cmds
  const dotBottom = i && stem ? bbox(i.slice(stem.length))?.yMin ?? null : null
  for (const c of COMPOSITES) {
    if (drawn.has(c.char)) continue
    const base = c.base === 'i' ? out.get('ı')?.cmds : drawn.get(c.base)
    const mark = drawn.get(markChar(c.mark))
    if (!base || !mark) continue
    const at = {
      centre: opticalCentre(base, c.mark === 'cedilla' ? 'bottom' : 'top'),
      upper: c.base !== c.base.toLowerCase(),
      dotBottom,
    }
    out.set(c.char, { cmds: placeMark(base, mark, c.mark, s, at), composite: true })
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

/** Something the books would point out about the drawn letters. */
export interface Check {
  kind: 'overshoot' | 'height' | 'weight' | 'slant'
  chars: string
  note: string
}

const ROUND_CAPS = 'OCGQS'
const ROUND_LOWER = 'oces'
const ROUND_FIGURES = '0368'
/** Overshoot: Cheng gives about 2% of the cap height for an O; we use 1.5%. */
const OVERSHOOT = 0.015 * CAP_HEIGHT

const isUpper = (c: string) => c !== c.toLowerCase()
const isLower = (c: string) => c !== c.toUpperCase()
const isFigure = (c: string) => /[0-9]/.test(c)

/** The height band a character is drawn in: the x-height for small letters, the cap height for capitals and figures. */
function body(c: string): [number, number] {
  return isUpper(c) || isFigure(c) || /[bdfhklt]/.test(c) ? [0, CAP_HEIGHT] : [0, X_HEIGHT]
}

export function assemble(
  drawn: Map<string, Cmd[]>,
  s: FontStyle,
  names: { family: string; designer?: string },
): BuiltFont & { checks: Check[]; kerns: number } {
  const checks: Check[] = []
  const base = outlines(drawn, s)

  // Round letters pass the lines a little (Cheng, Hochuli).
  if (s.overshoot) {
    const fixed: string[] = []
    for (const c of [...ROUND_CAPS, ...ROUND_LOWER, ...ROUND_FIGURES]) {
      const o = base.get(c)
      if (!o) continue
      const [lo, hi] = isLower(c) ? [0, X_HEIGHT] : [0, CAP_HEIGHT]
      const r = overshoot(o.cmds, lo, hi, OVERSHOOT)
      if (r.changed) {
        base.set(c, { ...o, cmds: r.cmds })
        fixed.push(c)
      }
    }
    if (fixed.length) checks.push({ kind: 'overshoot', chars: fixed.join(' '), note: t('font.check-overshoot') })
  }

  // Heights: what matters is that a hand is consistent with itself (Cheng). Report a
  // whole group drawn taller or shorter than its guide once, then letters that
  // stray from their own group. Our tolerance: 8% of the guide height.
  const groups: [string, RegExp, number][] = [
    [t('font.group-caps'), /[A-Z]/, CAP_HEIGHT],
    [t('font.group-lower'), /[acemnorsuvwxz]/, X_HEIGHT],
    [t('font.group-figures'), /[0-9]/, CAP_HEIGHT],
  ]
  for (const [label, members, line] of groups) {
    const tops = [...base]
      .filter(([c, o]) => members.test(c) && !o.composite)
      .map(([c, o]) => [c, bbox(o.cmds)?.yMax] as const)
      .filter((e): e is readonly [string, number] => e[1] !== undefined)
    if (tops.length < 3) continue
    const sorted = tops.map(([, t]) => t).sort((a, b) => a - b)
    const median = sorted[Math.floor(sorted.length / 2)]
    const off = (median - line) / line
    if (Math.abs(off) > 0.08) {
      checks.push({ kind: 'height', chars: label, note: t('font.check-size', { pct: Math.round(Math.abs(off) * 100), taller: t(off > 0 ? 'font.check-taller' : 'font.check-shorter') }) })
    }
    const strays = tops.filter(([, t]) => Math.abs(t - median) > line * 0.08).map(([c]) => c)
    if (strays.length) {
      checks.push({ kind: 'height', chars: strays.join(' '), note: t('font.check-strays', { group: label.toLowerCase() }) })
    }
  }
  if (Math.abs(s.shape.slant) > 10) {
    checks.push({ kind: 'slant', chars: '', note: t('font.check-slant', { deg: Math.abs(s.shape.slant) }) })
  }

  // Sides measured on the letters as drawn, before slant and bounce.
  const sides = new Map<string, { left: Side; right: Side }>()
  for (const [c, o] of base) {
    const [lo, hi] = body(c)
    const p = profile(o.cmds, lo, hi, 24)
    sides.set(c, { left: classifySide(p.left, -1, hi - lo), right: classifySide(p.right, 1, hi - lo) })
  }
  // Tracy's method (Cheng): reference sidebearings from the drawn H and n;
  // the style's "space beside letters" scales them (40 = as measured).
  const scale = s.spacing.side / 40
  const counter = (c: string, mid: number) => {
    const o = base.get(c)
    return o ? counterWidth(o.cmds, mid) : null
  }
  const measured = tracyRefs(counter('H', CAP_HEIGHT / 2), counter('n', X_HEIGHT / 2))
  const refs: TracyRefs = Object.fromEntries(Object.entries(measured).map(([k, v]) => [k, v * scale])) as unknown as TracyRefs

  const shaped = new Map<string, { cmds: Cmd[]; composite: boolean }>()
  for (const [char, o] of base) shaped.set(char, { cmds: shapeGlyph(o.cmds, char, s), composite: o.composite })
  const mono = monoWidth(new Map([...shaped].map(([c, o]) => [c, o.cmds])), s)
  const figureWidth = Math.max(
    0,
    ...[...shaped].filter(([c]) => isFigure(c)).map(([, o]) => {
      const b = bbox(o.cmds)
      return b ? b.xMax - b.xMin : 0
    }),
  )

  const glyphs: BuiltGlyph[] = []
  const chars = [...shaped.keys()].sort((a, b) => a.codePointAt(0)! - b.codePointAt(0)!)
  for (const char of chars) {
    const o = shaped.get(char)!
    let sp: { cmds: Cmd[]; advance: number }
    if (s.spacing.mono || !s.spacing.optical) {
      sp = space(o.cmds, s, mono)
    } else {
      const b = bbox(o.cmds)!
      const ink = b.xMax - b.xMin
      const centred = (w: number) => ({ cmds: translate(o.cmds, (w - ink) / 2 - b.xMin, 0), advance: Math.round(w + s.spacing.tracking) })
      // Accented letters space like their base letter.
      const key = [...char.normalize('NFD')][0].replace('ı', 'i')
      const upper = isUpper(key) || isFigure(key)
      const side = sides.get(char) ?? { left: 'straight' as Side, right: 'straight' as Side }
      const codes = (upper ? TRACY_CAPS : TRACY_LOWER)[key] ?? [codeForSide(side.left, upper), codeForSide(side.right, upper)]
      const letter = /[\p{L}\p{N}]/u.test(char)
      // Symbols without a set width: the n's room either side.
      let left = letter ? tracyValue(codes[0], upper, refs) : refs.nLeft * 0.8
      const right = letter ? tracyValue(codes[1], upper, refs) : refs.nLeft * 0.8
      // Some typographers move ! ? : ; to the right, away from the letter before (Cheng, Hochuli).
      if (s.spacing.punctuation && ':;?!'.includes(char)) left += refs.nLeft * 0.6
      const fixed = PUNCTUATION_WIDTH[char]
      if (s.figures === 'tabular' && isFigure(char)) {
        // Figures centred in an en, or wider if a figure needs it, so columns line up (Cheng).
        sp = centred(Math.max(FIGURE_WIDTH, figureWidth + 2 * refs.min))
      } else if (fixed && !s.spacing.punctuation) {
        // Punctuation centred in its customary width (Cheng, pp. 224–225).
        sp = centred(Math.max(fixed, ink + 2 * refs.min))
      } else {
        sp = {
          cmds: translate(o.cmds, left - b.xMin, 0),
          advance: Math.round(b.xMax - b.xMin + left + right + s.spacing.tracking),
        }
      }
    }
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
  let buffer = font.toArrayBuffer()
  let kerns = 0
  if (s.kerning && !s.spacing.mono) {
    const pairs = kerning(glyphs)
    kerns = pairs.length
    buffer = addKerning(buffer, pairs)
  }
  return { glyphs, buffer, checks, kerns }
}

/** Glyph index in the font: .notdef and space come first. */
const indexOf = (glyphs: BuiltGlyph[]) => new Map(glyphs.map((g, i) => [g.char, i + 2]))

/**
 * Kerning: for Hochuli's pairs, and every pair where a facing side is
 * diagonal or open (Cheng), bring the gap toward that of two straight-sided
 * letters (nn for small letters, HH for capitals), never letting ink touch.
 */
export function kerning(glyphs: BuiltGlyph[]): KernPair[] {
  const by = new Map(glyphs.map((g) => [g.char, g]))
  const profiles = new Map(glyphs.map((g) => [g.char, profile(g.cmds, DESCENDER, ASCENDER, 40)]))
  const gapOf = (a: string, b: string) => {
    const ga = by.get(a)
    const pa = profiles.get(a)
    const pb = profiles.get(b)
    return ga && pa && pb ? pairGap(pa, ga.advance, pb) : null
  }
  const ref = (a: string, b: string, fallback: number) => gapOf(a, b)?.gap ?? fallback
  const lowerRef = ref('n', 'n', 80)
  const upperRef = ref('H', 'H', 100)
  const mixedRef = ref('H', 'n', (lowerRef + upperRef) / 2)
  const sides = new Map(
    glyphs.map((g) => {
      const [lo, hi] = body(g.char)
      const p = profile(g.cmds, lo, hi, 24)
      return [g.char, { left: classifySide(p.left, -1, hi - lo), right: classifySide(p.right, 1, hi - lo) }] as const
    }),
  )
  const candidates = new Set<string>([...HOCHULI_PAIRS, ...CHENG_PAIRS])
  const letters = glyphs.map((g) => g.char).filter((c) => /[A-Za-z0-9.,]/.test(c))
  for (const a of letters) {
    for (const b of letters) {
      const ra = sides.get(a)!.right
      const lb = sides.get(b)!.left
      if (ra === 'diagonal' || ra === 'open' || lb === 'diagonal' || lb === 'open') candidates.add(a + b)
    }
  }
  const index = indexOf(glyphs)
  const pairs: KernPair[] = []
  for (const pair of candidates) {
    const [a, b] = [...pair]
    if (!by.has(a) || !by.has(b)) continue
    const gap = gapOf(a, b)
    if (!gap) continue
    const reference = isUpper(a) && isUpper(b) ? upperRef : isUpper(a) ? mixedRef : lowerRef
    const value = kernValue(gap, reference, 20)
    // Small adjustments aren't worth a pair.
    if (Math.abs(value) >= 20) pairs.push({ left: index.get(a)!, right: index.get(b)!, value })
  }
  return pairs
}
