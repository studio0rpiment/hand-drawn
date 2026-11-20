// The Texture view: upload a photo and adjust the image (its own scan step),
// then either make PBR maps from it (maps-view.ts: crop, seamless tile, base
// colour, height, normal, roughness, ambient occlusion, as files), or print
// the drawing as stamp, riso, halftone or plain ink, lay it out once or as a
// seamless tile, and export a PNG.

import { scanControls } from '../ui/scan-markup'
import { ScanStep, type Scanned } from '../ui/scan-step'
import { slug } from '../icon/style'
import { t, tHtml, tn } from '../text'
import { buildFields, fixed, pct, plain, type FieldGroup } from '../ui/fields'
import { StyleBook, styleBox } from '../ui/styles'
import { flash } from '../ui/hand'
import { compose } from './compose'
import { plan } from './layout'
import { printArt, printKey, resizeArt, type Art, type Print } from './looks'
import { BASE_COLOURS, BUILT_IN, DOTS, FORMATS, LAYOUTS, LOOKS, MAKES, MAX_MAP, MAX_SIDE, NORMAL_Y, readTextureStyle, type TextureStyle } from './style'
import { heightSourceIds } from './height'
import { renderMaps, setMapArt } from './maps-view'
import { DPI, PRESETS } from '../ui/size-presets'

const px = (v: number) => `${v} px`
const deg = (v: number) => `${v}°`
type S = TextureStyle

// The scan step's controls go in first: the rest of the view reads them.
scanControls('texture', {
  upload: tHtml('texture.upload'),
  sheetHint: tHtml('texture.sheet.hint'),
  colourExtra: `<label class="check"><input id="texture-scan-colours" type="checkbox" checked /> ${tHtml('texture.scan-colours')}</label>`,
})

const pct1 = (v: number) => `${(v * 100).toFixed(1)}%`
const signedPct = (v: number) => `${v > 0 ? '+' : ''}${Math.round(v * 100)}%`
const isPrint = (s: S) => s.make === 'print'

const MAKE_GROUPS: FieldGroup[] = [
  {
    legend: t('texture.g.make'),
    hint: t('texture.g.make.hint'),
    fields: [{ kind: 'select', path: 'make', label: t('texture.f.make'), options: MAKES }],
  },
]

/** Adjust drawing, for maps: the part of the image used, and the seamless tile. */
const SURFACE_GROUPS: FieldGroup[] = [
  {
    legend: t('texture.g.surface'),
    hint: t('texture.g.surface.hint'),
    fields: [
      { kind: 'range', path: 'surface.crop', label: t('texture.f.surface-crop'), min: 0, max: 0.25, step: 0.005, fmt: pct1 },
      { kind: 'check', path: 'surface.seamless', label: t('texture.f.surface-seamless') },
    ],
  },
  {
    legend: t('texture.g.seams'),
    hint: t('texture.g.seams.hint'),
    when: (s: S) => s.surface.seamless,
    presets: [{ label: 'Shuffle', path: 'seed', value: () => Math.floor(Math.random() * 1000000), icon: 'scatter-fill' }],
    fields: [
      { kind: 'range', path: 'surface.seam', label: t('texture.f.surface-seam'), min: 0.02, max: 0.33, step: 0.01, fmt: pct },
      { kind: 'range', path: 'surface.ragged', label: t('texture.f.surface-ragged'), min: 0, max: 1, step: 0.05, fmt: pct },
    ],
  },
]

