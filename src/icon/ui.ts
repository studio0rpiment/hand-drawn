// The Icon view: style controls from the shared field list, live previews of
// the family and the favicon sizes, and the exports.

import { flipLightness } from '../colour'
import type { Mask } from '../image'
import { onScanColours, scanColours } from '../ui/scan-colour'
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
    legend: 'Shape',
    hint: 'Changes here retrace the mark.',
    fields: [
      { kind: 'range', path: 'padding', label: 'Clear space', min: 0, max: 0.4, step: 0.01, fmt: pct },
      { kind: 'range', path: 'padding45', label: 'Clear space with 45° turns', min: 0, max: 0.4, step: 0.01, fmt: pct },
      { kind: 'check', path: 'fillClosed', label: 'Fill closed shapes' },
      { kind: 'range', path: 'bridge', label: 'Bridge gaps (closing size)', min: 0, max: 200, step: 1, fmt: plain },
      { kind: 'range', path: 'pinholes', label: 'Fill pinholes under', min: 0, max: 2000, step: 10, fmt: plain },
      { kind: 'range', path: 'trace.smoothness', label: 'Smoothness', min: 0, max: 1.33, step: 0.01, fmt: fixed(2) },
      { kind: 'range', path: 'trace.simplify', label: 'Simplify curves', min: 0, max: 1.5, step: 0.05, fmt: fixed(2) },
      { kind: 'range', path: 'trace.ignore', label: 'Ignore specks under', min: 0, max: 200, step: 1, fmt: plain },
      { kind: 'select', path: 'canvas', label: 'Canvas', options: [512, 1024, 2048] },
    ],
  },
  {
    legend: 'Variants',
    fields: [
      { kind: 'multi', path: 'variants', label: 'Make', options: VARIANTS },
      { kind: 'range', path: 'stroke', label: 'Line width', min: 1, max: 60, step: 0.5, fmt: plain },
      { kind: 'range', path: 'tintOpacity', label: 'Tint strength', min: 0, max: 1, step: 0.05, fmt: pct },
    ],
  },
  {
    legend: 'Orientation',
    presets: Object.entries(DIRECTION_GROUPS).map(([label, value]) => ({ label, path: 'directions', value })),
    fields: [{ kind: 'multi', path: 'directions', label: 'Directions', options: DIRECTIONS }],
  },
  {
    legend: 'Container',
    fields: [
      { kind: 'select', path: 'container.shape', label: 'Shape', options: CONTAINERS },
      { kind: 'range', path: 'container.radius', label: 'Corner radius', min: 0, max: 0.5, step: 0.01, fmt: pct },
    ],
  },
  {
    legend: 'Colours',
    // Hidden while the icons take the scan's colours.
    when: () => !$<HTMLInputElement>('icon-scan-colours').checked,
    fields: [
      { kind: 'color', path: 'light.ink', label: 'Light: ink' },
      { kind: 'color', path: 'light.bg', label: 'background' },
      { kind: 'color', path: 'dark.ink', label: 'Dark: ink' },
      { kind: 'color', path: 'dark.bg', label: 'background' },
    ],
  },
  {
    legend: 'Favicon and sprite',
    fields: [
      { kind: 'select', path: 'favicon.variant', label: 'Favicon variant', options: VARIANTS },
      { kind: 'select', path: 'favicon.small', label: 'At 48 px and under', options: VARIANTS },
      { kind: 'text', path: 'prefix', label: 'Sprite id prefix', pattern: '[a-z][a-z0-9-]{0,15}' },
    ],
  },
]

// ---- State ----

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T

// Storage keys keep the project's first name, sketch-to-mark, so styles saved before the rename still load.
const book = new StyleBook<IconStyle>({ noun: 'icon', key: 'sketch-to-mark.styles', builtIn: BUILT_IN, read: readStyle })
/**
 * The style as drawn: the edited one, with the scan's colours when "Colours
 * from the scan" is on (the dark version turns their lightness over). The
 * book keeps the style's own colours either way.
 */
