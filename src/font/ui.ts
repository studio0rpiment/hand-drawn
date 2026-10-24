// The Font view: print the letter sheet, read photos of it, and build a font
// under a font style, with a live type preview and OTF export.

import { flattenLight } from '../clean'
import { toGray, type GrayImage, type RGBAImage } from '../image'
import { slug } from '../icon/style'
import { buildFields, fixed, plain, type FieldGroup } from '../ui/fields'
import { StyleBook, styleBox } from '../ui/styles'
import { flash } from '../ui/hand'
import { assemble, ASCENDER, DESCENDER, type BuiltGlyph, type Check } from './assemble'
import { traceKey, traceSheet } from './make'
import { COMPOSITES, type Cmd } from './outline'
import { findSheetMarkers, readSheet, type SheetRead } from './read'
import { sampleSheetPhoto } from './sample'
import { GRID, SHEETS, sheetSvg, traceSize, type TraceLetters } from './sheet'
import { BUILT_IN, readFontStyle, type FontStyle } from './style'

const units = (v: number) => `${v}`
const degrees = (v: number) => `${v}°`

const GROUPS: FieldGroup[] = [
  {
    legend: 'Ink',
    hint: 'Changes here retrace the letters.',
    fields: [
      { kind: 'range', path: 'ink.cutoff', label: 'Ink cut-off (0 = automatic)', min: 0, max: 250, step: 1, fmt: (v) => (v ? `${v}` : 'auto') },
      { kind: 'range', path: 'ink.speck', label: 'Remove specks under', min: 0, max: 400, step: 5, fmt: plain },
      { kind: 'range', path: 'ink.weight', label: 'Weight', min: -4, max: 6, step: 1, fmt: (v) => (v > 0 ? `+${v}` : `${v}`) },
      { kind: 'check', path: 'ink.balance', label: 'Even out letters heavier or lighter than the rest' },
      { kind: 'range', path: 'trace.smoothness', label: 'Smoothness', min: 0, max: 1.33, step: 0.01, fmt: fixed(2) },
      { kind: 'range', path: 'trace.simplify', label: 'Simplify curves', min: 0, max: 1.5, step: 0.05, fmt: fixed(2) },
    ],
  },
  {
    legend: 'Spacing',
    hint: 'After Hochuli and Cheng: straight sides get the most room, round less, diagonal and open least; word space about a quarter of the em; lines about 1.2.',
    fields: [
      { kind: 'check', path: 'spacing.optical', label: 'Space by letter shape' },
      { kind: 'check', path: 'kerning', label: 'Kern pairs automatically' },
      { kind: 'range', path: 'spacing.side', label: 'Space beside letters', min: -50, max: 200, step: 5, fmt: units },
      { kind: 'range', path: 'spacing.tracking', label: 'Tracking', min: -150, max: 300, step: 5, fmt: units },
      { kind: 'range', path: 'spacing.space', label: 'Word space', min: 100, max: 800, step: 10, fmt: units },
      { kind: 'check', path: 'spacing.mono', label: 'Monospaced' },
      { kind: 'select', path: 'figures', label: 'Figures', options: ['proportional', 'tabular'] },
      { kind: 'check', path: 'spacing.punctuation', label: 'Room before : ; ? !' },
      { kind: 'range', path: 'lineGap', label: 'Extra line spacing', min: 0, max: 600, step: 10, fmt: units },
    ],
  },
  {
    legend: 'Character',
    hint: 'Hochuli: slanting past about 10° distorts letters.',
    presets: [{ label: 'Shuffle', path: 'shape.seed', value: () => Math.floor(Math.random() * 1000000), icon: 'scatter-fill' }],
    fields: [
      { kind: 'range', path: 'shape.slant', label: 'Slant', min: -20, max: 30, step: 1, fmt: degrees },
      { kind: 'range', path: 'shape.bounce', label: 'Bounce', min: 0, max: 150, step: 5, fmt: units },
      { kind: 'range', path: 'shape.wobble', label: 'Wobble', min: 0, max: 15, step: 0.5, fmt: degrees },
      { kind: 'range', path: 'shape.seed', label: 'Variation', min: 0, max: 999, step: 1, fmt: plain },
      { kind: 'check', path: 'overshoot', label: 'Round letters overshoot the lines' },
    ],
  },
  {
    legend: 'Accents',
    fields: [
      { kind: 'range', path: 'marks.gap', label: 'Gap above letters', min: -60, max: 200, step: 5, fmt: units },
      { kind: 'range', path: 'marks.scale', label: 'Accent size', min: 0.4, max: 1.6, step: 0.05, fmt: fixed(2) },
    ],
  },
]