/** Adjust styles, for maps: how each map is worked out. */
const MAP_GROUPS: FieldGroup[] = [
  {
    legend: t('texture.g.height'),
    hint: t('texture.g.height.hint'),
    fields: [
      { kind: 'select', path: 'maps.height', label: t('texture.f.maps-height'), options: heightSourceIds() },
      { kind: 'check', path: 'maps.darkHigh', label: t('texture.f.maps-darkHigh') },
      { kind: 'range', path: 'maps.soften', label: t('texture.f.maps-soften'), min: 0, max: 0.03, step: 0.001, fmt: pct1 },
      { kind: 'range', path: 'maps.detail', label: t('texture.f.maps-detail'), min: 0, max: 1, step: 0.05, fmt: pct },
    ],
  },
  {
    legend: t('texture.g.normal'),
    fields: [
      { kind: 'range', path: 'maps.depth', label: t('texture.f.maps-depth'), min: 0, max: 1, step: 0.01, fmt: pct },
      { kind: 'select', path: 'maps.normalY', label: t('texture.f.maps-normalY'), options: NORMAL_Y },
    ],
  },
  {
    legend: t('texture.g.roughness'),
    hint: t('texture.g.roughness.hint'),
    fields: [
      { kind: 'range', path: 'maps.roughness', label: t('texture.f.maps-roughness'), min: 0, max: 1, step: 0.01, fmt: pct },
      { kind: 'range', path: 'maps.roughVary', label: t('texture.f.maps-roughVary'), min: -1, max: 1, step: 0.05, fmt: signedPct },
    ],
  },
  {
    legend: t('texture.g.ao'),
    fields: [
      { kind: 'range', path: 'maps.ao', label: t('texture.f.maps-ao'), min: 0, max: 1, step: 0.05, fmt: pct },
      { kind: 'range', path: 'maps.aoReach', label: t('texture.f.maps-aoReach'), min: 0.005, max: 0.15, step: 0.005, fmt: pct1 },
    ],
  },
  {
    legend: t('texture.g.base'),
    fields: [
      { kind: 'select', path: 'maps.colour', label: t('texture.f.maps-colour'), options: BASE_COLOURS },
      { kind: 'range', path: 'maps.evenLight', label: t('texture.f.maps-evenLight'), min: 0, max: 1, step: 0.05, fmt: pct },
    ],
  },
]

/** Output, for maps: the files' format and quality (their size has its own inputs). */
const FILE_GROUPS: FieldGroup[] = [
  {
    legend: '',
    fields: [
      { kind: 'select', path: 'file.format', label: t('texture.f.file-format'), options: FORMATS },
      { kind: 'range', path: 'file.quality', label: t('texture.f.file-quality'), min: 0.3, max: 1, step: 0.01, fmt: pct },
    ],
  },
]

const GROUPS: FieldGroup[] = [
  {
    legend: t('texture.g.look'),
    when: isPrint,
    presets: [{ label: 'Shuffle', path: 'seed', value: () => Math.floor(Math.random() * 1000000), icon: 'scatter-fill' }],
    fields: [
      { kind: 'select', path: 'look', label: t('texture.f.look'), options: LOOKS },
      { kind: 'range', path: 'seed', label: t('texture.f.seed'), min: 0, max: 999, step: 1, fmt: plain },
      { kind: 'range', path: 'tone.black', label: t('texture.f.tone-black'), min: 0, max: 200, step: 1, fmt: plain },
      { kind: 'range', path: 'tone.white', label: t('texture.f.tone-white'), min: 60, max: 255, step: 1, fmt: plain },
      { kind: 'range', path: 'tone.gamma', label: t('texture.f.tone-gamma'), min: 0.3, max: 3, step: 0.05, fmt: fixed(2) },
      { kind: 'range', path: 'grain', label: t('texture.f.grain'), min: 0, max: 1, step: 0.05, fmt: pct },
    ],
  },
  {
    legend: t('texture.g.stamp'),
    when: (s: S) => isPrint(s) && s.look === 'stamp',
    fields: [
      { kind: 'range', path: 'stamp.bleed', label: t('texture.f.stamp-bleed'), min: 0, max: 12, step: 0.5, fmt: px },
      { kind: 'range', path: 'stamp.rough', label: t('texture.f.stamp-rough'), min: 0, max: 1, step: 0.05, fmt: pct },
      { kind: 'range', path: 'stamp.roughSize', label: t('texture.f.stamp-roughSize'), min: 1, max: 40, step: 1, fmt: px },
      { kind: 'range', path: 'stamp.wear', label: t('texture.f.stamp-wear'), min: 0, max: 1, step: 0.05, fmt: pct },
      { kind: 'range', path: 'stamp.wearSize', label: t('texture.f.stamp-wearSize'), min: 4, max: 200, step: 2, fmt: px },
      { kind: 'range', path: 'stamp.pressure', label: t('texture.f.stamp-pressure'), min: 0, max: 1, step: 0.05, fmt: pct },
    ],
  },
  {
    legend: t('texture.g.risograph'),
    when: (s: S) => isPrint(s) && s.look === 'riso',
    fields: [
      { kind: 'check', path: 'riso.second', label: t('texture.f.riso-second') },
      { kind: 'range', path: 'riso.offsetX', label: t('texture.f.riso-offsetX'), min: -30, max: 30, step: 1, fmt: px },
      { kind: 'range', path: 'riso.offsetY', label: t('texture.f.riso-offsetY'), min: -30, max: 30, step: 1, fmt: px },
    ],
  },
  {
    legend: t('texture.g.halftone'),
    when: (s: S) => isPrint(s) && s.look === 'halftone',
    fields: [
      { kind: 'select', path: 'halftone.shape', label: t('texture.f.halftone-shape'), options: DOTS },
      { kind: 'range', path: 'halftone.cell', label: t('texture.f.halftone-cell'), min: 3, max: 40, step: 1, fmt: px },
      { kind: 'range', path: 'halftone.angle', label: t('texture.f.halftone-angle'), min: 0, max: 180, step: 1, fmt: deg },
    ],
  },
  {
    legend: t('texture.g.colours'),
    when: isPrint,
    fields: [
      { kind: 'color', path: 'colors.ink2', label: t('texture.f.colors-ink2') },
      { kind: 'range', path: 'colors.paperGrain', label: t('texture.f.colors-paperGrain'), min: 0, max: 1, step: 0.05, fmt: pct },
    ],
  },
  {
    legend: t('texture.g.own-colours'),
    // Hidden while the texture takes the scan's ink and paper.
    when: (s: S) => isPrint(s) && !$<HTMLInputElement>('texture-scan-colours').checked,
    fields: [
      { kind: 'color', path: 'colors.ink', label: t('texture.f.colors-ink') },
      { kind: 'color', path: 'colors.paper', label: t('texture.f.colors-paper') },
      { kind: 'check', path: 'colors.onPaper', label: t('texture.f.colors-onPaper') },
    ],
  },
  {
    legend: t('texture.g.layout'),
    when: isPrint,
    fields: [
      { kind: 'select', path: 'layout.mode', label: t('texture.f.layout-mode'), options: LAYOUTS },
      { kind: 'range', path: 'layout.scale', label: t('texture.f.layout-scale'), min: 0.05, max: 1.5, step: 0.01, fmt: pct },
      { kind: 'range', path: 'layout.jitter', label: t('texture.f.layout-jitter'), min: 0, max: 180, step: 1, fmt: deg },
      { kind: 'range', path: 'layout.margin', label: t('texture.f.layout-margin'), min: 0, max: 600, step: 4, fmt: px },
      { kind: 'range', path: 'layout.gap', label: t('texture.f.layout-gap'), min: 0, max: 2, step: 0.05, fmt: pct },
      { kind: 'range', path: 'layout.count', label: t('texture.f.layout-count'), min: 1, max: 40, step: 1, fmt: plain },
    ],
  },
]

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T

