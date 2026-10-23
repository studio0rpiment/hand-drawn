import { cropMask, despeckle, flattenLight, inkBox, lineWeight, threshold, trimEdges, type Box } from './clean'
import { zip } from './icon/files'
import { padBox, splitDrawings } from './split'
import { otsu, shrinkGray, toGray, type GrayImage, type Mask, type Quad, type RGBAImage } from './image'
import { findPaper, fullFrame, quadSize, warp } from './paper'
import { setPage, showFont, useLoader } from './font/ui'
import { onSheetPick, setMask, setSheet, showIcon } from './icon/ui'
import { samplePhoto } from './sample'
import { decorate, favicon, flash, handSliders, installSprite, reserveHoverWidths } from './ui/hand'
import { privacyNotice, privacySettings } from './ui/privacy'
import { globePair } from './ui/sphere'
import { setArt, showTexture } from './texture/ui'
import { complexity } from './svgpath'
import { hexRgb, hslHex, measureColours, rgbHsl, type RGB } from './colour'
import { scanColours, setScanColours } from './ui/scan-colour'
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
const logoTab = $<HTMLButtonElement>('logo-tab')
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
  gap: $<HTMLInputElement>('gap'),
}
const sheetOn = $<HTMLInputElement>('sheet-on')
const levelAuto = $<HTMLInputElement>('level-auto')
const inkColor = $<HTMLInputElement>('ink')
const bgColor = $<HTMLInputElement>('bg')
const bgOn = $<HTMLInputElement>('bg-on')
const logoScan = $<HTMLInputElement>('logo-scan-colours')

// The scan's colours, in HSL; read from each new photo, then the user's to adjust.
const colourIn = {
  'ink-h': $<HTMLInputElement>('ink-h'),
  'ink-s': $<HTMLInputElement>('ink-s'),
  'ink-l': $<HTMLInputElement>('ink-l'),
  'paper-h': $<HTMLInputElement>('paper-h'),
  'paper-s': $<HTMLInputElement>('paper-s'),
  'paper-l': $<HTMLInputElement>('paper-l'),
}
const paperOn = $<HTMLInputElement>('paper-on')
const hslOf = (k: 'ink' | 'paper') => ({ h: Number(colourIn[`${k}-h`].value), s: Number(colourIn[`${k}-s`].value), l: Number(colourIn[`${k}-l`].value) })

const state: {
  name: string
  photo: RGBAImage | null
  quad: Quad | null
  flat: RGBAImage | null
  gray: GrayImage | null
  mask: Mask | null
  traced: TraceResult | null
  /** A sheet of several drawings: the page's ink, each drawing's box in it, and which one is being worked on. */
  sheet: { mask: Mask; boxes: Box[] } | null
  pick: number
} = { name: 'drawing', photo: null, quad: null, flat: null, gray: null, mask: null, traced: null, sheet: null, pick: 0 }

// ---- Loading ----

/** An iPhone HEIC/HEIF photo, by its type, its name, or the brand in its first bytes. */
async function isHeic(blob: Blob, name: string): Promise<boolean> {
  if (/^image\/hei[cf]/.test(blob.type) || /\.hei[cf]$/i.test(name)) return true
  const head = new TextDecoder().decode(await blob.slice(4, 12).arrayBuffer())
  return /^ftyp(heic|heix|hevc|mif1|msf1)/.test(head)
}

/** While a HEIC photo converts (the first one takes a few seconds), the open button says so. */
const openText = [...$('file').closest('label')!.childNodes].find((n) => n.nodeType === Node.TEXT_NODE && n.textContent!.trim())!
const openWas = openText.textContent
const converting = (on: boolean) => (openText.textContent = on ? ' Converting HEIC… ' : openWas)

