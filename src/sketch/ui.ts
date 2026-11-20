// The Sketches view, top to bottom like the Icon view: upload sketches into a
// collection, adjust the image (its own scan step), adjust the drawing (fine
// tuning, marks left out, lining up), adjust the style (the output kind, its
// settings, colours and size), then the downloads. Previews on the right:
// the image, the active sketch, the collection, and two sketches compared.

import type { RGBAImage } from '../image'
import { slug } from '../icon/style'
import { zip, type ZipFile } from '../icon/files'
import { t, tHtml, tn, tOr } from '../text'
import { buildFields, fixed, pct, type FieldGroup } from '../ui/fields'
import { flash } from '../ui/hand'
import { baseName, openImage } from '../ui/open-image'
import { scanControls } from '../ui/scan-markup'
import { ScanStep, type Scanned } from '../ui/scan-step'
import { DPI, PRESETS } from '../ui/size-presets'
import { globePair } from '../ui/sphere'
import { StyleBook, styleBox } from '../ui/styles'
import { onStorageChange, storageAllowed } from '../ui/consent'
import { privacySettings } from '../ui/privacy'
import { forget, keep, keepingOn, keptCollections, setKeeping, type KeptSketch } from './store'
import { distinct, moved, ordered, ORDERS, readCollectionJson, unzip, type CollectionJson, type Order } from './collection'
import { leftOutMarks, lineUpWith, markAt, moments, NO_DRAWING_TUNE, place, prepare, shrink, type DrawingTune, type Prepared } from './drawing'
import { frameFor, pathCount, sketchSvg, type Drawn } from './make'
import { contactSheet, drawingPdf, type SheetItem } from './pdf'
import { asDrawnCanvas, canvasBlob, drawnJob, svgCanvas, type Job } from './render'
import { BACKGROUNDS, BUILT_IN, FORMATS_FOR, MAX_SIDE, readSketchStyle, sketchFileName, SNAPS, TRACE_AS, type Kind, type SketchStyle } from './style'

// The scan step's controls go in first: the rest of the view reads them.
scanControls('sketch', {
  upload: `${tHtml('sketch.upload')} <span class="pages-count" id="sketch-count"></span>`,
  multiple: true,
  sheetOn: false,
  sheetLabel: tHtml('sketch.sheet-on'),
  speck: 4,
  setup: `
    <div class="name-row">
      <label class="field inline">${tHtml('sketch.collection')} <select id="sketch-collection"></select></label>
      <label class="field inline">${tHtml('sketch.collection-name')} <input id="sketch-collection-name" type="text" spellcheck="false" autocomplete="off" /></label>
    </div>
    <div class="row collection-row">
      <button id="sketch-new" class="button small" type="button" data-icon="cross-fill">${tHtml('sketch.collection-new')}</button>
      <button id="sketch-open" class="button small" type="button" data-icon="arrow-bar-fill-r270">${tHtml('sketch.collection-open')}</button>
      <input id="sketch-open-file" type="file" accept=".zip,application/zip" hidden />
      <button id="sketch-delete" class="button small" type="button" data-icon="big-x-fill" hidden>${tHtml('sketch.delete')}</button>
    </div>
    <label class="check"><input id="sketch-keep" type="checkbox" /> ${tHtml('sketch.keep')}</label>
    <p class="hint" id="sketch-keep-hint">${tHtml('sketch.keep.hint')}</p>`,
  after: `<div class="set-pages" id="sketch-chips" role="listbox" aria-label="${tHtml('sketch.chips')}" hidden></div>`,
  sheetHint: tHtml('sketch.sheet.hint'),
  inkExtra: `<label class="check"><input id="sketch-tones" type="checkbox" checked /> ${tHtml('sketch.tones')}</label>
      <p class="hint">${tHtml('sketch.tones.hint')}</p>`,
})

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T
const px = (v: number) => `${v} px`
const offPx = (v: number) => (v ? `${v} px` : t('common.off'))
type S = SketchStyle

// ---- The style's fields ----

const GROUPS: FieldGroup[] = [
  {
    legend: t('sketch.g.line'),
    hint: t('sketch.line.hint'),
    when: (s: S) => s.kind === 'line',
    fields: [
      { kind: 'select', path: 'line.traceAs', label: t('sketch.f.line-traceAs'), options: TRACE_AS },
      { kind: 'range', path: 'line.even', label: t('sketch.f.line-even'), min: 0, max: 1, step: 0.05, fmt: pct },
      { kind: 'range', path: 'line.smoothness', label: t('sketch.f.line-smoothness'), min: 0, max: 1.33, step: 0.01, fmt: fixed(2) },
      { kind: 'range', path: 'line.faint', label: t('sketch.f.line-faint'), min: 0, max: 0.9, step: 0.05, fmt: pct },
      { kind: 'range', path: 'line.gaps', label: t('sketch.f.line-gaps'), min: 0, max: 20, step: 1, fmt: offPx },
    ],
  },
  {
    legend: t('sketch.g.schematic'),
    when: (s: S) => s.kind === 'schematic',
    fields: [
      { kind: 'range', path: 'schematic.straighten', label: t('sketch.f.schematic-straighten'), min: 0, max: 30, step: 0.5, fmt: px },
      { kind: 'select', path: 'schematic.snap', label: t('sketch.f.schematic-snap'), options: SNAPS },
      { kind: 'range', path: 'schematic.join', label: t('sketch.f.schematic-join'), min: 0, max: 80, step: 1, fmt: offPx },
      { kind: 'range', path: 'schematic.grid', label: t('sketch.f.schematic-grid'), min: 0, max: 200, step: 2, fmt: offPx },
      { kind: 'range', path: 'schematic.width', label: t('sketch.f.schematic-width'), min: 0.5, max: 40, step: 0.5, fmt: px },
    ],
  },
  {
    legend: t('sketch.g.tones'),
    when: (s: S) => s.kind === 'tones',
    fields: [
      { kind: 'range', path: 'tones.levels', label: t('sketch.f.tones-levels'), min: 2, max: 5, step: 1, fmt: String },
      { kind: 'range', path: 'tones.smoothness', label: t('sketch.f.tones-smoothness'), min: 0, max: 1, step: 0.05, fmt: pct },
    ],
  },
  {
    legend: t('sketch.g.colours'),
    fields: [
      { kind: 'color', path: 'colours.ink', label: t('sketch.f.colours-ink') },
      { kind: 'select', path: 'colours.background', label: t('sketch.f.colours-background'), options: BACKGROUNDS },
      { kind: 'color', path: 'colours.colour', label: t('sketch.f.colours-colour') },
    ],
  },
]

// ---- State ----

/** One sketch: a photo, the drawing read from it, and what was done to it here. */
interface Sketch {
  id: number
  name: string
  /** The name was typed, not taken from the photo. */
  named: boolean
  photoName: string
  /** The photo as opened (or the flattened photo, for a collection opened again). */
  canvas: HTMLCanvasElement
  /** The photo is the page already (the sample, a flattened photo): no sheet to find. */
  whole: boolean
  /** The drawing picked on a sheet of several. */
  pick: number
  added: number
  place: number
  favourite: boolean
  date: number | null
  tune: DrawingTune
  /** The id of the sketch it is lined up with, the first favourite, or none. */
  lineUp: number | 'favourite' | null
  /** The latest from the scan step for this sketch. */
  art: Scanned['art']
  flat: RGBAImage | null
  /** The flattened photo as kept in this browser (a collection kept between visits). */
  kept: Blob | null
}

