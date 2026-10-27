// Letters drawn freehand, on any paper: the Scan view splits the page into
// drawings, each is placed on its letter (dragged there, or filled in from
// letters typed in drawing order), and here they are sized and set on the
// baseline. With no guide lines to go by, one scale serves every drawing from
// the same photo, so the hand's own proportions between letters stay.

import { inkBox, type Box } from '../clean'
import type { Mask } from '../image'
import { DESCENDER } from './assemble'
import { CAP_HEIGHT, X_HEIGHT, fromTraced, type Cmd } from './outline'

export interface Drawing {
  mask: Mask
  /** Where it was on the page (for reading order). */
  box: Box
  /** The photo it came from: drawings from one photo share a scale. */
  source: object
}

/**
 * Reading order: rows from the top, each left to right. A drawing joins the
 * row whose height range its middle falls in.
 */
export function readingOrder<T extends { box: Box }>(drawings: T[]): T[] {
  const rows: { top: number; bottom: number; items: T[] }[] = []
  for (const d of [...drawings].sort((a, b) => a.box.y - b.box.y)) {
    const mid = d.box.y + d.box.height / 2
    const row = rows.find((r) => mid >= r.top && mid <= r.bottom)
    if (row) {
      row.items.push(d)
      row.bottom = Math.max(row.bottom, d.box.y + d.box.height)
    } else rows.push({ top: d.box.y, bottom: d.box.y + d.box.height, items: [d] })
  }
  return rows.flatMap((r) => r.items.sort((a, b) => a.box.x - b.box.x))
}

/** Where a character sits, in font units: its bottom, top or middle on a line. */
type Anchor = { bottom: number } | { top: number } | { middle: number }

const HIGH = '\'"‘’“”`´ˆ¨˜˚°ªº¹²³^*'
const MIDDLE = '-–—·•×÷+=~<>«»‹›±←→'
const ROUND = '()[]{}|/\\'
const XLOW = 'acemnorsuvwxzæœø'

export function anchor(c: string): Anchor {
  if ('gpqy'.includes(c)) return { top: X_HEIGHT }
  if (c === 'j') return { bottom: DESCENDER * 0.8 }
  if (',‚„'.includes(c)) return { top: 100 }
  if (c === ';') return { bottom: -150 }
  if (c === '_') return { top: -60 }
  if (HIGH.includes(c)) return { top: CAP_HEIGHT }
  if (MIDDLE.includes(c)) return { middle: X_HEIGHT / 2 }
  if (ROUND.includes(c)) return { middle: (CAP_HEIGHT + DESCENDER / 2) / 2 }
  return { bottom: 0 }
}

/** The height a character of this kind has in the font, for sizing a photo's drawings. */
const nominal = (c: string) => (XLOW.includes(c) ? X_HEIGHT : /[A-Z0-9]/.test(c) ? CAP_HEIGHT : null)

/**
 * Font units per pixel for each photo: its capitals, figures and small
 * letters without ascenders at their usual heights, taken by the median so
 * one odd drawing doesn't set the size.
 */
export function scales(placed: Map<string, Drawing>): Map<object, number> {
  const bySource = new Map<object, number[]>()
  for (const [c, d] of placed) {
    const want = nominal(c)
    const b = inkBox(d.mask, 0)
    if (!want || !b) continue
    const list = bySource.get(d.source) ?? []
    list.push(want / b.height)
    bySource.set(d.source, list)
  }
  const out = new Map<object, number>()
  for (const [source, ratios] of bySource) {
    const sorted = ratios.sort((a, b) => a - b)
    const m = sorted.length / 2
    out.set(source, sorted.length % 2 ? sorted[Math.floor(m)] : (sorted[m - 1] + sorted[m]) / 2)
  }
  return out
}

/** A traced drawing (path data in its mask's pixels) as the outline of character `c`. */
export function placeOutline(c: string, d: Drawing, paths: string, perPx: number | undefined): Cmd[] {
  const b = inkBox(d.mask, 0)
  if (!b) return []
  // A photo with none of the letters that set a size: the drawing at its own kind's height.
  const f = perPx ?? (nominal(c) ?? CAP_HEIGHT) / b.height
  const a = anchor(c)
  const [py, uy] =
    'bottom' in a ? [b.y + b.height, a.bottom] : 'top' in a ? [b.y, a.top] : [b.y + b.height / 2, a.middle]
  return fromTraced(paths, (x, y) => ({ x: (x - b.x) * f, y: (py - y) * f + uy }))
}
