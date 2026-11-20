// A sketch in an output kind: the shapes each kind draws (worked out off the
// page's thread, see worker.ts), then the SVG round them. Pure, no DOM; the
// tracing of filled shapes (potrace) happens on the page, in render.ts.

import type { Mask } from '../image'
import type { Prepared } from './drawing'
import { closeGaps, dropFaint, evenWidth, levelMask, polylines, schematic, simplify, skeleton, smoothPath, straightPath, toneLevels, typicalWidth, type Circle } from './lines'
import type { SketchStyle } from './style'

/** What a kind draws: filled shapes to trace, or lines to stroke. */
export type Shapes =
  | { type: 'fill'; layers: { mask: Mask; opacity: number }[]; smoothness: number }
  | { type: 'stroke'; paths: string[]; circles: Circle[]; width: number; round: boolean }

/** The style's pixel settings are for the full-size drawing; a copy `k` times smaller takes them `k` times smaller. */
export function shapesFor(p: Prepared, s: SketchStyle, k = 1): Shapes {
  if (s.kind === 'as-drawn') return { type: 'fill', layers: [{ mask: p.mask, opacity: 1 }], smoothness: 1 }
  if (s.kind === 'tones') {
    const n = s.tones.levels
    const levels = toneLevels(p.tone, p.width, p.height, n, s.tones.smoothness / k)
    const layers = Array.from({ length: n }, (_, i) => ({ mask: levelMask(levels, p.width, p.height, i + 1), opacity: (i + 1) / n }))
    return { type: 'fill', layers, smoothness: 0.5 + s.tones.smoothness * 0.8 }
  }
  if (s.kind === 'line') {
    let m = dropFaint(p.mask, p.tone, s.line.faint)
    m = closeGaps(m, s.line.gaps / k)
    if (s.line.traceAs === 'outlines') return { type: 'fill', layers: [{ mask: evenWidth(m, s.line.even), opacity: 1 }], smoothness: s.line.smoothness }
    const skel = skeleton(m)
    const width = typicalWidth(m, skel)
    const lines = polylines(skel, Math.max(2, width))
    const tolerance = 0.4 + s.line.smoothness
    return { type: 'stroke', paths: lines.map((l) => smoothPath(simplify(l, tolerance))), circles: [], width, round: true }
  }
  // Schematic: from the centre lines, with every setting at the drawing's scale.
  let m = closeGaps(p.mask, 2 / k)
  m = dropFaint(m, p.tone, 0.15)
  const skel = skeleton(m)
  const lines = polylines(skel, Math.max(3, s.schematic.join / k))
  const sc = schematic(lines, {
    straighten: s.schematic.straighten / k,
    snap: s.schematic.snap,
    join: s.schematic.join / k,
    grid: s.schematic.grid / k,
  })
  return { type: 'stroke', paths: sc.lines.map((l) => straightPath(l.map((q) => ({ x: q.x + 0.5, y: q.y + 0.5 })))), circles: sc.circles.map((c) => ({ cx: c.cx + 0.5, cy: c.cy + 0.5, r: c.r })), width: s.schematic.width / k, round: true }
}

/** The shapes ready to draw: filled shapes traced to path data. */
export type Drawn =
  | { type: 'fill'; layers: { d: string; opacity: number }[] }
  | { type: 'stroke'; paths: string[]; circles: Circle[]; width: number; round: boolean }

export interface Frame {
  /** The drawing's own size. */
  width: number
  height: number
  /** The size it is shown or saved at, the drawing centred in it. */
  outW: number
  outH: number
}

/** The drawing at its own size, or contained and centred in the style's size. */
export function frameFor(width: number, height: number, s: SketchStyle): Frame {
  if (s.size.fit) return { width, height, outW: width, outH: height }
  return { width, height, outW: s.size.width, outH: s.size.height }
}

/** How the drawing sits in the frame: its scale and its top left corner. */
export function placement(f: Frame): { scale: number; x: number; y: number } {
  const scale = Math.min(f.outW / f.width, f.outH / f.height)
  return { scale, x: (f.outW - f.width * scale) / 2, y: (f.outH - f.height * scale) / 2 }
}

const r2 = (v: number) => String(Math.round(v * 1000) / 1000)

/** How many paths and circles a drawing has, for the stats line (each outline of a filled shape counts). */
export function pathCount(d: Drawn): number {
  return d.type === 'fill' ? d.layers.reduce((n, l) => n + (l.d.match(/M/gi)?.length ?? 0), 0) : d.paths.length + d.circles.length
}

/** The drawn shapes as SVG elements in the drawing's own pixels. */
export function svgBody(d: Drawn, ink: string): string {
  if (d.type === 'fill') {
    return d.layers
      .filter((l) => l.d)
      .map((l) => `<path fill="${ink}"${l.opacity < 1 ? ` fill-opacity="${r2(l.opacity)}"` : ''} fill-rule="evenodd" d="${l.d}"/>`)
      .join('\n  ')
  }
  const caps = d.round ? ' stroke-linecap="round" stroke-linejoin="round"' : ''
  return `<g fill="none" stroke="${ink}" stroke-width="${r2(d.width)}"${caps}>${[
    ...d.paths.map((p) => `\n    <path d="${p}"/>`),
    ...d.circles.map((c) => `\n    <circle cx="${r2(c.cx)}" cy="${r2(c.cy)}" r="${r2(c.r)}"/>`),
  ].join('')}\n  </g>`
}

/** A whole SVG file: the background (null for none), the drawing placed in its frame. */
export function sketchSvg(d: Drawn, f: Frame, ink: string, background: string | null): string {
  const p = placement(f)
  const bg = background ? `\n  <rect width="${f.outW}" height="${f.outH}" fill="${background}"/>` : ''
  const body = svgBody(d, ink)
  const placed = p.scale === 1 && !p.x && !p.y ? body : `<g transform="translate(${r2(p.x)} ${r2(p.y)}) scale(${r2(p.scale)})">\n  ${body}\n  </g>`
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${f.outW} ${f.outH}" width="${f.outW}" height="${f.outH}">${bg}\n  ${placed}\n</svg>\n`
}
