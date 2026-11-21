// The drawing's lines, for Line drawing, Schematic and Tones: faint lines
// dropped, gaps closed, lines made one width, centre lines found (thinning)
// and followed into polylines, polylines straightened, snapped and joined,
// and tones cut into a few flat levels. Pure, no DOM.

import { distance2 } from '../icon/shape'
import type { Mask, Point } from '../image'

/** Every group of touching ink pixels (8 neighbours), as lists of pixel indices. */
export function components(mask: Mask): number[][] {
  const { width: w, height: h, data } = mask
  const label = new Uint8Array(data.length)
  const out: number[][] = []
  const stack: number[] = []
  for (let s = 0; s < data.length; s++) {
    if (!data[s] || label[s]) continue
    const group: number[] = []
    label[s] = 1
    stack.push(s)
    while (stack.length) {
      const p = stack.pop()!
      group.push(p)
      const x = p % w
      const y = (p - x) / w
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx
          const ny = y + dy
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue
          const q = ny * w + nx
          if (data[q] && !label[q]) {
            label[q] = 1
            stack.push(q)
          }
        }
      }
    }
    out.push(group)
  }
  return out
}

/** Lines whose ink is on average paler than `faint` (0–1 of full ink) are dropped. */
export function dropFaint(mask: Mask, tone: Uint8Array, faint: number): Mask {
  if (faint <= 0) return mask
  const data = mask.data.slice()
  for (const group of components(mask)) {
    let sum = 0
    for (const p of group) sum += tone[p]
    if (sum / group.length < faint * 255) for (const p of group) data[p] = 0
  }
  return { width: mask.width, height: mask.height, data }
}

/** Gaps narrower than `px` closed: the ink grown by half of it, then shrunk back. */
export function closeGaps(mask: Mask, px: number): Mask {
  if (px <= 0) return mask
  const r = px / 2
  const near = distance2(mask, 1)
  const grown = new Uint8Array(mask.data.length)
  for (let i = 0; i < grown.length; i++) grown[i] = near[i] <= r * r ? 1 : 0
  const g: Mask = { width: mask.width, height: mask.height, data: grown }
  const far = distance2(g, 0)
  const data = new Uint8Array(grown.length)
  for (let i = 0; i < data.length; i++) data[i] = mask.data[i] || far[i] > r * r ? 1 : 0
  return { width: mask.width, height: mask.height, data }
}

/** The ink thinned to lines one pixel wide down its middle (Zhang and Suen). */
export function skeleton(mask: Mask): Mask {
  const { width: w, height: h } = mask
  const d = mask.data.slice()
  const at = (x: number, y: number) => (x >= 0 && y >= 0 && x < w && y < h ? d[y * w + x] : 0)
  const gone: number[] = []
  let changed = true
  while (changed) {
    changed = false
    for (const step of [0, 1]) {
      gone.length = 0
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          if (!d[y * w + x]) continue
          // Neighbours clockwise from the top.
          const p2 = at(x, y - 1)
          const p3 = at(x + 1, y - 1)
          const p4 = at(x + 1, y)
          const p5 = at(x + 1, y + 1)
          const p6 = at(x, y + 1)
          const p7 = at(x - 1, y + 1)
          const p8 = at(x - 1, y)
          const p9 = at(x - 1, y - 1)
          const b = p2 + p3 + p4 + p5 + p6 + p7 + p8 + p9
          if (b < 2 || b > 6) continue
          const ring = [p2, p3, p4, p5, p6, p7, p8, p9, p2]
          let a = 0
          for (let k = 0; k < 8; k++) if (!ring[k] && ring[k + 1]) a++
          if (a !== 1) continue
          if (step === 0 ? p2 * p4 * p6 || p4 * p6 * p8 : p2 * p4 * p8 || p2 * p6 * p8) continue
          gone.push(y * w + x)
        }
      }
      for (const i of gone) d[i] = 0
      if (gone.length) changed = true
    }
  }
  // Staircase corners: a pixel whose two neighbours at right angles touch diagonally anyway is one too many.
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!d[y * w + x]) continue
      const n = at(x, y - 1)
      const e = at(x + 1, y)
      const s = at(x, y + 1)
      const o = at(x - 1, y)
      if ((n && e && !s && !o && !at(x - 1, y + 1)) || (e && s && !n && !o && !at(x - 1, y - 1)) || (s && o && !n && !e && !at(x + 1, y - 1)) || (o && n && !e && !s && !at(x + 1, y + 1))) d[y * w + x] = 0
    }
  }
  return { width: w, height: h, data: d }
}

const NEIGHBOURS = [
  [1, 0],
  [1, 1],
  [0, 1],
  [-1, 1],
  [-1, 0],
  [-1, -1],
  [0, -1],
  [1, -1],
] as const