const SAMPLE_TEXT =
  'Sphinx of black quartz, judge my vow!\nÜbermäßig schön — à bientôt, señor? «Ça va.»\nAbcdefghijklmnopqrstuvwxyz 0123456789'

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T

// Storage keys keep the project's first name, sketch-to-mark, so styles saved before the rename still load.
const book = new StyleBook<FontStyle>({ noun: 'font', key: 'sketch-to-mark.font-styles', builtIn: BUILT_IN, read: readFontStyle })
let style = book.current

/** One read per sheet page; a new photo of a page replaces that page. */
const reads: (SheetRead | null)[] = [null, null]
const traced: { key: string; outlines: Map<string, Cmd[]>; balanced: string[] }[] = []
/** Pages waiting to be read, by the photo they came from (a photo's latest version replaces its earlier one). */
const pendingPages = new Map<RGBAImage, GrayImage>()
let built: ReturnType<typeof assemble> | null = null
let load: ((src: CanvasImageSource, w: number, h: number, name: string) => void) | null = null

const box = styleBox(book, () => applied())
$('font-style-box').replaceWith(box.element)
const fillFields = buildFields($('font-fields'), GROUPS, 'font', () => style, update)

function update(next: FontStyle) {
  book.edit(next)
  applied()
}

function applied() {
  style = book.current
  fillFields(style)
  box.refresh()
  buildSoon()
}

// ---- Letter sheet ----

function download(blob: Blob, filename: string) {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = filename
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 1000)
}

/**
 * With "letters to trace" ticked: a plain sans in light blue in each box, for
 * trying the whole font pipeline by tracing instead of drawing from scratch.
 * Helvetica and Arial both have caps 0.716 em tall.
 */
function traceLetters(): TraceLetters | undefined {
  if (!$<HTMLInputElement>('sheet-trace').checked) return undefined
  const family = 'Helvetica, Arial, sans-serif'
  const size = traceSize(0.716)
  const ctx = document.createElement('canvas').getContext('2d')!
  ctx.font = `100px ${family}`
  const room = GRID.cellW - 2.5
  return { family, size, squeeze: (c) => Math.min(1, room / ((ctx.measureText(c).width / 100) * size)) }
}

const sheetFor = (page: number) => sheetSvg(page, traceLetters())

function printSheet(page: number) {
  // A hidden frame at true A4 size; the SVG is in millimetres.
  const frame = document.createElement('iframe')
  frame.style.cssText = 'position:fixed;width:0;height:0;border:0'
  frame.srcdoc = `<!doctype html><style>@page{size:A4;margin:0}html,body{margin:0}svg{display:block}</style>${sheetFor(page)}`
  frame.onload = () => {
    frame.contentWindow?.print()
    setTimeout(() => frame.remove(), 1000)
  }
  document.body.append(frame)
}

$('sheet-print-1').addEventListener('click', () => printSheet(0))
$('sheet-print-2').addEventListener('click', () => printSheet(1))
$('sheet-svg').addEventListener('click', () => {
  download(new Blob([sheetFor(0)], { type: 'image/svg+xml' }), 'letter-sheet-1.svg')
  setTimeout(() => download(new Blob([sheetFor(1)], { type: 'image/svg+xml' }), 'letter-sheet-2.svg'), 300)
})
for (const page of [0, 1]) {
  $(`sheet-sample-${page + 1}`).addEventListener('click', async () => {
    const c = await sampleSheetPhoto(page)
    load?.(c, c.width, c.height, `letter-sheet-${page + 1}`)
  })
}