interface Collection {
  id: number
  name: string
  /** The name was typed. */
  named: boolean
  order: Order
  sketches: Sketch[]
  active: Sketch | null
  added: number
  style: SketchStyle | null
  /** Sketches kept in this browser, not yet opened (a collection opens when picked). */
  pending: KeptSketch[] | null
}

let ids = 0
let collections: Collection[] = []
let col: Collection = newCollection()
collections.push(col)

function newCollection(): Collection {
  return { id: ++ids, name: t('sketch.collection-default', { n: collections.length + 1 }), named: false, order: 'uploaded', sketches: [], active: null, added: 0, style: null, pending: null }
}

const book = new StyleBook<SketchStyle>({ noun: 'sketch', key: 'hand-drawn.sketch-styles', builtIn: BUILT_IN, read: readSketchStyle })
let style = book.current
let scanned: Scanned | null = null
const tonesIn = $<HTMLInputElement>('sketch-tones')

const box = styleBox(book, () => applied(), { markBuiltIn: false, actionsApart: true })
$('sketch-style-box').replaceWith(box.element)
box.title(t('sketch.presets'))
$('sketch-style-actions').replaceWith(box.actions)
const fillFields = buildFields($('sketch-fields'), GROUPS, 'sketch', () => book.current, update)

function update(next: SketchStyle) {
  book.edit(next)
  applied()
}

/** After the style changed: the controls, then every preview in the new style. */
function applied() {
  style = book.current
  col.style = style
  fillFields(style)
  // The background colour only shows when the background is a colour of its own.
  $('sketch-colours-colour').closest('label')!.hidden = style.colours.background !== 'colour'
  fillKinds()
  fillSize()
  fillFormats()
  box.refresh()
  renderSoon()
  tilesSoon()
  compareSoon()
  saveSoon()
}

// ---- Output kind ----

const kindButtons = [...document.querySelectorAll<HTMLButtonElement>('#sketch-kinds [data-kind]')]
function fillKinds() {
  for (const b of kindButtons) b.setAttribute('aria-checked', String(b.dataset.kind === style.kind))
  $('sketch-kind-hint').textContent = t(`sketch.kind.${style.kind}.hint`)
}
for (const b of kindButtons) b.addEventListener('click', () => update({ ...book.current, kind: b.dataset.kind as Kind }))

// ---- Size ----

const presetPick = $<HTMLSelectElement>('sketch-preset')
const sizeW = $<HTMLInputElement>('sketch-w')
const sizeH = $<HTMLInputElement>('sketch-h')
const sizeLock = $<HTMLInputElement>('sketch-lock')
const sizeFit = $<HTMLInputElement>('sketch-fit')
const sizeDpi = $<HTMLInputElement>('sketch-dpi')

presetPick.append(new Option(t('texture.custom'), ''))
for (const g of [...new Set(PRESETS.map((p) => p.group))]) {
  const og = document.createElement('optgroup')
  og.label = t(`texture.size-group.${g}`)
  PRESETS.forEach((p, i) => p.group === g && og.append(new Option(t(`texture.size.${p.id}`), String(i))))
  presetPick.append(og)
}

function fillSize() {
  const z = style.size
  sizeFit.checked = z.fit
  sizeW.value = String(z.width)
  sizeH.value = String(z.height)
  sizeDpi.value = String(z.dpi)
  const i = PRESETS.findIndex((p) => p.w === z.width && p.h === z.height)
  presetPick.value = i < 0 ? '' : String(i)
  for (const el of [presetPick, sizeW, sizeH, $<HTMLButtonElement>('sketch-swap'), sizeLock]) el.disabled = z.fit
  const inch = (v: number) => (v / z.dpi).toFixed(2).replace(/\.?0+$/, '')
  const mm = (v: number) => Math.round((v / z.dpi) * 25.4)
  const own = prepared()
  $('sketch-size-note').textContent = z.fit
    ? own
      ? t('sketch.size-own', { width: own.width, height: own.height, inW: inch(own.width), inH: inch(own.height), dpi: z.dpi })
      : ''
    : t('sketch.size-note', { inW: inch(z.width), inH: inch(z.height), mmW: mm(z.width), mmH: mm(z.height), dpi: z.dpi })
}

function setSize(width: number, height: number) {
  const side = (v: number) => Math.round(Math.min(MAX_SIDE, Math.max(16, v || 16)))
  update({ ...book.current, size: { ...book.current.size, width: side(width), height: side(height) } })
}
presetPick.addEventListener('change', () => {
  const p = PRESETS[Number(presetPick.value)]
  if (presetPick.value && p) setSize(p.w, p.h)
})
for (const [input, other] of [[sizeW, sizeH], [sizeH, sizeW]] as const) {
  input.addEventListener('change', () => {
    const z = book.current.size
    const v = Number(input.value)
    if (!sizeLock.checked) return setSize(input === sizeW ? v : z.width, input === sizeH ? v : z.height)
    const ratio = input === sizeW ? z.height / z.width : z.width / z.height
    other.value = String(Math.round(v * ratio))
    setSize(Number(sizeW.value), Number(sizeH.value))
  })
}
$('sketch-swap').addEventListener('click', () => setSize(book.current.size.height, book.current.size.width))
sizeFit.addEventListener('change', () => update({ ...book.current, size: { ...book.current.size, fit: sizeFit.checked } }))
sizeDpi.addEventListener('change', () => update({ ...book.current, size: { ...book.current.size, dpi: Number(sizeDpi.value) || DPI } }))

// ---- Formats ----

const formatChecks = [...document.querySelectorAll<HTMLInputElement>('[data-format]')]
const picked = () => formatChecks.filter((c) => c.checked).map((c) => c.dataset.format!)
/** The formats the kind has are shown; those it lacks are left out. */
function fillFormats() {
  const has = FORMATS_FOR[style.kind]
  for (const c of formatChecks) c.closest('label')!.classList.toggle('off', !has.includes(c.dataset.format as 'svg'))
  $('sketch-formats-hint').textContent = t('sketch.formats.hint', {
    kind: t(`sketch.kind.${style.kind}`),
    formats: has.map((f) => t(`sketch.format-${f}`)).join(', '),
  })
}

// ---- The scan step and the collection's photos ----

/**
 * Let the page draw between two long steps (a photo read, a sketch drawn), so
 * it never holds still. A page out of sight draws no frames, so a short wait
 * stands in for the frame there, and the photos still come in.
 */
const breathe = () =>
  new Promise<void>((r) => {
    let done = false
    const go = () => {
      if (done) return
      done = true
      setTimeout(r, 0)
    }
    requestAnimationFrame(go)
    setTimeout(go, 50)
  })

const scan = new ScanStep(
  'sketch',
  (next) => {
    scanned = next
    const s = col.active
    if (s) {
      s.art = next.art
      s.flat = next.flat
      s.pick = next.pick
    }
    paintLeftOut()
    drawingChanged()
  },
  { files: (files) => addFiles(files), remove: () => removeSketch() },
)

/** A photo becomes a sketch of the collection, and the active one. */
function addCanvas(c: HTMLCanvasElement, name: string, whole = false, date: number | null = null) {
  const s: Sketch = {
    id: ++ids,
    name,
    named: false,
    photoName: name,
    canvas: c,
    whole,
    pick: 0,
    added: col.added++,
    place: col.sketches.length,
    favourite: false,
    date,
    tune: { ...NO_DRAWING_TUNE, leftOut: [] },
    lineUp: null,
    art: null,
    flat: null,
    kept: null,
  }
  col.sketches.push(s)
  // The first photo names the collection, until a name is typed.
  if (!col.named && col.sketches.length === 1) col.name = name
  open(s)
}

