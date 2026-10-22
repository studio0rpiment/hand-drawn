// Measuring drawn letters the way a type designer would, and the corrections
// that follow, after Jost Hochuli (Detail in Typography) and Karen Cheng
// (Designing Type):
// - space each side by its shape: straight sides get the most room, round
//   sides less, diagonal and open sides least (counters set the rhythm);
// - kern the pairs whose shapes leave holes or collide, judging the gap more
//   by the upper half of the letters, where words are read;
// - let round letters overshoot the guide lines so they look as tall as flat ones.
// Where the books give no number, the defaults here are our own and say so.

import { bbox, map, type Cmd } from './outline'

type Pt = [number, number]

/** The outline as closed polygons (curves cut into short straight pieces). */
export function polygons(cmds: Cmd[], steps = 8): Pt[][] {
  const out: Pt[][] = []
  let cur: Pt[] = []
  let px = 0
  let py = 0
  for (const c of cmds) {
    if (c.t === 'M') {
      if (cur.length > 2) out.push(cur)
      cur = [[c.x, c.y]]
    } else if (c.t === 'L') cur.push([c.x, c.y])
    else if (c.t === 'C') {
      for (let i = 1; i <= steps; i++) {
        const t = i / steps
        const u = 1 - t
        cur.push([
          u * u * u * px + 3 * u * u * t * c.x1 + 3 * u * t * t * c.x2 + t * t * t * c.x,
          u * u * u * py + 3 * u * u * t * c.y1 + 3 * u * t * t * c.y2 + t * t * t * c.y,
        ])
      }
    } else {
      if (cur.length > 2) out.push(cur)
      cur = []
    }
    if (c.t !== 'Z') {
      px = c.x
      py = c.y
    }
  }
  if (cur.length > 2) out.push(cur)
  return out
}

/** Where a horizontal line at height y crosses the outline: ink lies between pairs (even-odd). */
export function crossings(polys: Pt[][], y: number): number[] {
  const xs: number[] = []
  for (const poly of polys) {
    for (let i = 0; i < poly.length; i++) {
      const [x1, y1] = poly[i]
      const [x2, y2] = poly[(i + 1) % poly.length]
      if ((y1 <= y && y2 > y) || (y2 <= y && y1 > y)) xs.push(x1 + ((y - y1) / (y2 - y1)) * (x2 - x1))
    }
  }
  return xs.sort((a, b) => a - b)
}

/** The ink's left and right edge at each of `bands` heights from `y0` to `y1` (NaN where there is no ink). */
export interface Profile {
  y0: number
  y1: number
  left: number[]
  right: number[]
}

export function profile(cmds: Cmd[], y0: number, y1: number, bands = 40): Profile {
  const polys = polygons(cmds)
  const left: number[] = []
  const right: number[] = []
  for (let i = 0; i < bands; i++) {
    const y = y0 + ((i + 0.5) / bands) * (y1 - y0)
    const xs = crossings(polys, y)
    left.push(xs.length ? xs[0] : NaN)
    right.push(xs.length ? xs[xs.length - 1] : NaN)
  }
  return { y0, y1, left, right }
}

export type Side = 'straight' | 'round' | 'diagonal' | 'open'

/**
 * Classify one side from how far the ink edge strays from its outermost point
 * over the body of the letter (`body` is that height in font units): little
 * stray is straight; a bulge that comes back at top and bottom is round; a
 * steady lean is diagonal; much empty height (the arms of T, the right of L
 * and r) is open. (Cheng sorts letters by these side shapes; the thresholds
 * are our own.)
 */
