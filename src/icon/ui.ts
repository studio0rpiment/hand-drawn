// The Icon view, top to bottom like the Font view: upload a photo, adjust the
// image (its own scan step), adjust the drawing (fine tuning), adjust the
// style, then the downloads with the preset controls.

import { flipLightness, hexRgb } from '../colour'
import { fineTune, type FineTune } from '../finetune'
import type { Mask } from '../image'
import { toSvg, trace } from '../trace'
import { scanControls } from '../ui/scan-markup'
import { ScanStep, type Scanned } from '../ui/scan-step'
import { globePair } from '../ui/sphere'
import { t, tHtml, tn, tOr } from '../text'
import { buildFields, fixed, pct, plain, type FieldGroup } from '../ui/fields'
import { StyleBook, styleBox } from '../ui/styles'
import { flash } from '../ui/hand'
import { buildIcon, faviconVariant, headSnippet, packZip, rasterize, shapeKey } from './pack'
import { BUILT_IN, CONTAINERS, DIRECTIONS, DIRECTION_GROUPS, VARIANTS, readStyle, slug, type IconStyle } from './style'
import { zip, type ZipFile } from './files'
import { sprite, spriteSet, standaloneSvg, type IconPaths } from './svg'
import { TEMPLATE_PAGES, iconSheetSvg } from './template'
import { baseName, openImage } from '../ui/open-image'

// The scan step's controls go in first: the rest of the view reads them.
const pageButton = (page: number) => {
  const cats = [...new Set(TEMPLATE_PAGES[page].map((i) => i.category))]
  return `<button id="icon-print-${page + 1}" class="button small sheet-print" type="button" title="${tHtml('icon.template-print', { page: page + 1, categories: cats.join(' · ') })}" data-icon="strokes-fill" data-icon-after="printer-fill">${tHtml('icon.template-page', { page: page + 1, category: cats[0] })}</button>`
}
scanControls('icon', {
  upload: `${tHtml('icon.upload')} <span class="pages-count" id="icon-pages-count"></span>`,
  multiple: true,
  sheetOn: true,
  setup: `
    <div class="name-row">
      <label class="field inline">${tHtml('icon.set-name')} <input id="icon-set-name" type="text" spellcheck="false" autocomplete="off" /></label>
      <label class="field inline">${tHtml('icon.set-size')} <select id="icon-set-size"></select></label>
    </div>
    <div class="template-row">
      <button id="icon-template-toggle" class="button small fold-toggle" type="button" aria-expanded="false" aria-controls="icon-template-body">${tHtml('icon.template')}</button>
      <label class="check trace-check"><input id="icon-template-on" type="checkbox" /> ${tHtml('icon.template-on')}</label>
    </div>
    <div class="sheet-body" id="icon-template-body" hidden>
      <p class="hint">${tHtml('icon.template.hint')}</p>
      <div class="sheet-pages">
        ${TEMPLATE_PAGES.map((_, p) => pageButton(p)).join('')}
        <button id="icon-template-svg" class="button small sheet-print" type="button" data-icon="arrow-bar-fill-r90">${tHtml('icon.template-dl')}</button>
      </div>
    </div>`,
  after: `<div class="set-pages" id="icon-pages" role="listbox" aria-label="${tHtml('icon.pages')}" hidden></div>`,
  sheetHint: tHtml('icon.sheet.hint'),
  colourExtra: `<label class="check"><input id="icon-scan-colours" type="checkbox" checked /> ${tHtml('icon.scan-colours')}</label>`,
})

// ---- The editable fields. One line per style setting. ----

