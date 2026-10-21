// Tracing the ink mask into vector paths with potrace.

import { init, potrace } from 'esm-potrace-wasm'
import type { Mask } from './image'
import { toPixels } from './svgpath'

export interface TraceSettings {
  /** Ignore specks up to this many pixels. */
  ignore: number
  /** potrace alphamax: 0 keeps every corner sharp, 1.33 rounds almost everything. */
  smoothness: number
  /** potrace opttolerance: how far curves may drift to use fewer points. */
  simplify: number
}

export interface TraceResult {
  /** One `d` attribute per traced shape, in mask pixel coordinates. */
  paths: string[]
  width: number
  height: number
}

let ready: Promise<void> | null = null

export async function trace(mask: Mask, s: TraceSettings): Promise<TraceResult> {
  ready ??= init()
  await ready
  const img = new ImageData(mask.width, mask.height)
  for (let i = 0, j = 0; i < mask.data.length; i++, j += 4) {
    const v = mask.data[i] ? 0 : 255
    img.data[j] = img.data[j + 1] = img.data[j + 2] = v
    img.data[j + 3] = 255
  }
  const out = await potrace(img, {
    turdsize: s.ignore,
    turnpolicy: 4,
    alphamax: s.smoothness,
    opticurve: 1,
    opttolerance: s.simplify,
    pathonly: true,
    extractcolors: false,
  })
  const paths = out.map((p) => toPixels(pathData(p), mask.height)).filter((d) => d.length > 0)
  return { paths, width: mask.width, height: mask.height }
}

/** potrace hands back either bare path data or a whole <path> element, depending on version. */
function pathData(p: string): string {
  const m = /\sd="([^"]*)"/.exec(p)
  return (m ? m[1] : p).trim()
}

export interface SvgStyle {
  ink: string
  /** null for transparent. */
  background: string | null
}

export function toSvg(r: TraceResult, style: SvgStyle): string {
  const bg = style.background
    ? `\n  <rect width="${r.width}" height="${r.height}" fill="${style.background}"/>`
    : ''
  // fill-rule evenodd keeps the holes in letters like o and a open.
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${r.width} ${r.height}" width="${r.width}" height="${r.height}">${bg}
  <path fill="${style.ink}" fill-rule="evenodd" d="${r.paths.join(' ')}"/>
</svg>
`
}