/** Make a sketch the active one: its photo in the scan step, its tuning in the controls. */
function open(s: Sketch) {
  col.active = s
  scan.openCanvas(s.canvas, s.name, s.whole)
  scan.flush()
  scan.choose(s.pick)
  showCollection()
}

/** Photos are read one at a time; another pick waits until these are in. */
let reading: Promise<void> = Promise.resolve()

/** Several photos at once: each is read in turn, the page drawn between them, the count going up as each comes in. */
function addFiles(files: File[]) {
  reading = reading.then(async () => {
    const upload = $('sketch-upload')
    upload.setAttribute('aria-busy', 'true')
    try {
      for (const f of files) {
        const c = await openImage(f, f.name)
        if (c) addCanvas(c, baseName(f.name), false, f.lastModified || null)
        await breathe()
      }
    } finally {
      upload.removeAttribute('aria-busy')
    }
  })
}

/** Remove photo: the active sketch leaves the collection. */
function removeSketch() {
  const s = col.active
  if (!s) return scan.remove()
  col.sketches = col.sketches.filter((x) => x !== s)
  for (const x of col.sketches) if (x.lineUp === s.id) x.lineUp = null
  col.active = null
  const next = ordered(col.sketches, col.order).at(-1)
  if (next) open(next)
  else {
    scan.remove()
    showCollection()
  }
  tilesSoon()
  saveSoon()
}

/** A photo opened, dropped or pasted while the Sketches view is open. */
export function openSketchPhotos(files: File[]) {
  addFiles(files)
}

/** The sample: one of Kevin's own drawings, photographed in a sketchbook, the page filling the photo. */
export async function loadSketchSample() {
  const res = await fetch('/sample-drawing.jpg')
  if (!res.ok) return
  const bitmap = await createImageBitmap(await res.blob())
  const c = document.createElement('canvas')
  c.width = bitmap.width
  c.height = bitmap.height
  c.getContext('2d', { willReadFrequently: true })!.drawImage(bitmap, 0, 0)
  bitmap.close()
  addCanvas(c, 'sample', true)
}

// ---- The collection: chips, picker, name ----

const nameIn = $<HTMLInputElement>('sketch-collection-name')
const collectionPick = $<HTMLSelectElement>('sketch-collection')

/** The collection's sketches in order, each with its number. */
const inOrder = () => ordered(col.sketches, col.order)
const numberOf = (s: Sketch) => inOrder().indexOf(s) + 1
/** Each sketch's name, told apart from another of the same name. */
function namesInOrder(): Map<Sketch, string> {
  const list = inOrder()
  const names = distinct(list.map((s) => s.name))
  return new Map(list.map((s, i) => [s, names[i]]))
}

function showCollection() {
  const list = inOrder()
  $('sketch-count').textContent = list.length ? t('sketch.count', { n: list.length }) : ''
  const chips = $('sketch-chips')
  chips.hidden = list.length < 2
  chips.replaceChildren(
    ...list.map((s, i) => {
      const btn = document.createElement('button')
      btn.type = 'button'
      btn.className = 'button small set-page'
      btn.setAttribute('role', 'option')
      btn.setAttribute('aria-selected', String(s === col.active))
      btn.textContent = t('sketch.chip', { n: i + 1, name: s.name })
      btn.addEventListener('click', () => s !== col.active && open(s))
      return btn
    }),
  )
  if (document.activeElement !== nameIn) nameIn.value = col.name
  collectionPick.replaceChildren(...collections.map((c) => new Option(t('sketch.collection-option', { name: c.name, n: c.sketches.length + (c.pending?.length ?? 0) }), String(c.id))))
  collectionPick.value = String(col.id)
  $('sketch-delete').hidden = !keeping() || !col.sketches.length
  fillLineUp()
  showTune()
}

nameIn.addEventListener('input', () => {
  col.name = nameIn.value.trim() || col.name
  col.named = !!nameIn.value.trim()
  collectionPick.selectedOptions[0].textContent = t('sketch.collection-option', { name: col.name, n: col.sketches.length })
  showStats()
  saveSoon()
})

/** Another collection in place of this one: its sketches, its style. */
function switchCollection(next: Collection) {
  stopWork()
  col = next
  if (col.style) {
    book.edit(col.style)
    box.refresh()
  }
  const a = col.active ?? inOrder()[0] ?? null
  if (a) open(a)
  else {
    col.active = null
    scan.remove()
  }
  showCollection()
  applied()
  if (col.pending) void openKept(col)
}

collectionPick.addEventListener('change', () => {
  const next = collections.find((c) => String(c.id) === collectionPick.value)
  if (next && next !== col) switchCollection(next)
})
$('sketch-new').addEventListener('click', () => {
  const c = newCollection()
  c.style = book.current
  collections.push(c)
  switchCollection(c)
})

// ---- Adjust drawing: fine tuning ----

const tuneIn = { rotate: $<HTMLInputElement>('sketch-rotate'), spread: $<HTMLInputElement>('sketch-spread'), margin: $<HTMLInputElement>('sketch-margin') }
type TuneKey = keyof typeof tuneIn
const tuneFormats: Record<TuneKey, (v: number) => string> = {
  rotate: (v) => `${v > 0 ? '+' : ''}${v.toFixed(1)}°`,
  spread: (v) => `${v > 0 ? '+' : ''}${v.toFixed(2)} px`,
  margin: (v) => `${Math.round(v * 100)}%`,
}

function showTune() {
  const tune = col.active?.tune ?? NO_DRAWING_TUNE
  for (const k of Object.keys(tuneIn) as TuneKey[]) {
    tuneIn[k].value = String(tune[k])
    $(`sketch-${k}-out`).textContent = tuneFormats[k](tune[k])
  }
  const n = tune.leftOut.length ? leftOutCount() : 0
  $('sketch-marks-count').textContent = n ? tn('sketch.marks-count', n) : ''
  $('sketch-name').toggleAttribute('disabled', !col.active)
  if (document.activeElement !== $('sketch-name')) $<HTMLInputElement>('sketch-name').value = col.active?.name ?? ''
}

for (const k of Object.keys(tuneIn) as TuneKey[]) {
  tuneIn[k].addEventListener('input', () => {
    const s = col.active
    if (!s) return
    s.tune = { ...s.tune, [k]: Number(tuneIn[k].value) }
    showTune()
    drawingChanged()
  })
}
globePair(t('sketch.globe-tune'), { input: tuneIn.rotate }, { input: tuneIn.spread }, $('sketch-globes'))

$<HTMLInputElement>('sketch-name').addEventListener('input', (e) => {
  const s = col.active
  if (!s) return
  const v = (e.target as HTMLInputElement).value.trim()
  s.name = v || s.photoName
  s.named = !!v
  showCollection()
  drawTiles()
  showStats()
  saveSoon()
})

// ---- Adjust drawing: marks left out ----

let picking = false
const pickBtn = $<HTMLButtonElement>('sketch-marks-pick')
const inkView = $<HTMLCanvasElement>('sketch-ink-view')

