// A sketch style: the output kind and its settings, the colours and the size.
// One style applies to the whole collection. Plain JSON, so it can be saved,
// exported and shared like the other tabs' styles. Pure, no DOM.

import { slug } from '../icon/style'

export const KINDS = ['as-drawn', 'line', 'schematic', 'tones'] as const
export type Kind = (typeof KINDS)[number]

export const TRACE_AS = ['outlines', 'centre'] as const
export const SNAPS = [0, 15, 45, 90] as const
export const BACKGROUNDS = ['none', 'paper', 'colour'] as const

export interface SketchStyle {
  name: string
  kind: Kind
  line: {
    /** 0: each line as drawn; 1: every line the same width. */
    even: number
    /** potrace alphamax: 0 keeps corners, 1.33 rounds almost everything. */
    smoothness: number
    /** Lines paler than this (0–1 of full ink) are dropped. */
    faint: number
    /** Gaps narrower than this (px) are closed. */
    gaps: number
    traceAs: (typeof TRACE_AS)[number]
  }
  schematic: {
    /** How far (px) a line may bend and still be made straight. */
    straighten: number
    /** Angles snap to multiples of this (degrees); 0 is off. */
    snap: number
    /** Ends closer than this (px) are joined. */
    join: number
    /** Corners snap to a grid of this size (px); 0 is off. */
    grid: number
    /** Line width (px). */
    width: number
  }
  tones: {
    levels: number
    smoothness: number
  }
  colours: {
    ink: string
    background: (typeof BACKGROUNDS)[number]
    /** The background when it is a colour of its own. */
    colour: string
  }
  size: {
    /** The drawing's own size (true), or placed in width × height. */
    fit: boolean
    width: number
    height: number
    dpi: number
  }
}

export const MAX_SIDE = 8000

export const PLAIN: SketchStyle = {
  name: 'Plain',
  kind: 'as-drawn',
  line: { even: 0, smoothness: 1, faint: 0.25, gaps: 0, traceAs: 'outlines' },
  schematic: { straighten: 4, snap: 15, join: 12, grid: 0, width: 4 },
  tones: { levels: 3, smoothness: 0.5 },
  colours: { ink: '#1d1a24', background: 'none', colour: '#ffffff' },
  size: { fit: true, width: 2480, height: 3508, dpi: 300 },
}

export const BLUEPRINT: SketchStyle = {
  ...PLAIN,
  name: 'Blueprint',
  kind: 'schematic',
  schematic: { straighten: 5, snap: 45, join: 14, grid: 0, width: 3 },
  colours: { ink: '#f2f6ff', background: 'colour', colour: '#1f4e9c' },
}

export const BUILT_IN: SketchStyle[] = [PLAIN, BLUEPRINT]

const num = (v: unknown, lo: number, hi: number, d: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d)
const hex = (v: unknown, d: string) => (typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v) ? v.toLowerCase() : d)
const pick = <T extends string | number>(v: unknown, from: readonly T[], d: T): T => (from.includes(v as T) ? (v as T) : d)
const obj = (v: unknown) => (v && typeof v === 'object' ? (v as Record<string, unknown>) : {})

/** Untrusted JSON (an imported style, a stored one) as a valid style; missing settings come from `base`. */
export function readSketchStyle(raw: unknown, base: SketchStyle = PLAIN): SketchStyle {
  const r = obj(raw)
  const l = obj(r.line)
  const s = obj(r.schematic)
  const t = obj(r.tones)
  const c = obj(r.colours)
  const z = obj(r.size)
  return {
    name: typeof r.name === 'string' && r.name.trim() ? r.name.trim().slice(0, 60) : base.name,
    kind: pick(r.kind, KINDS, base.kind),
    line: {
      even: num(l.even, 0, 1, base.line.even),
      smoothness: num(l.smoothness, 0, 1.33, base.line.smoothness),
      faint: num(l.faint, 0, 0.9, base.line.faint),
      gaps: Math.round(num(l.gaps, 0, 20, base.line.gaps)),
      traceAs: pick(l.traceAs, TRACE_AS, base.line.traceAs),
    },
    schematic: {
      straighten: num(s.straighten, 0, 30, base.schematic.straighten),
      snap: pick(s.snap, SNAPS, base.schematic.snap),
      join: num(s.join, 0, 80, base.schematic.join),
      grid: Math.round(num(s.grid, 0, 200, base.schematic.grid)),
      width: num(s.width, 0.5, 40, base.schematic.width),
    },
    tones: {
      levels: Math.round(num(t.levels, 2, 5, base.tones.levels)),
      smoothness: num(t.smoothness, 0, 1, base.tones.smoothness),
    },
    colours: {
      ink: hex(c.ink, base.colours.ink),
      background: pick(c.background, BACKGROUNDS, base.colours.background),
      colour: hex(c.colour, base.colours.colour),
    },
    size: {
      fit: typeof z.fit === 'boolean' ? z.fit : base.size.fit,
      width: Math.round(num(z.width, 16, MAX_SIDE, base.size.width)),
      height: Math.round(num(z.height, 16, MAX_SIDE, base.size.height)),
      dpi: Math.round(num(z.dpi, 36, 1200, base.size.dpi)),
    },
  }
}

/** What each kind downloads as. */
export const FORMATS_FOR: Record<Kind, readonly ('svg' | 'png' | 'pdf')[]> = {
  'as-drawn': ['png', 'svg'],
  line: ['svg', 'png', 'pdf'],
  schematic: ['svg', 'png', 'pdf'],
  tones: ['svg', 'png'],
}

/** The kind's part of a file name. */
export const KIND_FILE: Record<Kind, string> = { 'as-drawn': 'as-drawn', line: 'line', schematic: 'schematic', tones: 'tones' }

/**
 * A sketch's file name without its extension: the collection's name, its
 * two-digit number in collection order, the sketch's name and the kind
 * (chair-study-03-side-view-line).
 */
export function sketchFileName(collection: string, n: number, sketch: string, kind: Kind): string {
  return `${slug(collection)}-${String(n).padStart(2, '0')}-${slug(sketch)}-${KIND_FILE[kind]}`
}
