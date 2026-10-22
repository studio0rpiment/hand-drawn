// Tracing the cut-out boxes of a read sheet into outlines (needs the browser's potrace).

import { despeckle, lineWeight, threshold } from '../clean'
import type { Mask } from '../image'
import { trace } from '../trace'
import { strokeWidth } from './metrics'
import { fromTraced, type Cmd } from './outline'
import { dropSpill, type SheetRead } from './read'
import { SHEETS } from './sheet'
import type { FontStyle } from './style'

/** The settings tracing depends on; spacing, shape and accents don't need a retrace. */
export function traceKey(s: FontStyle): string {
  return JSON.stringify([s.ink, s.trace])
}

export interface TracedSheet {
  outlines: Map<string, Cmd[]>
  /** Letters thickened or thinned to match their group's weight. */
  balanced: string[]
}

/** Ink area and edge length (pixels with paper beside them). */
function inkStats(m: Mask): { area: number; edge: number } {
  const { width: w, height: h, data } = m
  let area = 0
  let edge = 0
  for (let i = 0; i < data.length; i++) {
    if (!data[i]) continue
    area++
    const x = i % w
    const y = (i - x) / w
    if (x === 0 || y === 0 || x === w - 1 || y === h - 1 || !data[i - 1] || !data[i + 1] || !data[i - w] || !data[i + w]) edge++
  }
  return { area, edge }
}

const group = (c: string) => (/[0-9]/.test(c) ? 'figures' : c !== c.toLowerCase() ? 'caps' : /[a-z]/.test(c) ? 'lower' : null)

/** Outlines for every box of the page that has a drawing in it. */
export async function traceSheet(read: SheetRead, s: FontStyle): Promise<TracedSheet> {
  const level = s.ink.cutoff || read.level
  const slots = SHEETS[read.page]
  const masks = new Map<string, Mask>()
  for (let i = 0; i < slots.length; i++) {
    let mask = threshold(read.cells[i], level)
    mask = dropSpill(despeckle(mask, s.ink.speck))
    mask = lineWeight(mask, s.ink.weight)
    if (mask.data.some((v) => v)) masks.set(slots[i].char, mask)
  }

  // One family, one weight (Cheng): letters much heavier or lighter than the
  // median of their group (capitals, small letters, figures) are evened out,
  // by at most 3 px. The 12% tolerance is our own.
  const balanced: string[] = []
  if (s.ink.balance) {
    const widths = new Map([...masks].map(([c, m]) => {
      const st = inkStats(m)
      return [c, strokeWidth(st.area, st.edge)] as const
    }))
    for (const g of ['caps', 'lower', 'figures']) {
      const members = [...widths].filter(([c]) => group(c) === g)
      if (members.length < 4) continue
      const sorted = members.map(([, w]) => w).sort((a, b) => a - b)
      const median = sorted[Math.floor(sorted.length / 2)]
      for (const [c, w] of members) {
        if (Math.abs(w - median) <= median * 0.12) continue
        const px = Math.max(-3, Math.min(3, Math.round((median - w) / 2)))
        if (!px) continue
        masks.set(c, lineWeight(masks.get(c)!, px))
        balanced.push(c)
      }
    }
  }

  const outlines = new Map<string, Cmd[]>()
  for (const [char, mask] of masks) {
    const traced = await trace(mask, { ignore: 4, smoothness: s.trace.smoothness, simplify: s.trace.simplify })
    const cmds = fromTraced(traced.paths.join(''))
    if (cmds.length) outlines.set(char, cmds)
  }
  return { outlines, balanced }
}