const GROUPS: FieldGroup[] = [
  {
    legend: t('icon.g.shape'),
    hint: t('icon.g.shape.hint'),
    fields: [
      { kind: 'range', path: 'padding', label: t('icon.f.padding'), min: 0, max: 0.4, step: 0.01, fmt: pct },
      { kind: 'range', path: 'padding45', label: t('icon.f.padding45'), min: 0, max: 0.4, step: 0.01, fmt: pct },
      { kind: 'check', path: 'fillClosed', label: t('icon.f.fillClosed') },
      { kind: 'range', path: 'bridge', label: t('icon.f.bridge'), min: 0, max: 200, step: 1, fmt: plain },
      { kind: 'range', path: 'pinholes', label: t('icon.f.pinholes'), min: 0, max: 2000, step: 10, fmt: plain },
      { kind: 'range', path: 'trace.smoothness', label: t('icon.f.trace-smoothness'), min: 0, max: 1.33, step: 0.01, fmt: fixed(2) },
      { kind: 'range', path: 'trace.simplify', label: t('icon.f.trace-simplify'), min: 0, max: 1.5, step: 0.05, fmt: fixed(2) },
      { kind: 'select', path: 'canvas', label: t('icon.f.canvas'), options: [512, 1024, 2048] },
    ],
  },
  {
    legend: t('icon.g.variants'),
    fields: [
      { kind: 'multi', path: 'variants', label: t('icon.f.variants'), options: VARIANTS },
      { kind: 'range', path: 'lineWidth', label: t('icon.f.lineWidth'), min: 0, max: 120, step: 1, fmt: (v: number) => (v ? plain(v) : t('icon.as-drawn')) },
      { kind: 'range', path: 'tintOpacity', label: t('icon.f.tintOpacity'), min: 0, max: 1, step: 0.05, fmt: pct },
    ],
  },
  {
    legend: t('icon.g.orientation'),
    presets: Object.entries(DIRECTION_GROUPS).map(([label, value]) => ({ label, path: 'directions', value })),
    fields: [{ kind: 'multi', path: 'directions', label: t('icon.f.directions'), options: DIRECTIONS }],
  },
  {
    legend: t('icon.g.container'),
    fields: [
      { kind: 'select', path: 'container.shape', label: t('icon.f.container-shape'), options: CONTAINERS },
      { kind: 'range', path: 'container.radius', label: t('icon.f.container-radius'), min: 0, max: 0.5, step: 0.01, fmt: pct },
    ],
  },
  {
    legend: t('icon.g.colours'),
    // Hidden while the icons take the scan's colours.
    when: () => !$<HTMLInputElement>('icon-scan-colours').checked,
    fields: [
      { kind: 'color', path: 'light.ink', label: t('icon.f.light-ink') },
      { kind: 'color', path: 'light.bg', label: t('icon.f.light-bg') },
      { kind: 'color', path: 'dark.ink', label: t('icon.f.dark-ink') },
      { kind: 'color', path: 'dark.bg', label: t('icon.f.dark-bg') },
    ],
  },
  {
    legend: t('icon.g.favicon-and-sprite'),
    fields: [
      { kind: 'select', path: 'favicon.variant', label: t('icon.f.favicon-variant'), options: VARIANTS },
      { kind: 'select', path: 'favicon.small', label: t('icon.f.favicon-small'), options: VARIANTS },
      { kind: 'text', path: 'prefix', label: t('icon.f.prefix'), pattern: '[a-z][a-z0-9-]{0,15}' },
    ],
  },
]

// ---- State ----

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T

// Storage keys keep the project's first name, sketch-to-mark, so styles saved before the rename still load.
const book = new StyleBook<IconStyle>({ noun: 'icon', key: 'sketch-to-mark.styles', builtIn: BUILT_IN, read: readStyle })
/** The latest from the scan step: the drawings on the photo and its colours. */
let scanned: Scanned = { name: 'drawing', drawings: [], pick: 0, sheet: false, colours: { ink: '#1d1a24', paper: null }, art: null, flat: null, photo: 0, template: null }

/**
 * The style as drawn: the edited one, with the image's colours when "Icons
 * in these colours" is on (the dark version turns their lightness over). The
 * book keeps the style's own colours either way.
 */
function withScan(s: IconStyle): IconStyle {
  if (!$<HTMLInputElement>('icon-scan-colours').checked) return s
  const { ink, paper } = scanned.colours
  const bg = paper ?? '#ffffff'
  return { ...s, light: { ink, bg }, dark: { ink: flipLightness(ink), bg: flipLightness(bg) } }
}
let style = withScan(book.current)

let mask: Mask | null = null
let maskName = 'mark'
let nameTouched = false
let paths: IconPaths | null = null
let builtFor = ''
let dirty = true

// ---- Controls ----

const box = styleBox(book, () => applied(), { markBuiltIn: false, actionsApart: true })
$('icon-style-box').replaceWith(box.element)
box.title(t('icon.presets'))
// Saving, sharing and resetting presets sit with the downloads, at the bottom.
$('icon-style-actions').replaceWith(box.actions)
const fillFields = buildFields($('style-fields'), GROUPS, 'icon', () => book.current, update)