export function classifySide(edge: number[], outward: 1 | -1, body: number): Side {
  const n = edge.length
  const present = edge.filter((v) => !Number.isNaN(v))
  if (present.length < n * 0.6) return 'open'
  const extreme = outward > 0 ? Math.max(...present) : Math.min(...present)
  // How far inward from the outermost point the edge is, band by band.
  const inset = edge.map((v) => (Number.isNaN(v) ? NaN : (extreme - v) * outward))
  const avg = (a: number[]) => {
    const p = a.filter((v) => !Number.isNaN(v))
    return p.length ? p.reduce((sum, v) => sum + v, 0) / p.length : NaN
  }
  const third = Math.floor(n / 3)
  const bottom = avg(inset.slice(0, third))
  const middle = avg(inset.slice(third, n - third))
  const top = avg(inset.slice(n - third))
  if (Number.isNaN(top) || Number.isNaN(bottom)) return 'open'
  const stray = Math.max(...present) - Math.min(...present)
  if (stray < body * 0.06) return 'straight'
  // The outermost point only in a small part of the height, the rest far inside:
  // the foot of an L, the bar of a T.
  const nearEdge = present.filter((v) => Math.abs(v - extreme) < stray * 0.3).length / present.length
  const sortedInset = inset.filter((v) => !Number.isNaN(v)).sort((a, b) => a - b)
  const medianInset = sortedInset[Math.floor(sortedInset.length / 2)]
  if (nearEdge < 0.3 && medianInset > body * 0.3) return 'open'
  if (Math.abs(top - bottom) > body * 0.15 && Math.min(top, bottom) < middle + body * 0.04) return 'diagonal'
  return 'round'
}

/**
 * Where the ink of a letter's top (or bottom) fifth sits, left to right: its
 * optical centre for placing an accent over it, or a cedilla under it (Cheng:
 * accents centre on the optical centre, not the box).
 */
export function opticalCentre(cmds: Cmd[], band: 'top' | 'bottom'): number | null {
  const b = bbox(cmds)
  if (!b) return null
  const polys = polygons(cmds)
  const h = b.yMax - b.yMin
  let sum = 0
  let weight = 0
  for (let i = 0; i < 6; i++) {
    const f = 0.02 + (i / 5) * 0.18
    const y = band === 'top' ? b.yMax - h * f : b.yMin + h * f
    const xs = crossings(polys, y)
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const len = xs[k + 1] - xs[k]
      sum += ((xs[k] + xs[k + 1]) / 2) * len
      weight += len
    }
  }
  return weight ? sum / weight : null
}

/** The width of the counter between the two stems of an n or H, measured at mid-height. */
export function counterWidth(cmds: Cmd[], midY: number): number | null {
  const xs = crossings(polygons(cmds), midY)
  // Ink runs are [xs0, xs1], [xs2, xs3], …; the counter is the gap after the first run.
  return xs.length >= 4 ? xs[2] - xs[1] : null
}

/** Shift and scale a glyph vertically about the middle of the band from `lo` to `hi`. */
export function stretchY(cmds: Cmd[], lo: number, hi: number, by: number): Cmd[] {
  const mid = (lo + hi) / 2
  return map(cmds, (x, y) => ({ x, y: mid + (y - mid) * by }))
}

/**
 * Make a round letter overshoot its guide lines by `amount` at top and bottom
 * if it doesn't already (Cheng: about 2% for an O; Hochuli: circles must pass
 * the lines to look as tall as squares). Letters drawn far off the guides are left alone.
 */
export function overshoot(cmds: Cmd[], lo: number, hi: number, amount: number): { cmds: Cmd[]; changed: boolean } {
  const b = bbox(cmds)
  if (!b) return { cmds, changed: false }
  const zone = hi - lo
  const drawn = b.yMax - b.yMin
  // Only letters drawn to about the right size: within 10% of the zone.
  if (Math.abs(drawn - zone) > zone * 0.1) return { cmds, changed: false }
  const short = b.yMax < hi + amount * 0.5 || b.yMin > lo - amount * 0.5
  if (!short) return { cmds, changed: false }
  const want = zone + 2 * amount
  const scaled = stretchY(cmds, b.yMin, b.yMax, want / drawn)
  // Centre it on the zone.
  const nb = bbox(scaled)!
  const dy = (lo + hi) / 2 - (nb.yMin + nb.yMax) / 2
  return { cmds: map(scaled, (x, y) => ({ x, y: y + dy })), changed: true }
}