// Storage keys keep the project's first name, sketch-to-mark, so styles saved before the rename still load.
const book = new StyleBook<TextureStyle>({ noun: 'texture', key: 'sketch-to-mark.texture-styles', builtIn: BUILT_IN, read: readTextureStyle })
/** The latest from the scan step. */
let scanned: Scanned | null = null

/** The style as drawn: with the image's ink and paper when "Texture in these colours" is on. */
function withScan(s: TextureStyle): TextureStyle {
  if (!$<HTMLInputElement>('texture-scan-colours').checked || !scanned) return s
  const { ink, paper } = scanned.colours
  return { ...s, colors: { ...s.colors, ink, paper: paper ?? s.colors.paper, onPaper: paper !== null } }
}
let style = withScan(book.current)

let rawArt: Art | null = null
let art: Art | null = null
let artName = 'drawing'
let print: Print | null = null
let printedFor = ''
let result: HTMLCanvasElement | null = null

const box = styleBox(book, () => applied(), { markBuiltIn: false, actionsApart: true })
$('texture-style-box').replaceWith(box.element)
box.title(t('texture.presets'))
// Saving, sharing and resetting presets sit with the export, at the bottom.
$('texture-style-actions').replaceWith(box.actions)
const fillFields = buildFields($('texture-fields'), GROUPS, 'tex', () => book.current, update)
const fillMake = buildFields($('texture-make-fields'), MAKE_GROUPS, 'tex', () => book.current, update)
const fillSurface = buildFields($('texture-surface-fields'), SURFACE_GROUPS, 'tex', () => book.current, update)
const fillMaps = buildFields($('texture-map-fields'), MAP_GROUPS, 'tex', () => book.current, update)
const fillFile = buildFields($('texture-file-fields'), FILE_GROUPS, 'tex', () => book.current, update)
// The file fields sit inside the Files fieldset: no fieldset of their own.
for (const fs of $('texture-file-fields').querySelectorAll('fieldset')) fs.replaceWith(...[...fs.childNodes].filter((n) => n.nodeName !== 'LEGEND'))

function update(next: TextureStyle) {
  book.edit(next)
  applied()
}

function applied() {
  style = withScan(book.current)
  $('texture-app').dataset.make = book.current.make
  fillFields(book.current)
  fillMake(book.current)
  fillSurface(book.current)
  fillMaps(book.current)
  fillFile(book.current)
  fillMapSize()
  fillSize()
  box.refresh()
  renderSoon()
}

