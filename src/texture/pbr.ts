// PBR maps from one surface: base colour, height, normal, roughness and
// ambient occlusion. Height comes from a height source (height.ts); normal,
// roughness and ambient occlusion are worked out from it and the brightness,
// with no model. No DOM, so it runs in tests.

import { heightSource } from './height'
import { blur, levels, luminance, seamless, type Surface } from './surface'

export const MAP_KINDS = ['base', 'height', 'normal', 'roughness', 'ao'] as const
export type MapKind = (typeof MAP_KINDS)[number]

export interface MapOptions {
  /** Where the height comes from: a height source's id. */
  height: string
  darkHigh: boolean
  /** Softening, as a share of the shorter side. */
  soften: number
  detail: number
  /** How steep the normals are for the height, 0–1. */
  depth: number
  /** Normal map's green channel: up (OpenGL, Blender, Godot, Unity) or down (DirectX, Unreal). */
  normalY: 'gl' | 'dx'
  /** Roughness where the brightness is middling, 0–1. */
  roughness: number
  /** Dark parts rougher (above 0) or smoother (below 0), −1 to 1. */
  roughVary: number
  /** Ambient occlusion strength, 0–1, and how far it reaches, as a share of the shorter side. */
  ao: number
  aoReach: number
  /** Base colour: the photo, or the scan's ink colour on its paper colour. */
  colour: 'photo' | 'ink-on-paper'
  /** How much of the photo's uneven light is taken out of the base colour, 0–1. */
  evenLight: number
}

export interface TileOptions {
  seamless: boolean
  seam: number
  ragged: number
  seed: number
}

export interface Maps {
  width: number
  height: number
  /** RGBA, one array per map; grey maps are written to all three channels. */
  images: Record<MapKind, Uint8ClampedArray>
  /** The height as numbers, for the lit preview. */
  heights: Float32Array
}

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v)

function hexRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

/** A grey map (0–1) as opaque RGBA. */
export function greyImage(v: Float32Array): Uint8ClampedArray {
  const out = new Uint8ClampedArray(v.length * 4)
  for (let i = 0, j = 0; i < v.length; i++, j += 4) {
    const g = Math.round(clamp01(v[i]) * 255)
    out[j] = out[j + 1] = out[j + 2] = g
    out[j + 3] = 255
  }
  return out
}

/** Normals from the height's slope (Sobel), as a tangent-space normal map. */
export function normalMap(h: Float32Array, w: number, hh: number, strength: number, y: 'gl' | 'dx', wrap: boolean): Uint8ClampedArray {
  const out = new Uint8ClampedArray(w * hh * 4)
  const at = (x: number, yy: number) => {
    if (wrap) {
      x = (x + w) % w
      yy = (yy + hh) % hh
    } else {
      x = x < 0 ? 0 : x >= w ? w - 1 : x
      yy = yy < 0 ? 0 : yy >= hh ? hh - 1 : yy
    }
    return h[yy * w + x]
  }
  // Height in the green channel's sense: image rows run down, OpenGL's y runs up.
  const flip = y === 'gl' ? 1 : -1
  for (let yy = 0; yy < hh; yy++) {
    for (let x = 0; x < w; x++) {
      const dx =
        (at(x + 1, yy - 1) + 2 * at(x + 1, yy) + at(x + 1, yy + 1) - at(x - 1, yy - 1) - 2 * at(x - 1, yy) - at(x - 1, yy + 1)) / 8
      const dy =
        (at(x - 1, yy + 1) + 2 * at(x, yy + 1) + at(x + 1, yy + 1) - at(x - 1, yy - 1) - 2 * at(x, yy - 1) - at(x + 1, yy - 1)) / 8
      const nx = -dx * strength
      const ny = dy * strength * flip
      const len = Math.hypot(nx, ny, 1)
      const j = (yy * w + x) * 4
      out[j] = Math.round(((nx / len) * 0.5 + 0.5) * 255)
      out[j + 1] = Math.round(((ny / len) * 0.5 + 0.5) * 255)
      out[j + 2] = Math.round(((1 / len) * 0.5 + 0.5) * 255)
      out[j + 3] = 255
    }
  }
  return out
}

/** Ambient occlusion: how far each point sits below its surroundings, at three reaches. */
export function aoMap(h: Float32Array, w: number, hh: number, reach: number, strength: number, wrap: boolean): Float32Array {
  const out = new Float32Array(h.length).fill(1)
  if (strength <= 0) return out
  const reaches = [reach / 4, reach / 2, reach].map((r) => Math.max(1, r))
  const cavity = new Float32Array(h.length)
  for (const r of reaches) {
    const around = blur(h, w, hh, r, wrap)
    for (let i = 0; i < h.length; i++) cavity[i] += Math.max(0, around[i] - h[i])
  }
  for (let i = 0; i < h.length; i++) out[i] = clamp01(1 - cavity[i] * strength * 3)
  return out
}

