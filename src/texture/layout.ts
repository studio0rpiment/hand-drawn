// Where each print goes: one print (on a canvas that fits it, or one of a set
// size), or a repeating tile of any width and height.

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
    if (L.fit) {
      const box = turnedBox(printW * L.scale, printH * L.scale, angle)
      const width = Math.ceil(box.w + 2 * L.margin)
      const height = Math.ceil(box.h + 2 * L.margin)
      return { width, height, wrap: false, items: [{ x: width / 2, y: height / 2, scale: L.scale, angle }] }
    }
    // On a set canvas: the turned print fits inside the margin at 100%, centred.
    const W = L.width
    const H = L.height
    const box = turnedBox(printW, printH, angle)
    const room = Math.max(1, Math.min((W - 2 * L.margin) / box.w, (H - 2 * L.margin) / box.h))
    return { width: W, height: H, wrap: false, items: [{ x: W / 2, y: H / 2, scale: room * L.scale, angle }] }
  }

  const W = L.width
  const H = L.height
  // Each print's longest side is `scale` of the tile's shorter side.
  const scale = (L.scale * Math.min(W, H)) / Math.max(printW, printH)
  const items: Placement[] = []
  if (L.mode === 'scatter') {
    // Best-candidate sampling: of a dozen random spots, take the one farthest
    // from the prints so far, measured around the wrap. Random but evenly spread.
    const dist = (a: Placement, x: number, y: number) => {
      const dx = Math.min(Math.abs(a.x - x), W - Math.abs(a.x - x))
      const dy = Math.min(Math.abs(a.y - y), H - Math.abs(a.y - y))
      return Math.hypot(dx, dy)
    }
    for (let i = 0; i < L.count; i++) {
      let best = { x: rand() * W, y: rand() * H }
      let bestD = -1
      for (let k = 0; k < (i === 0 ? 1 : 12); k++) {
        const c = k === 0 ? best : { x: rand() * W, y: rand() * H }
        const d = Math.min(Infinity, ...items.map((it) => dist(it, c.x, c.y)))
        if (d > bestD) {
          bestD = d
          best = c
        }
      }
      items.push({ ...best, scale, angle: turn() })
    }
    return { width: W, height: H, wrap: true, items }
  }

  // Grids: a whole number of cells across and down, so the edges meet; a
  // half-drop needs an even number of columns for its rhythm to carry over.
  const pitch = L.scale * Math.min(W, H) * (1 + L.gap)
  let cols = Math.max(1, Math.round(W / pitch))
  const rows = Math.max(1, Math.round(H / pitch))
  if (L.mode === 'half-drop' && cols % 2) cols = cols === 1 ? 2 : cols + (W / pitch > cols ? 1 : -1)
  const stepX = W / cols
  const stepY = H / rows
  for (let col = 0; col < cols; col++) {
    for (let row = 0; row < rows; row++) {
      const drop = L.mode === 'half-drop' && col % 2 === 1 ? stepY / 2 : 0
      items.push({ x: (col + 0.5) * stepX, y: (row + 0.5) * stepY + drop, scale, angle: turn() })
    }
  }
  return { width: W, height: H, wrap: true, items }
}