/** Every edit goes through here: validate, remember, redraw. */
function update(next: IconStyle) {
  book.edit(next)
  applied()
}

/** After the edited style changed: sync the controls, retrace if the shape changed, else redraw. */
function applied() {
  style = withScan(book.current)
  fillFields(book.current)
  box.refresh()
  if (shapeKey(style) !== builtFor) retraceSoon()
  else render()
  // The set redraws in the new colours, and rebuilds if the shape settings changed.
  if (shapeKey(style) !== setBuiltFor) buildSetSoon()
  else drawSet()
}

$('icon-scan-colours').addEventListener('change', applied)

const nameInput = $<HTMLInputElement>('icon-name')
nameInput.addEventListener('input', () => {
  nameTouched = true
  render()
})
const iconName = () => slug(nameInput.value || maskName)

// ---- Tracing and previews ----

/** Let the page draw between two long steps (a photo read, an icon traced), so it never holds still. */
const breathe = () => new Promise<void>((r) => requestAnimationFrame(() => setTimeout(r, 0)))

let retraceTimer = 0
let buildRun = 0

function retraceSoon() {
  dirty = true
  clearTimeout(retraceTimer)
  retraceTimer = window.setTimeout(retrace, 250)
}

async function retrace() {
  if (!mask || $('icon-app').hidden) return
  const run = ++buildRun
  const key = shapeKey(style)
  $('icon-stats').textContent = t('icon.tracing')
  const built = await buildIcon(mask, style)
  if (run !== buildRun) return
  paths = built.paths
  builtFor = key
  dirty = false
  render()
}

let renderRun = 0
let urls: string[] = []

async function render() {
  if (!paths) return
  const p = paths
  showEmpty()
  const run = ++renderRun
  renderFamily(p)
  const kb = (n: string) => (new Blob([n]).size / 1024).toFixed(1)
  const sp = sprite(iconName(), p, style)
  $('icon-stats').textContent =
    t('icon.stats', { symbols: style.variants.length * style.directions.length, kb: kb(sp.svg) }) +
    (p.solid !== p.ink ? ` ${t('icon.stats-filled')}` : '')

  // Pixel-true favicon sizes need real rasterizing. Rasterize everything first and
  // build images only if no newer render started, so no image loads a revoked URL.
  const schemes = [['light', style.light], ['dark', style.dark]] as const
  const shots: { label: string; size: number; url: string }[] = []
  for (const [label, scheme] of schemes) {
    for (const size of [16, 32, 48]) {
      const svg = standaloneSvg(faviconVariant(style, size), 'base', p, style, { scheme })
      shots.push({ label, size, url: URL.createObjectURL(new Blob([await rasterize(svg, size)], { type: 'image/png' })) })
    }
    for (const size of [180, 512]) {
      const svg = standaloneSvg(style.favicon.variant, 'base', p, style, { scheme, fullBleed: size === 180 })
      shots.push({ label, size, url: URL.createObjectURL(new Blob([await rasterize(svg, size)], { type: 'image/png' })) })
    }
    if (run !== renderRun) break
  }
  if (run !== renderRun) {
    shots.forEach((s) => URL.revokeObjectURL(s.url))
    return
  }

  const rows = schemes.map(([label]) => {
    const row = document.createElement('div')
    row.className = 'size-row'
    row.style.background = label === 'light' ? '#f3f1ec' : '#202022'
    row.style.color = label === 'light' ? '#3b3632' : '#d8d2ca'
    const tab = document.createElement('div')
    tab.className = 'tab-mock'
    row.append(tab)
    for (const { size, url } of shots.filter((s) => s.label === label)) {
      const small = size <= 48
      const shown = small ? size * 3 : size === 180 ? 90 : 96
      const img = new Image(shown, shown)
      img.src = url
      img.alt = t('icon.size-alt', { size, scheme: t(`icon.${label}`).toLowerCase() })
      img.className = small ? 'pixelated' : size === 180 ? 'apple' : ''
      const cap = document.createElement('figcaption')
      cap.textContent = small ? t('icon.size-small', { size }) : size === 180 ? t('icon.size-apple') : t('icon.size-app')
      const fig = document.createElement('figure')
      fig.append(img, cap)
      row.append(fig)
      if (size === 16) {
        const icon = new Image(16, 16)
        icon.src = url
        icon.alt = ''
        tab.append(icon, ` ${nameInput.value || maskName}`)
      }
    }
    return row
  })
  $('sizes').replaceChildren(...rows)
  urls.forEach((u) => URL.revokeObjectURL(u))
  urls = shots.map((s) => s.url)
}

