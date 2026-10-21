// Tracing the cut-out boxes of a read sheet into outlines (needs the browser's potrace).

import { despeckle, lineWeight, threshold } from '../clean'
import { trace } from '../trace'
import { fromTraced, type Cmd } from './outline'
import { dropSpill, type SheetRead } from './read'
import { SHEETS } from './sheet'
import type { FontStyle } from './style'

/** The settings tracing depends on; spacing, shape and accents don't need a retrace. */
export function traceKey(s: FontStyle): string {
  return JSON.stringify([s.ink, s.trace])
}

/** Outlines for every box of the page that has a drawing in it. */
export async function traceSheet(read: SheetRead, s: FontStyle): Promise<Map<string, Cmd[]>> {
  const out = new Map<string, Cmd[]>()
  const level = s.ink.cutoff || read.level
  const slots = SHEETS[read.page]
  for (let i = 0; i < slots.length; i++) {
    let mask = threshold(read.cells[i], level)
    mask = dropSpill(despeckle(mask, s.ink.speck))
    mask = lineWeight(mask, s.ink.weight)
    if (!mask.data.some((v) => v)) continue
    const traced = await trace(mask, { ignore: 4, smoothness: s.trace.smoothness, simplify: s.trace.simplify })
    const cmds = fromTraced(traced.paths.join(''))
    if (cmds.length) out.set(slots[i].char, cmds)
  }
  return out
}
