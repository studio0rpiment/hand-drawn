// An icon style: every choice that makes a set of icons look like one family.
// Styles are plain JSON so they can be saved, exported and shared between projects.

export const VARIANTS = ['line', 'fill', 'tint'] as const
export type Variant = (typeof VARIANTS)[number]

export const DIRECTIONS = ['base', 'r45', 'r90', 'r135', 'r180', 'r270', 'mh', 'mv', 'mhv'] as const
export type Direction = (typeof DIRECTIONS)[number]

export const CONTAINERS = ['none', 'circle', 'square', 'rounded', 'squircle'] as const
export type Container = (typeof CONTAINERS)[number]

/** Direction sets by the drawing's symmetry, as hand-icons groups them. */
export const DIRECTION_GROUPS: Record<string, Direction[]> = {
  'as drawn': ['base'],
  rotate: ['base', 'r90', 'r180', 'r270'],
  rotate45: ['base', 'r45', 'r90', 'r135'],
  mirror: ['base', 'mh', 'mv', 'mhv'],
}

export interface Scheme {
  ink: string
  /** Container fill; also the background of opaque icons (Apple, maskable). */
  bg: string
}

export interface IconStyle {
  name: string
  /** Square canvas size in SVG units; the mark is traced at this resolution. */
  canvas: number
  /** Clear space around the mark, as a fraction of the canvas, per side. */
  padding: number
  /** Padding used instead when the directions include a 45° turn, so the diagonal fits. */
  padding45: number
  /** Stroke width of the line variant, in canvas units. */
  stroke: number
  /** Fill opacity behind the line in the tint variant. */
  tintOpacity: number
  /** Fill closed shapes solid in the fill and tint variants. */
  fillClosed: boolean
  /** Gaps in a drawn outline up to this wide (canvas units) still count as closed. */
  bridge: number
  /** Pinholes in the ink smaller than this (canvas units²) are filled. */
  pinholes: number
  trace: { smoothness: number; simplify: number; ignore: number }
  variants: Variant[]
  directions: Direction[]
  container: { shape: Container; /** Corner radius for rounded, as a fraction of the canvas. */ radius: number }
  light: Scheme
  dark: Scheme
  /** Which variant favicons use, and which one sizes of 48 px and under fall back to. */
  favicon: { variant: Variant; small: Variant }
  /** Sprite symbol ids are `<prefix>-<name>-<variant>[-<direction>]`. */
  prefix: string
}

/** Kevin's hand-icons library, with the constants its build scripts use. */
export const HAND_ICONS: IconStyle = {
  name: 'hand-icons',
  canvas: 1024,
  padding: 0.12,
  padding45: 0.16,
  stroke: 6,
  tintOpacity: 0.35,
  fillClosed: true,
  bridge: 41,
  pinholes: 150,
  trace: { smoothness: 0.8, simplify: 0.2, ignore: 8 },
  variants: ['line', 'fill'],
  directions: ['base'],
  container: { shape: 'none', radius: 0.22 },
  light: { ink: '#000000', bg: '#ffffff' },
  dark: { ink: '#ffffff', bg: '#000000' },
  favicon: { variant: 'fill', small: 'fill' },
  prefix: 'hi',
}

export const BUILT_IN: IconStyle[] = [HAND_ICONS]

const HEX = /^#[0-9a-f]{6}$/i

/**
 * Read a style from untrusted JSON (an imported file, saved storage), keeping
 * every valid field and falling back to `base` for the rest.
 */
export function readStyle(raw: unknown, base: IconStyle = HAND_ICONS): IconStyle {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const num = (v: unknown, d: number, min: number, max: number) =>
    typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : d
  const pick = <T extends string>(v: unknown, list: readonly T[], d: T): T =>
    list.includes(v as T) ? (v as T) : d
  const many = <T extends string>(v: unknown, list: readonly T[], d: T[]): T[] => {
    const out = Array.isArray(v) ? list.filter((x) => v.includes(x)) : []
    return out.length ? out : d
  }
  const color = (v: unknown, d: string) => (typeof v === 'string' && HEX.test(v) ? v.toLowerCase() : d)
  const scheme = (v: unknown, d: Scheme): Scheme => {
    const s = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>
    return { ink: color(s.ink, d.ink), bg: color(s.bg, d.bg) }
  }
  const t = (r.trace && typeof r.trace === 'object' ? r.trace : {}) as Record<string, unknown>
  const c = (r.container && typeof r.container === 'object' ? r.container : {}) as Record<string, unknown>
  const f = (r.favicon && typeof r.favicon === 'object' ? r.favicon : {}) as Record<string, unknown>
  const name = typeof r.name === 'string' && r.name.trim() ? r.name.trim().slice(0, 60) : base.name
  const prefix = typeof r.prefix === 'string' && /^[a-z][a-z0-9-]{0,15}$/.test(r.prefix) ? r.prefix : base.prefix
  return {
    name,
    canvas: Math.round(num(r.canvas, base.canvas, 64, 4096)),
    padding: num(r.padding, base.padding, 0, 0.4),
    padding45: num(r.padding45, base.padding45, 0, 0.4),
    stroke: num(r.stroke, base.stroke, 0.5, 200),
    tintOpacity: num(r.tintOpacity, base.tintOpacity, 0, 1),
    fillClosed: typeof r.fillClosed === 'boolean' ? r.fillClosed : base.fillClosed,
    bridge: num(r.bridge, base.bridge, 0, 400),
    pinholes: num(r.pinholes, base.pinholes, 0, 100000),
    trace: {
      smoothness: num(t.smoothness, base.trace.smoothness, 0, 1.34),
      simplify: num(t.simplify, base.trace.simplify, 0, 2),
      ignore: Math.round(num(t.ignore, base.trace.ignore, 0, 1000)),
    },
    variants: many(r.variants, VARIANTS, base.variants),
    directions: many(r.directions, DIRECTIONS, base.directions),
    container: {
      shape: pick(c.shape, CONTAINERS, base.container.shape),
      radius: num(c.radius, base.container.radius, 0, 0.5),
    },
    light: scheme(r.light, base.light),
    dark: scheme(r.dark, base.dark),
    favicon: {
      variant: pick(f.variant, VARIANTS, base.favicon.variant),
      small: pick(f.small, VARIANTS, base.favicon.small),
    },
    prefix,
  }
}

/** The share of the canvas a container leaves usable for the mark: the square that fits inside it. */
const CONTENT_BOX: Record<Container, number> = {
  none: 1,
  square: 1,
  rounded: 1,
  squircle: 0.86,
  circle: Math.SQRT1_2,
}

/**
 * Padding as a fraction of the whole canvas: the style's padding (the wider one
 * when the directions include a 45° turn), measured inside the container.
 */
export function effectivePadding(s: IconStyle): number {
  const pad = s.directions.some((d) => d === 'r45' || d === 'r135') ? Math.max(s.padding, s.padding45) : s.padding
  const box = s.container.shape === 'rounded' ? 1 - s.container.radius * 0.3 : CONTENT_BOX[s.container.shape]
  return (1 - box * (1 - 2 * pad)) / 2
}

/** Lower-case, hyphenated name usable in ids and file names. */
export function slug(name: string): string {
  return (
    name
      .replace(/ß/g, 'ss')
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40) || 'mark'
  )
}