function setPicking(on: boolean) {
  picking = on
  pickBtn.setAttribute('aria-pressed', String(on))
  pickBtn.textContent = t(on ? 'sketch.marks-picking' : 'sketch.marks-pick')
  inkView.classList.toggle('picking', on)
}
pickBtn.addEventListener('click', () => setPicking(!picking))

/** How many separate marks are left out. */
function leftOutCount(): number {
  const s = col.active
  if (!s?.art) return 0
  const gone = leftOutMarks(s.art.mask, s.tune.leftOut)
  // Count the taps that hit a mark of their own.
  const seen = new Set<number>()
  for (const p of s.tune.leftOut) {
    const hit = markAt(s.art.mask, p.x, p.y)
    if (!hit) continue
    seen.add(firstOf(gone, hit.y * gone.width + hit.x))
  }
  return seen.size
}

/** A mark's first pixel (the one a flood would start from), to tell marks apart. */
function firstOf(m: { width: number; data: Uint8Array }, start: number): number {
  const stack = [start]
  const seen = new Set([start])
  let first = start
  while (stack.length) {
    const p = stack.pop()!
    if (p < first) first = p
    const x = p % m.width
    for (const q of [p - 1, p + 1, p - m.width, p + m.width, p - m.width - 1, p - m.width + 1, p + m.width - 1, p + m.width + 1]) {
      const qx = q % m.width
      if (q < 0 || q >= m.data.length || Math.abs(qx - x) > 1 || seen.has(q) || !m.data[q]) continue
      seen.add(q)
      stack.push(q)
    }
  }
  return first
}

/** The image pane's ink as the scan step last drew it, under the silver of the marks left out. */
let inkUnder: { x: number; y: number; data: ImageData } | null = null

/** The marks left out, silver in the image pane. */
function paintLeftOut() {
  const s = col.active
  inkUnder = null
  if (!s?.art || !s.tune.leftOut.length || inkView.width < 2) return
  const b = s.art.box
  const ctx = inkView.getContext('2d')!
  const under = ctx.getImageData(b.x, b.y, b.width, b.height)
  inkUnder = { x: b.x, y: b.y, data: under }
  const gone = leftOutMarks(s.art.mask, s.tune.leftOut)
  const over = new ImageData(new Uint8ClampedArray(under.data), b.width, b.height)
  for (let i = 0, j = 0; i < gone.data.length; i++, j += 4) {
    if (!gone.data[i]) continue
    over.data.set([192, 192, 192, 255], j)
  }
  ctx.putImageData(over, b.x, b.y)
}

function repaintLeftOut() {
  if (inkUnder) inkView.getContext('2d')!.putImageData(inkUnder.data, inkUnder.x, inkUnder.y)
  paintLeftOut()
}

inkView.addEventListener('click', (e) => {
  const s = col.active
  if (!picking || !s?.art) return
  const r = inkView.getBoundingClientRect()
  const x = ((e.clientX - r.left) / r.width) * inkView.width - s.art.box.x
  const y = ((e.clientY - r.top) / r.height) * inkView.height - s.art.box.y
  // A tap reaches a little further on a large photo shown small.
  const reach = Math.max(6, (inkView.width / r.width) * 6)
  const hit = markAt(s.art.mask, x, y, reach)
  if (!hit) return
  const gone = leftOutMarks(s.art.mask, s.tune.leftOut)
  const at = hit.y * gone.width + hit.x
  if (gone.data[at]) {
    // A silver mark comes back: every tap on it goes.
    const mark = firstOf(gone, at)
    s.tune = { ...s.tune, leftOut: s.tune.leftOut.filter((p) => { const h = markAt(s.art!.mask, p.x, p.y); return !h || firstOf(gone, h.y * gone.width + h.x) !== mark }) }
  } else s.tune = { ...s.tune, leftOut: [...s.tune.leftOut, hit] }
  repaintLeftOut()
  showTune()
  drawingChanged()
})

$('sketch-marks-back').addEventListener('click', () => {
  const s = col.active
  if (!s || !s.tune.leftOut.length) return
  s.tune = { ...s.tune, leftOut: [] }
  repaintLeftOut()
  showTune()
  drawingChanged()
})

// ---- Adjust drawing: line up ----

const lineUpPick = $<HTMLSelectElement>('sketch-lineup')
function fillLineUp() {
  const s = col.active
  lineUpPick.replaceChildren(
    new Option(t('sketch.lineup-none'), ''),
    ...inOrder()
      .map((x, i) => (x === s ? null : new Option(t('sketch.lineup-sketch', { n: i + 1 }), String(x.id))))
      .filter((o): o is HTMLOptionElement => !!o),
    new Option(t('sketch.lineup-favourite'), 'favourite'),
  )
  lineUpPick.value = s?.lineUp == null ? '' : String(s.lineUp)
  lineUpPick.disabled = !s
}
lineUpPick.addEventListener('change', () => {
  const s = col.active
  if (!s) return
  const v = lineUpPick.value
  s.lineUp = v === '' ? null : v === 'favourite' ? 'favourite' : Number(v)
  drawingChanged()
})

// ---- Each sketch's drawing ----

const baseCache = new WeakMap<object, { key: string; prepared: Prepared }>()
const placedCache = new WeakMap<object, { key: string; prepared: Prepared }>()

/** The sketch's drawing, tuned, before any lining up. */
function base(s: Sketch): Prepared | null {
  if (!s.art) return null
  const key = JSON.stringify(s.tune)
  const kept = baseCache.get(s.art)
  if (kept?.key === key) return kept.prepared
  const p = prepare(s.art, s.tune)
  baseCache.set(s.art, { key, prepared: p })
  return p
}

/** Who a sketch lines up with: a sketch, the first favourite (not itself), or nobody. */
function lineUpTarget(s: Sketch): Sketch | null {
  if (s.lineUp === 'favourite') return inOrder().find((x) => x.favourite && x !== s && x.art) ?? null
  if (s.lineUp == null) return null
  return col.sketches.find((x) => x.id === s.lineUp && x !== s && x.art) ?? null
}

/** The drawing every output starts from: tuned, and lined up when asked. */
function preparedOf(s: Sketch): Prepared | null {
  const own = base(s)
  const target = lineUpTarget(s)
  if (!own || !target) return own
  const to = base(target)!
  const key = `${idOf(target.art!)}|${JSON.stringify(target.tune)}|${JSON.stringify(s.tune)}`
  const kept = placedCache.get(s.art!)
  if (kept?.key === key) return kept.prepared
  const a = moments(own.mask)
  const b = moments(to.mask)
  if (!a || !b) return own
  const p = place(own, to.width, to.height, lineUpWith(a, b))
  placedCache.set(s.art!, { key, prepared: p })
  return p
}

const prepared = () => (col.active ? preparedOf(col.active) : null)

/** The background as a colour, or null for none. */
function background(): string | null {
  const b = style.colours.background
  if (b === 'none') return null
  if (b === 'paper') return scanned?.colours.paper ?? scan.paperColour()
  return style.colours.colour
}

/** The settings that change the shapes (not the colours or the size). */
const shapeKey = (s: SketchStyle) => JSON.stringify([s.kind, s.line, s.schematic, s.tones])

/** The active sketch's drawing changed (scan, tuning, marks, line up): every preview of it again. */
function drawingChanged() {
  fillSize()
  renderSoon()
  tilesSoon()
  compareSoon()
  saveSoon()
}

// ---- The Sketch pane ----

let renderTimer = 0
let sketchJob: Job<Drawn> | null = null
/** The active sketch's full-size drawing, for the downloads, and what it was made from. */
let drawn: { key: string; prepared: Prepared; drawn: Drawn } | null = null