/** The last photo opened wasn't a letter sheet (its corner squares weren't found). */
let notSheet = false

function showSheetState() {
  const lines = reads.map((r, page) => {
    if (!r) return `Page ${page + 1}: not read yet. Photograph it and open the photo.`
    const drawn = traced[page]?.outlines.size
    const markers = r.markers === 4 ? 'all corner markers found' : `${r.markers} of 4 corner markers found; boxes may be off`
    return `Page ${page + 1}: ${drawn === undefined ? '…' : `${drawn} of ${SHEETS[page].length} boxes drawn`} · ${markers}`
  })
  if (notSheet) lines.unshift('The last photo isn’t a letter sheet: its corner squares weren’t found.')
  $('sheet-state').innerHTML = lines.map((l) => `<span>${l}</span>`).join('')
}

// ---- Building ----

let timer = 0
let run = 0

function buildSoon() {
  clearTimeout(timer)
  timer = window.setTimeout(build, 150)
}

async function build() {
  if ($('font-app').hidden) return
  for (const [photo, page] of pendingPages) {
    // The sheet's own corner squares place it best, found in the whole photo;
    // failing that, the page as the Scan view straightened it.
    const raw = flattenLight(toGray(photo), 0.9)
    const corners = findSheetMarkers(raw)
    const r = corners ? readSheet(raw, corners) : readSheet(page)
    // Only a photo of the letter sheet: at least three of its corner squares must be there.
    if (r.markers >= 3) {
      reads[r.page] = r
      delete traced[r.page]
      notSheet = false
    } else notSheet = true
  }
  pendingPages.clear()
  const mine = ++run
  const key = traceKey(style)
  for (const page of [0, 1]) {
    const r = reads[page]
    if (!r || traced[page]?.key === key) continue
    $('font-stats').textContent = `Tracing page ${page + 1}…`
    const result = await traceSheet(r, style)
    if (mine !== run) return
    traced[page] = { key, ...result }
  }
  showSheetState()
  const drawn = new Map<string, Cmd[]>()
  for (const t of traced) if (t) for (const [c, o] of t.outlines) drawn.set(c, o)
  if (drawn.size === 0) {
    $('font-stats').textContent = 'No letters yet.'
    return
  }
  const family = ($<HTMLInputElement>('font-family').value || 'My Hand').trim()
  built = assemble(drawn, style, { family, designer: $<HTMLInputElement>('font-designer').value.trim() || undefined })
  await preview(built.buffer)
  if (mine !== run) return
  renderGlyphs(built.glyphs, drawn)
  renderChecks(built.checks, traced.flatMap((t) => t?.balanced ?? []))
  const made = built.glyphs.filter((g) => g.composite).length
  const kerned = built.kerns ? ` · ${built.kerns} kerning pairs` : ''
  $('font-stats').textContent = `${built.glyphs.length} characters (${made} made from accents)${kerned} · ${(built.buffer.byteLength / 1024).toFixed(0)} KB`
}

let face: FontFace | null = null
let faceCount = 0

/** Load the built font into the page and set the preview in it. */
async function preview(buffer: ArrayBuffer) {
  const name = `stm-preview-${++faceCount}`
  const next = new FontFace(name, buffer)
  await next.load()
  document.fonts.add(next)
  if (face) document.fonts.delete(face)
  face = next
  $('font-sample').style.fontFamily = `"${name}", system-ui`
}