/**
 * The visual gap between two letters set side by side (`advance` is the left
 * letter's width), from their facing profiles over the same heights. The
 * closest approach counts, and so does the average, with the upper half
 * weighted more (Hochuli: words are read by their upper half).
 */
export function pairGap(left: Profile, advance: number, right: Profile): { gap: number; closest: number } | null {
  let sum = 0
  let weights = 0
  let closest = Infinity
  const n = left.right.length
  for (let i = 0; i < n; i++) {
    const a = left.right[i]
    const b = right.left[i]
    if (Number.isNaN(a) || Number.isNaN(b)) continue
    const g = advance - a + b
    const w = i >= n / 2 ? 1.5 : 1
    sum += g * w
    weights += w
    closest = Math.min(closest, g)
  }
  if (!weights) return null
  return { gap: 0.5 * (sum / weights) + 0.5 * closest, closest }
}

/** Pairs worth kerning: Hochuli's list, and every pair where a side is diagonal or open (Cheng). */
export const HOCHULI_PAIRS = ['Av', 'Ay', 'AV', 'AW', 'AY', 'AT', 'LT', 'LV', 'LY', 'Ta', 'Te', 'To', 'Ty', 'Tr', 'Ve', 'Va', 'Vo', 'Wo', 'Wa', 'We', 'Ya', 'Ye', 'Yo', 'PA', 'P.', 'P,', 'T.', 'T,', 'V.', 'V,', 'Y.', 'Y,', 'F.', 'F,', 'r.', 'r,', 'y.', 'y,', 'f)', 'gy', 'gj', 'qj']

/**
 * Kerning for a pair: bring the pair's gap to the reference gap of two
 * straight-sided letters (nn or HH), by most of the difference, never letting
 * ink come closer than `minClear`. Our defaults: 60% of the difference,
 * at most 12% of the em either way.
 */
export function kernValue(gap: { gap: number; closest: number }, reference: number, minClear: number): number {
  let k = -(gap.gap - reference) * 0.6
  // No touching: a small hole is better than a collision (Hochuli).
  if (gap.closest + k < minClear) k = minClear - gap.closest
  k = Math.max(-120, Math.min(120, k))
  return Math.round(k)
}

/** A rough stroke width from a glyph's ink mask: twice the area over the edge length. */
export function strokeWidth(area: number, edge: number): number {
  return edge > 0 ? (2 * area) / edge : 0
}

/**
 * Walter Tracy's spacing method, as Karen Cheng sets it out (Designing Type,
 * pp. 220–221): measure H and O for capitals, n and o for small letters, then
 * give every other side one of a few reference values. The codes:
 *
 * Capitals: 1 the H's sidebearing · 2 slightly less than H · 3 half of H ·
 *           4 minimum · 5 the O's sidebearing
 * Small:    1 the n's left · 2 the n's right · 3 slightly more than n's left ·
 *           4 minimum · 5 the o's · 6 slightly less than o's
 *
 * Letters the method leaves to the eye (S, a, g, s, t, z, f …) are spaced
 * from their side shapes instead.
 */
export const TRACY_CAPS: Record<string, [number, number]> = {
  A: [4, 4], B: [1, 3], C: [5, 3], D: [1, 5], E: [1, 3], F: [1, 3], G: [5, 2], H: [1, 1], I: [1, 1],
  J: [4, 1], K: [1, 4], L: [1, 4], M: [2, 1], N: [2, 2], O: [5, 5], P: [1, 5], Q: [5, 5], R: [1, 4],
  T: [4, 4], U: [1, 2], V: [4, 4], W: [4, 4], X: [4, 4], Y: [4, 4], Z: [3, 3],
}
export const TRACY_LOWER: Record<string, [number, number]> = {
  b: [1, 5], c: [5, 6], d: [5, 1], e: [5, 6], h: [3, 2], i: [3, 1], j: [1, 1], k: [3, 4], l: [3, 1],
  m: [1, 2], n: [1, 2], o: [5, 5], p: [3, 5], q: [5, 1], r: [1, 4], u: [2, 2], v: [4, 4], w: [4, 4],
  x: [4, 4], y: [4, 4],
}

