import { cropMask, despeckle, flattenLight, inkBox, lineWeight, threshold, trimEdges } from './clean'
import { otsu, toGray, type GrayImage, type Mask, type Quad, type RGBAImage } from './image'
import { findPaper, fullFrame, quadSize, warp } from './paper'
import { setPage, showFont, useLoader } from './font/ui'
import { setMask, showIcon } from './icon/ui'
import { samplePhoto } from './sample'
import { decorate, favicon, flash, handSliders, installSprite, reserveHoverWidths } from './ui/hand'
import { privacyNotice, privacySettings } from './ui/privacy'
import { globePair } from './ui/sphere'
import { setArt, showTexture } from './texture/ui'
import { complexity } from './svgpath'
import { toSvg, trace, type TraceResult } from './trace'

installSprite()
favicon()

// Photos are worked on at this size at most; plenty for a logo, and keeps sliders live.
const WORK_SIDE = 2400

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T
const app = $('app')
const photoCanvas = $<HTMLCanvasElement>('photo')
const handles = document.getElementById('handles') as unknown as SVGSVGElement
const inkCanvas = $<HTMLCanvasElement>('ink-view')
const flatCanvas = $<HTMLCanvasElement>('flat-view')
const vectorView = $('vector-view')
const stats = $('stats')

const sliders = {
  flatten: $<HTMLInputElement>('flatten'),
  level: $<HTMLInputElement>('level'),
  weight: $<HTMLInputElement>('weight'),
  speck: $<HTMLInputElement>('speck'),
  trim: $<HTMLInputElement>('trim'),
  pad: $<HTMLInputElement>('pad'),
  smooth: $<HTMLInputElement>('smooth'),
  simplify: $<HTMLInputElement>('simplify'),
}
const levelAuto = $<HTMLInputElement>('level-auto')
const inkColor = $<HTMLInputElement>('ink')
const bgColor = $<HTMLInputElement>('bg')
const bgOn = $<HTMLInputElement>('bg-on')

const state: {
  name: string
  photo: RGBAImage | null
  quad: Quad | null
  flat: RGBAImage | null
  gray: GrayImage | null
  mask: Mask | null
  traced: TraceResult | null
} = { name: 'drawing', photo: null, quad: null, flat: null, gray: null, mask: null, traced: null }

// ---- Loading ----

async function loadBlob(blob: Blob, name: string) {
  let bitmap: ImageBitmap
  try {
    bitmap = await createImageBitmap(blob, { imageOrientation: 'from-image' })
  } catch {
    alert(
      'This browser can’t read that image. iPhone HEIC photos open in Safari; elsewhere, export them as JPEG first.',
    )
    return
  }
  loadSource(bitmap, bitmap.width, bitmap.height, name)
  bitmap.close()
}

function loadSource(src: CanvasImageSource, w: number, h: number, name: string) {
  const s = Math.min(1, WORK_SIDE / Math.max(w, h))
  const c = document.createElement('canvas')
  c.width = Math.round(w * s)
  c.height = Math.round(h * s)
  const g = c.getContext('2d', { willReadFrequently: true })!
  g.drawImage(src, 0, 0, c.width, c.height)
  state.photo = g.getImageData(0, 0, c.width, c.height)
  state.name = name.replace(/\.[^.]+$/, '') || 'drawing'
  photoCanvas.width = c.width
  photoCanvas.height = c.height
  photoCanvas.getContext('2d')!.drawImage(c, 0, 0)
  app.classList.remove('empty')
  reserveHoverWidths(app)
  detectPaper()
}

useLoader(loadSource)

$<HTMLInputElement>('file').addEventListener('change', (e) => {
  const f = (e.target as HTMLInputElement).files?.[0]
  if (f) loadBlob(f, f.name)
})

$('sample').addEventListener('click', () => {
  const c = samplePhoto()
  loadSource(c, c.width, c.height, 'sample')
})

