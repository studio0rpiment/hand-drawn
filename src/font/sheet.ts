// The printable letter sheet: an A4 page in millimetres with corner markers,
// a grid of boxes with guide lines, and which character goes in which box.

export const PAGE = { width: 210, height: 297 }

/** Solid squares at the corners; their centres anchor the reading of a photo. */
export const MARKER = { size: 8, inset: 14 }
export const MARKERS = [
  { x: MARKER.inset, y: MARKER.inset },
  { x: PAGE.width - MARKER.inset, y: MARKER.inset },
  { x: PAGE.width - MARKER.inset, y: PAGE.height - MARKER.inset },
  { x: MARKER.inset, y: PAGE.height - MARKER.inset },
]
/** An extra square, top centre, printed only on page 2. */
export const PAGE2_FLAG = { x: PAGE.width / 2, y: MARKER.inset, size: 5 }

export const GRID = { x: 20, y: 30, cols: 10, rows: 7, cellW: 17, cellH: 36 }

/** Guide lines, in mm down from a box's top. The label sits above `top`. */
export const GUIDES = { top: 4.5, ascender: 7, cap: 9, x: 14.5, baseline: 25, descender: 33 }

/** Font units per millimetre: cap height (16 mm) becomes 700 units of a 1000 em. */
export const UNITS = 700 / (GUIDES.baseline - GUIDES.cap)

export type MarkName = 'acute' | 'grave' | 'circumflex' | 'dieresis' | 'tilde' | 'cedilla' | 'ring'

export interface Slot {
  /** The character drawn in this box. */
  char: string
  /** Accent marks are drawn alone and placed on letters to make accented ones. */
  mark?: MarkName
}

const chars = (s: string): Slot[] => [...s].map((char) => ({ char }))

export const MARK_CHARS: Record<MarkName, string> = {
  acute: '´',
  grave: '`',
  circumflex: 'ˆ',
  dieresis: '¨',
  tilde: '˜',
  cedilla: '¸',
  ring: '˚',
}

export const SHEETS: Slot[][] = [
  chars('ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789.,!?\'"-&'),
  [
    ...chars('()[]:;/@#%+=*_<>«»€$£¿¡ßœŒæÆøØ‘’“”–…·'),
    ...(Object.entries(MARK_CHARS) as [MarkName, string][]).map(([mark, char]) => ({ char, mark })),
  ],
]

/** Top-left of box `i` on the page, in mm. */
export function cellOrigin(i: number): { x: number; y: number } {
  return { x: GRID.x + (i % GRID.cols) * GRID.cellW, y: GRID.y + Math.floor(i / GRID.cols) * GRID.cellH }
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/** The sheet as an SVG at true size (prints 1:1 on A4). `page` is 0 or 1. */
export function sheetSvg(page: number): string {
  const slots = SHEETS[page]
  const parts: string[] = []
  parts.push(`<rect width="${PAGE.width}" height="${PAGE.height}" fill="#fff"/>`)
  for (const m of MARKERS) {
    parts.push(`<rect x="${m.x - MARKER.size / 2}" y="${m.y - MARKER.size / 2}" width="${MARKER.size}" height="${MARKER.size}" fill="#000"/>`)
  }
  if (page === 1) {
    const f = PAGE2_FLAG
    parts.push(`<rect x="${f.x - f.size / 2}" y="${f.y - f.size / 2}" width="${f.size}" height="${f.size}" fill="#000"/>`)
  }
  const guide = (y: number, x: number, color: string, w: number, dash = '') =>
    `<line x1="${x + 0.6}" x2="${x + GRID.cellW - 0.6}" y1="${y}" y2="${y}" stroke="${color}" stroke-width="${w}"${dash ? ` stroke-dasharray="${dash}"` : ''}/>`
  slots.forEach((slot, i) => {
    const { x, y } = cellOrigin(i)
    parts.push(`<rect x="${x}" y="${y}" width="${GRID.cellW}" height="${GRID.cellH}" fill="none" stroke="#d3dde7" stroke-width="0.2"/>`)
    parts.push(guide(y + GUIDES.ascender, x, '#dbe5ee', 0.15, '0.6 0.6'))
    parts.push(guide(y + GUIDES.cap, x, '#c6d6e5', 0.2, '1.2 0.8'))
    parts.push(guide(y + GUIDES.x, x, '#c6d6e5', 0.2, '1.2 0.8'))
    parts.push(guide(y + GUIDES.baseline, x, '#a9c2da', 0.3))
    parts.push(guide(y + GUIDES.descender, x, '#dbe5ee', 0.15, '0.6 0.6'))
    const label = slot.mark ? `${slot.char} ${slot.mark}` : slot.char
    parts.push(`<text x="${x + 0.8}" y="${y + 3.2}" font-size="2.6" font-family="Helvetica, Arial, sans-serif" fill="#a7b4c0">${esc(label)}</text>`)
  })
  const note =
    page === 0
      ? 'Hand Drawn · letter sheet 1 of 2 · sit each letter on the solid line; capitals reach the upper dashed line, small letters the lower one'
      : 'Hand Drawn · letter sheet 2 of 2 · draw accent marks on their own; they are placed on letters for you'
  parts.push(`<text x="${PAGE.width / 2}" y="${PAGE.height - 6}" font-size="2.4" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" fill="#a7b4c0">${esc(note)}</text>`)
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${PAGE.width}mm" height="${PAGE.height}mm" viewBox="0 0 ${PAGE.width} ${PAGE.height}">${parts.join('')}</svg>`
}
