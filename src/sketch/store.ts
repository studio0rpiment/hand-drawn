// Sketch collections kept in this browser (IndexedDB) between visits: names,
// order, favourites, tuning, style and the flattened photos. Only when this
// browser allowed Hand Drawn to keep anything (consent.ts) and "Keep
// collections in this browser" is ticked; withdrawing deletes it all.
// Nothing here ever leaves the browser.

import { KEEP_SKETCHES, SKETCH_DB, storageAllowed } from '../ui/consent'
import type { Order } from './collection'
import type { DrawingTune } from './drawing'
import type { SketchStyle } from './style'

const STORE = 'collections'

export interface KeptSketch {
  id: number
  name: string
  named: boolean
  photoName: string
  pick: number
  added: number
  place: number
  favourite: boolean
  date: number | null
  tune: DrawingTune
  lineUp: number | 'favourite' | null
  /** The flattened photo, JPEG. */
  photo: Blob
}

export interface KeptCollection {
  id: number
  name: string
  named: boolean
  order: Order
  added: number
  style: SketchStyle | null
  active: number | null
  /** When it was last kept (ms), so the latest opens first. */
  saved: number
  sketches: KeptSketch[]
}

/** Keeping is on: allowed in this browser, and asked for on the Sketches tab. */
export function keepingOn(): boolean {
  if (!storageAllowed()) return false
  try {
    return localStorage.getItem(KEEP_SKETCHES) === '1'
  } catch {
    return false
  }
}

/** Turn keeping on (only once storage is allowed) or off; off deletes every kept collection. */
export async function setKeeping(on: boolean) {
  try {
    if (on && storageAllowed()) localStorage.setItem(KEEP_SKETCHES, '1')
    else localStorage.removeItem(KEEP_SKETCHES)
  } catch {
    // Storage blocked: nothing is kept either way.
  }
  if (!on) await deleteAll()
}

function db(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(SKETCH_DB, 1)
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'id' })
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

async function run<T>(mode: IDBTransactionMode, work: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const d = await db()
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = d.transaction(STORE, mode)
      const req = work(tx.objectStore(STORE))
      tx.oncomplete = () => resolve(req.result)
      tx.onerror = () => reject(tx.error)
      tx.onabort = () => reject(tx.error)
    })
  } finally {
    d.close()
  }
}

/** Keep one collection (replacing what was kept of it). Does nothing unless keeping is on. */
export async function keep(c: KeptCollection) {
  if (!keepingOn()) return
  await run('readwrite', (s) => s.put(c))
}

/** Every kept collection, the latest first; none unless keeping is on. */
export async function keptCollections(): Promise<KeptCollection[]> {
  if (!keepingOn()) return []
  try {
    const all = await run('readonly', (s) => s.getAll() as IDBRequest<KeptCollection[]>)
    return all.sort((a, b) => b.saved - a.saved)
  } catch {
    return []
  }
}

export async function forget(id: number) {
  if (!keepingOn()) return
  await run('readwrite', (s) => s.delete(id))
}

/** Delete the whole database. */
export function deleteAll(): Promise<void> {
  return new Promise((resolve) => {
    try {
      const req = indexedDB.deleteDatabase(SKETCH_DB)
      req.onsuccess = req.onerror = req.onblocked = () => resolve()
    } catch {
      resolve()
    }
  })
}
