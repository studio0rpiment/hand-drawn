// Where a texture's height (displacement) comes from. Every other map is
// worked out from the height, so this is the one place a better estimate
// plugs in.
//
// Two sources are built in and need no model:
//   ink-scan   — the ink scan: ink stands up from the paper (or sits in it).
//   brightness — the light-evened brightness: for photos of a surface.
//
// The seam for a model: a source may be async. Depth Anything V2 Small (run
// by onnxruntime-web, as Variable Machine's image segmentation tab does), or
// later a height-and-normal model trained in Variable Machine, is added with
// `addHeightSource({ id: 'model', estimate })` from a module that loads the
// model on first use. Its words go in texture.md as `texture.o.model`, and the
// "Height from" choice lists it. The model and onnxruntime's wasm files must
// be served from the site (the CSP allows only same-origin and
// 'wasm-unsafe-eval'), so nothing leaves the browser.

import { blur, levels, type Surface } from './surface'

export interface HeightOptions {
  /** Dark parts stand high (ink raised like a stamp); off, they sit low (crevices, engraving). */
  darkHigh: boolean
  /** Softening radius in pixels at this surface's size. */
  soften: number
  /** Fine detail from the photo's grey added on top, 0–1 (paper tooth, grain). */
  detail: number
  /** The surface repeats: blurs read across the opposite edge. */
  wrap: boolean
}

export interface HeightSource {
  id: string
  /** Height per pixel, 0 (low) to 1 (high), the surface's size. */
  estimate(s: Surface, o: HeightOptions): Float32Array | Promise<Float32Array>
}

/** Fine detail: the grey minus its blur, centred on 0, roughly −0.5 to 0.5. */
function detailOf(s: Surface, o: HeightOptions): Float32Array {
  const g = Float32Array.from(s.gray, (v) => v / 255)
  const r = Math.max(2, Math.min(s.width, s.height) / 128)
  const soft = blur(g, s.width, s.height, r, o.wrap)
  const out = new Float32Array(g.length)
  for (let i = 0; i < g.length; i++) out[i] = (g[i] - soft[i]) * 4 * (o.darkHigh ? -1 : 1)
  return out
}

function finish(base: Float32Array, s: Surface, o: HeightOptions): Float32Array {
  const soft = blur(base, s.width, s.height, o.soften, o.wrap)
  if (o.detail > 0) {
    const d = detailOf(s, o)
    for (let i = 0; i < soft.length; i++) soft[i] += d[i] * o.detail * 0.25
  }
  return levels(soft, 0.005, 0.995)
}

const SOURCES = new Map<string, HeightSource>()

export function addHeightSource(source: HeightSource) {
  SOURCES.set(source.id, source)
}

/** The ids of the sources, in the order they were added. */
export function heightSourceIds(): string[] {
  return [...SOURCES.keys()]
}

export function heightSource(id: string): HeightSource {
  return SOURCES.get(id) ?? SOURCES.get('ink-scan')!
}

addHeightSource({
  id: 'ink-scan',
  estimate(s, o) {
    // Ink is dark: it stands high when dark parts do.
    return finish(Float32Array.from(s.ink, (v) => (o.darkHigh ? v : 255 - v) / 255), s, o)
  },
})

addHeightSource({
  id: 'brightness',
  estimate(s, o) {
    return finish(Float32Array.from(s.gray, (v) => (o.darkHigh ? 255 - v : v) / 255), s, o)
  },
})