export interface TracyRefs {
  /** Capitals: the H's sidebearing, the O's, and the minimum. */
  H: number
  O: number
  /** Small letters: the n's left and right, the o's, and the minimum. */
  nLeft: number
  nRight: number
  o: number
  min: number
}

/**
 * Reference sidebearings from the drawn H and n counters. Cheng: each H side is
 * 25–50% of the space between its stems (her sans example: 67% between two H's,
 * a third each side); the n's left is 25–50% of its counter and its right a
 * little less (normal setting: about half the counter between two n's); O and o
 * get slightly less than H and n. We take a third of the H counter, 28% and 24%
 * of the n counter, and 80% for the round letters.
 */
export function tracyRefs(hCounter: number | null, nCounter: number | null): TracyRefs {
  const H = Math.max(15, Math.min(150, (hCounter ?? 160) * 0.34))
  const nLeft = Math.max(12, Math.min(120, (nCounter ?? 140) * 0.28))
  const nRight = Math.max(10, Math.min(110, (nCounter ?? 140) * 0.24))
  return { H, O: H * 0.8, nLeft, nRight, o: nLeft * 0.8, min: Math.max(6, nRight * 0.25) }
}

/** The sidebearing for one Tracy code. */
export function tracyValue(code: number, upper: boolean, r: TracyRefs): number {
  if (upper) return [0, r.H, r.H * 0.9, r.H * 0.5, r.min, r.O][code]
  return [0, r.nLeft, r.nRight, r.nLeft * 1.1, r.min, r.o, r.o * 0.9][code]
}

/** For letters Tracy leaves to the eye: the code that matches a measured side shape. */
export function codeForSide(side: Side, upper: boolean): number {
  if (side === 'straight') return 1
  if (side === 'round') return 5
  return upper ? 4 : side === 'open' ? 4 : 4
}

/**
 * Fixed widths for punctuation and figures (Cheng, pp. 224–225): comma, full
 * stop, colon, semicolon and single quotes in a quarter em; double quotes and
 * the question mark in about 40% of the em; the exclamation mark a little more
 * than a quarter; figures for tables in an en.
 */
export const PUNCTUATION_WIDTH: Record<string, number> = {
  ',': 250, '.': 250, ':': 250, ';': 250, "'": 250, '‘': 250, '’': 250, '·': 250,
  '"': 400, '“': 400, '”': 400, '?': 400, '¿': 400,
  '!': 280, '¡': 280,
}
export const FIGURE_WIDTH = 500

