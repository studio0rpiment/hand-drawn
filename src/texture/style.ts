// A texture style: what the tab makes (PBR maps, or a printed look), and its
// settings. For maps: the surface (crop, seamless tile), how each map is
// worked out, and the files. For a printed look: how the drawing is printed,
// on what, and how it is laid out. Plain JSON, like icon styles, so styles can
// be saved and shared.

import { heightSourceIds } from './height'

export const LOOKS = ['ink', 'stamp', 'riso', 'halftone'] as const
export type Look = (typeof LOOKS)[number]

export const LAYOUTS = ['single', 'grid', 'half-drop', 'scatter'] as const
export type Layout = (typeof LAYOUTS)[number]

export const DOTS = ['dot', 'line'] as const

/** What the tab makes: PBR maps from the image, or the drawing printed in a look. */
export const MAKES = ['maps', 'print'] as const
export const FORMATS = ['png', 'jpg', 'webp'] as const
export type Format = (typeof FORMATS)[number]
export const NORMAL_Y = ['gl', 'dx'] as const
export const BASE_COLOURS = ['photo', 'ink-on-paper'] as const

/** Longest side of a map, in pixels. */
export const MAX_MAP = 4096

export interface TextureStyle {
  name: string
  make: (typeof MAKES)[number]
  /** The part of the image the maps are made from, and whether it repeats. */
  surface: {
    /** Trimmed off every edge before anything else, as a share of the side, 0–0.25. */
    crop: number
    seamless: boolean
    /** Blend band either side of the seams, as a share of the side. */
    seam: number
    /** How far the blend's edge wanders, 0–1. */
    ragged: number
  }
  maps: {
    /** A height source's id (height.ts). */
    height: string
    darkHigh: boolean
    soften: number
    detail: number
    depth: number
    normalY: (typeof NORMAL_Y)[number]
    roughness: number
    roughVary: number
    ao: number
    aoReach: number
    colour: (typeof BASE_COLOURS)[number]
    evenLight: number
  }
  /** The map files: size in pixels, format and quality (JPG and WebP). */
  file: { width: number; height: number; format: Format; quality: number }
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
    /** The texture's size in pixels: the tile, for patterns (which repeat at any rectangle). */
    width: number
    height: number
    /** A single print: the canvas fits the print (plus margin), ignoring width and height. */
    fit: boolean
    /** Size of each print: a fraction of the tile's shorter side (patterns), of the space inside the margin (single on a set canvas), or of the art (single, fitted). */
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

const SURFACE: TextureStyle['surface'] = { crop: 0.02, seamless: true, seam: 0.15, ragged: 0.6 }
const MAPS: TextureStyle['maps'] = {
  height: 'ink-scan',
  darkHigh: true,
  soften: 0.004,
  detail: 0.3,
  depth: 0.5,
  normalY: 'gl',
  roughness: 0.75,
  roughVary: -0.4,
  ao: 0.6,
  aoReach: 0.03,
  colour: 'photo',
  evenLight: 0.6,
}
const FILE: TextureStyle['file'] = { width: 1024, height: 1024, format: 'png', quality: 0.9 }

export const STAMP: TextureStyle = {
  name: 'Rubber stamp',
  make: 'print',
  surface: SURFACE,
  maps: MAPS,
  file: FILE,
  look: 'stamp',
  seed: 7,
  tone: { black: 40, white: 220, gamma: 1 },
  grain: 0.15,
  stamp: { bleed: 2, rough: 0.5, roughSize: 6, wear: 0.25, wearSize: 40, pressure: 0.35 },
  riso: { offsetX: 6, offsetY: -4, second: false },
  halftone: { cell: 10, angle: 45, shape: 'dot' },
  colors: { ink: '#b53519', ink2: '#272942', paper: '#f5f4ed', onPaper: false, paperGrain: 0.2 },
  layout: { mode: 'single', width: 1024, height: 1024, fit: true, scale: 1, gap: 0.3, jitter: 0, count: 6, margin: 48 },
}

/** Maps from a drawing: the ink stands up from the paper. */
export const DRAWN_MAPS: TextureStyle = { ...STAMP, name: 'Maps from a drawing', make: 'maps' }

export const BUILT_IN: TextureStyle[] = [
  DRAWN_MAPS,
  {
    ...DRAWN_MAPS,
    name: 'Maps from a photo',
    surface: { ...SURFACE, crop: 0.04 },
    maps: { ...MAPS, height: 'brightness', darkHigh: false, soften: 0.002, detail: 0.5, depth: 0.35, roughness: 0.7, roughVary: 0.3, ao: 0.5 },
  },
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

/** Longest side allowed, in pixels: room for 12 in at 300 dpi. */
export const MAX_SIDE = 4800

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
  const su = obj(r.surface)
  const m = obj(r.maps)
  const f = obj(r.file)
  const black = int(t.black, base.tone.black, 0, 254)
  return {
    name: typeof r.name === 'string' && r.name.trim() ? r.name.trim().slice(0, 60) : base.name,
    make: pick(r.make, MAKES, base.make),
    surface: {
      crop: num(su.crop, base.surface.crop, 0, 0.25),
      seamless: bool(su.seamless, base.surface.seamless),
      seam: num(su.seam, base.surface.seam, 0.02, 1 / 3),
      ragged: num(su.ragged, base.surface.ragged, 0, 1),
    },
    maps: {
      height: pick(m.height, heightSourceIds(), base.maps.height),
      darkHigh: bool(m.darkHigh, base.maps.darkHigh),
      soften: num(m.soften, base.maps.soften, 0, 0.05),
      detail: num(m.detail, base.maps.detail, 0, 1),
      depth: num(m.depth, base.maps.depth, 0, 1),
      normalY: pick(m.normalY, NORMAL_Y, base.maps.normalY),
      roughness: num(m.roughness, base.maps.roughness, 0, 1),
      roughVary: num(m.roughVary, base.maps.roughVary, -1, 1),
      ao: num(m.ao, base.maps.ao, 0, 1),
      aoReach: num(m.aoReach, base.maps.aoReach, 0.005, 0.15),
      colour: pick(m.colour, BASE_COLOURS, base.maps.colour),
      evenLight: num(m.evenLight, base.maps.evenLight, 0, 1),
    },
    file: {
      width: int(f.width, base.file.width, 16, MAX_MAP),
      height: int(f.height, base.file.height, 16, MAX_MAP),
      format: pick(f.format, FORMATS, base.file.format),
      quality: num(f.quality, base.file.quality, 0.3, 1),
    },
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
      // Styles saved before rectangles had one square `tile`.
      width: int(l.width ?? l.tile, base.layout.width, 64, MAX_SIDE),
      height: int(l.height ?? l.tile, base.layout.height, 64, MAX_SIDE),
      fit: bool(l.fit, base.layout.fit),
      scale: num(l.scale, base.layout.scale, 0.05, 2),
      gap: num(l.gap, base.layout.gap, 0, 3),
      jitter: num(l.jitter, base.layout.jitter, 0, 180),
      count: int(l.count, base.layout.count, 1, 60),
      margin: int(l.margin, base.layout.margin, 0, 600),
    },
  }
}