function renderSoon() {
  clearTimeout(renderTimer)
  renderTimer = window.setTimeout(() => void render(), 120)
}

function making(id: 'sketch' | 'collection', text: string | null) {
  $(`${id}-making`).hidden = text === null
  $(id === 'sketch' ? 'sketch-pane' : 'sketch-collection-pane').classList.toggle('making', text !== null)
  if (text !== null) $(`${id}-making-text`).textContent = text
}

$('sketch-stop').addEventListener('click', () => {
  sketchJob?.stop()
  sketchJob = null
  making('sketch', null)
  $('sketch-stats').textContent = t('sketch.stopped')
})

async function render() {
  if ($('sketch-app').hidden) return
  const s = col.active
  const p = s ? preparedOf(s) : null
  $('sketch-pane').classList.toggle('empty', !p)
  const stage = $('sketch-stage')
  if (!p) {
    stage.replaceChildren()
    $('sketch-stats').textContent = ''
    making('sketch', null)
    return
  }
  const frame = frameFor(p.width, p.height, style)
  const ink = style.colours.ink
  const bg = background()
  if (style.kind === 'as-drawn') {
    // The picture first, with its tones; the traced outlines follow for the SVG and the stats.
    const c = asDrawnCanvas(p, frame, ink, bg, tonesIn.checked)
    c.className = 'sketch-picture'
    stage.replaceChildren(c)
  }
  const key = `${shapeKey(style)}`
  if (drawn?.prepared === p && drawn.key === key) return show(drawn.drawn)
  sketchJob?.stop()
  const job = drawnJob(p, style, 1)
  sketchJob = job
  if (style.kind !== 'as-drawn') making('sketch', t('sketch.making', { kind: t(`sketch.kind.${style.kind}`).toLowerCase() }))
  try {
    const d = await job.result
    if (sketchJob !== job) return
    drawn = { key, prepared: p, drawn: d }
    show(d)
  } catch {
    // Stopped, or a newer drawing took its place.
  } finally {
    if (sketchJob === job) {
      sketchJob = null
      making('sketch', null)
    }
  }

  function show(d: Drawn) {
    if (style.kind !== 'as-drawn') stage.innerHTML = sketchSvg(d, frame, ink, bg)
    showStats()
  }
}

function showStats() {
  const s = col.active
  const p = s ? preparedOf(s) : null
  if (!p || !drawn || drawn.prepared !== p) return
  const svg = sketchSvg(drawn.drawn, frameFor(p.width, p.height, style), style.colours.ink, background())
  const n = pathCount(drawn.drawn)
  $('sketch-stats').textContent = tn('sketch.stats', n, { paths: n, kb: (new Blob([svg]).size / 1024).toFixed(0) })
}

for (const r of document.querySelectorAll<HTMLInputElement>('input[name="sketch-ground"]')) {
  r.addEventListener('change', () => $('sketch-pane').classList.toggle('dark', r.value === 'dark' && r.checked))
}

// ---- The Collection pane ----

const TILE = 320
/** Each sketch's tile picture, kept while its drawing and the style are the same. */
const tiles = new Map<number, { key: string; el: HTMLElement }>()
let favouritesOnly = false
let tileTimer = 0
let tileRun = 0
let tileJob: Job<Drawn> | null = null
/** The two sketches ticked to compare, oldest first. */
let ticked: number[] = []

const orderPick = $<HTMLSelectElement>('sketch-order')
orderPick.replaceChildren(...ORDERS.map((o) => new Option(tOr(`sketch.o.${o}`, o), o)))
orderPick.addEventListener('change', () => {
  col.order = orderPick.value as Order
  showCollection()
  drawTiles()
  saveSoon()
})
$('sketch-favourites-only').addEventListener('click', (e) => {
  favouritesOnly = !favouritesOnly
  ;(e.currentTarget as HTMLElement).setAttribute('aria-pressed', String(favouritesOnly))
  drawTiles()
})

function tilesSoon() {
  clearTimeout(tileTimer)
  tileTimer = window.setTimeout(() => void buildTiles(), 200)
}

const tileKey = (s: Sketch) => {
  const p = preparedOf(s)
  return p ? `${shapeKey(style)}|${style.colours.ink}|${background()}|${tonesIn.checked}|${JSON.stringify(s.tune)}|${s.lineUp}|${lineUpTarget(s)?.id}|${p.width}x${p.height}|${baseCache.get(s.art!)?.key}|${idOf(s.art!)}` : ''
}
/** A stable id per scan result, so a rescanned drawing makes a new tile. */
const artIds = new WeakMap<object, number>()
let artCount = 0
const idOf = (o: object) => {
  if (!artIds.has(o)) artIds.set(o, ++artCount)
  return artIds.get(o)!
}

/** A sketch drawn small (or at `side`), in the style, as a canvas or an SVG element. */
async function picture(s: Sketch, side: number, ink: string, bg: string | null, onJob?: (j: Job<Drawn>) => void): Promise<HTMLElement | null> {
  const full = preparedOf(s)
  if (!full) return null
  const { prepared: p, k } = shrink(full, side)
  const frame = { width: p.width, height: p.height, outW: p.width, outH: p.height }
  if (style.kind === 'as-drawn') return asDrawnCanvas(p, frame, ink, bg, tonesIn.checked)
  const job = drawnJob(p, style, k)
  onJob?.(job)
  const d = await job.result
  const holder = document.createElement('div')
  holder.className = 'sketch-svg'
  holder.innerHTML = sketchSvg(d, frame, ink, bg)
  return holder
}

/** Every tile in the current style, one at a time, each drawn as it lands. */
async function buildTiles() {
  if ($('sketch-app').hidden) return
  const run = ++tileRun
  tileJob?.stop()
  drawTiles()
  const list = inOrder()
  for (let i = 0; i < list.length; i++) {
    const s = list[i]
    const key = tileKey(s)
    if (!key || tiles.get(s.id)?.key === key) continue
    await breathe()
    if (run !== tileRun) return
    try {
      const el = await picture(s, TILE, style.colours.ink, background(), (j) => (tileJob = j))
      if (run !== tileRun) return
      if (el) tiles.set(s.id, { key, el })
    } catch {
      return
    }
    drawTiles()
  }
}

