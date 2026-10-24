// Reading a photographed letter sheet: find the corner markers, work out
// which page it is, and cut out every box at a fixed resolution.

import { otsu, type GrayImage, type Mask, type Point, type Quad } from '../image'
import { applyHomography, rectToQuad } from '../paper'
import { GRID, GUIDES, MARKER, MARKERS, PAGE, PAGE2_FLAG, SHEETS, cellOrigin } from './sheet'

/** Boxes are cut out at this many pixels per millimetre. */
export const RES = 10

/** The part of each box that is read, in mm from the box's top-left: inside the border, below the label. */
export const READ_BOX = { x: 0.7, y: GUIDES.top, width: GRID.cellW - 1.4, height: GRID.cellH - GUIDES.top - 0.7 }

/**
 * Each box is read with this much (mm) of its neighbours on either side, so a
 * letter drawn past its box's edge is not cut off; which ink belongs to the
 * box is decided afterwards (see ownInk).
 */
export const READ_SPILL = 8

/** Baseline position inside a cut-out box, in pixels from its top. */
export const BASELINE_PX = (GUIDES.baseline - READ_BOX.y) * RES

export interface SheetRead {
  /** 0 for page 1, 1 for page 2. */
  page: number
  /** How many of the four corner markers were found (4 means the boxes are placed precisely). */
  markers: number
  /** The page's ink cut-off, picked automatically. */
  level: number
  /** One grey cut-out per box of this page, in SHEETS[page] order, `margin` px wider than the box on each side. */
  cells: GrayImage[]
  /** How far (px) each cut-out reaches past its box on the left and right. */
  margin: number
}

/** Find a marker near where it is expected: the most square-like dark blob of about the right size. */
function findMarker(gray: GrayImage, around: Point, scale: { x: number; y: number }, level: number): Point | null {
  const r = 11
  const x0 = Math.max(0, Math.floor((around.x - r) * scale.x))
  const y0 = Math.max(0, Math.floor((around.y - r) * scale.y))
  const x1 = Math.min(gray.width, Math.ceil((around.x + r) * scale.x))
  const y1 = Math.min(gray.height, Math.ceil((around.y + r) * scale.y))
  const w = x1 - x0
  const h = y1 - y0
  if (w <= 0 || h <= 0) return null
  const seen = new Uint8Array(w * h)
  const stack: number[] = []
  const expected = MARKER.size * MARKER.size * scale.x * scale.y
  let best: { p: Point; score: number } | null = null
  for (let start = 0; start < w * h; start++) {
    const sx = start % w
    const sy = (start - sx) / w
    if (seen[start] || gray.data[(y0 + sy) * gray.width + x0 + sx] > level) continue
    seen[start] = 1
    stack.push(start)
    let area = 0
    let cx = 0
    let cy = 0
    let bx0 = w
    let by0 = h
    let bx1 = 0
    let by1 = 0
    while (stack.length) {
      const p = stack.pop()!
      const x = p % w
      const y = (p - x) / w
      area++
      cx += x
      cy += y
      bx0 = Math.min(bx0, x)
      bx1 = Math.max(bx1, x)
      by0 = Math.min(by0, y)
      by1 = Math.max(by1, y)
      for (const [nx, ny] of [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]]) {
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue
        const q = ny * w + nx
        if (!seen[q] && gray.data[(y0 + ny) * gray.width + x0 + nx] <= level) {
          seen[q] = 1
          stack.push(q)
        }
      }
    }
    const bw = bx1 - bx0 + 1
    const bh = by1 - by0 + 1
    const fill = area / (bw * bh)
    const aspect = bw / bh
    const sizeFit = area / expected
    if (fill < 0.6 || aspect < 0.6 || aspect > 1.6 || sizeFit < 0.4 || sizeFit > 2.2) continue
    const score = Math.abs(Math.log(sizeFit)) + (1 - fill)
    if (!best || score < best.score) best = { p: { x: x0 + cx / area + 0.5, y: y0 + cy / area + 0.5 }, score }
  }
  return best?.p ?? null
}

/**
 * The four corner squares anywhere in a photo, without knowing where the page
 * is: the biggest solid, square dark shapes, taken at the photo's four
 * extremes (top left, top right, bottom right, bottom left). The page-2 flag
 * is smaller and drops out; so do letters, which are neither solid nor square.
 */
export function findSheetMarkers(gray: GrayImage): Quad | null {
  const { width: w, height: h, data } = gray
  const level = otsu(gray)
  const seen = new Uint8Array(w * h)
  const minSide = Math.min(w, h) * 0.012
  const found: { x: number; y: number; area: number }[] = []
  const stack: number[] = []
  for (let start = 0; start < w * h; start++) {
    if (seen[start] || data[start] > level) continue
    seen[start] = 1
    stack.push(start)
    let area = 0
    let cx = 0
    let cy = 0
    let x0 = w
    let y0 = h
    let x1 = 0
    let y1 = 0
    while (stack.length) {
      const p = stack.pop()!
      const x = p % w
      const y = (p - x) / w
      area++
      cx += x
      cy += y
      if (x < x0) x0 = x
      if (x > x1) x1 = x
      if (y < y0) y0 = y
      if (y > y1) y1 = y
      for (const q of [x > 0 ? p - 1 : -1, x < w - 1 ? p + 1 : -1, y > 0 ? p - w : -1, y < h - 1 ? p + w : -1]) {
        if (q >= 0 && !seen[q] && data[q] <= level) {
          seen[q] = 1
          stack.push(q)
        }
      }
    }
    const bw = x1 - x0 + 1
    const bh = y1 - y0 + 1
    if (bw < minSide || bh < minSide || bw / bh < 0.7 || bw / bh > 1.43 || area / (bw * bh) < 0.8) continue
    found.push({ x: cx / area + 0.5, y: cy / area + 0.5, area })
  }
  if (found.length < 4) return null
  const biggest = Math.max(...found.map((f) => f.area))
  const squares = found.filter((f) => f.area >= biggest * 0.55)
  if (squares.length < 4) return null
  const pick = (score: (f: { x: number; y: number }) => number) => squares.reduce((a, b) => (score(b) > score(a) ? b : a))
  const tl = pick((f) => -(f.x + f.y))
  const tr = pick((f) => f.x - f.y)
  const br = pick((f) => f.x + f.y)
  const bl = pick((f) => f.y - f.x)
  if (new Set([tl, tr, br, bl]).size < 4) return null
  return [tl, tr, br, bl].map(({ x, y }) => ({ x, y })) as Quad
}

