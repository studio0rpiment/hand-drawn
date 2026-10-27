// Glyph outlines as absolute commands in font units (y up, baseline 0), and
// everything a font style does to them: accents, slant, bounce, spacing.

import { hash } from '../texture/noise'
import { parse } from '../svgpath'
import { BASELINE_PX, RES } from './read'
import { GUIDES, MARK_CHARS, UNITS, type MarkName } from './sheet'
import type { FontStyle } from './style'

export type Cmd =
  | { t: 'M' | 'L'; x: number; y: number }
  | { t: 'C'; x1: number; y1: number; x2: number; y2: number; x: number; y: number }
  | { t: 'Z' }

export interface Box {
  xMin: number
  yMin: number
  xMax: number
  yMax: number
}

/** x-height and cap height in font units. */
export const X_HEIGHT = (GUIDES.baseline - GUIDES.x) * UNITS
export const CAP_HEIGHT = (GUIDES.baseline - GUIDES.cap) * UNITS

/** A sheet box's pixels to font units. */
const boxUnits = (x: number, y: number) => ({ x: (x / RES) * UNITS, y: ((BASELINE_PX - y) / RES) * UNITS })

/** Path data (as traced, in pixels of a cut-out box, or placed by `u`) to absolute commands in font units. */
export function fromTraced(d: string, u: (x: number, y: number) => { x: number; y: number } = boxUnits): Cmd[] {
  const out: Cmd[] = []
  let cx = 0
  let cy = 0
  let sx = 0
  let sy = 0
  for (const { cmd, nums } of parse(d)) {
    const rel = cmd === cmd.toLowerCase()
    const c = cmd.toUpperCase()
    if (c === 'Z') {
      out.push({ t: 'Z' })
      cx = sx
      cy = sy
      continue
    }
    const size = c === 'C' ? 6 : 2
    for (let i = 0; i + size <= nums.length; i += size) {
      const n = nums.slice(i, i + size).map((v, k) => v + (rel ? (k % 2 === 0 ? cx : cy) : 0))
      // After a moveto, further pairs are linetos.
      const kind = c === 'M' && i > 0 ? 'L' : c
      if (kind === 'C') {
        const a = u(n[0], n[1])
        const b = u(n[2], n[3])
        const e = u(n[4], n[5])
        out.push({ t: 'C', x1: a.x, y1: a.y, x2: b.x, y2: b.y, x: e.x, y: e.y })
      } else {
        const e = u(n[0], n[1])
        out.push({ t: kind as 'M' | 'L', x: e.x, y: e.y })
      }
      cx = n[size - 2]
      cy = n[size - 1]
      if (kind === 'M') {
        sx = cx
        sy = cy
      }
    }
  }
  return out
}

export function map(cmds: Cmd[], f: (x: number, y: number) => { x: number; y: number }): Cmd[] {
  return cmds.map((c) => {
    if (c.t === 'Z') return c
    if (c.t === 'C') {
      const a = f(c.x1, c.y1)
      const b = f(c.x2, c.y2)
      const e = f(c.x, c.y)
      return { t: 'C', x1: a.x, y1: a.y, x2: b.x, y2: b.y, x: e.x, y: e.y }
    }
    const e = f(c.x, c.y)
    return { t: c.t, x: e.x, y: e.y }
  })
}

export const translate = (cmds: Cmd[], dx: number, dy: number) => map(cmds, (x, y) => ({ x: x + dx, y: y + dy }))

/** Bounding box over end and control points (a curve never leaves its control hull). */
export function bbox(cmds: Cmd[]): Box | null {
  let b: Box | null = null
  const add = (x: number, y: number) => {
    if (!b) b = { xMin: x, yMin: y, xMax: x, yMax: y }
    else {
      b.xMin = Math.min(b.xMin, x)
      b.xMax = Math.max(b.xMax, x)
      b.yMin = Math.min(b.yMin, y)
      b.yMax = Math.max(b.yMax, y)
    }
  }
  for (const c of cmds) {
    if (c.t === 'Z') continue
    if (c.t === 'C') {
      add(c.x1, c.y1)
      add(c.x2, c.y2)
    }
    add(c.x, c.y)
  }
  return b
}

/** Split into closed contours (each starts with M). */
export function contours(cmds: Cmd[]): Cmd[][] {
  const out: Cmd[][] = []
  for (const c of cmds) {
    if (c.t === 'M' || out.length === 0) out.push([])
    out[out.length - 1].push(c)
  }
  return out
}

/** An i without its dot: drop the contours sitting wholly above the middle of the x-height. */
export function dotless(cmds: Cmd[]): Cmd[] {
  return contours(cmds)
    .filter((c) => {
      const b = bbox(c)
      return !b || b.yMin < X_HEIGHT * 0.55
    })
    .flat()
}