/** What the books would point out about the drawn letters, and what was adjusted. */
function renderChecks(checks: Check[], balanced: string[]) {
  const items = [...checks]
  if (balanced.length) {
    items.push({ kind: 'weight', chars: balanced.join(' '), note: 'Heavier or lighter than the rest of their group; evened out (Cheng: one family, one weight).' })
  }
  const list = $('font-checks')
  list.replaceChildren(
    ...items.map((c) => {
      const li = document.createElement('li')
      const chars = document.createElement('span')
      chars.className = 'check-chars'
      chars.textContent = c.chars
      li.append(chars, ` ${c.note}`)
      return li
    }),
  )
  $('font-checks-pane').hidden = items.length === 0
}

function glyphSvg(g: BuiltGlyph): string {
  const d = g.cmds
    .map((c) => {
      // Font units are y-up; flip for SVG.
      if (c.t === 'Z') return 'Z'
      if (c.t === 'C') return `C${c.x1} ${-c.y1} ${c.x2} ${-c.y2} ${c.x} ${-c.y}`
      return `${c.t}${c.x} ${-c.y}`
    })
    .join('')
  const top = -ASCENDER
  const h = ASCENDER - DESCENDER
  return `<svg viewBox="0 ${top} ${Math.max(g.advance, 1)} ${h}" aria-hidden="true"><line x1="0" x2="${g.advance}" y1="0" y2="0" class="baseline"/><path d="${d}"/></svg>`
}

function renderGlyphs(glyphs: BuiltGlyph[], drawn: Map<string, Cmd[]>) {
  const cells = glyphs.map((g) => {
    const fig = document.createElement('figure')
    fig.className = g.composite ? 'glyph composite' : 'glyph'
    fig.innerHTML = `${glyphSvg(g)}<figcaption>${g.char === '<' ? '&lt;' : g.char === '&' ? '&amp;' : g.char}</figcaption>`
    fig.title = g.composite ? `${g.char}: made from a letter and an accent` : g.char
    return fig
  })
  $('glyphs').replaceChildren(...cells)
  const wanted = [...SHEETS.flat().map((s) => s.char), ...COMPOSITES.map((c) => c.char)]
  const missing = wanted.filter((c) => !glyphs.some((g) => g.char === c) && !drawn.has(c))
  $('glyphs-missing').textContent = missing.length ? `Not in the font yet: ${missing.join(' ')}` : 'Every character on the sheets is in the font.'
}

// ---- Exports ----

const fileName = () => slug(`${$<HTMLInputElement>('font-family').value || 'my hand'} ${style.name}`)

$('font-otf').addEventListener('click', () => {
  if (built) download(new Blob([built.buffer], { type: 'font/otf' }), `${fileName()}.otf`)
})

$('font-css').addEventListener('click', async (e) => {
  const btn = e.currentTarget as HTMLButtonElement
  const family = $<HTMLInputElement>('font-family').value || 'My Hand'
  await navigator.clipboard.writeText(
    `@font-face {\n  font-family: "${family.replace(/["\\]/g, '\\$&')}";\n  src: url("${fileName()}.otf") format("opentype");\n  font-display: swap;\n}\n`,
  )
  flash(btn)
})

for (const id of ['font-family', 'font-designer']) $(id).addEventListener('change', buildSoon)
$<HTMLInputElement>('font-size').addEventListener('input', (e) => {
  $('font-sample').style.fontSize = `${(e.target as HTMLInputElement).value}px`
})
$<HTMLTextAreaElement>('font-sample').value = SAMPLE_TEXT

// ---- Wiring to the Logo view ----

/** Called with each straightened, light-evened page from the Scan view, and the photo it came from. */
export function setPage(gray: GrayImage, photo: RGBAImage) {
  pendingPages.delete(photo)
  pendingPages.set(photo, gray)
  // Only the latest few photos wait; older ones were for other tabs.
  while (pendingPages.size > 3) pendingPages.delete(pendingPages.keys().next().value!)
  buildSoon()
}

/** Lets the sample buttons open a photo the way Open photo does. */
export function useLoader(fn: typeof load) {
  load = fn
}

export function showFont() {
  showSheetState()
  buildSoon()
}

fillFields(style)
box.refresh()
showSheetState()