function renderFamily(p: IconPaths) {
  const panels = (['light', 'dark'] as const).map((which) => {
    const scheme = style[which]
    const panel = document.createElement('div')
    panel.className = `family-panel ${which}`
    // Without a container the icon sits on the page colour; show that.
    if (style.container.shape === 'none') panel.style.background = scheme.bg
    const grid = document.createElement('div')
    grid.className = 'family-grid'
    grid.style.gridTemplateColumns = `5rem repeat(${style.directions.length}, minmax(0, 1fr))`
    grid.append(cell('', 'corner'))
    for (const d of style.directions) grid.append(cell(tOr(`icon.o.${d}`, d), 'head'))
    for (const v of style.variants) {
      grid.append(cell(tOr(`icon.o.${v}`, v), 'head'))
      for (const d of style.directions) {
        const t = document.createElement('div')
        t.className = 'tile'
        t.innerHTML = standaloneSvg(v, d, p, style, { scheme })
        t.title = `${style.prefix}-${iconName()}-${v}${d === 'base' ? '' : `-${d}`}`
        grid.append(t)
      }
    }
    const h = document.createElement('h3')
    h.textContent = t(`icon.${which}`)
    panel.append(h, grid)
    return panel
  })
  $('family').replaceChildren(...panels)
}

function cell(text: string, cls: string) {
  const d = document.createElement('div')
  d.className = cls
  d.textContent = text
  return d
}

// ---- Exports ----

function download(blob: Blob, filename: string) {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = filename
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 1000)
}

$('dl-pack').addEventListener('click', async (e) => {
  if (!paths) return
  const btn = e.currentTarget as HTMLButtonElement
  btn.disabled = true
  const label = btn.lastChild!
  label.textContent = ` ${t('icon.packing')}`
  try {
    const title = nameInput.value || maskName
    download(await packZip(title, paths, book.named()), `${slug(title)}-icons.zip`)
  } finally {
    btn.disabled = false
    label.textContent = ` ${t('icon.dl-pack')}`
  }
})

$('dl-sprite').addEventListener('click', () => {
  if (!paths) return
  const sp = sprite(iconName(), paths, style)
  download(new Blob([sp.svg], { type: 'image/svg+xml' }), `${iconName()}.sprite.svg`)
})

$('copy-head').addEventListener('click', async (e) => {
  const btn = e.currentTarget as HTMLButtonElement
  await navigator.clipboard.writeText(headSnippet())
  flash(btn)
})

/**
 * The picked drawing on its own, as fine tuned (on a square artboard if
 * ticked), with the style's clear space round it: for the plain SVG and PNG.
 */
function plainMask(): Mask | null {
  if (!scanned.drawings.length) return null
  const m = tuned(scanned.pick, { square: square.checked })
  const pad = Math.round(style.padding * Math.max(m.width, m.height))
  const out: Mask = { width: m.width + 2 * pad, height: m.height + 2 * pad, data: new Uint8Array((m.width + 2 * pad) * (m.height + 2 * pad)) }
  for (let y = 0; y < m.height; y++) out.data.set(m.data.subarray(y * m.width, (y + 1) * m.width), (y + pad) * out.width + pad)
  return out
}

/** The plain downloads: the light ink, on the paper colour only while the paper is kept. */
const plainColours = () => ({ ink: style.light.ink, background: scanned.colours.paper ? style.light.bg : null })

$('icon-dl-svg').addEventListener('click', async () => {
  const m = plainMask()
  if (!m) return
  const r = await trace(m, { ignore: 2, smoothness: style.trace.smoothness, simplify: style.trace.simplify })
  download(new Blob([toSvg(r, plainColours())], { type: 'image/svg+xml' }), `${iconName()}.svg`)
})

$('icon-copy-svg').addEventListener('click', async (e) => {
  const m = plainMask()
  if (!m) return
  const btn = e.currentTarget as HTMLButtonElement
  const r = await trace(m, { ignore: 2, smoothness: style.trace.smoothness, simplify: style.trace.simplify })
  await navigator.clipboard.writeText(toSvg(r, plainColours()))
  flash(btn)
})