const drop = $('drop')
let dragDepth = 0
addEventListener('dragenter', (e) => {
  if (!e.dataTransfer?.types.includes('Files')) return
  dragDepth++
  drop.hidden = false
})
addEventListener('dragleave', () => {
  if (--dragDepth <= 0) {
    dragDepth = 0
    drop.hidden = true
  }
})
addEventListener('dragover', (e) => e.preventDefault())
addEventListener('drop', (e) => {
  e.preventDefault()
  dragDepth = 0
  drop.hidden = true
  const f = [...(e.dataTransfer?.files ?? [])].find((f) => f.type.startsWith('image/'))
  if (f) loadBlob(f, f.name)
})
addEventListener('paste', (e) => {
  const item = [...(e.clipboardData?.items ?? [])].find((i) => i.type.startsWith('image/'))
  const f = item?.getAsFile()
  if (f) loadBlob(f, 'pasted')
})

// ---- Paper corners ----

function detectPaper() {
  if (!state.photo) return
  state.quad = findPaper(toGray(state.photo)) ?? fullFrame(state.photo.width, state.photo.height)
  drawHandles()
  straighten()
}

$('detect').addEventListener('click', detectPaper)
$('whole').addEventListener('click', () => {
  if (!state.photo) return
  state.quad = fullFrame(state.photo.width, state.photo.height)
  drawHandles()
  straighten()
})

const SVG_NS = 'http://www.w3.org/2000/svg'
const cornerNames = ['top left', 'top right', 'bottom right', 'bottom left']

function drawHandles() {
  const q = state.quad
  if (!q || !state.photo) return
  const { width, height } = state.photo
  handles.setAttribute('viewBox', `0 0 ${width} ${height}`)
  handles.style.width = `${photoCanvas.clientWidth}px`
  handles.style.height = `${photoCanvas.clientHeight}px`
  const r = (0.6 * 16 * width) / Math.max(1, photoCanvas.clientWidth)
  if (!handles.firstChild) {
    handles.append(document.createElementNS(SVG_NS, 'polygon'))
    cornerNames.forEach((label, i) => {
      const c = document.createElementNS(SVG_NS, 'circle')
      c.setAttribute('tabindex', '0')
      c.setAttribute('role', 'slider')
      c.setAttribute('aria-label', `Sheet corner, ${label}. Arrow keys move it.`)
      c.addEventListener('pointerdown', (e) => startDrag(e, i))
      c.addEventListener('keydown', (e) => nudge(e, i))
      handles.append(c)
    })
  }
  handles.querySelector('polygon')!.setAttribute('points', q.map((p) => `${p.x},${p.y}`).join(' '))
  handles.querySelectorAll('circle').forEach((c, i) => {
    c.setAttribute('cx', String(q[i].x))
    c.setAttribute('cy', String(q[i].y))
    c.setAttribute('r', String(r))
  })
}

new ResizeObserver(drawHandles).observe(photoCanvas)

function toPhoto(e: PointerEvent) {
  const box = photoCanvas.getBoundingClientRect()
  const { width, height } = state.photo!
  return {
    x: Math.min(Math.max(((e.clientX - box.left) / box.width) * width, 0), width),
    y: Math.min(Math.max(((e.clientY - box.top) / box.height) * height, 0), height),
  }
}

function startDrag(e: PointerEvent, i: number) {
  const el = e.target as SVGCircleElement
  el.setPointerCapture(e.pointerId)
  e.preventDefault()
  const move = (ev: PointerEvent) => {
    state.quad![i] = toPhoto(ev)
    drawHandles()
    schedule(straighten)
  }
  const up = () => {
    el.removeEventListener('pointermove', move)
    el.removeEventListener('pointerup', up)
    el.removeEventListener('pointercancel', up)
  }
  el.addEventListener('pointermove', move)
  el.addEventListener('pointerup', up)
  el.addEventListener('pointercancel', up)
}

function nudge(e: KeyboardEvent, i: number) {
  const step = e.shiftKey ? 20 : 2
  const d = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key]
  if (!d || !state.quad || !state.photo) return
  e.preventDefault()
  const p = state.quad[i]
  p.x = Math.min(Math.max(p.x + d[0], 0), state.photo.width)
  p.y = Math.min(Math.max(p.y + d[1], 0), state.photo.height)
  drawHandles()
  schedule(straighten)
}