const COMBINING: Record<string, MarkName> = {
  '́': 'acute',
  '̀': 'grave',
  '̂': 'circumflex',
  '̈': 'dieresis',
  '̃': 'tilde',
  '̧': 'cedilla',
  '̊': 'ring',
}

/** Accented letters built from a drawn letter plus a drawn mark. */
export const COMPOSITES: { char: string; base: string; mark: MarkName }[] = [
  ...'ÀÁÂÃÄÅÇÈÉÊËÌÍÎÏÑÒÓÔÕÖÙÚÛÜÝŸàáâãäåçèéêëìíîïñòóôõöùúûüýÿ',
].map((char) => {
  const [base, comb] = [...char.normalize('NFD')]
  return { char, base, mark: COMBINING[comb] }
})

export interface MarkPlace {
  /** The letter's optical centre (top band, or bottom for a cedilla); default the middle of its box. */
  centre?: number | null
  /** A capital: less room above it and a slightly smaller accent (Cheng). */
  upper?: boolean
  /** Bottom of the i's dot: a dieresis on a small letter lines up with it (Cheng). */
  dotBottom?: number | null
}

/**
 * Put an accent on a letter, after Cheng (Designing Type, pp. 200–211): over
 * the letter's optical centre, an acute nudged right and a grave left so their
 * thin ends sit over it; on capitals a narrower gap (two thirds) and a slightly
 * smaller accent (88%, our figure); a dieresis on a small letter at the height
 * of the i's dot; a cedilla tucked under, from the bottom's optical centre.
 */
export function placeMark(base: Cmd[], mark: Cmd[], name: MarkName, s: FontStyle, at: MarkPlace = {}): Cmd[] {
  const b = bbox(base)
  const m0 = bbox(mark)
  if (!b || !m0) return base
  const k = s.marks.scale * (at.upper ? 0.88 : 1)
  const mcx = (m0.xMin + m0.xMax) / 2
  const scaled = map(mark, (x, y) => ({ x: mcx + (x - mcx) * k, y: m0.yMin + (y - m0.yMin) * k }))
  const m = bbox(scaled)!
  const width = m.xMax - m.xMin
  const shift = name === 'acute' ? width / 3 : name === 'grave' ? -width / 3 : 0
  const centre = at.centre ?? (b.xMin + b.xMax) / 2
  const dx = centre + shift - (m.xMin + m.xMax) / 2
  const gap = at.upper ? (s.marks.gap * 2) / 3 : s.marks.gap
  let dy: number
  if (name === 'cedilla') dy = Math.min(b.yMin, 0) + 20 - m.yMax // tucked just under the letter
  else if (name === 'dieresis' && !at.upper && at.dotBottom != null) dy = Math.max(b.yMax + gap * 0.5, at.dotBottom) - m.yMin
  else dy = b.yMax + gap - m.yMin
  return [...base, ...translate(scaled, dx, dy)]
}

/** The style's per-letter character: random rise and turn (seeded per character), then the slant. */
export function shapeGlyph(cmds: Cmd[], char: string, s: FontStyle): Cmd[] {
  const code = char.codePointAt(0) ?? 0
  const rise = s.shape.bounce ? (hash(code, 1, s.shape.seed) * 2 - 1) * s.shape.bounce : 0
  const turn = s.shape.wobble ? (((hash(code, 2, s.shape.seed) * 2 - 1) * s.shape.wobble * Math.PI) / 180) : 0
  const b = bbox(cmds)
  const cx = b ? (b.xMin + b.xMax) / 2 : 0
  const cy = X_HEIGHT / 2
  const cos = Math.cos(turn)
  const sin = Math.sin(turn)
  const lean = Math.tan((s.shape.slant * Math.PI) / 180)
  return map(cmds, (x, y) => {
    // Turn about the letter's middle (clockwise for positive), then rise, then lean.
    let px = cx + (x - cx) * cos + (y - cy) * sin
    let py = cy - (x - cx) * sin + (y - cy) * cos + rise
    px += py * lean
    return { x: px, y: py }
  })
}

export interface Spaced {
  cmds: Cmd[]
  advance: number
}

/** Side bearings and widths. In mono every glyph gets `monoWidth`, centred. */
export function space(cmds: Cmd[], s: FontStyle, monoWidth: number): Spaced {
  const b = bbox(cmds)
  if (!b) return { cmds, advance: (s.spacing.mono ? monoWidth : s.spacing.space) + s.spacing.tracking }
  const ink = b.xMax - b.xMin
  if (s.spacing.mono) {
    const left = (monoWidth - ink) / 2
    return { cmds: translate(cmds, left - b.xMin, 0), advance: monoWidth + s.spacing.tracking }
  }
  return { cmds: translate(cmds, s.spacing.side - b.xMin, 0), advance: Math.round(ink + 2 * s.spacing.side + s.spacing.tracking) }
}

/** The mark's own character (´ ` ˆ …) for its spacing glyph. */
export const markChar = (m: MarkName) => MARK_CHARS[m]