$('icon-dl-png').addEventListener('click', () => {
  const m = plainMask()
  if (!m) return
  const { ink, background } = plainColours()
  const img = new ImageData(m.width, m.height)
  const [r, g, b] = hexRgb(ink)
  const [br, bg, bb] = hexRgb(background ?? '#ffffff')
  for (let i = 0, j = 0; i < m.data.length; i++, j += 4) {
    if (m.data[i]) img.data.set([r, g, b, 255], j)
    else if (background) img.data.set([br, bg, bb, 255], j)
  }
  const c = document.createElement('canvas')
  c.width = m.width
  c.height = m.height
  c.getContext('2d')!.putImageData(img, 0, 0)
  c.toBlob((blob) => blob && download(blob, `${iconName()}.png`), 'image/png')
})

// ---- Upload and adjust image ----

// ---- The set's images ----

/**
 * One image of the set: its photo and the drawings read from it, as last
 * adjusted. The scan step works on one image at a time (the active one); the
 * others keep their drawings until they are picked again.
 */
interface SetPage {
  id: number
  name: string
  canvas: HTMLCanvasElement
  /** The photo uses all of its frame (the sample): no sheet to find. */
  whole: boolean
  drawings: { mask: Mask; name: string | null }[]
}
let pages: SetPage[] = []
let active: SetPage | null = null
let pageIds = 0

const templateOn = $<HTMLInputElement>('icon-template-on')
const setSizeIn = $<HTMLSelectElement>('icon-set-size')
const setNameIn = $<HTMLInputElement>('icon-set-name')
const MAX_IMAGES = 12
/** How many images the set takes: up to the template's four pages when drawn on it. */
function fillSetSizes() {
  const max = templateOn.checked ? TEMPLATE_PAGES.length : MAX_IMAGES
  const was = Number(setSizeIn.value) || 1
  setSizeIn.replaceChildren(...Array.from({ length: max }, (_, i) => new Option(String(i + 1), String(i + 1))))
  setSizeIn.value = String(Math.min(was, max))
}
fillSetSizes()
const setSize = () => Number(setSizeIn.value) || 1

const scan = new ScanStep(
  'icon',
  (next) => {
    const coloursChanged = JSON.stringify(next.colours) !== JSON.stringify(scanned.colours)
    scanned = next
    showTune()
    useDrawings()
    if (coloursChanged && $<HTMLInputElement>('icon-scan-colours').checked) applied()
  },
  { template: () => templateOn.checked, files: (files) => void addFiles(files), remove: () => removePage() },
)

/** Open a photo as an image of the set: a new one while the set has room, else in place of the active one. */
function addCanvas(c: HTMLCanvasElement, name: string, whole = false) {
  let page = active
  if (!page || pages.length < setSize()) {
    page = { id: ++pageIds, name, canvas: c, whole, drawings: [] }
    pages.push(page)
  } else {
    Object.assign(page, { name, canvas: c, whole, drawings: [] })
    for (const k of [...tunes.keys()]) if (k.startsWith(`${page.id}:`)) tunes.delete(k)
  }
  active = page
  scan.openCanvas(c, name, whole)
  scan.flush()
  showPages()
}

/** Photos are read one at a time; another pick waits until these are in. */
let reading: Promise<void> = Promise.resolve()

/**
 * Several photos at once: the set grows to hold them all (up to its most), and
 * each is read in turn, the page drawn between them, so the count in the
 * upload button goes up as each comes in.
 */
function addFiles(files: File[]) {
  reading = reading.then(async () => {
    const max = setSizeIn.options.length
    const room = Math.min(max, Math.max(setSize(), files.length))
    if (room !== setSize()) setSizeIn.value = String(room)
    // More photos than the set can hold: the last ones fill it.
    const take = files.slice(-room)
    const upload = $('icon-upload')
    upload.setAttribute('aria-busy', 'true')
    try {
      for (const f of take) {
        const c = await openImage(f, f.name)
        if (c) addCanvas(c, baseName(f.name))
        await breathe()
      }
    } finally {
      upload.removeAttribute('aria-busy')
    }
  })
}

/** Make another image of the set the active one, its drawing `pick` picked. */
function switchTo(page: SetPage, pick = 0) {
  if (page !== active) {
    active = page
    scan.openCanvas(page.canvas, page.name, page.whole)
    scan.flush()
    showPages()
  }
  scan.choose(pick)
}