async function loadBlob(blob: Blob, name: string) {
  let bitmap: ImageBitmap
  try {
    bitmap = await createImageBitmap(blob, { imageOrientation: 'from-image' })
  } catch {
    // Most browsers other than Safari can't read HEIC: convert it to PNG here, in the page.
    // The converter is large, so it only loads when a HEIC photo comes in.
    try {
      if (!(await isHeic(blob, name))) throw new Error('not HEIC')
      converting(true)
      const { heicTo } = await import('heic-to/csp')
      const png = await heicTo({ blob, type: 'image/png' })
      bitmap = await createImageBitmap(png, { imageOrientation: 'from-image' })
    } catch {
      alert('This browser can’t read that image. Try exporting it as JPEG or PNG.')
      return
    } finally {
      converting(false)
    }
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
  state.pick = 0
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
  const f = [...(e.dataTransfer?.files ?? [])].find((f) => f.type.startsWith('image/') || /\.hei[cf]$/i.test(f.name))
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

// While a globe rolls, the drawing is worked out on a half-size copy so it can
// keep up; when the globe comes to rest, a full-size pass follows.
const PREVIEW = 2
let previewGray: GrayImage | null = null
let previewFor = -1
let previewFlat: GrayImage | null = null

function makeInk() {
  if (!state.flat) return
  if (!state.gray) {
    state.gray = toGray(state.flat)
    flattenedFor = -1
    previewGray = null
    previewFor = -1
  }
  const rolling = document.documentElement.dataset.rolling === '1'
  const strength = Number(sliders.flatten.value)
  let base: GrayImage
  // Pixel-based settings scale with the working size.
  let k = 1
  if (rolling) {
    previewGray ??= shrinkGray(state.gray, PREVIEW)
    if (previewFor !== strength || !previewFlat) {
      previewFlat = flattenLight(previewGray, strength)
      previewFor = strength
    }
    base = previewFlat
    k = PREVIEW
  } else {
    if (flattenedFor !== strength || !flattened) {
      flattened = flattenLight(state.gray, strength)
      flattenedFor = strength
    }
    base = flattened
  }
  if (levelAuto.checked) sliders.level.value = String(otsu(base))
  let mask = threshold(base, Number(sliders.level.value))
  mask = trimEdges(mask, Number(sliders.trim.value))
  // Specks go before the weight change, so thickening never grows them past the limit.
  mask = despeckle(mask, Number(sliders.speck.value) / (k * k))
  mask = lineWeight(mask, Math.round(Number(sliders.weight.value) / k))
  const pad = Math.round(Number(sliders.pad.value) / k)
  let box: Box | null
  if (sheetOn.checked) {
    // A sheet of drawings: find each one; the picked one is what the views work on.
    const minArea = Math.max(30, Number(sliders.speck.value)) / (k * k)
    const boxes = splitDrawings(mask, Number(sliders.gap.value) / k, minArea)
    state.sheet = { mask, boxes }
    state.pick = Math.min(state.pick, Math.max(0, boxes.length - 1))
    box = boxes.length ? padBox(boxes[state.pick], pad, mask.width, mask.height) : null
  } else {
    state.sheet = null
    box = inkBox(mask, pad)
  }
  state.mask = box ? cropMask(mask, box) : null
  if (!rolling && measuredFor !== state.flat) {
    measuredFor = state.flat
    readColours(state.flat, mask)
  }
  if (!rolling) {
    setMask(state.mask, state.name)
    // The Font view reads the whole straightened page, not the cropped drawing.
    setPage(base)
    // Textures keep the photo's own tones, so they get the light-evened grey too.
    setArt(box && state.mask ? { gray: cropMask(base, box), mask: state.mask } : null, state.name)
    logoTab.disabled = !state.mask
    $<HTMLButtonElement>('icon-tab').disabled = !state.mask
    $<HTMLButtonElement>('texture-tab').disabled = !state.mask
    showSheet()
  }
  showOutputs()
  drawInk()
  traceSoon()
}

// ---- Colour ----

// The straightened photo the colours were last read from; a new one is read again.
let measuredFor: RGBAImage | null = null

/** Set the colour controls from the photo (the globes roll there). */
function readColours(flat: RGBAImage, mask: Mask) {
  const got = measureColours(flat, mask)
  if (!got) return
  for (const [k, rgb] of [['ink', got.ink], ['paper', got.paper]] as [string, RGB][]) {
    const c = rgbHsl(rgb)
    for (const [axis, v] of [['h', c.h], ['s', c.s], ['l', c.l]] as const) {
      colourIn[`${k}-${axis}` as keyof typeof colourIn].value = String(Math.round(v))
    }
  }
  colourChanged()
}

/** After any colour control moved: share the colours and repaint what shows them. */
function colourChanged() {
  setScanColours({ ink: hslHex(hslOf('ink')), paper: paperOn.checked ? hslHex(hslOf('paper')) : null })
  showColourOutputs()
  drawInk()
  showSheet()
  drawVector()
}

const colourFormats = { h: (v: number) => `${v}°`, s: (v: number) => `${v}%`, l: (v: number) => `${v}%` }
function showColourOutputs() {
  for (const [k, el] of Object.entries(colourIn)) $(`${k}-out`).textContent = colourFormats[k.slice(-1) as 'h' | 's' | 'l'](Number(el.value))
  for (const k of ['paper-h', 'paper-s', 'paper-l'] as const) colourIn[k].closest('label')!.classList.toggle('off', !paperOn.checked)
}

for (const el of Object.values(colourIn)) el.addEventListener('input', colourChanged)
paperOn.addEventListener('change', colourChanged)
$('measure').addEventListener('click', () => {
  measuredFor = null
  schedule(makeInk)
})

/** The logo's colours: the scan's, or its own. */
function logoColours() {
  if (logoScan.checked) {
    const c = scanColours()
    return { ink: c.ink, background: c.paper }
  }
  return { ink: inkColor.value, background: bgOn.checked ? bgColor.value : null }
}

logoScan.addEventListener('change', () => {
  $('logo-own-colours').hidden = logoScan.checked
  drawVector()
})

// A globe came to rest: redo the drawing at full size.
addEventListener('globe-rest', () => schedule(makeInk))

// ---- Sheets of drawings ----

const two = (n: number) => String(n).padStart(2, '0')
const pieceName = (i: number) => `${state.name}-${two(i + 1)}`

/** The drawings of a sheet, each cropped close (the views add their own margins). */
function sheetPieces(): { mask: Mask; name: string }[] {
  const sh = state.sheet
  if (!sh) return []
  return sh.boxes.map((b, i) => ({ mask: cropMask(sh.mask, padBox(b, 2, sh.mask.width, sh.mask.height)), name: pieceName(i) }))
}

/** The numbered thumbnails above the result, and the sheet's drawings handed to the Icon view. */
function showSheet() {
  const strip = $('pieces')
  const sh = state.sheet
  $('sheet-count').textContent = sh
    ? `${sh.boxes.length} drawing${sh.boxes.length === 1 ? '' : 's'} found${sh.boxes.length ? ` · working on ${state.pick + 1}` : ''}`
    : ''
  $<HTMLButtonElement>('dl-all').disabled = !sh || !sh.boxes.length
  strip.hidden = !sh
  if (!sh) {
    strip.replaceChildren()
    setSheet(null, 0)
    return
  }
  const [r, g, b] = hexRgb(scanColours().ink)
  strip.replaceChildren(
    ...sh.boxes.map((box, i) => {
      const btn = document.createElement('button')
      btn.type = 'button'
      btn.className = 'piece'
      btn.setAttribute('role', 'option')
      btn.setAttribute('aria-selected', String(i === state.pick))
      btn.setAttribute('aria-label', `Drawing ${i + 1}`)
      const c = document.createElement('canvas')
      const s = Math.min(1, 72 / Math.max(box.width, box.height))
      c.width = Math.max(1, Math.round(box.width * s))
      c.height = Math.max(1, Math.round(box.height * s))
      const full = cropMask(sh.mask, box)
      const img = new ImageData(full.width, full.height)
      for (let p = 0, j = 0; p < full.data.length; p++, j += 4) {
        if (!full.data[p]) continue
        img.data[j] = r
        img.data[j + 1] = g
        img.data[j + 2] = b
        img.data[j + 3] = 255
      }
      const tmp = document.createElement('canvas')
      tmp.width = full.width
      tmp.height = full.height
      tmp.getContext('2d')!.putImageData(img, 0, 0)
      const ctx = c.getContext('2d')!
      ctx.imageSmoothingQuality = 'high'
      ctx.drawImage(tmp, 0, 0, c.width, c.height)
      const num = document.createElement('span')
      num.textContent = String(i + 1)
      btn.append(c, num)
      btn.addEventListener('click', () => {
        state.pick = i
        schedule(makeInk)
      })
      return btn
    }),
  )
  setSheet(sheetPieces(), state.pick)
}

$('dl-all').addEventListener('click', async (e) => {
  const pieces = sheetPieces()
  if (!pieces.length) return
  const btn = e.currentTarget as HTMLButtonElement
  btn.disabled = true
  const settings = { ignore: 2, smoothness: Number(sliders.smooth.value), simplify: Number(sliders.simplify.value) }
  const style = logoColours()
  const files = []
  for (const [i, p] of pieces.entries()) {
    stats.textContent = `Tracing ${i + 1} of ${pieces.length}…`
    // The same margin as a single drawing gets.
    const pad = Number(sliders.pad.value)
    const m = p.mask
    const padded: Mask = { width: m.width + 2 * pad, height: m.height + 2 * pad, data: new Uint8Array((m.width + 2 * pad) * (m.height + 2 * pad)) }
    for (let y = 0; y < m.height; y++) padded.data.set(m.data.subarray(y * m.width, (y + 1) * m.width), (y + pad) * padded.width + pad)
    files.push({ path: `${state.name}-drawings/${p.name}.svg`, data: toSvg(await trace(padded, settings), style) })
  }
  const bytes = zip(files)
  download(new Blob([bytes.buffer as ArrayBuffer], { type: 'application/zip' }), `${state.name}-drawings.zip`)
  stats.textContent = `${pieces.length} SVGs packed`
  btn.disabled = false
})

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

/** The mask in the scan's ink colour, on its paper colour or transparent. */
function maskImage(m: Mask): ImageData {
  const img = new ImageData(m.width, m.height)
  const { ink, paper } = scanColours()
  const [r, g, b] = hexRgb(ink)
  const [br, bg, bb] = hexRgb(paper ?? '#ffffff')
  for (let i = 0, j = 0; i < m.data.length; i++, j += 4) {
    if (m.data[i]) {
      img.data[j] = r
      img.data[j + 1] = g
      img.data[j + 2] = b
      img.data[j + 3] = 255
    } else if (paper) {
      img.data[j] = br
      img.data[j + 1] = bg
      img.data[j + 2] = bb
      img.data[j + 3] = 255
    }
  }
  return img
}

// Trace as often as tracing allows, so the drawing follows a globe while it
// rolls: start at once, and if anything changes mid-trace, run once more with
// the latest settings when it finishes.
let tracing = false
let traceAgain = false
function traceSoon() {
  if (tracing) traceAgain = true
  else void runTrace()
}

async function runTrace() {
  const m = state.mask
  if (!m) {
    state.traced = null
    vectorView.innerHTML = ''
    stats.textContent = 'No ink found. Try a higher ink cut-off.'
    return
  }
  tracing = true
  try {
    state.traced = await trace(m, {
      ignore: 2,
      smoothness: Number(sliders.smooth.value),
      simplify: Number(sliders.simplify.value),
    })
    drawVector()
  } finally {
    tracing = false
  }
  if (traceAgain) {
    traceAgain = false
    void runTrace()
  }
}

function svgText() {
  return toSvg(state.traced!, logoColours())
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
  gap: (v) => `${v} px`,
}

function showOutputs() {
  for (const k of Object.keys(sliders) as (keyof typeof sliders)[]) {
    $(`${k}-out`).textContent = formats[k](Number(sliders[k].value))
  }
}

sheetOn.addEventListener('change', () => schedule(makeInk))
// Choosing an icon in the Icon view's set picks that drawing everywhere.
onSheetPick((i) => {
  state.pick = i
  schedule(makeInk)
})
for (const k of ['flatten', 'weight', 'speck', 'trim', 'pad', 'gap'] as const) {
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
for (const el of [inkColor, bgColor, bgOn]) el.addEventListener('input', drawVector)

const views = { ink: inkCanvas, flat: flatCanvas }
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
const arc = $('globe-arc')
globePair('Light', { input: sliders.flatten }, { input: sliders.level, whole: true }, arc)
globePair('Ink', { input: sliders.weight, whole: true }, { input: sliders.speck, whole: true }, arc)
globePair('Ink colour', { input: colourIn['ink-h'], whole: true }, { input: colourIn['ink-s'], whole: true }, arc)
globePair('Paper colour', { input: colourIn['paper-h'], whole: true }, { input: colourIn['paper-s'], whole: true }, arc)
globePair('Curves', { input: sliders.smooth }, { input: sliders.simplify }, $('logo-globes'))
colourChanged()

// The photo inset: small in the corner, enlarged to place the sheet corners.
$('inset-size').addEventListener('click', (e) => {
  const btn = e.currentTarget as HTMLButtonElement
  const big = $('photo-inset').classList.toggle('big')
  btn.setAttribute('aria-pressed', String(big))
  btn.textContent = big ? 'Shrink photo' : 'Enlarge photo'
  drawHandles()
})
handSliders()
decorate()
reserveHoverWidths()

$('privacy-settings').addEventListener('click', privacySettings)
privacyNotice()