// ---- Pipeline: straighten → ink → trace ----

// Coalesce slider input into one run. A timer rather than requestAnimationFrame,
// which stops while the window is in the background.
const pending = new Set<() => void>()
function schedule(fn: () => void) {
  if (pending.size === 0) {
    setTimeout(() => {
      const fns = [...pending]
      pending.clear()
      fns.forEach((f) => f())
    })
  }
  pending.add(fn)
}

function straighten() {
  if (!state.photo || !state.quad) return
  const { width, height } = quadSize(state.quad, WORK_SIDE)
  try {
    state.flat = warp(state.photo, state.quad, width, height)
  } catch (err) {
    stats.textContent = (err as Error).message
    return
  }
  flatCanvas.width = width
  flatCanvas.height = height
  flatCanvas.getContext('2d')!.putImageData(new ImageData(state.flat.data, width, height), 0, 0)
  state.gray = null
  makeInk()
}

let flattenedFor = -1
let flattened: GrayImage | null = null

function makeInk() {
  if (!state.flat) return
  if (!state.gray) {
    state.gray = toGray(state.flat)
    flattenedFor = -1
  }
  const strength = Number(sliders.flatten.value)
  if (flattenedFor !== strength || !flattened) {
    flattened = flattenLight(state.gray, strength)
    flattenedFor = strength
  }
  if (levelAuto.checked) sliders.level.value = String(otsu(flattened))
  let mask = threshold(flattened, Number(sliders.level.value))
  mask = trimEdges(mask, Number(sliders.trim.value))
  // Specks go before the weight change, so thickening never grows them past the limit.
  mask = despeckle(mask, Number(sliders.speck.value))
  mask = lineWeight(mask, Number(sliders.weight.value))
  const box = inkBox(mask, Number(sliders.pad.value))
  state.mask = box ? cropMask(mask, box) : null
  setMask(state.mask, state.name)
  // The Font view reads the whole straightened page, not the cropped drawing.
  setPage(flattened)
  // Textures keep the photo's own tones, so they get the light-evened grey too.
  setArt(box && state.mask ? { gray: cropMask(flattened, box), mask: state.mask } : null, state.name)
  $<HTMLButtonElement>('icon-tab').disabled = !state.mask
  $<HTMLButtonElement>('texture-tab').disabled = !state.mask
  showOutputs()
  drawInk()
  traceSoon()
}

function drawInk() {
  const m = state.mask
  if (!m) {
    inkCanvas.width = inkCanvas.height = 1
    return
  }
  inkCanvas.width = m.width
  inkCanvas.height = m.height
  inkCanvas.getContext('2d')!.putImageData(maskImage(m), 0, 0)
}

function hexRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

/** The mask in the ink colour, on the background colour or transparent. */
function maskImage(m: Mask): ImageData {
  const img = new ImageData(m.width, m.height)
  const [r, g, b] = hexRgb(inkColor.value)
  const [br, bg, bb] = hexRgb(bgColor.value)
  for (let i = 0, j = 0; i < m.data.length; i++, j += 4) {
    if (m.data[i]) {
      img.data[j] = r
      img.data[j + 1] = g
      img.data[j + 2] = b
      img.data[j + 3] = 255
    } else if (bgOn.checked) {
      img.data[j] = br
      img.data[j + 1] = bg
      img.data[j + 2] = bb
      img.data[j + 3] = 255
    }
  }
  return img
}

let traceTimer = 0
let traceRun = 0
function traceSoon() {
  clearTimeout(traceTimer)
  traceTimer = window.setTimeout(runTrace, 200)
}

async function runTrace() {
  const m = state.mask
  if (!m) {
    state.traced = null
    vectorView.innerHTML = ''
    stats.textContent = 'No ink found. Try a higher ink cut-off.'
    return
  }
  const run = ++traceRun
  const result = await trace(m, {
    ignore: 2,
    smoothness: Number(sliders.smooth.value),
    simplify: Number(sliders.simplify.value),
  })
  if (run !== traceRun) return
  state.traced = result
  drawVector()
}