function drawTiles() {
  const list = inOrder()
  const shown = favouritesOnly ? list.filter((s) => s.favourite) : list
  $('sketch-collection-pane').classList.toggle('empty', !list.length)
  orderPick.value = col.order
  $('sketch-tiles').replaceChildren(
    ...shown.map((s) => {
      const n = list.indexOf(s) + 1
      const tile = document.createElement('div')
      tile.className = 'sketch-tile'
      tile.dataset.id = String(s.id)
      tile.setAttribute('role', 'option')
      tile.setAttribute('aria-selected', String(s === col.active))
      tile.title = s.name
      const pic = document.createElement('button')
      pic.type = 'button'
      pic.className = 'sketch-tile-pic'
      pic.setAttribute('aria-label', t('sketch.chip', { n, name: s.name }))
      const kept = tiles.get(s.id)
      if (kept) pic.append(kept.el)
      else pic.innerHTML = '<span class="set-wait">…</span>'
      pic.addEventListener('click', () => {
        if (dragged) return
        if (s !== col.active) open(s)
      })
      const num = document.createElement('span')
      num.className = 'set-num'
      num.textContent = String(n)
      const star = document.createElement('button')
      star.type = 'button'
      star.className = 'sketch-star'
      star.setAttribute('aria-pressed', String(s.favourite))
      star.setAttribute('aria-label', t('sketch.star'))
      star.title = t('sketch.star')
      star.textContent = s.favourite ? '★' : '☆'
      star.addEventListener('click', () => {
        s.favourite = !s.favourite
        if (col.order === 'favourites') showCollection()
        drawTiles()
        // A sketch lined up with "the first favourite" may have a new one.
        if (col.sketches.some((x) => x.lineUp === 'favourite')) drawingChanged()
        saveSoon()
      })
      const tick = document.createElement('label')
      tick.className = 'sketch-tick'
      tick.title = t('sketch.tick')
      const box = document.createElement('input')
      box.type = 'checkbox'
      box.checked = ticked.includes(s.id)
      box.setAttribute('aria-label', t('sketch.tick'))
      box.addEventListener('change', () => {
        ticked = ticked.filter((id) => id !== s.id)
        if (box.checked) ticked.push(s.id)
        // Two at most: the oldest tick goes.
        if (ticked.length > 2) ticked = ticked.slice(-2)
        drawTiles()
        compareSoon()
      })
      tick.append(box)
      tile.append(pic, num, star, tick)
      return tile
    }),
  )
  const favs = col.sketches.filter((s) => s.favourite).length
  $('sketch-collection-stats').textContent = list.length
    ? t('sketch.collection-stats', { sketches: tn('sketch.sketches', list.length), favourites: tn('sketch.favourites', favs) })
    : ''
}

// Tiles drag to a new place (after the Font tab's drag of drawings onto letters): the order becomes "as arranged".
let press: { tile: HTMLElement; x: number; y: number; ghost: HTMLElement | null } | null = null
let dragged = false
const tileGrid = $('sketch-tiles')
tileGrid.addEventListener('pointerdown', (e) => {
  const tile = (e.target as HTMLElement).closest<HTMLElement>('.sketch-tile')
  if (!tile || (e.target as HTMLElement).closest('.sketch-star, .sketch-tick') || e.button !== 0) return
  press = { tile, x: e.clientX, y: e.clientY, ghost: null }
})
addEventListener('pointermove', (e) => {
  if (!press) return
  if (!press.ghost) {
    if (Math.hypot(e.clientX - press.x, e.clientY - press.y) < 6) return
    const ghost = document.createElement('div')
    ghost.className = 'freehand-ghost sketch-ghost'
    ghost.append(press.tile.querySelector('.sketch-tile-pic')!.cloneNode(true))
    document.body.append(ghost)
    press.ghost = ghost
    press.tile.classList.add('lifted')
  }
  press.ghost.style.transform = `translate(${e.clientX}px, ${e.clientY}px)`
  for (const el of tileGrid.querySelectorAll('.over')) el.classList.remove('over')
  ;(document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null)?.closest('.sketch-tile')?.classList.add('over')
})
addEventListener('pointerup', (e) => {
  if (!press) return
  const { tile, ghost } = press
  press = null
  if (!ghost) return
  ghost.remove()
  tile.classList.remove('lifted')
  for (const el of tileGrid.querySelectorAll('.over')) el.classList.remove('over')
  dragged = true
  setTimeout(() => (dragged = false))
  const onto = (document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null)?.closest<HTMLElement>('.sketch-tile')
  if (!onto || onto === tile) return
  const list = inOrder()
  const from = list.findIndex((s) => String(s.id) === tile.dataset.id)
  const to = list.findIndex((s) => String(s.id) === onto.dataset.id)
  moved(list, from, to).forEach((s, i) => (s.place = i))
  col.order = 'own'
  showCollection()
  drawTiles()
  compareSoon()
  saveSoon()
})

// ---- The Compare pane ----

let compareTimer = 0
let compareRun = 0
let compareMode: 'side' | 'overlay' = 'side'
const blendIn = $<HTMLInputElement>('sketch-blend')

function compareSoon() {
  clearTimeout(compareTimer)
  compareTimer = window.setTimeout(() => void buildCompare(), 250)
}

for (const r of document.querySelectorAll<HTMLInputElement>('input[name="sketch-compare"]')) {
  r.addEventListener('change', () => {
    if (!r.checked) return
    compareMode = r.value as 'side' | 'overlay'
    compareSoon()
  })
}
blendIn.addEventListener('input', () => {
  $('sketch-blend-out').textContent = pct(Number(blendIn.value))
  const top = $('sketch-compare').querySelector<HTMLElement>('.compare-top')
  if (top) top.style.opacity = blendIn.value
})
$('sketch-blend-out').textContent = pct(Number(blendIn.value))

async function buildCompare() {
  if ($('sketch-app').hidden) return
  ticked = ticked.filter((id) => col.sketches.some((s) => s.id === id))
  const pair = ticked.map((id) => col.sketches.find((s) => s.id === id)!).filter((s) => s.art)
  const ready = pair.length === 2
  $('sketch-compare-pane').classList.toggle('empty', !ready)
  $('sketch-compare-hint').hidden = ready
  $('sketch-blend-row').hidden = !ready || compareMode !== 'overlay'
  const out = $('sketch-compare')
  if (!ready) return out.replaceChildren()
  const run = ++compareRun
  const [a, b] = inOrder().filter((s) => pair.includes(s))
  const overlay = compareMode === 'overlay'
  try {
    const first = await picture(a, 900, style.colours.ink, overlay ? null : background())
    const second = await picture(b, 900, overlay ? '#c0c0c0' : style.colours.ink, overlay ? null : background())
    if (run !== compareRun || !first || !second) return
    out.className = `compare ${overlay ? 'overlay' : 'side'}`
    out.setAttribute('aria-label', t('sketch.compare-pair', { a: numberOf(a), b: numberOf(b) }))
    if (overlay) {
      second.classList.add('compare-top')
      second.style.opacity = blendIn.value
    }
    const fig = (el: HTMLElement, s: Sketch) => {
      const f = document.createElement('figure')
      const cap = document.createElement('figcaption')
      cap.textContent = t('sketch.chip', { n: numberOf(s), name: s.name })
      f.append(el, cap)
      return f
    }
    if (overlay) {
      const stack = document.createElement('div')
      stack.className = 'compare-stack'
      const bg = background()
      if (bg) stack.style.background = bg
      stack.append(first, second)
      out.replaceChildren(stack)
    } else out.replaceChildren(fig(first, a), fig(second, b))
  } catch {
    // A newer comparison took its place.
  }
}

// ---- Downloads ----

function download(blob: Blob, filename: string) {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = filename
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 1000)
}

/** Stop a collection being packed. */
let packing: { stopped: boolean; job: Job<Drawn> | null } | null = null
$('collection-stop').addEventListener('click', () => {
  if (!packing) return
  packing.stopped = true
  packing.job?.stop()
})

function stopWork() {
  sketchJob?.stop()
  tileJob?.stop()
  tileRun++
  compareRun++
  if (packing) packing.stopped = true
}

/** A sketch's full-size drawing in the style: the Sketch pane's when it is the active one, else made now. */
async function fullDrawn(s: Sketch, onJob?: (j: Job<Drawn>) => void): Promise<{ p: Prepared; d: Drawn } | null> {
  const p = preparedOf(s)
  if (!p) return null
  if (drawn?.prepared === p && drawn.key === shapeKey(style)) return { p, d: drawn.drawn }
  const job = drawnJob(p, style, 1)
  onJob?.(job)
  return { p, d: await job.result }
}