/** Remove photo: the active image leaves the set. */
function removePage() {
  if (!active) return scan.remove()
  for (const k of [...tunes.keys()]) if (k.startsWith(`${active.id}:`)) tunes.delete(k)
  pages = pages.filter((p) => p !== active)
  active = null
  const last = pages.at(-1)
  if (last) switchTo(last)
  else {
    scan.remove()
    showPages()
  }
}

/** Read every image again (the template was turned on or off), then come back to the active one. */
function rereadAll() {
  reading = reading.then(async () => {
    const back = active
    for (const page of pages) {
      active = page
      scan.openCanvas(page.canvas, page.name, page.whole)
      scan.flush()
      await breathe()
    }
    if (back && back !== active) {
      active = back
      scan.openCanvas(back.canvas, back.name, back.whole)
      scan.flush()
    }
    showPages()
  })
}

/** The images' count in the upload button, and a button per image to work on it again. */
function showPages() {
  $('icon-pages-count').textContent = t('icon.pages-count', { n: pages.length, total: setSize() })
  const list = $('icon-pages')
  list.hidden = pages.length < 2
  list.replaceChildren(
    ...pages.map((page, i) => {
      const btn = document.createElement('button')
      btn.type = 'button'
      btn.className = 'button small set-page'
      btn.setAttribute('role', 'option')
      btn.setAttribute('aria-selected', String(page === active))
      btn.textContent = t('icon.page-chip', { n: i + 1, name: page.name })
      btn.addEventListener('click', () => switchTo(page))
      return btn
    }),
  )
}

setSizeIn.addEventListener('change', showPages)
templateOn.addEventListener('change', () => {
  fillSetSizes()
  // Images past the template's four pages leave the set.
  if (pages.length > setSize()) pages = pages.slice(0, setSize())
  if (active && !pages.includes(active)) active = pages.at(-1) ?? null
  rereadAll()
})
setNameIn.addEventListener('input', () => {
  nameTouched = false
  setPieces()
})

$('icon-template-toggle').addEventListener('click', (e) => {
  const btn = e.currentTarget as HTMLButtonElement
  const open = btn.getAttribute('aria-expanded') !== 'true'
  btn.setAttribute('aria-expanded', String(open))
  $('icon-template-body').hidden = !open
})
function printTemplate(page: number) {
  // A hidden frame at true A4 size; the SVG is in millimetres.
  const frame = document.createElement('iframe')
  frame.style.cssText = 'position:fixed;width:0;height:0;border:0'
  frame.srcdoc = `<!doctype html><style>@page{size:A4;margin:0}html,body{margin:0}svg{display:block}</style>${iconSheetSvg(page)}`
  frame.onload = () => {
    frame.contentWindow?.print()
    setTimeout(() => frame.remove(), 1000)
  }
  document.body.append(frame)
}
TEMPLATE_PAGES.forEach((_, page) => $(`icon-print-${page + 1}`).addEventListener('click', () => printTemplate(page)))
$('icon-template-svg').addEventListener('click', () => {
  TEMPLATE_PAGES.forEach((_, page) =>
    setTimeout(() => download(new Blob([iconSheetSvg(page)], { type: 'image/svg+xml' }), `icon-template-${page + 1}.svg`), page * 300),
  )
})
showPages()

/** A photo opened, dropped or pasted while the Icon view is open. */
export async function openIconPhoto(blob: Blob, name: string) {
  const c = await openImage(blob, name)
  if (c) addCanvas(c, baseName(name))
}

