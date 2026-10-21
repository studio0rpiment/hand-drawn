// The Icon view: style controls from the shared field list, live previews of
// the family and the favicon sizes, and the exports.

import type { Mask } from '../image'
import { buildFields, fixed, pct, plain, type FieldGroup } from '../ui/fields'
import { StyleBook, styleBox } from '../ui/styles'
import { flash } from '../ui/hand'
import { buildIcon, faviconVariant, headSnippet, packZip, rasterize, shapeKey } from './pack'
import { BUILT_IN, CONTAINERS, DIRECTIONS, DIRECTION_GROUPS, VARIANTS, readStyle, slug, type IconStyle } from './style'
import { sprite, standaloneSvg, type IconPaths } from './svg'

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

const book = new StyleBook<IconStyle>({ noun: 'icon', key: 'sketch-to-mark.styles', builtIn: BUILT_IN, read: readStyle })
let style = book.current

let mask: Mask | null = null
let maskName = 'mark'
let nameTouched = false
let paths: IconPaths | null = null
let builtFor = ''
let dirty = true

// ---- Controls ----

const box = styleBox(book, () => applied())
$('icon-style-box').replaceWith(box.element)
const fillFields = buildFields($('style-fields'), GROUPS, 'icon', () => style, update)

/** Every edit goes through here: validate, remember, redraw. */
function update(next: IconStyle) {
  book.edit(next)
  applied()
}

/** After the edited style changed: sync the controls, retrace if the shape changed, else redraw. */
function applied() {
  style = book.current
  fillFields(style)
  box.refresh()
  if (shapeKey(style) !== builtFor) retraceSoon()
  else render()
}

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
}

fillFields(style)
box.refresh()
