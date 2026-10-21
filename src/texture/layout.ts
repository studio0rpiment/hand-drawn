// Where each print goes: one print with a margin, or a repeating tile.

import { random } from './noise'
import type { TextureStyle } from './style'

export interface Placement {
  /** Centre of the print. */
  x: number
  y: number
  /** Scale applied to the print's pixels. */
  scale: number
  /** Turn in degrees. */
  angle: number
}

export interface Plan {
  width: number
  height: number
  /** Patterns repeat: prints near an edge are drawn again on the opposite side. */
  wrap: boolean
  items: Placement[]
}

/** Bounding box of a w × h rectangle turned by `deg`. */
function turnedBox(w: number, h: number, deg: number): { w: number; h: number } {
  const r = (Math.abs(deg) * Math.PI) / 180
  const c = Math.abs(Math.cos(r))
  const s = Math.abs(Math.sin(r))
  return { w: w * c + h * s, h: w * s + h * c }
}

export function plan(s: TextureStyle, printW: number, printH: number): Plan {
  const L = s.layout
  const rand = random(s.seed + 101)
  const turn = () => (L.jitter ? (rand() * 2 - 1) * L.jitter : 0)

  if (L.mode === 'single') {
    const angle = turn()
    const box = turnedBox(printW * L.scale, printH * L.scale, angle)
    const width = Math.ceil(box.w + 2 * L.margin)
    const height = Math.ceil(box.h + 2 * L.margin)
    return { width, height, wrap: false, items: [{ x: width / 2, y: height / 2, scale: L.scale, angle }] }
  }

  const T = L.tile
  // Each print's longest side is `scale` of the tile.
  const scale = (L.scale * T) / Math.max(printW, printH)
  const items: Placement[] = []
  if (L.mode === 'scatter') {
    // Best-candidate sampling: of a dozen random spots, take the one farthest
    // from the prints so far, measured around the wrap. Random but evenly spread.
    const dist = (a: Placement, x: number, y: number) => {
      const dx = Math.min(Math.abs(a.x - x), T - Math.abs(a.x - x))
      const dy = Math.min(Math.abs(a.y - y), T - Math.abs(a.y - y))
      return Math.hypot(dx, dy)
    }
    for (let i = 0; i < L.count; i++) {
      let best = { x: rand() * T, y: rand() * T }
      let bestD = -1
      for (let k = 0; k < (i === 0 ? 1 : 12); k++) {
        const c = k === 0 ? best : { x: rand() * T, y: rand() * T }
        const d = Math.min(Infinity, ...items.map((it) => dist(it, c.x, c.y)))
        if (d > bestD) {
          bestD = d
          best = c
        }
      }
      items.push({ ...best, scale, angle: turn() })
    }
    return { width: T, height: T, wrap: true, items }
  }

  // Grids: a whole number of cells per tile, so the edges meet.
  const pitch = L.scale * T * (1 + L.gap)
  const n = Math.max(1, Math.round(T / pitch))
  const step = T / n
  for (let col = 0; col < n; col++) {
    for (let row = 0; row < n; row++) {
      const drop = L.mode === 'half-drop' && col % 2 === 1 ? step / 2 : 0
      items.push({ x: (col + 0.5) * step, y: (row + 0.5) * step + drop, scale, angle: turn() })
    }
  }
  return { width: T, height: T, wrap: true, items }
}