// ---- Size ----

const presetPick = $<HTMLSelectElement>('tex-preset')
const sizeW = $<HTMLInputElement>('tex-w')
const sizeH = $<HTMLInputElement>('tex-h')
const sizeLock = $<HTMLInputElement>('tex-lock')
const sizeFit = $<HTMLInputElement>('tex-fit')

presetPick.append(new Option(t('texture.custom'), ''))
for (const g of [...new Set(PRESETS.map((p) => p.group))]) {
  const og = document.createElement('optgroup')
  og.label = t(`texture.size-group.${g}`)
  PRESETS.forEach((p, i) => p.group === g && og.append(new Option(t(`texture.size.${p.id}`), String(i))))
  presetPick.append(og)
}

/** Show the edited style's size in the Size controls. */
function fillSize() {
  const L = book.current.layout
  sizeW.value = String(L.width)
  sizeH.value = String(L.height)
  sizeFit.checked = L.fit
  const i = PRESETS.findIndex((p) => p.w === L.width && p.h === L.height)
  presetPick.value = i < 0 ? '' : String(i)
  const fitted = L.mode === 'single' && L.fit
  sizeFit.closest('label')!.hidden = L.mode !== 'single'
  sizeW.disabled = sizeH.disabled = presetPick.disabled = fitted
  const inch = (v: number) => (v / DPI).toFixed(2).replace(/\.?0+$/, '')
  const mm = (v: number) => Math.round((v / DPI) * 25.4)
  $('tex-size-note').textContent = fitted
    ? t('texture.fits')
    : t('texture.size-note', {
        what: t(L.mode === 'single' ? 'texture.one-print' : 'texture.tile'),
        inW: inch(L.width),
        inH: inch(L.height),
        mmW: mm(L.width),
        mmH: mm(L.height),
        dpi: DPI,
      })
}

function setSize(width: number, height: number) {
  const clampSide = (v: number) => Math.round(Math.min(MAX_SIDE, Math.max(64, v || 64)))
  update({ ...book.current, layout: { ...book.current.layout, width: clampSide(width), height: clampSide(height) } })
}

presetPick.addEventListener('change', () => {
  const p = PRESETS[Number(presetPick.value)]
  if (presetPick.value && p) setSize(p.w, p.h)
})
for (const [input, other] of [[sizeW, sizeH], [sizeH, sizeW]] as const) {
  input.addEventListener('change', () => {
    const L = book.current.layout
    const v = Number(input.value)
    if (!sizeLock.checked) return setSize(input === sizeW ? v : L.width, input === sizeH ? v : L.height)
    // Proportions kept: the other side follows.
    const ratio = input === sizeW ? L.height / L.width : L.width / L.height
    other.value = String(Math.round(v * ratio))
    setSize(Number(sizeW.value), Number(sizeH.value))
  })
}
$('tex-swap').addEventListener('click', () => setSize(book.current.layout.height, book.current.layout.width))
sizeFit.addEventListener('change', () => update({ ...book.current, layout: { ...book.current.layout, fit: sizeFit.checked } }))

// ---- Map size ----

const mapW = $<HTMLInputElement>('map-w')
const mapH = $<HTMLInputElement>('map-h')

function fillMapSize() {
  mapW.value = String(book.current.file.width)
  mapH.value = String(book.current.file.height)
  const q = $('texture-file-fields').querySelector<HTMLElement>('input[type="range"]')?.closest('label')
  if (q) q.hidden = book.current.file.format === 'png'
}

function setMapSize(width: number, height: number) {
  const side = (v: number) => Math.round(Math.min(MAX_MAP, Math.max(16, v || 16)))
  update({ ...book.current, file: { ...book.current.file, width: side(width), height: side(height) } })
}

mapW.addEventListener('change', () => setMapSize(Number(mapW.value), book.current.file.height))
mapH.addEventListener('change', () => setMapSize(book.current.file.width, Number(mapH.value)))
$('map-swap').addEventListener('click', () => setMapSize(book.current.file.height, book.current.file.width))
for (const b of document.querySelectorAll<HTMLButtonElement>('[data-square]')) {
  b.addEventListener('click', () => setMapSize(Number(b.dataset.square), Number(b.dataset.square)))
}

// ---- Rendering ----

let timer = 0
function renderSoon() {
  clearTimeout(timer)
  timer = window.setTimeout(render, 120)
}