/**
 * A one-pixel skeleton followed into polylines: from each end and each fork
 * along the line to the next end or fork, then the closed loops left over.
 * Polylines shorter than `minLength` pixels are dropped (the stubs thinning leaves).
 */
export function polylines(skel: Mask, minLength = 3): Point[][] {
  const { width: w, height: h, data } = skel
  const on = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h && data[y * w + x] === 1
  const degree = new Uint8Array(data.length)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!data[y * w + x]) continue
      let n = 0
      for (const [dx, dy] of NEIGHBOURS) if (on(x + dx, y + dy)) n++
      degree[y * w + x] = n
    }
  }
  // Steps already walked, by the pair of pixels: each is walked once.
  const walked = new Set<number>()
  const key = (a: number, b: number) => (a < b ? a * data.length + b : b * data.length + a)
  const node = (i: number) => degree[i] !== 2
  const lines: Point[][] = []
  const walk = (start: number, next: number) => {
    const line: Point[] = [{ x: start % w, y: Math.floor(start / w) }]
    let prev = start
    let cur = next
    walked.add(key(prev, cur))
    for (;;) {
      line.push({ x: cur % w, y: Math.floor(cur / w) })
      if (node(cur) || cur === start) break
      const cx = cur % w
      const cy = Math.floor(cur / w)
      let step = -1
      for (const [dx, dy] of NEIGHBOURS) {
        if (!on(cx + dx, cy + dy)) continue
        const q = (cy + dy) * w + cx + dx
        if (q === prev || walked.has(key(cur, q))) continue
        step = q
        break
      }
      if (step < 0) break
      walked.add(key(cur, step))
      prev = cur
      cur = step
    }
    return line
  }
  const out = (start: number) => {
    const x = start % w
    const y = Math.floor(start / w)
    for (const [dx, dy] of NEIGHBOURS) {
      if (!on(x + dx, y + dy)) continue
      const q = (y + dy) * w + x + dx
      if (!walked.has(key(start, q))) lines.push(walk(start, q))
    }
  }
  for (let i = 0; i < data.length; i++) if (data[i] && node(i) && degree[i] > 0) out(i)
  // What is left is loops, every pixel with two neighbours.
  for (let i = 0; i < data.length; i++) if (data[i] && degree[i] === 2) out(i)
  // A lone pixel is a dot.
  for (let i = 0; i < data.length; i++) if (data[i] && degree[i] === 0) lines.push([{ x: i % w, y: Math.floor(i / w) }])
  return lines.filter((l) => l.length === 1 || length(l) >= minLength)
}

/** A polyline's length. */
export function length(line: Point[]): number {
  let s = 0
  for (let i = 1; i < line.length; i++) s += Math.hypot(line[i].x - line[i - 1].x, line[i].y - line[i - 1].y)
  return s
}

/** Douglas–Peucker: the fewest points that keep the line within `tolerance` pixels of where it was. */
export function simplify(line: Point[], tolerance: number): Point[] {
  if (line.length < 3 || tolerance <= 0) return line
  const keep = new Uint8Array(line.length)
  keep[0] = keep[line.length - 1] = 1
  const stack: [number, number][] = [[0, line.length - 1]]
  while (stack.length) {
    const [a, b] = stack.pop()!
    const A = line[a]
    const B = line[b]
    const len = Math.hypot(B.x - A.x, B.y - A.y)
    let far = -1
    let farD = tolerance
    for (let i = a + 1; i < b; i++) {
      const P = line[i]
      const d = len ? Math.abs((B.x - A.x) * (A.y - P.y) - (A.x - P.x) * (B.y - A.y)) / len : Math.hypot(P.x - A.x, P.y - A.y)
      if (d > farD) {
        farD = d
        far = i
      }
    }
    if (far >= 0) {
      keep[far] = 1
      stack.push([a, far], [far, b])
    }
  }
  return line.filter((_, i) => keep[i])
}

const r2 = (v: number) => String(Math.round(v * 100) / 100)

/** A polyline as smooth path data (Catmull–Rom through its points, as cubic curves). */
export function smoothPath(line: Point[]): string {
  if (line.length === 1) return `M${r2(line[0].x + 0.5)} ${r2(line[0].y + 0.5)}h0`
  const p = line.map((q) => ({ x: q.x + 0.5, y: q.y + 0.5 }))
  const closed = p.length > 3 && p[0].x === p[p.length - 1].x && p[0].y === p[p.length - 1].y
  let d = `M${r2(p[0].x)} ${r2(p[0].y)}`
  for (let i = 0; i < p.length - 1; i++) {
    const a = p[i - 1] ?? (closed ? p[p.length - 2] : p[i])
    const b = p[i]
    const c = p[i + 1]
    const e = p[i + 2] ?? (closed ? p[1] : c)
    d += `C${r2(b.x + (c.x - a.x) / 6)} ${r2(b.y + (c.y - a.y) / 6)} ${r2(c.x - (e.x - b.x) / 6)} ${r2(c.y - (e.y - b.y) / 6)} ${r2(c.x)} ${r2(c.y)}`
  }
  return closed ? `${d}Z` : d
}