/** Commonly kerned pairs from Cheng's table (p. 227), where the scan could be read. */
export const CHENG_PAIRS = [
  'AC', 'AG', 'AO', 'AQ', 'AT', 'AU', 'AV', 'AW', 'AY', 'BA', 'BE', 'BL', 'BR', 'BU', 'BV', 'BW', 'BY',
  'CA', 'CO', 'CR', 'DA', 'DE', 'DI', 'DL', 'DM', 'DN', 'DO', 'DP', 'DR', 'DU', 'DV', 'DW', 'DY', 'EC', 'EO',
  'FA', 'FC', 'FG', 'FO', 'GE', 'GO', 'GR', 'GU', 'HO', 'IC', 'IG', 'IO', 'JA', 'JO', 'KO', 'LC', 'LG', 'LO',
  'LT', 'LU', 'LV', 'LW', 'LY', 'MG', 'MO', 'NC', 'NG', 'NO', 'OA', 'OB', 'OD', 'OE', 'OF', 'OH', 'OI', 'OK',
  'OL', 'OM', 'ON', 'OP', 'OR', 'OT', 'OU', 'OV', 'OW', 'OX', 'OY', 'PA', 'PE', 'PL', 'PO', 'PP', 'PU', 'PY',
  'QU', 'RC', 'RG', 'RO', 'RT', 'RU', 'RV', 'RW', 'RY', 'SI', 'SM', 'ST', 'SU', 'TA', 'TC', 'TO', 'UA', 'UC',
  'UG', 'UO', 'US', 'VA', 'VC', 'VG', 'VO', 'VS', 'WA', 'WC', 'WG', 'WO', 'YA', 'YC', 'YO', 'YS',
  'Ac', 'Ad', 'Ae', 'Ag', 'Ao', 'Ap', 'Aq', 'At', 'Au', 'Av', 'Aw', 'Ay', 'Bb', 'Bi', 'Bk', 'Bl', 'Br', 'Bu', 'By',
  'Ca', 'Cr', 'Da', 'Eu', 'Ev', 'Fa', 'Fe', 'Ff', 'Fi', 'Fo', 'Fr', 'Ft', 'Fu', 'Fy', 'Gu', 'He', 'Ho', 'Hu', 'Hy',
  'Ic', 'Id', 'Iq', 'Io', 'It', 'Ja', 'Je', 'Jo', 'Ju', 'Ke', 'Ko', 'Ku', 'Kv', 'Kw', 'Ky', 'Lu', 'Ly',
  'Ma', 'Mc', 'Md', 'Me', 'Mo', 'Nu', 'Na', 'Ne', 'Ni', 'No', 'Oa', 'Ob', 'Oh', 'Ok', 'Ol', 'Pa', 'Pe', 'Po',
  'Rd', 'Re', 'Ro', 'Rt', 'Ru', 'Si', 'Sp', 'Su', 'Ta', 'Tc', 'Te', 'Ti', 'To', 'Tr', 'Ts', 'Tu', 'Tw', 'Ty',
  'Ua', 'Ug', 'Um', 'Un', 'Up', 'Us', 'Va', 'Ve', 'Vi', 'Vo', 'Vr', 'Vu', 'Vy', 'Wa', 'Wd', 'We', 'Wi', 'Wm',
  'Wr', 'Wt', 'Wu', 'Wy', 'Xa', 'Xe', 'Xo', 'Xu', 'Xy', 'Yd', 'Ye', 'Yi', 'Yp', 'Yu', 'Yv',
  'ac', 'ad', 'ae', 'ag', 'ap', 'af', 'at', 'au', 'av', 'aw', 'ay', 'bl', 'br', 'bu', 'by', 'ca', 'ch', 'ck',
  'da', 'dc', 'de', 'dg', 'do', 'dt', 'du', 'dv', 'dw', 'dy', 'ea', 'ei', 'el', 'em', 'en', 'ep', 'er', 'et', 'eu',
  'ev', 'ew', 'ey', 'fa', 'fe', 'ff', 'fi', 'fl', 'fo', 'ga', 'ge', 'gh', 'gl', 'go', 'gg', 'hc', 'hd', 'he', 'hg',
  'ho', 'hp', 'ht', 'hu', 'hv', 'hw', 'hy', 'ic', 'id', 'ie', 'ig', 'io', 'ip', 'it', 'iu', 'iv', 'ja', 'je', 'jo', 'ju',
  'B.', 'C.', 'D.', 'F.', 'J.', 'N.', 'O.', 'P.', 'R.', 'S.', 'T.', 'U.', 'V.', 'W.', 'Y.',
  'F,', 'P,', 'T,', 'V,', 'W,', 'Y,', 'F:', 'P:', 'T:', 'V:', 'W:', 'Y:', 'F-', 'P-', 'T-', 'V-', 'W-', 'Y-',
]