function render() {
  if ($('texture-app').hidden) return
  if (book.current.make === 'maps') {
    const paper = scanned?.colours.paper ?? book.current.colors.paper
    void renderMaps(book.current, { ink: scanned?.colours.ink ?? book.current.colors.ink, paper })
    return
  }
  // No drawing: the print is an empty box with its name.
  $('texture-print-pane').classList.toggle('empty', !rawArt)
  if (!rawArt) {
    $('texture-repeat-pane').hidden = true
    result = null
    $('texture-stats').textContent = ''
  }
  if (!rawArt || $('texture-app').hidden) return
  art ??= resizeArt(rawArt)
  const t0 = performance.now()
  const key = printKey(style)
  if (!print || printedFor !== key) {
    print = printArt(art, style)
    printedFor = key
  }
  const p = plan(style, print.width, print.height)
  result = compose(print, p, style)
  const shown = $<HTMLCanvasElement>('texture-view')
  shown.width = result.width
  shown.height = result.height
  shown.getContext('2d')!.drawImage(result, 0, 0)
  drawRepeat(p.wrap)
  const ms = Math.round(performance.now() - t0)
  $('texture-stats').textContent = t('texture.stats', {
    width: result.width,
    height: result.height,
    prints: tn('texture.prints', p.items.length),
    seamless: p.wrap ? ` ${t('texture.seamless')}` : '',
    ms,
  })
}

/** For patterns, the tile 2 × 2, so seams would show. */
function drawRepeat(wrap: boolean) {
  const c = $<HTMLCanvasElement>('texture-repeat')
  $('texture-repeat-pane').hidden = !wrap
  if (!wrap || !result) return
  // The tile 2 × 2, at most 600 px a tile on its longer side.
  const k = Math.min(1, 600 / Math.max(result.width, result.height))
  const w = Math.round(result.width * k)
  const h = Math.round(result.height * k)
  c.width = w * 2
  c.height = h * 2
  const g = c.getContext('2d')!
  g.imageSmoothingQuality = 'high'
  for (const [x, y] of [[0, 0], [1, 0], [0, 1], [1, 1]]) g.drawImage(result, x * w, y * h, w, h)
}

// ---- Exports ----

function download(blob: Blob, filename: string) {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = filename
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 1000)
}

const fileStem = () => `${slug(artName)}-${slug(style.look)}${style.layout.mode === 'single' ? '' : '-pattern'}`

$('texture-png').addEventListener('click', () => {
  result?.toBlob((b) => b && download(b, `${fileStem()}.png`), 'image/png')
})

$('texture-css').addEventListener('click', async (e) => {
  if (!result) return
  const btn = e.currentTarget as HTMLButtonElement
  const size = style.layout.mode === 'single' ? 'contain' : `${result.width / 2}px ${result.height / 2}px`
  const repeat = style.layout.mode === 'single' ? 'no-repeat' : 'repeat'
  // Half size in CSS so the tile stays sharp on high-density screens.
  await navigator.clipboard.writeText(`background: url("${fileStem()}.png") 0 0 / ${size} ${repeat};\n`)
  flash(btn)
})

// ---- Upload and adjust image ----

const scan = new ScanStep('texture', (next) => {
  const coloursChanged = JSON.stringify(next.colours) !== JSON.stringify(scanned?.colours)
  scanned = next
  if (next.art?.mask !== rawArt?.mask) setArt(next.art, next.name)
  if (coloursChanged && ($<HTMLInputElement>('texture-scan-colours').checked || book.current.make === 'maps')) applied()
})

/** A photo opened, dropped or pasted while the Texture view is open. */
export function openTexturePhoto(blob: Blob, name: string) {
  return scan.open(blob, name)
}

/** The sample drawing, the page filling the photo. */
export async function loadTextureSample() {
  const res = await fetch('/sample-drawing.jpg')
  if (!res.ok) return
  const bitmap = await createImageBitmap(await res.blob())
  const c = document.createElement('canvas')
  c.width = bitmap.width
  c.height = bitmap.height
  c.getContext('2d', { willReadFrequently: true })!.drawImage(bitmap, 0, 0)
  bitmap.close()
  scan.openCanvas(c, 'sample', true)
}

/** The picked drawing: the light-evened photo and the ink, cropped alike. */
function setArt(next: Art | null, name: string) {
  // Resized only when the Texture view draws, not on every change made in the scan step.
  rawArt = next
  art = null
  artName = name
  print = null
  setMapArt(scanned?.art ?? null, name)
  renderSoon()
}

export function showTexture() {
  renderSoon()
}

$('texture-scan-colours').addEventListener('change', applied)

applied()
