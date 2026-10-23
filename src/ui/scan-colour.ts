// The scanned drawing's colours, set in the Scan view and followed by every
// output that has "Colours from the scan" on.

export interface ScanColours {
  ink: string
  /** null: transparent. */
  paper: string | null
}

let current: ScanColours = { ink: '#1d1a24', paper: null }
const listeners = new Set<(c: ScanColours) => void>()

export const scanColours = () => current

export function setScanColours(next: ScanColours) {
  if (next.ink === current.ink && next.paper === current.paper) return
  current = next
  listeners.forEach((f) => f(current))
}

export function onScanColours(f: (c: ScanColours) => void) {
  listeners.add(f)
}
