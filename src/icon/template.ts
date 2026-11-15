// The printable icon template: four A4 pages of named, empty boxes for the
// common icons of Kevin's hand-icons set (its trace sheets, without the light
// guide drawings), with the letter sheet's corner squares, so a photo of a
// page is placed exactly and each box read as the icon named on it.

import { t } from '../text'

export const PAGE = { width: 210, height: 297 }

/** Solid corner squares, as on the letter sheet: their centres place the page in a photo. */
export const MARKER = { size: 8, inset: 14 }

/**
 * Small squares along the top edge tell the pages apart: none on page 1, one
 * in the middle on page 2, two either side of it on page 3, all three on page 4.
 */
export const FLAG = { y: MARKER.inset, size: 5 }
export const PAGE_FLAGS: number[][] = [[], [105], [85, 125], [85, 105, 125]]

export const GRID = { x: 21, y: 30, cols: 6, rows: 8, cell: 28 }

/** Inside a box, the part that is read (mm from its top-left): below the name, inside the border. */
export const READ_BOX = { x: 1, y: 4, width: GRID.cell - 2, height: GRID.cell - 5 }

/** The set's clear space round an icon (12%), shown as a faint dashed square. */
const PADDING = 0.12

/** The common icons by category, in the order of hand-icons' trace sheets. */
const CATEGORIES: [string, string[]][] = [
  ['general', ["home", "briefcase", "pie-chart", "archive", "credit-card", "cart", "wallet", "bank", "sun", "moon", "palette", "flask", "basket", "shopping-bag", "activity", "umbrella", "calendar", "filter", "first-aid", "clock", "alarm", "stopwatch", "tag", "gift"]],
  ['status', ["lock", "unlock", "eye", "eye-off", "key", "pin", "bolt", "shield", "info", "warning", "checkbox", "star", "gem", "bell", "bell-ring", "bell-off", "heart", "flame", "power", "bulb", "award", "hourglass", "toggle-on", "toggle-off", "graduation", "bookmark", "book"]],
  ['communication', ["mail", "mail-open", "contact", "user", "user-add", "thumbs-up · mv = down", "chat", "chat-dots", "phone", "send", "share", "forward · mh = reply", "megaphone", "external-link", "at"]],
  ['media', ["headphones", "play", "pause", "stop", "fast-forward · mh = rewind", "skip · mh = back", "mic", "mic-off", "music", "volume", "mute", "shuffle", "film", "disc", "image", "camera", "video"]],
  ['files', ["file", "file-text", "clipboard", "folder", "folder-open", "cloud", "cloud-upload", "cloud-download", "copy", "upload", "download", "save", "trash"]],
  ['interface', ["arrow · rotates", "chevron · rotates", "check", "close", "plus", "minus", "menu", "list", "more · r90 = vertical", "search", "zoom-in", "zoom-out", "refresh", "sync", "history", "swap", "sort", "move", "fullscreen", "collapse", "expand", "link", "paperclip", "broadcast", "bluetooth", "log-in", "log-out", "pencil", "edit", "grid", "apps", "settings", "sliders", "layers", "backspace", "code", "browser", "sidebar", "notification", "slides", "sticky-note", "cube", "bar-chart", "pen-tool", "brush", "wrench"]],
  ['devices and places', ["monitor", "phone-device", "watch", "gamepad", "server", "chip", "mouse", "binoculars", "battery", "map", "map-pin", "compass", "locate", "navigate", "globe", "target"]],
  ['pointer and touch', ["pointer", "pointer-click", "pointer-hold", "pointer-drag", "pointer-scroll", "tap", "tap-hold", "swipe-left", "swipe-right", "swipe-up", "swipe-down"]],
]

export interface TemplateIcon {
  /** As printed on the box, with any note: "thumbs-up · mv = down". */
  label: string
  /** The icon's name, for its files: "thumbs-up". */
  name: string
  category: string
}