/** Roughness from brightness: middling at `base`, dark parts moved by `vary`. */
export function roughnessMap(gray: Uint8Array, base: number, vary: number, wrap: boolean, w: number, h: number): Float32Array {
  const g = levels(blur(Float32Array.from(gray, (v) => v / 255), w, h, 1, wrap), 0.02, 0.98)
  const out = new Float32Array(g.length)
  for (let i = 0; i < g.length; i++) out[i] = clamp01(base + vary * (0.5 - g[i]))
  return out
}

/** The base colour: the photo with its uneven light taken out, or ink on paper. */
export function baseColour(s: Surface, o: MapOptions, inkHex: string, paperHex: string, wrap: boolean): Uint8ClampedArray {
  const n = s.width * s.height
  const out = new Uint8ClampedArray(n * 4)
  if (o.colour === 'ink-on-paper') {
    const ink = hexRgb(inkHex)
    const paper = hexRgb(paperHex)
    for (let i = 0, j = 0; i < n; i++, j += 4) {
      const t = s.ink[i] / 255
      for (let k = 0; k < 3; k++) out[j + k] = paper[k] + (ink[k] - paper[k]) * t
      out[j + 3] = 255
    }
    return out
  }
  out.set(s.colour)
  if (o.evenLight > 0) {
    // The light across the photo: its brightness blurred wide. Each pixel is
    // lifted or lowered toward the average by that much.
    const lum = luminance(s.colour)
    const wide = blur(lum, s.width, s.height, Math.min(s.width, s.height) / 10, wrap)
    let mean = 0
    for (let i = 0; i < n; i++) mean += wide[i]
    mean /= n
    for (let i = 0, j = 0; i < n; i++, j += 4) {
      const f = 1 + (mean / Math.max(0.02, wide[i]) - 1) * o.evenLight
      out[j] = s.colour[j] * f
      out[j + 1] = s.colour[j + 1] * f
      out[j + 2] = s.colour[j + 2] * f
    }
  }
  for (let j = 3; j < out.length; j += 4) out[j] = 255
  return out
}

/** The steps of making the maps, in order: the seamless tile, then each map. */
export const MAP_STEPS = ['tile', 'height', 'base', 'normal', 'roughness', 'ao'] as const
export type MapStep = (typeof MAP_STEPS)[number]

/** Every map for the surface, tiled first when the tile is to be seamless. `done` hears each step as it finishes. */
export async function makeMaps(
  src: Surface,
  o: MapOptions,
  tile: TileOptions,
  colours: { ink: string; paper: string },
  done: (step: MapStep) => void = () => {},
): Promise<Maps> {
  const wrap = tile.seamless
  const s = wrap ? seamless(src, { width: tile.seam, ragged: tile.ragged, seed: tile.seed }) : src
  done('tile')
  const { width: w, height: h } = s
  const side = Math.min(w, h)
  const heights = await heightSource(o.height).estimate(s, { darkHigh: o.darkHigh, soften: o.soften * side, detail: o.detail, wrap })
  const height = greyImage(heights)
  done('height')
  const base = baseColour(s, o, colours.ink, colours.paper, wrap)
  done('base')
  // Steepness grows with the size, so a bump looks the same at every resolution.
  const normal = normalMap(heights, w, h, o.depth * side * 0.06, o.normalY, wrap)
  done('normal')
  const roughness = greyImage(roughnessMap(s.gray, o.roughness, o.roughVary, wrap, w, h))
  done('roughness')
  const ao = greyImage(aoMap(heights, w, h, Math.max(1, o.aoReach * side), o.ao, wrap))
  done('ao')
  return { width: w, height: h, heights, images: { base, height, normal, roughness, ao } }
}

/** The sizes the files can be had at: the chosen size, then halves of it, down to `smallest` on the longer side. */
export function mapSizes(width: number, height: number, smallest = 256): { width: number; height: number }[] {
  const out = [{ width, height }]
  for (let d = 2; ; d *= 2) {
    const w = Math.round(width / d)
    const h = Math.round(height / d)
    if (Math.max(w, h) < smallest || Math.min(w, h) < 16) break
    out.push({ width: w, height: h })
  }
  return out
}