/** The sample: one of Kevin's own drawings, photographed in a sketchbook, the page filling the photo. */
export async function loadIconSample() {
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

// ---- Adjust drawing ----

/**
 * Fine tuning, per drawing of the sheet: rotate and line spread as in
 * FineTune. Specks are removed once, in the image's Ink settings.
 */
interface Tune {
  rotate: number
  spread: number
}
const NO_TUNE: Tune = { rotate: 0, spread: 0 }
/** By image and drawing: `${image id}:${drawing}`. */
const tunes = new Map<string, Tune>()
const tuneIn = { rotate: $<HTMLInputElement>('icon-rotate'), spread: $<HTMLInputElement>('icon-spread') }
const square = $<HTMLInputElement>('icon-square')
const tuneFormats: Record<keyof Tune, (v: number) => string> = {
  rotate: (v) => `${v > 0 ? '+' : ''}${v.toFixed(1)}°`,
  spread: (v) => `${v > 0 ? '+' : ''}${v.toFixed(2)} px`,
}
const tuneKey = (i: number) => `${active?.id ?? 0}:${i}`
const tuneOf = (i: number) => tunes.get(tuneKey(i)) ?? NO_TUNE

/** The fine tuning sliders show the picked drawing's own. */
function showTune() {
  const tune = tuneOf(scanned.pick)
  for (const k of Object.keys(tuneIn) as (keyof Tune)[]) {
    tuneIn[k].value = String(tune[k])
    $(`icon-${k}-out`).textContent = tuneFormats[k](tune[k])
  }
}

for (const k of Object.keys(tuneIn) as (keyof Tune)[]) {
  tuneIn[k].addEventListener('input', () => {
    tunes.set(tuneKey(scanned.pick), { ...tuneOf(scanned.pick), [k]: Number(tuneIn[k].value) })
    showTune()
    useDrawings()
  })
}
// Rotate and line spread share a globe, with the image's globes (Logo's "Tune").
globePair(t('icon.globe-tune'), { input: tuneIn.rotate }, { input: tuneIn.spread }, $('icon-globes'))

/** Each drawing as fine tuned, kept while neither the drawing nor its tuning changes. */
const tunedCache = new WeakMap<Mask, { key: string; mask: Mask }>()

function tuned(i: number, extra: Partial<FineTune> = {}): Mask {
  const m = scanned.drawings[i]
  const tune = tuneOf(i)
  const f: FineTune = { rotate: tune.rotate, spread: tune.spread, square: false, ...extra }
  const key = JSON.stringify(f)
  const kept = tunedCache.get(m)
  if (kept?.key === key) return kept.mask
  const mask = fineTune(m, f)
  // Only the plain tuning is kept; the square artboard is for the downloads.
  if (!extra.square) tunedCache.set(m, { key, mask })
  return mask
}

const two = (n: number) => String(n).padStart(2, '0')

/** Hand the picked drawing to the previews, and the active image's drawings to the set. */
function useDrawings() {
  const { drawings, pick, template } = scanned
  if (active) active.drawings = drawings.map((_, i) => ({ mask: tuned(i), name: template?.names[i] ?? null }))
  const next = drawings.length ? tuned(pick) : null
  if (next !== mask) {
    mask = next
    builtFor = ''
    dirty = true
    if (!mask) clearPreviews()
    else if (!$('icon-app').hidden) retraceSoon()
  }
  setPieces()
}

/**
 * Every drawing of every image, named: as printed on the template, else the
 * set's name (or the photo's) numbered through the set; two of a name are told
 * apart by a number.
 */
function setPieces() {
  // slug() gives a stand-in name for an empty one, so the set's name is checked before it.
  const base = slug(setNameIn.value.trim() || active?.name || scanned.name)
  const all = pages.flatMap((page) => page.drawings.map((d) => ({ ...d, page })))
  let k = 0
  const seen = new Map<string, number>()
  const named = all.map((d) => {
    let name = d.name ?? (all.length > 1 ? `${base}-${two(++k)}` : base)
    const n = (seen.get(name) ?? 0) + 1
    seen.set(name, n)
    if (n > 1) name = `${name}-${n}`
    return { mask: d.mask, name, page: d.page }
  })
  const current = named.findIndex((d) => d.page === active) + scanned.pick
  const here = named[current]
  maskName = here?.name ?? base
  if (!nameTouched) nameInput.value = maskName
  setSheet(named.length > 1 ? named : null, Math.max(0, current))
}

/** No drawing: the result panes go back to empty boxes. */
function clearPreviews() {
  paths = null
  $('sizes').replaceChildren()
  $('family').replaceChildren()
  $('icon-stats').textContent = ''
  showEmpty()
}

function showEmpty() {
  for (const id of ['icon-sizes-pane', 'icon-family-pane']) $(id).classList.toggle('empty', !paths)
}

/** Called when the Icon view is shown. */
export function showIcon() {
  if (dirty && mask) retraceSoon()
  buildSetSoon()
}

// ---- A whole sheet of icons ----

let pieces: { mask: Mask; name: string; page: SetPage }[] | null = null
let picked = 0
/** Built paths per piece, for the shape settings they were built with. */
let setPaths: (IconPaths | null)[] = []
let setBuiltFor = ''
let setRun = 0

/** Every drawing of a sheet (or null when the photo is one drawing); a drawing that changed is built again. */
function setSheet(next: { mask: Mask; name: string; page: SetPage }[] | null, current: number) {
  setPaths = (next ?? []).map((p, i) => (pieces?.[i]?.mask === p.mask ? (setPaths[i] ?? null) : null))
  pieces = next
  picked = current
  $('icon-set-pane').hidden = !pieces
  buildSetSoon()
}

let setTimer = 0
function buildSetSoon() {
  clearTimeout(setTimer)
  setTimer = window.setTimeout(buildSet, 200)
}

/** Build every icon of the set in the current style, one at a time, drawing each as it lands. */
async function buildSet() {
  if (!pieces || $('icon-app').hidden) return
  const key = shapeKey(style)
  if (key !== setBuiltFor) {
    setPaths = []
    setBuiltFor = key
  }
  const run = ++setRun
  drawSet()
  for (let i = 0; i < pieces.length; i++) {
    if (setPaths[i]) continue
    $('icon-set-stats').textContent = t('icon.building', { n: i + 1, total: pieces.length })
    await breathe()
    if (run !== setRun || !pieces) return
    const built = await buildIcon(pieces[i].mask, style)
    if (run !== setRun || !pieces) return
    setPaths[i] = built.paths
    drawSet()
  }
  $('icon-set-stats').textContent = t('icon.set-stats', {
    icons: tn('icon.icons', pieces.length),
    variants: tn('icon.variants', style.variants.length),
    directions: tn('icon.directions', style.directions.length),
  })
}

function drawSet() {
  if (!pieces) return
  const v = style.favicon.variant
  $('icon-set').replaceChildren(
    ...pieces.map((p, i) => {
      const btn = document.createElement('button')
      btn.type = 'button'
      btn.className = 'set-tile'
      btn.setAttribute('role', 'option')
      btn.setAttribute('aria-selected', String(i === picked))
      btn.title = `${style.prefix}-${p.name}`
      const paths = setPaths[i]
      btn.innerHTML = paths ? standaloneSvg(v, 'base', paths, style, { scheme: style.light }) : '<span class="set-wait">…</span>'
      const num = document.createElement('span')
      num.className = 'set-num'
      num.textContent = String(i + 1)
      btn.append(num)
      // A drawing of another image makes that image the active one.
      btn.addEventListener('click', () => switchTo(p.page, i - pieces!.findIndex((q) => q.page === p.page)))
      return btn
    }),
  )
}

$('dl-set').addEventListener('click', async (e) => {
  if (!pieces) return
  const btn = e.currentTarget as HTMLButtonElement
  btn.disabled = true
  try {
    // Finish any icons still building, in this style.
    const key = shapeKey(style)
    if (key !== setBuiltFor) {
      setPaths = []
      setBuiltFor = key
    }
    for (let i = 0; i < pieces.length; i++) {
      $('icon-set-stats').textContent = t('icon.building', { n: i + 1, total: pieces.length })
      setPaths[i] ??= (await buildIcon(pieces[i].mask, style)).paths
    }
    const icons = pieces.map((p, i) => ({ name: slug(p.name), paths: setPaths[i]! }))
    const root = setNameIn.value.trim() ? slug(setNameIn.value) : `${slug(scanned.name)}-icon-set`
    const files: ZipFile[] = []
    const set = spriteSet(icons, style)
    files.push({ path: `${root}/sprite/${root}.svg`, data: set.svg })
    files.push({ path: `${root}/sprite/${root}.json`, data: JSON.stringify(set.manifest, null, 1) + '\n' })
    for (const icon of icons) {
      for (const v of style.variants) {
        for (const d of style.directions) {
          const file = d === 'base' ? icon.name : `${icon.name}-${d}`
          files.push({ path: `${root}/svg/${v}/${file}.svg`, data: standaloneSvg(v, d, icon.paths, style, { scheme: null }) })
        }
      }
    }
    files.push({ path: `${root}/style.json`, data: JSON.stringify(book.named(), null, 2) + '\n' })
    const bytes = zip(files)
    download(new Blob([bytes.buffer as ArrayBuffer], { type: 'application/zip' }), `${root}.zip`)
    drawSet()
    $('icon-set-stats').textContent = t('icon.set-packed', { n: icons.length, svgs: files.length - 3 })
  } finally {
    btn.disabled = false
  }
})

fillFields(book.current)
box.refresh()