/**
 * Read a photo of a letter sheet. `corners`, when known (findSheetMarkers),
 * place the page exactly; otherwise `gray` is taken to be the straightened
 * page and the squares are looked for near where they should be.
 */
export function readSheet(gray: GrayImage, corners?: Quad): SheetRead {
  const scale = { x: gray.width / PAGE.width, y: gray.height / PAGE.height }
  const found = corners ?? MARKERS.map((m) => findMarker(gray, m, scale, otsu(gray)))
  const markers = found.filter(Boolean).length

  // Page mm → photo px: through the markers when all four are there, else by plain scaling.
  let toPx: (x: number, y: number) => Point
  if (markers === 4) {
    const span = { w: PAGE.width - 2 * MARKER.inset, h: PAGE.height - 2 * MARKER.inset }
    const H = rectToQuad(span.w, span.h, found as Quad)
    toPx = (x, y) => applyHomography(H, x - MARKER.inset, y - MARKER.inset)
  } else {
    toPx = (x, y) => ({ x: x * scale.x, y: y * scale.y })
  }

  const sample = (x: number, y: number): number => {
    const p = toPx(x, y)
    const fx = Math.min(Math.max(p.x - 0.5, 0), gray.width - 1)
    const fy = Math.min(Math.max(p.y - 0.5, 0), gray.height - 1)
    const ix = Math.floor(fx)
    const iy = Math.floor(fy)
    const ax = fx - ix
    const ay = fy - iy
    const i00 = gray.data[iy * gray.width + ix]
    const i10 = gray.data[iy * gray.width + Math.min(ix + 1, gray.width - 1)]
    const i01 = gray.data[Math.min(iy + 1, gray.height - 1) * gray.width + ix]
    const i11 = gray.data[Math.min(iy + 1, gray.height - 1) * gray.width + Math.min(ix + 1, gray.width - 1)]
    return (i00 + (i10 - i00) * ax) * (1 - ay) + (i01 + (i11 - i01) * ax) * ay
  }

  // The ink cut-off, from the grid area of the page only (a photo may show the table round it).
  const samples: number[] = []
  for (let y = GRID.y; y < GRID.y + GRID.rows * GRID.cellH; y += 0.5) {
    for (let x = GRID.x; x < GRID.x + GRID.cols * GRID.cellW; x += 0.5) samples.push(Math.round(sample(x, y)))
  }
  const level = otsu({ width: samples.length, height: 1, data: Uint8Array.from(samples) })

  // Page 2 carries a solid square at the top centre.
  let dark = 0
  let n = 0
  const half = PAGE2_FLAG.size * 0.3
  for (let y = -half; y <= half; y += 0.25) {
    for (let x = -half; x <= half; x += 0.25) {
      if (sample(PAGE2_FLAG.x + x, PAGE2_FLAG.y + y) <= level) dark++
      n++
    }
  }
  const page = dark / n > 0.5 ? 1 : 0

  const margin = READ_SPILL * RES
  const w = Math.round(READ_BOX.width * RES) + 2 * margin
  const h = Math.round(READ_BOX.height * RES)
  const cells = SHEETS[page].map((_, i) => {
    const o = cellOrigin(i)
    const x0 = o.x + READ_BOX.x - READ_SPILL
    const data = new Uint8Array(w * h)
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        data[y * w + x] = Math.round(sample(x0 + (x + 0.5) / RES, o.y + READ_BOX.y + (y + 0.5) / RES))
      }
    }
    return { data, width: w, height: h }
  })
  return { page, markers, level, cells, margin }
}

/**
 * The ink that belongs to a box, from a cut-out reaching `margin` px past it
 * on both sides: every connected shape with at least half its ink inside the
 * box. A letter drawn over its box's edge keeps its overhang; a neighbour's
 * letter reaching in stays with the neighbour.
 */
export function ownInk(mask: Mask, margin: number): Mask {
  const { width: w, height: h, data } = mask
  const out = new Uint8Array(data.length)
  const seen = new Uint8Array(data.length)
  const right = w - margin
  for (let start = 0; start < data.length; start++) {
    if (!data[start] || seen[start]) continue
    const region: number[] = []
    const stack = [start]
    seen[start] = 1
    let inside = 0
    while (stack.length) {
      const p = stack.pop()!
      region.push(p)
      const x = p % w
      const y = (p - x) / w
      if (x >= margin && x < right) inside++
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx
          const ny = y + dy
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue
          const q = ny * w + nx
          if (data[q] && !seen[q]) {
            seen[q] = 1
            stack.push(q)
          }
        }
      }
    }
    if (inside * 2 >= region.length) for (const p of region) out[p] = 1
  }
  return { ...mask, data: out }
}
