// Reading and rewriting the path data potrace produces (commands M, m, l, c, z).

import type { TraceResult } from './trace'

const ARITY: Record<string, number> = { m: 2, l: 2, c: 6, z: 0 }

/** Split path data into commands with their numbers; implicit repeats stay in one command. */
function parse(d: string): { cmd: string; nums: number[] }[] {
  const out: { cmd: string; nums: number[] }[] = []
  for (const tok of d.match(/[a-zA-Z]|-?\d*\.?\d+(?:e-?\d+)?/g) ?? []) {
    if (/[a-zA-Z]/.test(tok)) {
      if (!(tok.toLowerCase() in ARITY)) throw new Error(`Unexpected path command ${tok}`)
      out.push({ cmd: tok, nums: [] })
    } else out[out.length - 1].nums.push(Number(tok))
  }
  return out
}

/**
 * potrace draws in tenths of a pixel with y pointing up, and expects
 * translate(0,h) scale(0.1,-0.1). Bake that in so the SVG has plain pixel
 * coordinates and no transform.
 */
export function toPixels(d: string, height: number, decimals = 2): string {
  const k = 10 ** decimals
  const r = (v: number) => String(Math.round(v * k) / k)
  return parse(d)
    .map(({ cmd, nums }) => {
      const abs = cmd === cmd.toUpperCase()
      const pts = nums.map((v, i) => (i % 2 === 0 ? v / 10 : abs ? height - v / 10 : -v / 10))
      return cmd + pts.map(r).join(' ')
    })
    .join('')
}

/** Number of closed outlines and of curve/line segments, as a feel for how heavy the logo is. */
export function complexity(r: TraceResult): { outlines: number; segments: number } {
  let outlines = 0
  let segments = 0
  for (const d of r.paths) {
    for (const { cmd, nums } of parse(d)) {
      const c = cmd.toLowerCase()
      if (c === 'm') outlines++
      if (c === 'l' || c === 'c') segments += nums.length / ARITY[c]
    }
  }
  return { outlines, segments }
}
