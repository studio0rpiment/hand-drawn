// A texture style: how the drawing is printed (the look), on what, and how it
// is laid out. Plain JSON, like icon styles, so looks can be saved and shared.

export const LOOKS = ['ink', 'stamp', 'riso', 'halftone'] as const
export type Look = (typeof LOOKS)[number]

export const LAYOUTS = ['single', 'grid', 'half-drop', 'scatter'] as const
export type Layout = (typeof LAYOUTS)[number]

export const DOTS = ['dot', 'line'] as const

export interface TextureStyle {
  name: string
  look: Look
  /** Seed for every random choice, so a style gives the same print each time. */
  seed: number
  /** How the photo's grey becomes ink: at or below `black` is full ink, at or above `white` none. */
  tone: { black: number; white: number; gamma: number }
  /** Fine print grain over the ink, 0–1. */
  grain: number
  stamp: {
    /** Ink spreading past the drawn edge, in pixels. */
    bleed: number
    /** How ragged the edge is, 0–1, and the size of its wobble in pixels. */
    rough: number
    roughSize: number
    /** Share of the ink worn away in patches, 0–1, and the patch size in pixels. */
    wear: number
    wearSize: number
    /** Uneven pressure across the stamp, 0–1. */
    pressure: number
  }
  riso: {
    /** Second drum offset in pixels; the second ink prints the same art misregistered. */
    offsetX: number
    offsetY: number
    /** Print the second ink at all. */
    second: boolean
  }
  halftone: { cell: number; angle: number; shape: (typeof DOTS)[number] }
  colors: { ink: string; ink2: string; paper: string; /** Print on paper colour; off for transparent. */ onPaper: boolean; paperGrain: number }
  layout: {
    mode: Layout
    /** Square tile size in pixels for patterns; single prints are sized by the art. */
    tile: number
    /** Size of each print, as a fraction of the tile (patterns) or of the art (single). */
    scale: number
    /** Space between prints, as a fraction of the print size. */
    gap: number
    /** Random turn per print, degrees either way. */
    jitter: number
    /** Prints per tile for scatter. */
    count: number
    /** Clear space around a single print, in pixels. */
    margin: number
  }
}

export const STAMP: TextureStyle = {
  name: 'Rubber stamp',
  look: 'stamp',
  seed: 7,
  tone: { black: 40, white: 220, gamma: 1 },
  grain: 0.15,
  stamp: { bleed: 2, rough: 0.5, roughSize: 6, wear: 0.25, wearSize: 40, pressure: 0.35 },
  riso: { offsetX: 6, offsetY: -4, second: false },
  halftone: { cell: 10, angle: 45, shape: 'dot' },
  colors: { ink: '#b53519', ink2: '#272942', paper: '#f5f4ed', onPaper: false, paperGrain: 0.2 },
  layout: { mode: 'single', tile: 1024, scale: 1, gap: 0.3, jitter: 0, count: 6, margin: 48 },
}

export const BUILT_IN: TextureStyle[] = [
  STAMP,
  {
    ...STAMP,
    name: 'Ink as drawn',
    look: 'ink',
    grain: 0,
    colors: { ...STAMP.colors, ink: '#191b1a' },
  },
  {
    ...STAMP,
    name: 'Risograph, two drum',
    look: 'riso',
    grain: 0.55,
    riso: { offsetX: 7, offsetY: -5, second: true },
    colors: { ...STAMP.colors, ink: '#6686e6', ink2: '#d34533', onPaper: true },
  },
  {
    ...STAMP,
    name: 'Halftone',
    look: 'halftone',
    grain: 0,
    tone: { black: 30, white: 235, gamma: 0.8 },
    colors: { ...STAMP.colors, ink: '#272942' },
  },
  {
    ...STAMP,
    name: 'Stamp pattern',
    colors: { ...STAMP.colors, ink: '#869c42', onPaper: true },
    layout: { ...STAMP.layout, mode: 'half-drop', scale: 0.3, gap: 0.35, jitter: 12 },
  },
]

const HEX = /^#[0-9a-f]{6}$/i

/** Read a texture style from untrusted JSON, keeping valid fields and falling back to `base`. */
export function readTextureStyle(raw: unknown, base: TextureStyle = STAMP): TextureStyle {
  const obj = (v: unknown) => (v && typeof v === 'object' ? (v as Record<string, unknown>) : {})
  const r = obj(raw)
  const num = (v: unknown, d: number, min: number, max: number) =>
    typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : d
  const int = (v: unknown, d: number, min: number, max: number) => Math.round(num(v, d, min, max))
  const pick = <T extends string>(v: unknown, list: readonly T[], d: T): T => (list.includes(v as T) ? (v as T) : d)
  const color = (v: unknown, d: string) => (typeof v === 'string' && HEX.test(v) ? v.toLowerCase() : d)
  const bool = (v: unknown, d: boolean) => (typeof v === 'boolean' ? v : d)
  const t = obj(r.tone)
  const st = obj(r.stamp)
  const ri = obj(r.riso)
  const h = obj(r.halftone)
  const c = obj(r.colors)
  const l = obj(r.layout)
  const black = int(t.black, base.tone.black, 0, 254)
  return {
    name: typeof r.name === 'string' && r.name.trim() ? r.name.trim().slice(0, 60) : base.name,
    look: pick(r.look, LOOKS, base.look),
    seed: int(r.seed, base.seed, 0, 999999),
    tone: {
      black,
      white: int(t.white, base.tone.white, black + 1, 255),
      gamma: num(t.gamma, base.tone.gamma, 0.2, 5),
    },
    grain: num(r.grain, base.grain, 0, 1),
    stamp: {
      bleed: num(st.bleed, base.stamp.bleed, 0, 20),
      rough: num(st.rough, base.stamp.rough, 0, 1),
      roughSize: num(st.roughSize, base.stamp.roughSize, 1, 80),
      wear: num(st.wear, base.stamp.wear, 0, 1),
      wearSize: num(st.wearSize, base.stamp.wearSize, 2, 400),
      pressure: num(st.pressure, base.stamp.pressure, 0, 1),
    },
    riso: {
      offsetX: num(ri.offsetX, base.riso.offsetX, -60, 60),
      offsetY: num(ri.offsetY, base.riso.offsetY, -60, 60),
      second: bool(ri.second, base.riso.second),
    },
    halftone: {
      cell: num(h.cell, base.halftone.cell, 3, 80),
      angle: num(h.angle, base.halftone.angle, 0, 180),
      shape: pick(h.shape, DOTS, base.halftone.shape),
    },
    colors: {
      ink: color(c.ink, base.colors.ink),
      ink2: color(c.ink2, base.colors.ink2),
      paper: color(c.paper, base.colors.paper),
      onPaper: bool(c.onPaper, base.colors.onPaper),
      paperGrain: num(c.paperGrain, base.colors.paperGrain, 0, 1),
    },
    layout: {
      mode: pick(l.mode, LAYOUTS, base.layout.mode),
      tile: int(l.tile, base.layout.tile, 128, 4096),
      scale: num(l.scale, base.layout.scale, 0.05, 2),
      gap: num(l.gap, base.layout.gap, 0, 3),
      jitter: num(l.jitter, base.layout.jitter, 0, 180),
      count: int(l.count, base.layout.count, 1, 60),
      margin: int(l.margin, base.layout.margin, 0, 600),
    },
  }
}
