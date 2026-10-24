// The Texture view: print the drawing as stamp, riso, halftone or plain ink,
// lay it out once or as a seamless tile, and export a PNG.

import { onScanColours, scanColours } from '../ui/scan-colour'
import { slug } from '../icon/style'
import { buildFields, fixed, pct, plain, type FieldGroup } from '../ui/fields'
import { StyleBook, styleBox } from '../ui/styles'
import { flash } from '../ui/hand'
import { compose } from './compose'
import { plan } from './layout'
import { printArt, printKey, resizeArt, type Art, type Print } from './looks'
import { BUILT_IN, DOTS, LAYOUTS, LOOKS, MAX_SIDE, readTextureStyle, type TextureStyle } from './style'

const px = (v: number) => `${v} px`
const deg = (v: number) => `${v}°`
type S = TextureStyle

const GROUPS: FieldGroup[] = [
  {
    legend: 'Look',
    presets: [{ label: 'Shuffle', path: 'seed', value: () => Math.floor(Math.random() * 1000000), icon: 'scatter-fill' }],
    fields: [
      { kind: 'select', path: 'look', label: 'Print as', options: LOOKS },
      { kind: 'range', path: 'seed', label: 'Variation', min: 0, max: 999, step: 1, fmt: plain },
      { kind: 'range', path: 'tone.black', label: 'Full ink at grey', min: 0, max: 200, step: 1, fmt: plain },
      { kind: 'range', path: 'tone.white', label: 'No ink at grey', min: 60, max: 255, step: 1, fmt: plain },
      { kind: 'range', path: 'tone.gamma', label: 'Tone curve', min: 0.3, max: 3, step: 0.05, fmt: fixed(2) },
      { kind: 'range', path: 'grain', label: 'Print grain', min: 0, max: 1, step: 0.05, fmt: pct },
    ],
  },
  {
    legend: 'Stamp',
    when: (s: S) => s.look === 'stamp',
    fields: [
      { kind: 'range', path: 'stamp.bleed', label: 'Ink spread', min: 0, max: 12, step: 0.5, fmt: px },
      { kind: 'range', path: 'stamp.rough', label: 'Ragged edge', min: 0, max: 1, step: 0.05, fmt: pct },
      { kind: 'range', path: 'stamp.roughSize', label: 'Edge wobble size', min: 1, max: 40, step: 1, fmt: px },
      { kind: 'range', path: 'stamp.wear', label: 'Worn patches', min: 0, max: 1, step: 0.05, fmt: pct },
      { kind: 'range', path: 'stamp.wearSize', label: 'Patch size', min: 4, max: 200, step: 2, fmt: px },
      { kind: 'range', path: 'stamp.pressure', label: 'Uneven pressure', min: 0, max: 1, step: 0.05, fmt: pct },
    ],
  },
  {
    legend: 'Risograph',
    when: (s: S) => s.look === 'riso',
    fields: [
      { kind: 'check', path: 'riso.second', label: 'Print a second drum' },
      { kind: 'range', path: 'riso.offsetX', label: 'Misregister across', min: -30, max: 30, step: 1, fmt: px },
      { kind: 'range', path: 'riso.offsetY', label: 'Misregister down', min: -30, max: 30, step: 1, fmt: px },
    ],
  },
  {
    legend: 'Halftone',
    when: (s: S) => s.look === 'halftone',
    fields: [
      { kind: 'select', path: 'halftone.shape', label: 'Screen', options: DOTS },
      { kind: 'range', path: 'halftone.cell', label: 'Cell size', min: 3, max: 40, step: 1, fmt: px },
      { kind: 'range', path: 'halftone.angle', label: 'Screen angle', min: 0, max: 180, step: 1, fmt: deg },
    ],
  },
  {
    legend: 'Colours',
    fields: [
      { kind: 'color', path: 'colors.ink2', label: 'Second ink' },
      { kind: 'range', path: 'colors.paperGrain', label: 'Paper texture', min: 0, max: 1, step: 0.05, fmt: pct },
    ],
  },
  {
    legend: 'Own colours',
    // Hidden while the texture takes the scan's ink and paper.
    when: () => !$<HTMLInputElement>('texture-scan-colours').checked,
    fields: [
      { kind: 'color', path: 'colors.ink', label: 'Ink' },
      { kind: 'color', path: 'colors.paper', label: 'Paper' },
      { kind: 'check', path: 'colors.onPaper', label: 'Print on paper (off: transparent)' },
    ],
  },
  {
    legend: 'Layout',
    fields: [
      { kind: 'select', path: 'layout.mode', label: 'Arrange', options: LAYOUTS },
      { kind: 'range', path: 'layout.scale', label: 'Print size', min: 0.05, max: 1.5, step: 0.01, fmt: pct },
      { kind: 'range', path: 'layout.jitter', label: 'Random turn', min: 0, max: 180, step: 1, fmt: deg },
      { kind: 'range', path: 'layout.margin', label: 'Margin (single)', min: 0, max: 600, step: 4, fmt: px },
      { kind: 'range', path: 'layout.gap', label: 'Gap (grids)', min: 0, max: 2, step: 0.05, fmt: pct },
      { kind: 'range', path: 'layout.count', label: 'Prints (scatter)', min: 1, max: 40, step: 1, fmt: plain },
    ],
  },
]

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T

