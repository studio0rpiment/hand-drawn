// Whether this browser may keep anything at all. Hand Drawn stores nothing
// until the person allows it. Once allowed it keeps saved styles, and sketch
// collections only when "Keep collections in this browser" is also ticked on
// the Sketches tab (those go in IndexedDB, photos included). No cookies, ever.
// Declining is not stored either (that would be storing something), so the
// question comes back on the next visit. Withdrawing deletes everything.

const KEY = 'hand-drawn.consent'
/** Bump when the wording of what is stored changes; people are asked again. */
export const CONSENT_VERSION = 2
const EVENT = 'hand-drawn-storage'
/** Set when sketch collections are to be kept between visits. */
export const KEEP_SKETCHES = 'hand-drawn.sketch-keep'
/** The IndexedDB database the kept sketch collections are in. */
export const SKETCH_DB = 'hand-drawn.sketches'

/** Everything Hand Drawn can put in browser storage, for the policy and for clearing; `db` is an IndexedDB database, not a local storage key. */
export const STORED: { key: string; purpose: string; db?: boolean }[] = [
  { key: KEY, purpose: 'privacy.store-consent' },
  { key: 'sketch-to-mark.styles', purpose: 'privacy.store-icon' },
  { key: 'sketch-to-mark.styles.current', purpose: 'privacy.store-icon-current' },
  { key: 'sketch-to-mark.texture-styles', purpose: 'privacy.store-texture' },
  { key: 'sketch-to-mark.texture-styles.current', purpose: 'privacy.store-texture-current' },
  { key: 'sketch-to-mark.font-styles', purpose: 'privacy.store-font' },
  { key: 'sketch-to-mark.font-styles.current', purpose: 'privacy.store-font-current' },
  { key: 'hand-drawn.sketch-styles', purpose: 'privacy.store-sketch' },
  { key: 'hand-drawn.sketch-styles.current', purpose: 'privacy.store-sketch-current' },
  { key: KEEP_SKETCHES, purpose: 'privacy.store-sketch-keep' },
  { key: SKETCH_DB, purpose: 'privacy.store-sketch-db', db: true },
]

/** Has this browser allowed Hand Drawn to keep styles? */
export function storageAllowed(): boolean {
  try {
    const c = JSON.parse(localStorage.getItem(KEY) ?? 'null') as { version?: number; allowed?: boolean } | null
    return c?.version === CONSENT_VERSION && c.allowed === true
  } catch {
    return false
  }
}

/** Allow keeping styles, or withdraw: withdrawing deletes everything Hand Drawn stored. */
export function setStorageAllowed(allowed: boolean) {
  try {
    if (allowed) {
      localStorage.setItem(KEY, JSON.stringify({ version: CONSENT_VERSION, allowed: true, at: new Date().toISOString() }))
    } else {
      for (const { key, db } of STORED) if (!db) localStorage.removeItem(key)
    }
  } catch {
    // Storage blocked (private window, settings): nothing is kept either way.
  }
  // The kept sketch collections go too.
  if (!allowed) {
    try {
      indexedDB.deleteDatabase(SKETCH_DB)
    } catch {
      // No IndexedDB here: nothing was kept in it.
    }
  }
  window.dispatchEvent(new CustomEvent(EVENT, { detail: allowed }))
}

export function onStorageChange(fn: (allowed: boolean) => void) {
  window.addEventListener(EVENT, (e) => fn((e as CustomEvent<boolean>).detail))
}

/** What is in storage right now, from the list above (the sketch database while keeping is on). */
export function storedNow(): string[] {
  try {
    return STORED.filter((s) => (s.db ? localStorage.getItem(KEEP_SKETCHES) !== null : localStorage.getItem(s.key) !== null)).map((s) => s.key)
  } catch {
    return []
  }
}