/** The files of one sketch, in the formats picked that its kind has. */
async function sketchFiles(s: Sketch, n: number, name: string, onJob?: (j: Job<Drawn>) => void): Promise<ZipFile[]> {
  const formats = FORMATS_FOR[style.kind].filter((f) => picked().includes(f))
  const got = await fullDrawn(s, onJob)
  if (!got || !formats.length) return []
  const { p, d } = got
  const frame = frameFor(p.width, p.height, style)
  const ink = style.colours.ink
  const bg = background()
  const stem = sketchFileName(col.name, n, name, style.kind)
  const svg = sketchSvg(d, frame, ink, bg)
  const files: ZipFile[] = []
  for (const f of formats) {
    if (f === 'svg') files.push({ path: `${stem}.svg`, data: svg })
    if (f === 'png') {
      const c = style.kind === 'as-drawn' ? asDrawnCanvas(p, frame, ink, bg, tonesIn.checked) : await svgCanvas(svg, frame.outW, frame.outH)
      files.push({ path: `${stem}.png`, data: new Uint8Array(await (await canvasBlob(c)).arrayBuffer()) })
    }
    if (f === 'pdf') files.push({ path: `${stem}.pdf`, data: drawingPdf(d, frame, ink, bg, style.size.dpi) })
  }
  return files
}

const MIME: Record<string, string> = { svg: 'image/svg+xml', png: 'image/png', pdf: 'application/pdf' }
const asBlob = (f: ZipFile) => new Blob([typeof f.data === 'string' ? f.data : f.data.slice()], { type: MIME[f.path.split('.').pop()!] })

$('sketch-dl').addEventListener('click', async (e) => {
  const s = col.active
  if (!s) return
  const btn = e.currentTarget as HTMLButtonElement
  btn.disabled = true
  try {
    const files = await sketchFiles(s, numberOf(s), namesInOrder().get(s) ?? s.name)
    files.forEach((f, i) => setTimeout(() => download(asBlob(f), f.path), i * 300))
  } catch {
    // Stopped.
  } finally {
    btn.disabled = false
  }
})

$('sketch-copy-svg').addEventListener('click', async (e) => {
  const s = col.active
  const btn = e.currentTarget as HTMLButtonElement
  const got = s ? await fullDrawn(s) : null
  if (!got) return
  await navigator.clipboard.writeText(sketchSvg(got.d, frameFor(got.p.width, got.p.height, style), style.colours.ink, background()))
  flash(btn)
})

/** JPEG bytes of a canvas, on white (JPEG has no transparency). */
async function jpeg(c: HTMLCanvasElement, quality = 0.85): Promise<Uint8Array> {
  const w = document.createElement('canvas')
  w.width = c.width
  w.height = c.height
  const g = w.getContext('2d')!
  g.fillStyle = '#ffffff'
  g.fillRect(0, 0, w.width, w.height)
  g.drawImage(c, 0, 0)
  return new Uint8Array(await (await canvasBlob(w, 'image/jpeg', quality)).arrayBuffer())
}

/** A picture element (canvas or SVG holder) on a canvas, for the contact sheet. */
async function pictureCanvas(el: HTMLElement): Promise<HTMLCanvasElement> {
  if (el instanceof HTMLCanvasElement) return el
  const svg = el.querySelector('svg')!
  const w = Number(svg.getAttribute('width'))
  const h = Number(svg.getAttribute('height'))
  return svgCanvas(svg.outerHTML, w, h)
}

/** The collection (or its favourites) as one zip: every sketch's files, the contact sheet, collection.json, the style, and the photos if asked. */
async function downloadCollection(favouritesOnlyZip: boolean) {
  if (packing) return
  const list = inOrder()
  const take = favouritesOnlyZip ? list.filter((s) => s.favourite) : list
  if (!take.length) {
    if (favouritesOnlyZip) $('sketch-collection-stats').textContent = t('sketch.no-favourites')
    return
  }
  const names = namesInOrder()
  const work = { stopped: false, job: null as Job<Drawn> | null }
  packing = work
  const files: ZipFile[] = []
  const sheet: SheetItem[] = []
  const photos = $<HTMLInputElement>('sketch-photos').checked
  const json: CollectionJson = { app: 'hand-drawn', kind: 'sketch-collection', version: 1, name: col.name, order: col.order, sketches: [] }
  const two = (n: number) => String(n).padStart(2, '0')
  try {
    for (let i = 0; i < take.length; i++) {
      const s = take[i]
      const n = list.indexOf(s) + 1
      const name = names.get(s) ?? s.name
      making('collection', t('sketch.making-zip', { n: i + 1, total: take.length }))
      await breathe()
      if (work.stopped) throw new Error('stopped')
      files.push(...(await sketchFiles(s, n, name, (j) => (work.job = j))))
      if (work.stopped) throw new Error('stopped')
      const pic = await picture(s, 600, style.colours.ink, background(), (j) => (work.job = j))
      if (pic) {
        const c = await pictureCanvas(pic)
        sheet.push({ image: { jpeg: await jpeg(c), width: c.width, height: c.height }, n, name, favourite: s.favourite })
      }
      let file: string | null = null
      if (photos && s.flat) {
        const c = document.createElement('canvas')
        c.width = s.flat.width
        c.height = s.flat.height
        c.getContext('2d')!.putImageData(new ImageData(s.flat.data, s.flat.width, s.flat.height), 0, 0)
        file = `photos/${two(n)}-${slug(name)}.jpg`
        files.push({ path: file, data: await jpeg(c, 0.9) })
      }
      const target = lineUpTarget(s)
      json.sketches.push({
        n,
        name,
        photo: s.photoName,
        file,
        date: s.date ? new Date(s.date).toISOString() : null,
        favourite: s.favourite,
        tune: s.tune,
        lineUp: target ? list.indexOf(target) + 1 : null,
      })
    }
    files.push({ path: 'contact-sheet.pdf', data: contactSheet(col.name, sheet) })
    files.push({ path: 'collection.json', data: JSON.stringify(json, null, 1) + '\n' })
    files.push({ path: 'style.json', data: JSON.stringify(book.named(), null, 2) + '\n' })
    const root = slug(col.name)
    const bytes = zip(files.map((f) => ({ ...f, path: `${root}/${f.path}` })))
    download(new Blob([bytes.buffer as ArrayBuffer], { type: 'application/zip' }), `${root}${favouritesOnlyZip ? '-favourites' : ''}.zip`)
  } catch {
    $('sketch-collection-stats').textContent = t('sketch.stopped')
  } finally {
    packing = null
    making('collection', null)
  }
}

$('sketch-dl-collection').addEventListener('click', () => void downloadCollection(false))
$('sketch-dl-favourites').addEventListener('click', () => void downloadCollection(true))

// ---- Opening a downloaded collection again ----

$('sketch-open').addEventListener('click', () => $('sketch-open-file').click())
$<HTMLInputElement>('sketch-open-file').addEventListener('change', async (e) => {
  const input = e.target as HTMLInputElement
  const f = input.files?.[0]
  input.value = ''
  if (f) await openCollectionZip(f)
})