function svgText() {
  return toSvg(state.traced!, { ink: inkColor.value, background: bgOn.checked ? bgColor.value : null })
}

function drawVector() {
  if (!state.traced) return
  const svg = svgText()
  vectorView.innerHTML = svg
  const kb = new Blob([svg]).size / 1024
  const { outlines, segments } = complexity(state.traced)
  stats.textContent = `${state.traced.width} × ${state.traced.height} px · ${outlines} outlines · ${segments} segments · ${kb.toFixed(1)} KB`
}

// ---- Controls ----

const formats: Record<keyof typeof sliders, (v: number) => string> = {
  flatten: (v) => `${Math.round(v * 100)}%`,
  level: (v) => String(v),
  weight: (v) => (v > 0 ? `+${v} px` : `${v} px`),
  speck: (v) => (v ? `${v} px` : 'off'),
  trim: (v) => `${(v * 100).toFixed(1)}%`,
  pad: (v) => `${v} px`,
  smooth: (v) => v.toFixed(2),
  simplify: (v) => v.toFixed(2),
}

function showOutputs() {
  for (const k of Object.keys(sliders) as (keyof typeof sliders)[]) {
    $(`${k}-out`).textContent = formats[k](Number(sliders[k].value))
  }
}

for (const k of ['flatten', 'weight', 'speck', 'trim', 'pad'] as const) {
  sliders[k].addEventListener('input', () => schedule(makeInk))
}
sliders.level.addEventListener('input', () => {
  levelAuto.checked = false
  schedule(makeInk)
})
levelAuto.addEventListener('change', () => schedule(makeInk))
for (const k of ['smooth', 'simplify'] as const) {
  sliders[k].addEventListener('input', () => {
    showOutputs()
    traceSoon()
  })
}
for (const el of [inkColor, bgColor, bgOn]) {
  el.addEventListener('input', () => {
    drawInk()
    drawVector()
  })
}

const views = { vector: vectorView, ink: inkCanvas, flat: flatCanvas }
document.querySelectorAll<HTMLInputElement>('input[name="view"]').forEach((r) =>
  r.addEventListener('change', () => {
    for (const [k, el] of Object.entries(views)) el.hidden = k !== r.value
  }),
)

// ---- Views ----

document.querySelectorAll<HTMLButtonElement>('.tab').forEach((tab) =>
  tab.addEventListener('click', () => {
    document.querySelectorAll<HTMLButtonElement>('.tab').forEach((t) => {
      const on = t === tab
      t.setAttribute('aria-pressed', String(on))
      $(t.dataset.view!).hidden = !on
    })
    reserveHoverWidths($(tab.dataset.view!))
    if (tab.dataset.view === 'icon-app') showIcon()
    if (tab.dataset.view === 'texture-app') showTexture()
    if (tab.dataset.view === 'font-app') showFont()
  }),
)

// ---- Export ----

function download(blob: Blob, filename: string) {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = filename
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 1000)
}

$('dl-svg').addEventListener('click', () => {
  if (state.traced) download(new Blob([svgText()], { type: 'image/svg+xml' }), `${state.name}.svg`)
})

$('copy-svg').addEventListener('click', async (e) => {
  if (!state.traced) return
  const btn = e.currentTarget as HTMLButtonElement
  await navigator.clipboard.writeText(svgText())
  flash(btn)
})

$('dl-png').addEventListener('click', () => {
  if (!state.mask) return
  drawInk()
  inkCanvas.toBlob((b) => b && download(b, `${state.name}-ink.png`), 'image/png')
})

showOutputs()

// Related pairs become one globe; then every remaining slider is drawn and the icons added.
globePair({ input: sliders.flatten, hint: '← →' }, { input: sliders.level, hint: '↑ ↓' }, 'Even out light and ink cut-off')
handSliders()
decorate()
reserveHoverWidths()

$('privacy-settings').addEventListener('click', privacySettings)
privacyNotice()
