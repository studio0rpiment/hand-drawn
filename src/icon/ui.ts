// The Icon view, top to bottom like the Font view: upload a photo, adjust the
// image (its own scan step), adjust the drawing (fine tuning), adjust the
// style, then the downloads with the preset controls.

import { despeckle } from '../clean'
import { flipLightness, hexRgb } from '../colour'
import { fineTune, type FineTune } from '../finetune'
import type { Mask } from '../image'
import { toSvg, trace } from '../trace'
import { ScanStep, type Scanned } from '../ui/scan-step'
import { t, tn, tOr } from '../text'
import { buildFields, fixed, pct, plain, type FieldGroup } from '../ui/fields'
import { StyleBook, styleBox } from '../ui/styles'
import { flash } from '../ui/hand'
import { buildIcon, faviconVariant, headSnippet, packZip, rasterize, shapeKey } from './pack'
import { BUILT_IN, CONTAINERS, DIRECTIONS, DIRECTION_GROUPS, VARIANTS, readStyle, slug, type IconStyle } from './style'
import { zip, type ZipFile } from './files'
import { sprite, spriteSet, standaloneSvg, type IconPaths } from './svg'

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
      { kind: 'range', path: 'trace.ignore', label: t('icon.f.trace-ignore'), min: 0, max: 200, step: 1, fmt: plain },
      { kind: 'select', path: 'canvas', label: t('icon.f.canvas'), options: [512, 1024, 2048] },
    ],
  },
  {
    legend: t('icon.g.variants'),
    fields: [
      { kind: 'multi', path: 'variants', label: t('icon.f.variants'), options: VARIANTS },
      { kind: 'range', path: 'stroke', label: t('icon.f.stroke'), min: 1, max: 60, step: 0.5, fmt: plain },
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
let scanned: Scanned = { name: 'drawing', drawings: [], pick: 0, sheet: false, colours: { ink: '#1d1a24', paper: null }, photo: 0 }

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

const scan = new ScanStep('icon', (next) => {
  const newPhoto = next.photo !== scanned.photo
  const coloursChanged = JSON.stringify(next.colours) !== JSON.stringify(scanned.colours)
  scanned = next
  if (newPhoto) tunes.clear()
  showTune()
  useDrawings()
  if (coloursChanged && $<HTMLInputElement>('icon-scan-colours').checked) applied()
})

$('icon-upload').addEventListener('click', () => $('icon-file').click())
$<HTMLInputElement>('icon-file').addEventListener('change', (e) => {
  const input = e.target as HTMLInputElement
  const f = input.files?.[0]
  input.value = ''
  if (f) void scan.open(f, f.name)
})

/** A photo opened, dropped or pasted while the Icon view is open. */
export function openIconPhoto(blob: Blob, name: string) {
  return scan.open(blob, name)
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
  scan.openCanvas(c, 'sample', true)
}

// ---- Adjust drawing ----

/** Fine tuning, per drawing of the sheet: rotate and line spread as in FineTune, and spots to ignore. */
interface Tune {
  rotate: number
  spread: number
  ignore: number
}
const NO_TUNE: Tune = { rotate: 0, spread: 0, ignore: 0 }
const tunes = new Map<number, Tune>()
const tuneIn = { rotate: $<HTMLInputElement>('icon-rotate'), spread: $<HTMLInputElement>('icon-spread'), ignore: $<HTMLInputElement>('icon-ignore') }
const square = $<HTMLInputElement>('icon-square')
const tuneFormats: Record<keyof Tune, (v: number) => string> = {
  rotate: (v) => `${v > 0 ? '+' : ''}${v.toFixed(1)}°`,
  spread: (v) => `${v > 0 ? '+' : ''}${v.toFixed(2)} px`,
  ignore: (v) => (v ? `${v} px` : t('common.off')),
}
const tuneOf = (i: number) => tunes.get(i) ?? NO_TUNE

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
    tunes.set(scanned.pick, { ...tuneOf(scanned.pick), [k]: Number(tuneIn[k].value) })
    showTune()
    useDrawings()
  })
}

/** Each drawing as fine tuned, kept while neither the drawing nor its tuning changes. */
const tunedCache = new WeakMap<Mask, { key: string; mask: Mask }>()

function tuned(i: number, extra: Partial<FineTune> = {}): Mask {
  const m = scanned.drawings[i]
  const tune = tuneOf(i)
  const f: FineTune = { rotate: tune.rotate, spread: tune.spread, square: false, ...extra }
  const key = JSON.stringify([tune.ignore, f])
  const kept = tunedCache.get(m)
  if (kept?.key === key) return kept.mask
  const mask = fineTune(tune.ignore ? despeckle(m, tune.ignore) : m, f)
  // Only the plain tuning is kept; the square artboard is for the downloads.
  if (!extra.square) tunedCache.set(m, { key, mask })
  return mask
}

const two = (n: number) => String(n).padStart(2, '0')

/** Hand the picked drawing to the previews and every drawing of a sheet to the set. */
function useDrawings() {
  const { drawings, pick, sheet, name } = scanned
  const several = sheet && drawings.length > 1
  const next = drawings.length ? tuned(pick) : null
  const nextName = several ? `${name}-${two(pick + 1)}` : name
  if (!nameTouched) nameInput.value = nextName
  if (next !== mask) {
    mask = next
    maskName = nextName
    builtFor = ''
    dirty = true
    if (!mask) clearPreviews()
    else if (!$('icon-app').hidden) retraceSoon()
  }
  setSheet(sheet && drawings.length ? drawings.map((_, i) => ({ mask: tuned(i), name: `${name}-${two(i + 1)}` })) : null, pick)
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

let pieces: { mask: Mask; name: string }[] | null = null
let picked = 0
/** Built paths per piece, for the shape settings they were built with. */
let setPaths: (IconPaths | null)[] = []
let setBuiltFor = ''
let setRun = 0

/** Every drawing of a sheet (or null when the photo is one drawing); a drawing that changed is built again. */
function setSheet(next: { mask: Mask; name: string }[] | null, current: number) {
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
      btn.addEventListener('click', () => scan.choose(i))
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
    const root = `${slug(scanned.name)}-icon-set`
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
