// Finding the separate drawings on a sheet: a page of icons, or a page of
// logo iterations. Ink closer together than `gap` belongs to one drawing (a
// dot over an i, a dashed line); pieces smaller than `minArea` are dropped.

import type { Box } from './clean'
import { distance2 } from './icon/shape'
import type { Mask } from './image'

export function splitDrawings(mask: Mask, gap: number, minArea: number): Box[] {
  const { width: w, height: h, data } = mask
  // Grow the ink by half the gap: drawings closer than `gap` now touch.
  const r = gap / 2
  const near = distance2(mask, 1)
  const grown = new Uint8Array(data.length)
  for (let i = 0; i < grown.length; i++) grown[i] = near[i] <= r * r ? 1 : 0

  const label = new Int32Array(data.length).fill(-1)
  const stack = new Int32Array(data.length)
  const found: (Box & { area: number })[] = []
  for (let start = 0; start < data.length; start++) {
    if (!grown[start] || label[start] !== -1) continue
    let top = 0
    stack[top++] = start
    label[start] = found.length
    // The box and area of the actual ink in this group, not the grown halo.
    let x0 = w
    let y0 = h
    let x1 = -1
    let y1 = -1
    let area = 0
    while (top > 0) {
      const p = stack[--top]
      const x = p % w
      const y = (p - x) / w
      if (data[p]) {
        area++
        if (x < x0) x0 = x
        if (x > x1) x1 = x
        if (y < y0) y0 = y
        if (y > y1) y1 = y
      }
      if (x > 0 && grown[p - 1] && label[p - 1] === -1) (label[p - 1] = found.length), (stack[top++] = p - 1)
      if (x < w - 1 && grown[p + 1] && label[p + 1] === -1) (label[p + 1] = found.length), (stack[top++] = p + 1)
      if (y > 0 && grown[p - w] && label[p - w] === -1) (label[p - w] = found.length), (stack[top++] = p - w)
      if (y < h - 1 && grown[p + w] && label[p + w] === -1) (label[p + w] = found.length), (stack[top++] = p + w)
    }
    found.push({ x: x0, y: y0, width: x1 - x0 + 1, height: y1 - y0 + 1, area })
  }
  const groups = found.map((b, id) => ({ ...b, id })).filter((b) => b.width > 0)
  // Ink of group `id` at pixel p.
  const inkOf = (p: number, id: number) => data[p] !== 0 && label[p] === id
  return readingOrder(mergeInside(groups, w, inkOf).filter((b) => b.area >= minArea)).map(
    ({ x, y, width, height }) => ({ x, y, width, height }),
  )
}

/**
 * A mark inside another drawing (a dot in a ring, an eye in a face) belongs
 * to it, however far from its lines: inside means that drawing's ink is met
 * looking left, right, up and down from the mark's middle. A small drawing
 * that only sits within a bigger one's box (beside a long curve, under an
 * arch's open side) stays a drawing of its own.
 */
function mergeInside<T extends Box & { area: number; id: number }>(boxes: T[], w: number, inkOf: (p: number, id: number) => boolean): T[] {
  const out = [...boxes].sort((a, b) => b.width * b.height - a.width * a.height)
  // Each box's own groups: a merged box is enclosed by any of them.
  const members = new Map(out.map((b) => [b, [b.id]]))
  const ray = (x: number, y: number, dx: number, dy: number, big: T, ids: number[]) => {
    for (let px = x + dx, py = y + dy; px >= big.x && px < big.x + big.width && py >= big.y && py < big.y + big.height; px += dx, py += dy) {
      if (ids.some((id) => inkOf(py * w + px, id))) return true
    }
    return false
  }
  for (let i = 0; i < out.length; i++) {
    for (let j = out.length - 1; j > i; j--) {
      const big = out[i]
      const small = out[j]
      const cx = Math.round(small.x + small.width / 2)
      const cy = Math.round(small.y + small.height / 2)
      if (cx < big.x || cx >= big.x + big.width || cy < big.y || cy >= big.y + big.height) continue
      const ids = members.get(big)!
      if (!ray(cx, cy, -1, 0, big, ids) || !ray(cx, cy, 1, 0, big, ids) || !ray(cx, cy, 0, -1, big, ids) || !ray(cx, cy, 0, 1, big, ids)) continue
      const x1 = Math.max(big.x + big.width, small.x + small.width)
      const y1 = Math.max(big.y + big.height, small.y + small.height)
      big.x = Math.min(big.x, small.x)
      big.y = Math.min(big.y, small.y)
      big.width = x1 - big.x
      big.height = y1 - big.y
      big.area += small.area
      ids.push(...members.get(small)!)
      out.splice(j, 1)
    }
  }
  return out
}

/** Rows top to bottom (a box joins a row when it overlaps the row's middle band), then left to right. */
export function readingOrder<T extends Box>(boxes: T[]): T[] {
  const sorted = [...boxes].sort((a, b) => a.y + a.height / 2 - (b.y + b.height / 2))
  const rows: { mid: number; half: number; items: T[] }[] = []
  for (const b of sorted) {
    const mid = b.y + b.height / 2
    const row = rows.find((r) => Math.abs(r.mid - mid) < Math.max(r.half, b.height / 2) * 0.6)
    if (row) row.items.push(b)
    else rows.push({ mid, half: b.height / 2, items: [b] })
  }
  return rows.flatMap((r) => r.items.sort((a, b) => a.x - b.x))
}

/** A box grown by `pad` on every side, kept inside the image. */
export function padBox(b: Box, pad: number, width: number, height: number): Box {
  const x = Math.max(0, b.x - pad)
  const y = Math.max(0, b.y - pad)
  return { x, y, width: Math.min(width, b.x + b.width + pad) - x, height: Math.min(height, b.y + b.height + pad) - y }
}