function withScan(s: IconStyle): IconStyle {
  if (!$<HTMLInputElement>('icon-scan-colours').checked) return s
  const { ink, paper } = scanColours()
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

const box = styleBox(book, () => applied())
$('icon-style-box').replaceWith(box.element)
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
onScanColours(() => {
  if ($<HTMLInputElement>('icon-scan-colours').checked) applied()
})

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
  $('icon-stats').textContent = 'Tracing…'
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
  const run = ++renderRun
  renderFamily(p)
  const kb = (n: string) => (new Blob([n]).size / 1024).toFixed(1)
  const sp = sprite(iconName(), p, style)
  $('icon-stats').textContent =
    `${style.variants.length * style.directions.length} symbols · sprite ${kb(sp.svg)} KB` +
    (p.solid !== p.ink ? ' · closed shapes filled' : '')

  // Pixel-true favicon sizes need real rasterizing. Rasterize everything first and
  // build images only if no newer render started, so no image loads a revoked URL.
  const schemes = [['Light', style.light], ['Dark', style.dark]] as const
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
    row.style.background = label === 'Light' ? '#f3f1ec' : '#202022'
    row.style.color = label === 'Light' ? '#3b3632' : '#d8d2ca'
    const tab = document.createElement('div')
    tab.className = 'tab-mock'
    row.append(tab)
    for (const { size, url } of shots.filter((s) => s.label === label)) {
      const small = size <= 48
      const shown = small ? size * 3 : size === 180 ? 90 : 96
      const img = new Image(shown, shown)
      img.src = url
      img.alt = `${size} px icon, ${label.toLowerCase()}`
      img.className = small ? 'pixelated' : size === 180 ? 'apple' : ''
      const cap = document.createElement('figcaption')
      cap.textContent = small ? `${size} px ×3` : size === 180 ? 'Apple 180' : 'App 512'
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
    for (const d of style.directions) grid.append(cell(d, 'head'))
    for (const v of style.variants) {
      grid.append(cell(v, 'head'))
      for (const d of style.directions) {
        const t = document.createElement('div')
        t.className = 'tile'
        t.innerHTML = standaloneSvg(v, d, p, style, { scheme })
        t.title = `${style.prefix}-${iconName()}-${v}${d === 'base' ? '' : `-${d}`}`
        grid.append(t)
      }
    }
    const h = document.createElement('h3')
    h.textContent = which === 'light' ? 'Light' : 'Dark'
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
  label.textContent = ' Packing…'
  try {
    const title = nameInput.value || maskName
    download(await packZip(title, paths, book.named()), `${slug(title)}-icons.zip`)
  } finally {
    btn.disabled = false
    label.textContent = 'Download icon pack'
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

// ---- Wiring to the Logo view ----

/** Called with each new cleaned mask from the Logo view. */
export function setMask(m: Mask | null, name: string) {
  mask = m
  maskName = name
  if (!nameTouched) nameInput.value = name
  dirty = true
  builtFor = ''
  if (!$('icon-app').hidden) retraceSoon()
}

/** Called when the Icon view is shown. */
export function showIcon() {
  if (dirty) retraceSoon()
  buildSetSoon()
}

// ---- A whole sheet of icons ----

let pieces: { mask: Mask; name: string }[] | null = null
let picked = 0
/** Built paths per piece, for the shape settings they were built with. */
let setPaths: (IconPaths | null)[] = []
let setBuiltFor = ''
let setRun = 0
let pick: ((i: number) => void) | null = null

/** Lets a click in the set choose the drawing the whole app works on. */
export function onSheetPick(fn: (i: number) => void) {
  pick = fn
}

/** Called with every drawing of a sheet (or null when the photo is one drawing). */
export function setSheet(next: { mask: Mask; name: string }[] | null, current: number) {
  const changed = next?.length !== pieces?.length || next?.some((p, i) => p.mask !== pieces?.[i].mask)
  pieces = next
  picked = current
  if (changed) {
    setPaths = []
    setBuiltFor = ''
  }
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
    $('icon-set-stats').textContent = `Building ${i + 1} of ${pieces.length}…`
    const built = await buildIcon(pieces[i].mask, style)
    if (run !== setRun || !pieces) return
    setPaths[i] = built.paths
    drawSet()
  }
  $('icon-set-stats').textContent = `${pieces.length} icons · ${style.variants.length} variant${style.variants.length === 1 ? '' : 's'} × ${style.directions.length} direction${style.directions.length === 1 ? '' : 's'} each`
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
      btn.addEventListener('click', () => pick?.(i))
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
      $('icon-set-stats').textContent = `Building ${i + 1} of ${pieces.length}…`
      setPaths[i] ??= (await buildIcon(pieces[i].mask, style)).paths
    }
    const icons = pieces.map((p, i) => ({ name: slug(p.name), paths: setPaths[i]! }))
    const root = `${slug(maskName)}-icon-set`
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
    $('icon-set-stats').textContent = `${icons.length} icons packed: one sprite, ${files.length - 3} SVGs`
  } finally {
    btn.disabled = false
  }
})

fillFields(book.current)
box.refresh()
