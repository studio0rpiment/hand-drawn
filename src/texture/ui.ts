// The Texture view: print the drawing as stamp, riso, halftone or plain ink,
// lay it out once or as a seamless tile, and export a PNG.

import { slug } from '../icon/style'
import { buildFields, fixed, pct, plain, type FieldGroup } from '../ui/fields'
import { StyleBook, styleBox } from '../ui/styles'
import { flash } from '../ui/hand'
import { compose } from './compose'
import { plan } from './layout'
import { printArt, printKey, resizeArt, type Art, type Print } from './looks'
import { BUILT_IN, DOTS, LAYOUTS, LOOKS, readTextureStyle, type TextureStyle } from './style'

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
      { kind: 'color', path: 'colors.ink', label: 'Ink' },
      { kind: 'color', path: 'colors.ink2', label: 'Second ink' },
      { kind: 'color', path: 'colors.paper', label: 'Paper' },
      { kind: 'check', path: 'colors.onPaper', label: 'Print on paper (off: transparent)' },
      { kind: 'range', path: 'colors.paperGrain', label: 'Paper texture', min: 0, max: 1, step: 0.05, fmt: pct },
    ],
  },
  {
    legend: 'Layout',
    fields: [
      { kind: 'select', path: 'layout.mode', label: 'Arrange', options: LAYOUTS },
      { kind: 'range', path: 'layout.scale', label: 'Print size', min: 0.05, max: 1.5, step: 0.01, fmt: pct },
      { kind: 'range', path: 'layout.jitter', label: 'Random turn', min: 0, max: 180, step: 1, fmt: deg },
      { kind: 'range', path: 'layout.margin', label: 'Margin (single)', min: 0, max: 300, step: 4, fmt: px },
      { kind: 'select', path: 'layout.tile', label: 'Tile size', options: [512, 1024, 2048] },
      { kind: 'range', path: 'layout.gap', label: 'Gap (grids)', min: 0, max: 2, step: 0.05, fmt: pct },
      { kind: 'range', path: 'layout.count', label: 'Prints (scatter)', min: 1, max: 40, step: 1, fmt: plain },
    ],
  },
]

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T

// Storage keys keep the project's first name, sketch-to-mark, so styles saved before the rename still load.
const book = new StyleBook<TextureStyle>({ noun: 'texture', key: 'sketch-to-mark.texture-styles', builtIn: BUILT_IN, read: readTextureStyle })
let style = book.current

let art: Art | null = null
let artName = 'drawing'
let print: Print | null = null
let printedFor = ''
let result: HTMLCanvasElement | null = null

const box = styleBox(book, () => applied())
$('texture-style-box').replaceWith(box.element)
const fillFields = buildFields($('texture-fields'), GROUPS, 'tex', () => style, update)

function update(next: TextureStyle) {
  book.edit(next)
  applied()
}

function applied() {
  style = book.current
  fillFields(style)
  box.refresh()
  renderSoon()
}

// ---- Rendering ----

let timer = 0
function renderSoon() {
  clearTimeout(timer)
  timer = window.setTimeout(render, 120)
}

function render() {
  if (!art || $('texture-app').hidden) return
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
  const half = Math.min(result.width, 600)
  c.width = c.height = half * 2
  const g = c.getContext('2d')!
  g.imageSmoothingQuality = 'high'
  for (const [x, y] of [[0, 0], [1, 0], [0, 1], [1, 1]]) g.drawImage(result, x * half, y * half, half, half)
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
  const size = style.layout.mode === 'single' ? 'contain' : `${result.width / 2}px`
  const repeat = style.layout.mode === 'single' ? 'no-repeat' : 'repeat'
  // Half size in CSS so the tile stays sharp on high-density screens.
  await navigator.clipboard.writeText(`background: url("${fileStem()}.png") 0 0 / ${size} ${repeat};\n`)
  flash(btn)
})

// ---- Wiring to the Logo view ----

/** Called with each new drawing from the Logo view: the light-evened photo and the ink, cropped alike. */
export function setArt(next: Art | null, name: string) {
  art = next ? resizeArt(next) : null
  artName = name
  print = null
  renderSoon()
}

export function showTexture() {
  renderSoon()
}

fillFields(style)
box.refresh()
