// A collection's order, its file names, its collection.json, and reading a
// downloaded collection's zip back in. Pure, no DOM.

import { slug } from '../icon/style'
import type { DrawingTune } from './drawing'
import { FORMATS_FOR, sketchFileName, type Kind } from './style'

export const ORDERS = ['uploaded', 'name', 'favourites', 'date', 'own'] as const
export type Order = (typeof ORDERS)[number]

/** What the order needs to know of a sketch. */
export interface Placed {
  name: string
  /** Its place in upload order. */
  added: number
  /** Its place once dragged ("own" order). */
  place: number
  favourite: boolean
  /** When the photo was taken, as far as the file says (ms), or null. */
  date: number | null
}

/** The sketches in the collection's order; numbers follow this order. */
export function ordered<T extends Placed>(sketches: T[], order: Order): T[] {
  const by = (f: (a: T, b: T) => number) => [...sketches].sort((a, b) => f(a, b) || a.added - b.added)
  switch (order) {
    case 'name':
      return by((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }))
    case 'favourites':
      return by((a, b) => Number(b.favourite) - Number(a.favourite))
    case 'date':
      return by((a, b) => (a.date ?? Infinity) - (b.date ?? Infinity))
    case 'own':
      return by((a, b) => a.place - b.place)
    default:
      return by(() => 0)
  }
}

/** `list` with the item at `from` moved to `to`. */
export function moved<T>(list: T[], from: number, to: number): T[] {
  const out = [...list]
  const [item] = out.splice(from, 1)
  out.splice(Math.max(0, Math.min(out.length, to)), 0, item)
  return out
}

/** Names told apart: a second "side view" becomes "side view 2". */
export function distinct(names: string[]): string[] {
  const seen = new Map<string, number>()
  return names.map((name) => {
    const k = slug(name)
    const n = (seen.get(k) ?? 0) + 1
    seen.set(k, n)
    return n > 1 ? `${name} ${n}` : name
  })
}

/** The files one sketch downloads as, in the formats picked that its kind has. */
export function sketchFiles(collection: string, n: number, sketch: string, kind: Kind, picked: readonly string[]): string[] {
  const stem = sketchFileName(collection, n, sketch, kind)
  return FORMATS_FOR[kind].filter((f) => picked.includes(f)).map((f) => `${stem}.${f}`)
}

/** collection.json: what the collection is, in order, so the zip opens again as a collection. */
export interface CollectionJson {
  app: 'hand-drawn'
  kind: 'sketch-collection'
  version: 1
  name: string
  order: Order
  sketches: {
    n: number
    name: string
    photo: string
    /** The flattened photo in the zip's photos/ folder, when included. */
    file: string | null
    date: string | null
    favourite: boolean
    tune: DrawingTune
    /** The number of the sketch it is lined up with, or null. */
    lineUp: number | null
  }[]
}

/** Read an opened collection.json; null when it isn't one. */
export function readCollectionJson(raw: unknown): CollectionJson | null {
  const r = raw as Partial<CollectionJson> | null
  if (!r || r.app !== 'hand-drawn' || r.kind !== 'sketch-collection' || !Array.isArray(r.sketches)) return null
  const num = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) ? v : d)
  return {
    app: 'hand-drawn',
    kind: 'sketch-collection',
    version: 1,
    name: typeof r.name === 'string' ? r.name.slice(0, 80) : 'collection',
    order: ORDERS.includes(r.order as Order) ? (r.order as Order) : 'uploaded',
    sketches: r.sketches.map((s, i) => {
      const t = (s?.tune ?? {}) as Partial<DrawingTune>
      return {
        n: num(s?.n, i + 1),
        name: typeof s?.name === 'string' ? s.name.slice(0, 80) : `sketch ${i + 1}`,
        photo: typeof s?.photo === 'string' ? s.photo.slice(0, 120) : '',
        file: typeof s?.file === 'string' ? s.file : null,
        date: typeof s?.date === 'string' ? s.date : null,
        favourite: s?.favourite === true,
        tune: {
          rotate: num(t.rotate, 0),
          spread: num(t.spread, 0),
          margin: num(t.margin, 0.04),
          leftOut: Array.isArray(t.leftOut) ? t.leftOut.filter((p) => p && typeof p.x === 'number' && typeof p.y === 'number').map((p) => ({ x: p.x, y: p.y })) : [],
        },
        lineUp: typeof s?.lineUp === 'number' ? s.lineUp : null,
      }
    }),
  }
}

/**
 * The files in a zip whose entries are stored, not compressed (as Hand
 * Drawn writes them; compressed entries are skipped). Read from the central
 * directory, so sizes are right even when the local headers leave them out.
 */
export function unzip(bytes: Uint8Array): Map<string, Uint8Array> {
  const out = new Map<string, Uint8Array>()
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  let end = -1
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) {
    if (v.getUint32(i, true) === 0x06054b50) {
      end = i
      break
    }
  }
  if (end < 0) return out
  const count = v.getUint16(end + 10, true)
  let p = v.getUint32(end + 16, true)
  const dec = new TextDecoder()
  for (let k = 0; k < count && p + 46 <= bytes.length; k++) {
    if (v.getUint32(p, true) !== 0x02014b50) break
    const method = v.getUint16(p + 10, true)
    const size = v.getUint32(p + 20, true)
    const nameLen = v.getUint16(p + 28, true)
    const extraLen = v.getUint16(p + 30, true)
    const commentLen = v.getUint16(p + 32, true)
    const local = v.getUint32(p + 42, true)
    const name = dec.decode(bytes.subarray(p + 46, p + 46 + nameLen))
    p += 46 + nameLen + extraLen + commentLen
    if (method !== 0 || name.endsWith('/')) continue
    const start = local + 30 + v.getUint16(local + 26, true) + v.getUint16(local + 28, true)
    out.set(name, bytes.subarray(start, start + size))
  }
  return out
}