/** A collection's zip (as Download collection makes it) as a new collection: its photos, names, order, favourites, tuning and style. */
async function openCollectionZip(f: File) {
  const files = unzip(new Uint8Array(await f.arrayBuffer()))
  const find = (name: string) => [...files.entries()].find(([path]) => path === name || path.endsWith(`/${name}`))?.[1]
  let json: CollectionJson | null = null
  try {
    json = readCollectionJson(JSON.parse(new TextDecoder().decode(find('collection.json'))))
  } catch {
    json = null
  }
  if (!json) return alert(t('sketch.open-not-collection'))
  if (!json.sketches.some((s) => s.file && find(s.file))) return alert(t('sketch.open-no-photos'))
  const c = newCollection()
  c.name = json.name
  c.named = true
  c.order = json.order
  try {
    const st = find('style.json')
    if (st) c.style = readSketchStyle(JSON.parse(new TextDecoder().decode(st)))
  } catch {
    c.style = null
  }
  collections.push(c)
  switchCollection(c)
  const byN = new Map<number, Sketch>()
  reading = reading.then(async () => {
    for (const s of json.sketches) {
      const bytes = s.file ? find(s.file) : undefined
      if (!bytes) continue
      const canvas = await openImage(new Blob([bytes.slice()], { type: 'image/jpeg' }), s.file!)
      if (!canvas) continue
      addCanvas(canvas, s.name, true, s.date ? Date.parse(s.date) : null)
      const sk = col.active!
      sk.photoName = s.photo || s.name
      sk.named = true
      sk.favourite = s.favourite
      sk.tune = s.tune
      sk.place = s.n - 1
      byN.set(s.n, sk)
      await breathe()
    }
    json.sketches.forEach((s) => {
      const sk = byN.get(s.n)
      if (sk && s.lineUp != null) sk.lineUp = byN.get(s.lineUp)?.id ?? null
    })
    showCollection()
    drawingChanged()
  })
}

// ---- Keeping collections in this browser ----

const keepIn = $<HTMLInputElement>('sketch-keep')
const keeping = () => keepingOn()
/** Keeping was asked for before this browser allowed storage: it starts once allowed. */
let wantKeep = false
/** Kept collections are being opened: nothing is kept again until they are in. */
let restoring = false

function showKeep() {
  keepIn.checked = keepingOn()
  $('sketch-keep-hint').textContent = wantKeep && !storageAllowed() ? t('sketch.keep.ask') : t('sketch.keep.hint')
  $('sketch-delete').hidden = !keepingOn() || !col.sketches.length
}

keepIn.addEventListener('change', async () => {
  if (keepIn.checked) {
    // Nothing is stored without consent: the privacy card asks first.
    if (!storageAllowed()) {
      keepIn.checked = false
      wantKeep = true
      showKeep()
      privacySettings()
      return
    }
    await setKeeping(true)
    keepAll()
  } else {
    if (!confirm(t('sketch.keep-off-ask'))) {
      keepIn.checked = true
      return
    }
    await setKeeping(false)
  }
  showKeep()
})

onStorageChange(async (allowed) => {
  if (allowed && wantKeep) {
    wantKeep = false
    await setKeeping(true)
    keepAll()
  }
  if (!allowed) wantKeep = false
  showKeep()
})

/** The flattened photo as JPEG: the kept one for a kept sketch, else made from the straightened photo (once per photo). */
const photoBlobs = new WeakMap<object, Blob>()
async function photoOf(s: Sketch): Promise<Blob | null> {
  if (s.kept && s.whole) return s.kept
  const flat = s.flat
  if (!flat) return s.kept
  const made = photoBlobs.get(flat)
  if (made) return made
  const c = document.createElement('canvas')
  c.width = flat.width
  c.height = flat.height
  c.getContext('2d')!.putImageData(new ImageData(flat.data, flat.width, flat.height), 0, 0)
  const blob = await canvasBlob(c, 'image/jpeg', 0.9)
  photoBlobs.set(flat, blob)
  return blob
}

let saveTimer = 0
function saveSoon() {
  if (!keepingOn() || restoring) return
  clearTimeout(saveTimer)
  const c = col
  saveTimer = window.setTimeout(() => void keepCollection(c), 800)
}

/** Keep one collection as it is now; an empty one is not kept. */
async function keepCollection(c: Collection) {
  if (!keepingOn() || c.pending) return
  const sketches: KeptSketch[] = []
  for (const s of c.sketches) {
    const photo = await photoOf(s)
    if (!photo) continue
    const { id, name, named, photoName, pick, added, place, favourite, date, tune, lineUp } = s
    sketches.push({ id, name, named, photoName, pick, added, place, favourite, date, tune, lineUp, photo })
  }
  try {
    if (!sketches.length) return await forget(c.id)
    await keep({ id: c.id, name: c.name, named: c.named, order: c.order, added: c.added, style: c.style, active: c.active?.id ?? null, saved: Date.now(), sketches })
  } catch {
    // Storage full or blocked: the collection still works for this visit.
  }
}

function keepAll() {
  for (const c of collections) void keepCollection(c)
}

/** The collections kept in this browser, on arrival: the latest opens, the others when picked. */
async function restore() {
  const kept = await keptCollections()
  if (!kept.length) return
  // Kept ids stay; new ones count on from the highest.
  ids = Math.max(ids, ...kept.flatMap((k) => [k.id, ...k.sketches.map((s) => s.id)]))
  const back: Collection[] = kept.map((k) => ({
    id: k.id,
    name: k.name,
    named: k.named,
    order: k.order,
    sketches: [],
    active: null,
    added: k.added,
    style: k.style ? readSketchStyle(k.style) : null,
    pending: k.sketches,
  }))
  const activeOf = new Map(kept.map((k) => [k.id, k.active]))
  // The empty collection the page started with makes way, unless photos went into it already.
  if (!col.sketches.length) collections = collections.filter((c) => c !== col)
  collections.push(...back)
  for (const c of back) c.active = null
  pendingActive = activeOf
  if (!col.sketches.length) switchCollection(back[0])
  else showCollection()
}
let pendingActive = new Map<number, number | null>()

/** Open a kept collection's sketches: each photo read through the scan step in turn, then its active sketch again. */
function openKept(c: Collection) {
  const list = c.pending ?? []
  c.pending = null
  restoring = true
  reading = reading.then(async () => {
    try {
      for (let i = 0; i < list.length; i++) {
        // Another collection was picked meanwhile: the rest wait until this one is picked again.
        if (col !== c) {
          c.pending = list.slice(i)
          break
        }
        const k = list[i]
        const canvas = await openImage(k.photo, `${k.photoName}.jpg`)
        if (!canvas) continue
        const s: Sketch = { ...k, canvas, whole: true, art: null, flat: null, kept: k.photo }
        c.sketches.push(s)
        open(s)
        await breathe()
      }
      const a = c.sketches.find((s) => s.id === pendingActive.get(c.id))
      if (a && col === c && a !== c.active) open(a)
    } finally {
      restoring = false
      showCollection()
      drawingChanged()
    }
  })
}

$('sketch-delete').addEventListener('click', async () => {
  if (!confirm(t('sketch.delete-ask', { name: col.name, n: col.sketches.length }))) return
  await forget(col.id)
  collections = collections.filter((c) => c !== col)
  if (!collections.length) collections.push(newCollection())
  switchCollection(collections[0])
  showKeep()
})

// ---- Showing the view ----

/** Called when the Sketches view is shown. */
export function showSketch() {
  renderSoon()
  tilesSoon()
  compareSoon()
}

tonesIn.addEventListener('change', () => {
  renderSoon()
  tilesSoon()
  compareSoon()
})

fillFields(book.current)
applied()
showCollection()
showKeep()
void restore()