// Storage keys keep the project's first name, sketch-to-mark, so styles saved before the rename still load.
const book = new StyleBook<TextureStyle>({ noun: 'texture', key: 'sketch-to-mark.texture-styles', builtIn: BUILT_IN, read: readTextureStyle })
/** The style as drawn: with the scan's ink and paper when "Colours from the scan" is on. */
function withScan(s: TextureStyle): TextureStyle {
  if (!$<HTMLInputElement>('texture-scan-colours').checked) return s
  const { ink, paper } = scanColours()
  return { ...s, colors: { ...s.colors, ink, paper: paper ?? s.colors.paper, onPaper: paper !== null } }
}
let style = withScan(book.current)

let rawArt: Art | null = null
let art: Art | null = null
let artName = 'drawing'
let print: Print | null = null
let printedFor = ''
let result: HTMLCanvasElement | null = null

const box = styleBox(book, () => applied())
$('texture-style-box').replaceWith(box.element)
const fillFields = buildFields($('texture-fields'), GROUPS, 'tex', () => book.current, update)

function update(next: TextureStyle) {
  book.edit(next)
  applied()
}

function applied() {
  style = withScan(book.current)
  fillFields(book.current)
  fillSize()
  box.refresh()
  renderSoon()
}

// ---- Size ----

const DPI = 300
/** Common sizes: on screen in pixels, and print sizes in inches at 300 dpi. */
const PRESETS: { group: string; label: string; w: number; h: number }[] = [
  { group: 'Square tiles', label: '512 × 512', w: 512, h: 512 },
  { group: 'Square tiles', label: '1024 × 1024', w: 1024, h: 1024 },
  { group: 'Square tiles', label: '2048 × 2048', w: 2048, h: 2048 },
  { group: 'Square tiles', label: '4096 × 4096', w: 4096, h: 4096 },
  { group: 'Screens', label: 'HD 1920 × 1080', w: 1920, h: 1080 },
  { group: 'Screens', label: '4K 3840 × 2160', w: 3840, h: 2160 },
  { group: 'Screens', label: 'Post 4:5, 1080 × 1350', w: 1080, h: 1350 },
  { group: 'Screens', label: 'Story 9:16, 1080 × 1920', w: 1080, h: 1920 },
  { group: 'Screens', label: 'Banner 3:1, 1500 × 500', w: 1500, h: 500 },
  { group: 'Screens', label: 'Phone wallpaper, 1290 × 2796', w: 1290, h: 2796 },
  ...(
    [
      ['A5, 148 × 210 mm', 148 / 25.4, 210 / 25.4],
      ['A4, 210 × 297 mm', 210 / 25.4, 297 / 25.4],
      ['US Letter, 8.5 × 11 in', 8.5, 11],
      ['5 × 7 in', 5, 7],
      ['8 × 10 in', 8, 10],
      ['11 × 14 in', 11, 14],
      ['12 × 12 in', 12, 12],
    ] as const
  ).map(([label, w, h]) => ({ group: 'Print at 300 dpi', label, w: Math.round(w * DPI), h: Math.round(h * DPI) })),
]

const presetPick = $<HTMLSelectElement>('tex-preset')
const sizeW = $<HTMLInputElement>('tex-w')
const sizeH = $<HTMLInputElement>('tex-h')
const sizeLock = $<HTMLInputElement>('tex-lock')
const sizeFit = $<HTMLInputElement>('tex-fit')

presetPick.append(new Option('Custom', ''))
for (const g of [...new Set(PRESETS.map((p) => p.group))]) {
  const og = document.createElement('optgroup')
  og.label = g
  PRESETS.forEach((p, i) => p.group === g && og.append(new Option(p.label, String(i))))
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
    ? 'The canvas fits the print and its margin.'
    : `${L.mode === 'single' ? 'One print, centred' : 'A seamless tile'} · ${inch(L.width)} × ${inch(L.height)} in, ${mm(L.width)} × ${mm(L.height)} mm at ${DPI} dpi`
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

// ---- Rendering ----

let timer = 0
function renderSoon() {
  clearTimeout(timer)
  timer = window.setTimeout(render, 120)
}

function render() {
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
  $('texture-stats').textContent = `${result.width} × ${result.height} px · ${p.items.length} print${p.items.length === 1 ? '' : 's'}${p.wrap ? ' · tiles seamlessly' : ''} · ${ms} ms`
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

// ---- Wiring to the Logo view ----

/** Called with each new drawing from the Logo view: the light-evened photo and the ink, cropped alike. */
export function setArt(next: Art | null, name: string) {
  // Resized only when the Texture view draws, not on every change made in the Logo view.
  rawArt = next
  art = null
  artName = name
  print = null
  renderSoon()
}

export function showTexture() {
  renderSoon()
}

$('texture-scan-colours').addEventListener('change', applied)
onScanColours(() => {
  if ($<HTMLInputElement>('texture-scan-colours').checked) applied()
})

fillFields(book.current)
fillSize()
box.refresh()
