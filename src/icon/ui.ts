// The Icon view: a style editor generated from the field list below, live
// previews of the family and the favicon sizes, and the exports.

import type { Mask } from '../image'
import { buildIcon, faviconVariant, headSnippet, packZip, rasterize, shapeKey } from './pack'
import {
  BUILT_IN,
  CONTAINERS,
  DIRECTIONS,
  DIRECTION_GROUPS,
  HAND_ICONS,
  VARIANTS,
  readStyle,
  slug,
  type IconStyle,
} from './style'
import { sprite, standaloneSvg, type IconPaths } from './svg'

// ---- The editable fields. One line per style setting. ----

type Field =
  | { kind: 'range'; path: string; label: string; min: number; max: number; step: number; fmt: (v: number) => string }
  | { kind: 'check'; path: string; label: string }
  | { kind: 'select'; path: string; label: string; options: readonly (string | number)[] }
  | { kind: 'multi'; path: string; label: string; options: readonly string[] }
  | { kind: 'color'; path: string; label: string }
  | { kind: 'text'; path: string; label: string; pattern: string }

const pct = (v: number) => `${Math.round(v * 100)}%`
const units = (v: number) => `${v}`

const GROUPS: { legend: string; hint?: string; fields: Field[]; directionPresets?: boolean }[] = [
  {
    legend: 'Shape',
    hint: 'Changes here retrace the mark.',
    fields: [
      { kind: 'range', path: 'padding', label: 'Clear space', min: 0, max: 0.4, step: 0.01, fmt: pct },
      { kind: 'range', path: 'padding45', label: 'Clear space with 45° turns', min: 0, max: 0.4, step: 0.01, fmt: pct },
      { kind: 'check', path: 'fillClosed', label: 'Fill closed shapes' },
      { kind: 'range', path: 'bridge', label: 'Bridge gaps (closing size)', min: 0, max: 200, step: 1, fmt: units },
      { kind: 'range', path: 'pinholes', label: 'Fill pinholes under', min: 0, max: 2000, step: 10, fmt: units },
      { kind: 'range', path: 'trace.smoothness', label: 'Smoothness', min: 0, max: 1.33, step: 0.01, fmt: (v) => v.toFixed(2) },
      { kind: 'range', path: 'trace.simplify', label: 'Simplify curves', min: 0, max: 1.5, step: 0.05, fmt: (v) => v.toFixed(2) },
      { kind: 'range', path: 'trace.ignore', label: 'Ignore specks under', min: 0, max: 200, step: 1, fmt: units },
      { kind: 'select', path: 'canvas', label: 'Canvas', options: [512, 1024, 2048] },
    ],
  },
  {
    legend: 'Variants',
    fields: [
      { kind: 'multi', path: 'variants', label: 'Make', options: VARIANTS },
      { kind: 'range', path: 'stroke', label: 'Line width', min: 1, max: 60, step: 0.5, fmt: units },
      { kind: 'range', path: 'tintOpacity', label: 'Tint strength', min: 0, max: 1, step: 0.05, fmt: pct },
    ],
  },
  {
    legend: 'Orientation',
    directionPresets: true,
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

function get(obj: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((o, k) => (o as Record<string, unknown>)?.[k], obj)
}

function set<T>(obj: T, path: string, value: unknown): T {
  const copy = structuredClone(obj) as Record<string, unknown>
  const keys = path.split('.')
  let o = copy
  for (const k of keys.slice(0, -1)) o = o[k] as Record<string, unknown>
  o[keys[keys.length - 1]] = value
  return copy as T
}

// ---- Saved styles (this browser only; export a style to keep it anywhere). ----

const SAVED_KEY = 'sketch-to-mark.styles'
const CURRENT_KEY = 'sketch-to-mark.current-style'

function loadSaved(): IconStyle[] {
  try {
    const raw = JSON.parse(localStorage.getItem(SAVED_KEY) ?? '[]')
    return Array.isArray(raw) ? raw.map((s) => readStyle(s)) : []
  } catch {
    return []
  }
}

function store(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // Private windows and full storage: styles still work for this visit.
  }
}

// ---- State ----

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T

let saved = loadSaved()
let picked: IconStyle = HAND_ICONS
let style: IconStyle = HAND_ICONS
try {
  const cur = JSON.parse(localStorage.getItem(CURRENT_KEY) ?? 'null')
  if (cur) {
    style = readStyle(cur.style)
    picked = [...BUILT_IN, ...saved].find((s) => s.name === cur.picked) ?? HAND_ICONS
  }
} catch {
  // Fall back to hand-icons.
}

let mask: Mask | null = null
let maskName = 'mark'
let nameTouched = false
let paths: IconPaths | null = null
let builtFor = ''
let dirty = true

const allStyles = () => [...BUILT_IN, ...saved]
const isBuiltIn = (name: string) => BUILT_IN.some((s) => s.name === name)

// ---- Controls ----

const fieldsRoot = $('style-fields')
const inputs = new Map<string, (s: IconStyle) => void>()

function buildFields() {
  for (const g of GROUPS) {
    const fs = document.createElement('fieldset')
    const lg = document.createElement('legend')
    lg.textContent = g.legend
    fs.append(lg)
    if (g.hint) {
      const p = document.createElement('p')
      p.className = 'hint'
      p.textContent = g.hint
      fs.append(p)
    }
    if (g.directionPresets) {
      const row = document.createElement('div')
      row.className = 'row'
      for (const [label, dirs] of Object.entries(DIRECTION_GROUPS)) {
        const b = document.createElement('button')
        b.type = 'button'
        b.className = 'button small'
        b.textContent = label
        b.addEventListener('click', () => update(set(style, 'directions', dirs)))
        row.append(b)
      }
      fs.append(row)
    }
    for (const f of g.fields) fs.append(fieldElement(f))
    fieldsRoot.append(fs)
  }
}

function fieldElement(f: Field): HTMLElement {
  const id = `f-${f.path.replace(/\./g, '-')}`
  if (f.kind === 'multi') {
    const box = document.createElement('div')
    box.className = 'multi'
    box.setAttribute('role', 'group')
    box.setAttribute('aria-label', f.label)
    const checks = f.options.map((opt) => {
      const l = document.createElement('label')
      l.className = 'check'
      const c = document.createElement('input')
      c.type = 'checkbox'
      c.value = opt
      c.addEventListener('change', () => {
        const chosen = checks.filter((x) => x.checked).map((x) => x.value)
        // At least one must stay on.
        if (chosen.length === 0) c.checked = true
        else update(set(style, f.path, chosen))
      })
      l.append(c, ` ${opt}`)
      box.append(l)
      return c
    })
    inputs.set(f.path, (s) => {
      const v = get(s, f.path) as string[]
      checks.forEach((c) => (c.checked = v.includes(c.value)))
    })
    return box
  }

  const label = document.createElement('label')
  label.className = f.kind === 'check' ? 'check' : f.kind === 'color' ? 'swatch' : f.kind === 'range' ? 'slider' : 'field'
  // A select shares everything used here (value, append, events) with an input.
  const input = document.createElement(f.kind === 'select' ? 'select' : 'input') as HTMLInputElement
  input.id = id

  if (f.kind === 'range') {
    const head = document.createElement('span')
    const out = document.createElement('output')
    head.append(f.label, out)
    input.type = 'range'
    input.min = String(f.min)
    input.max = String(f.max)
    input.step = String(f.step)
    input.addEventListener('input', () => update(set(style, f.path, Number(input.value))))
    inputs.set(f.path, (s) => {
      const v = get(s, f.path) as number
      input.value = String(v)
      out.textContent = f.fmt(v)
    })
    label.append(head, input)
  } else if (f.kind === 'check') {
    input.type = 'checkbox'
    input.addEventListener('change', () => update(set(style, f.path, input.checked)))
    inputs.set(f.path, (s) => (input.checked = Boolean(get(s, f.path))))
    label.append(input, ` ${f.label}`)
  } else if (f.kind === 'select') {
    for (const o of f.options) input.append(new Option(String(o), String(o)))
    input.addEventListener('change', () => {
      const v = typeof f.options[0] === 'number' ? Number(input.value) : input.value
      update(set(style, f.path, v))
    })
    inputs.set(f.path, (s) => (input.value = String(get(s, f.path))))
    label.append(`${f.label} `, input)
  } else if (f.kind === 'color') {
    input.type = 'color'
    input.addEventListener('input', () => update(set(style, f.path, input.value)))
    inputs.set(f.path, (s) => (input.value = String(get(s, f.path))))
    label.append(`${f.label} `, input)
  } else {
    input.type = 'text'
    input.pattern = f.pattern
    input.spellcheck = false
    input.addEventListener('change', () => {
      if (input.checkValidity()) update(set(style, f.path, input.value))
      else input.value = String(get(style, f.path))
    })
    inputs.set(f.path, (s) => (input.value = String(get(s, f.path))))
    label.append(`${f.label} `, input)
  }
  return label
}

function syncControls() {
  for (const fill of inputs.values()) fill(style)
  const pick = $<HTMLSelectElement>('style-pick')
  pick.replaceChildren(
    ...allStyles().map((s) => new Option(isBuiltIn(s.name) ? `${s.name} (built in)` : s.name, s.name)),
  )
  pick.value = picked.name
  $<HTMLButtonElement>('style-delete').disabled = isBuiltIn(picked.name)
  const changed = JSON.stringify({ ...style, name: picked.name }) !== JSON.stringify(picked)
  $('style-state').textContent = changed ? `Changed from “${picked.name}”. Save as… to keep it.` : ''
}

/** Every edit goes through here: validate, remember, redraw, retrace if the shape changed. */
function update(next: IconStyle) {
  style = readStyle(next, style)
  store(CURRENT_KEY, { picked: picked.name, style })
  syncControls()
  if (shapeKey(style) !== builtFor) retraceSoon()
  else render()
}

function choose(s: IconStyle) {
  picked = s
  update(s)
}

$<HTMLSelectElement>('style-pick').addEventListener('change', (e) => {
  const s = allStyles().find((x) => x.name === (e.target as HTMLSelectElement).value)
  if (s) choose(s)
})

$('style-save').addEventListener('click', () => {
  const name = prompt('Name for this style', isBuiltIn(picked.name) ? `${picked.name} variant` : picked.name)?.trim()
  if (!name) return
  if (isBuiltIn(name)) return alert('That name belongs to a built-in style. Pick another.')
  if (saved.some((s) => s.name === name) && !confirm(`Replace the saved style “${name}”?`)) return
  const s = readStyle({ ...style, name })
  saved = [...saved.filter((x) => x.name !== name), s]
  store(SAVED_KEY, saved)
  choose(s)
})

$('style-delete').addEventListener('click', () => {
  if (isBuiltIn(picked.name) || !confirm(`Delete the saved style “${picked.name}”?`)) return
  saved = saved.filter((s) => s.name !== picked.name)
  store(SAVED_KEY, saved)
  choose(HAND_ICONS)
})

$('style-reset').addEventListener('click', () => choose(picked))

$('style-export').addEventListener('click', () => {
  const s = { ...style, name: picked.name }
  download(new Blob([JSON.stringify(s, null, 2) + '\n'], { type: 'application/json' }), `${slug(s.name)}.style.json`)
})

$<HTMLInputElement>('style-import').addEventListener('change', async (e) => {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  let raw: unknown
  try {
    raw = JSON.parse(await file.text())
  } catch {
    return alert('That file isn’t a style (it isn’t JSON).')
  }
  let s = readStyle(raw)
  let name = s.name
  for (let n = 2; isBuiltIn(name) || saved.some((x) => x.name === name); n++) name = `${s.name} ${n}`
  s = { ...s, name }
  saved = [...saved, s]
  store(SAVED_KEY, saved)
  choose(s)
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
  btn.textContent = 'Packing…'
  try {
    const title = nameInput.value || maskName
    download(await packZip(title, paths, { ...style, name: picked.name }), `${slug(title)}-icons.zip`)
  } finally {
    btn.disabled = false
    btn.textContent = 'Download icon pack'
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
  btn.textContent = 'Copied'
  setTimeout(() => (btn.textContent = 'Copy <head> tags'), 1200)
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

buildFields()
syncControls()
