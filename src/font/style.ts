// A font style: how drawn letters become a typeface. The same drawing under
// different styles gives different fonts (tidy, bouncy, bold, slanted).

export interface FontStyle {
  name: string
  ink: {
    /** Grey at or below which counts as ink; 0 picks it from the page. */
    cutoff: number
    /** Specks smaller than this many pixels (at 10 px/mm) are dropped. */
    speck: number
    /** Thicken (+) or thin (−) every stroke, in pixels at 10 px/mm. */
    weight: number
  }
  trace: { smoothness: number; simplify: number }
  spacing: {
    /** Space either side of each letter, in font units (cap height is 700). */
    side: number
    /** Added to every letter's width. */
    tracking: number
    /** Width of the word space. */
    space: number
    /** Every glyph the same width, letters centred. */
    mono: boolean
  }
  shape: {
    /** Lean in degrees, positive to the right. */
    slant: number
    /** Random rise or drop per letter, in font units. */
    bounce: number
    /** Random turn per letter, in degrees. */
    wobble: number
    seed: number
  }
  marks: {
    /** Space between a letter and the accent above it, in font units. */
    gap: number
    /** Accent size relative to as drawn. */
    scale: number
  }
  /** Extra space between lines, in font units. */
  lineGap: number
}

export const AS_DRAWN: FontStyle = {
  name: 'As drawn',
  ink: { cutoff: 0, speck: 30, weight: 0 },
  trace: { smoothness: 1, simplify: 0.2 },
  spacing: { side: 40, tracking: 0, space: 300, mono: false },
  shape: { slant: 0, bounce: 0, wobble: 0, seed: 1 },
  marks: { gap: 40, scale: 1 },
  lineGap: 100,
}

export const BUILT_IN: FontStyle[] = [
  AS_DRAWN,
  { ...AS_DRAWN, name: 'Tidy', trace: { smoothness: 1.2, simplify: 0.6 }, spacing: { ...AS_DRAWN.spacing, side: 50 } },
  { ...AS_DRAWN, name: 'Bouncy', shape: { slant: 0, bounce: 45, wobble: 4, seed: 3 } },
  { ...AS_DRAWN, name: 'Bold marker', ink: { ...AS_DRAWN.ink, weight: 3 }, spacing: { ...AS_DRAWN.spacing, side: 50 } },
  { ...AS_DRAWN, name: 'Slanted', shape: { ...AS_DRAWN.shape, slant: 12 } },
  { ...AS_DRAWN, name: 'Typewriter', spacing: { ...AS_DRAWN.spacing, mono: true, side: 30 } },
]

export function readFontStyle(raw: unknown, base: FontStyle = AS_DRAWN): FontStyle {
  const obj = (v: unknown) => (v && typeof v === 'object' ? (v as Record<string, unknown>) : {})
  const r = obj(raw)
  const num = (v: unknown, d: number, min: number, max: number) =>
    typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : d
  const int = (v: unknown, d: number, min: number, max: number) => Math.round(num(v, d, min, max))
  const bool = (v: unknown, d: boolean) => (typeof v === 'boolean' ? v : d)
  const i = obj(r.ink)
  const t = obj(r.trace)
  const sp = obj(r.spacing)
  const sh = obj(r.shape)
  const m = obj(r.marks)
  return {
    name: typeof r.name === 'string' && r.name.trim() ? r.name.trim().slice(0, 60) : base.name,
    ink: {
      cutoff: int(i.cutoff, base.ink.cutoff, 0, 254),
      speck: int(i.speck, base.ink.speck, 0, 2000),
      weight: int(i.weight, base.ink.weight, -4, 6),
    },
    trace: {
      smoothness: num(t.smoothness, base.trace.smoothness, 0, 1.34),
      simplify: num(t.simplify, base.trace.simplify, 0, 2),
    },
    spacing: {
      side: int(sp.side, base.spacing.side, -100, 300),
      tracking: int(sp.tracking, base.spacing.tracking, -200, 400),
      space: int(sp.space, base.spacing.space, 50, 1000),
      mono: bool(sp.mono, base.spacing.mono),
    },
    shape: {
      slant: num(sh.slant, base.shape.slant, -30, 30),
      bounce: int(sh.bounce, base.shape.bounce, 0, 200),
      wobble: num(sh.wobble, base.shape.wobble, 0, 20),
      seed: int(sh.seed, base.shape.seed, 0, 999999),
    },
    marks: {
      gap: int(m.gap, base.marks.gap, -100, 300),
      scale: num(m.scale, base.marks.scale, 0.3, 2),
    },
    lineGap: int(r.lineGap, base.lineGap, 0, 1000),
  }
}