/** A polyline as straight path data. */
export function straightPath(line: Point[]): string {
  if (line.length === 1) return `M${r2(line[0].x)} ${r2(line[0].y)}h0`
  return line.map((q, i) => `${i ? 'L' : 'M'}${r2(q.x)} ${r2(q.y)}`).join('')
}

/** The middle of the ink's line widths: twice the median distance from the centre line to the paper. */
export function typicalWidth(mask: Mask, skel: Mask): number {
  const far = distance2(mask, 0)
  const r: number[] = []
  for (let i = 0; i < skel.data.length; i++) if (skel.data[i]) r.push(Math.sqrt(far[i]))
  if (!r.length) return 1
  r.sort((a, b) => a - b)
  return Math.max(1, 2 * r[r.length >> 1] - 1)
}

/**
 * Line width from as drawn (0) to even (1): each point of every centre line
 * is drawn again as a disc, its radius moved `even` of the way from its own
 * to the drawing's typical one.
 */
export function evenWidth(mask: Mask, even: number): Mask {
  if (even <= 0) return mask
  const { width: w, height: h } = mask
  const skel = skeleton(mask)
  const far = distance2(mask, 0)
  const radii: number[] = []
  for (let i = 0; i < skel.data.length; i++) if (skel.data[i]) radii.push(Math.sqrt(far[i]))
  if (!radii.length) return mask
  const sorted = [...radii].sort((a, b) => a - b)
  const typical = sorted[sorted.length >> 1]
  const data = new Uint8Array(w * h)
  for (let i = 0; i < skel.data.length; i++) {
    if (!skel.data[i]) continue
    const own = Math.sqrt(far[i])
    const r = Math.max(0.5, own + (typical - own) * even)
    const cx = i % w
    const cy = Math.floor(i / w)
    const R = Math.ceil(r)
    for (let y = Math.max(0, cy - R); y <= Math.min(h - 1, cy + R); y++) {
      for (let x = Math.max(0, cx - R); x <= Math.min(w - 1, cx + R); x++) {
        if ((x - cx) ** 2 + (y - cy) ** 2 <= r * r) data[y * w + x] = 1
      }
    }
  }
  return { width: w, height: h, data }
}

// ---- Schematic ----

export interface Circle {
  cx: number
  cy: number
  r: number
}

export interface Schematic {
  lines: Point[][]
  circles: Circle[]
}

export interface SchematicSettings {
  straighten: number
  snap: number
  join: number
  grid: number
}

/** A closed polyline that is nearly round, as a circle; else null. */
export function asCircle(line: Point[]): Circle | null {
  if (line.length < 12) return null
  const a = line[0]
  const b = line[line.length - 1]
  if (Math.hypot(a.x - b.x, a.y - b.y) > 2.5) return null
  let cx = 0
  let cy = 0
  for (const p of line) {
    cx += p.x
    cy += p.y
  }
  cx /= line.length
  cy /= line.length
  const r = line.map((p) => Math.hypot(p.x - cx, p.y - cy))
  const mean = r.reduce((s, v) => s + v, 0) / r.length
  if (mean < 3) return null
  const sd = Math.sqrt(r.reduce((s, v) => s + (v - mean) ** 2, 0) / r.length)
  return sd / mean < 0.1 ? { cx, cy, r: mean } : null
}

/** Where two lines meet, each through a point in a direction; null when they run side by side. */
function meet(p: Point, u: Point, q: Point, v: Point): Point | null {
  const den = u.x * v.y - u.y * v.x
  if (Math.abs(den) < 1e-6) return null
  const t = ((q.x - p.x) * v.y - (q.y - p.y) * v.x) / den
  return { x: p.x + u.x * t, y: p.y + u.y * t }
}

/**
 * Each straight run of a polyline turned to the nearest multiple of `step`
 * degrees about its middle; the corners are where the turned runs meet, and
 * the ends stay on their runs.
 */