const ALL: TemplateIcon[] = CATEGORIES.flatMap(([category, names]) =>
  names.map((label) => ({ label, name: label.split(' · ')[0], category })),
)

const PER_PAGE = GRID.cols * GRID.rows

/** The icons on each page, in box order (left to right, top to bottom). */
export const TEMPLATE_PAGES: TemplateIcon[][] = Array.from({ length: Math.ceil(ALL.length / PER_PAGE) }, (_, p) =>
  ALL.slice(p * PER_PAGE, (p + 1) * PER_PAGE),
)

/** Top-left of box `i` on a page, in mm. */
export function boxOrigin(i: number): { x: number; y: number } {
  return { x: GRID.x + (i % GRID.cols) * GRID.cell, y: GRID.y + Math.floor(i / GRID.cols) * GRID.cell }
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const LABEL = '#a7b4c0'
const GUIDE = '#c6d6e5'
const FAINT = '#e3eaf1'
const text = (x: number, y: number, s: string, size: number, color = LABEL, anchor = 'start') =>
  `<text x="${x}" y="${y}" font-size="${size}" text-anchor="${anchor}" font-family="Helvetica, Arial, sans-serif" fill="${color}">${esc(s)}</text>`
const square = (x: number, y: number, s: number) => `<rect x="${x - s / 2}" y="${y - s / 2}" width="${s}" height="${s}" fill="#000"/>`

/** A page of the template as an SVG at true size (prints 1:1 on A4). */
export function iconSheetSvg(page: number): string {
  const icons = TEMPLATE_PAGES[page]
  const parts: string[] = [`<rect width="${PAGE.width}" height="${PAGE.height}" fill="#fff"/>`]
  const far = { x: PAGE.width - MARKER.inset, y: PAGE.height - MARKER.inset }
  for (const [x, y] of [[MARKER.inset, MARKER.inset], [far.x, MARKER.inset], [far.x, far.y], [MARKER.inset, far.y]]) {
    parts.push(square(x, y, MARKER.size))
  }
  for (const x of PAGE_FLAGS[page]) parts.push(square(x, FLAG.y, FLAG.size))
  const categories = [...new Set(icons.map((i) => i.category))].join(' · ')
  parts.push(text(GRID.x, GRID.y - 4, t('icon.template-heading', { categories }).toUpperCase(), 3, '#7d8b98'))
  const pad = GRID.cell * PADDING
  icons.forEach((icon, i) => {
    const { x, y } = boxOrigin(i)
    parts.push(`<rect x="${x}" y="${y}" width="${GRID.cell}" height="${GRID.cell}" fill="none" stroke="${GUIDE}" stroke-width="0.2"/>`)
    parts.push(
      `<rect x="${x + pad}" y="${y + pad}" width="${GRID.cell - 2 * pad}" height="${GRID.cell - 2 * pad}" fill="none" stroke="${FAINT}" stroke-width="0.2" stroke-dasharray="1 0.8"/>`,
    )
    parts.push(text(x + 1.2, y + 2.6, icon.label, 2.1))
  })
  parts.push(text(PAGE.width / 2, PAGE.height - 6, t('icon.template-note', { page: page + 1, pages: TEMPLATE_PAGES.length }), 2.3, LABEL, 'middle'))
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${PAGE.width}mm" height="${PAGE.height}mm" viewBox="0 0 ${PAGE.width} ${PAGE.height}">${parts.join('')}</svg>`
}

/**
 * Which page a photo shows, from its top-edge squares. `dark(x)` says whether
 * the spot at x mm along the top marker line is printed black.
 */
export function pageFromFlags(dark: (x: number) => boolean): number {
  const spots = [...new Set(PAGE_FLAGS.flat())]
  const marked = new Set(spots.filter(dark))
  const which = PAGE_FLAGS.findIndex((f) => f.length === marked.size && f.every((x) => marked.has(x)))
  return which < 0 ? 0 : which
}
