// Whether this browser may keep anything at all. Hand Drawn stores nothing
// until the person allows it, and the only thing it ever keeps is saved styles.
// No cookies, ever. Declining is not stored either (that would be storing
// something), so the question comes back on the next visit.

const KEY = 'hand-drawn.consent'
/** Bump when the wording of what is stored changes; people are asked again. */
export const CONSENT_VERSION = 1
const EVENT = 'hand-drawn-storage'

/** Everything Hand Drawn can put in browser storage, for the policy and for clearing. */
export const STORED: { key: string; purpose: string }[] = [
  { key: KEY, purpose: 'privacy.store-consent' },
  { key: 'sketch-to-mark.styles', purpose: 'privacy.store-icon' },
  { key: 'sketch-to-mark.styles.current', purpose: 'privacy.store-icon-current' },
  { key: 'sketch-to-mark.texture-styles', purpose: 'privacy.store-texture' },
  { key: 'sketch-to-mark.texture-styles.current', purpose: 'privacy.store-texture-current' },
  { key: 'sketch-to-mark.font-styles', purpose: 'privacy.store-font' },
  { key: 'sketch-to-mark.font-styles.current', purpose: 'privacy.store-font-current' },
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
      for (const { key } of STORED) localStorage.removeItem(key)
    }
  } catch {
    // Storage blocked (private window, settings): nothing is kept either way.
  }
  window.dispatchEvent(new CustomEvent(EVENT, { detail: allowed }))
}

export function onStorageChange(fn: (allowed: boolean) => void) {
  window.addEventListener(EVENT, (e) => fn((e as CustomEvent<boolean>).detail))
}

/** What is in storage right now, from the list above. */
export function storedNow(): string[] {
  try {
    return STORED.map((s) => s.key).filter((k) => localStorage.getItem(k) !== null)
  } catch {
    return []
  }
}