export function snapAngles(line: Point[], step: number): Point[] {
  if (step <= 0 || line.length < 2) return line
  const s = (step * Math.PI) / 180
  const runs = line.slice(1).map((b, i) => {
    const a = line[i]
    const ang = Math.round(Math.atan2(b.y - a.y, b.x - a.x) / s) * s
    return { mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, dir: { x: Math.cos(ang), y: Math.sin(ang) } }
  })
  const onRun = (p: Point, r: (typeof runs)[number]) => {
    const t = (p.x - r.mid.x) * r.dir.x + (p.y - r.mid.y) * r.dir.y
    return { x: r.mid.x + r.dir.x * t, y: r.mid.y + r.dir.y * t }
  }
  const out: Point[] = [onRun(line[0], runs[0])]
  for (let i = 1; i < runs.length; i++) out.push(meet(runs[i - 1].mid, runs[i - 1].dir, runs[i].mid, runs[i].dir) ?? onRun(line[i], runs[i]))
  out.push(onRun(line[line.length - 1], runs[runs.length - 1]))
  return out
}

/** Ends of different lines (or of one line) closer than `within` pixels meet at their middle. */
export function joinEnds(lines: Point[][], within: number): Point[][] {
  if (within <= 0) return lines
  const out = lines.map((l) => l.map((p) => ({ ...p })))
  const ends: Point[] = []
  for (const l of out) if (l.length > 1) ends.push(l[0], l[l.length - 1])
  // Group ends that are near each other, one after another.
  const group = ends.map((_, i) => i)
  const root = (i: number): number => (group[i] === i ? i : (group[i] = root(group[i])))
  for (let i = 0; i < ends.length; i++) {
    for (let j = i + 1; j < ends.length; j++) {
      if (Math.hypot(ends[i].x - ends[j].x, ends[i].y - ends[j].y) <= within) group[root(i)] = root(j)
    }
  }
  const sums = new Map<number, { x: number; y: number; n: number }>()
  ends.forEach((p, i) => {
    const s = sums.get(root(i)) ?? { x: 0, y: 0, n: 0 }
    s.x += p.x
    s.y += p.y
    s.n++
    sums.set(root(i), s)
  })
  ends.forEach((p, i) => {
    const s = sums.get(root(i))!
    if (s.n < 2) return
    p.x = s.x / s.n
    p.y = s.y / s.n
  })
  return out
}

/**
 * Lines made exact: straight within `straighten` pixels, angles snapped,
 * near circles made round, ends that nearly meet joined, and corners on a grid.
 */
export function schematic(lines: Point[][], s: SchematicSettings): Schematic {
  const circles: Circle[] = []
  let straight: Point[][] = []
  for (const l of lines) {
    const c = asCircle(l)
    if (c) circles.push(c)
    else straight.push(simplify(l, Math.max(0.75, s.straighten)))
  }
  straight = straight.map((l) => snapAngles(l, s.snap))
  straight = joinEnds(straight, s.join)
  if (s.grid > 0) {
    const g = (v: number) => Math.round(v / s.grid) * s.grid
    straight = straight.map((l) => l.map((p) => ({ x: g(p.x), y: g(p.y) })))
    for (const c of circles) {
      c.cx = g(c.cx)
      c.cy = g(c.cy)
      c.r = Math.max(s.grid / 2, Math.round(c.r / (s.grid / 2)) * (s.grid / 2))
    }
  }
  // Snapping can fold a short line onto a point; a line of one point is a dot, which a schematic doesn't need.
  straight = straight.filter((l) => l.length > 1 && length(l) > 0.5)
  return { lines: straight, circles }
}

// ---- Tones ----

/** Each pixel's level: 0 is paper, 1 … `levels` from the palest ink to the darkest. */
export function toneLevels(tone: Uint8Array, width: number, height: number, levels: number, smoothness: number): Uint8Array {
  // Smoothing first, so each level's edge runs smooth rather than following the grain.
  const r = Math.round(smoothness * 3)
  let t: Uint8Array = tone
  if (r > 0) {
    const tmp = new Float32Array(tone.length)
    const out = new Uint8Array(tone.length)
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        let s = 0
        let n = 0
        for (let k = Math.max(0, x - r); k <= Math.min(width - 1, x + r); k++, n++) s += tone[y * width + k]
        tmp[y * width + x] = s / n
      }
    }
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        let s = 0
        let n = 0
        for (let k = Math.max(0, y - r); k <= Math.min(height - 1, y + r); k++, n++) s += tmp[k * width + x]
        out[y * width + x] = Math.round(s / n)
      }
    }
    t = out
  }
  const out = new Uint8Array(t.length)
  for (let i = 0; i < t.length; i++) out[i] = Math.min(levels, Math.floor((t[i] / 255) * levels + 0.5))
  return out
}

/** The pixels of one level, as a mask to trace. */
export function levelMask(levels: Uint8Array, width: number, height: number, level: number): Mask {
  const data = new Uint8Array(levels.length)
  for (let i = 0; i < data.length; i++) data[i] = levels[i] === level ? 1 : 0
  return { width, height, data }
}
