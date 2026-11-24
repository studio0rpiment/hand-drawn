// The maps side of the Texture tab: the picked image made into PBR maps,
// shown one by one, tiled 3 × 3 and on a lit sphere, with the files' sizes and
// their downloads (one at a time, or all in one zip).
//
// The maps are made in a worker (maps-worker.ts), so the page never freezes.
// The preview is made at once, at most PREVIEW_SIDE on the longer side, and
// its files are ready to download. Smaller files are made when picked; bigger
// ones only when asked, with a picture of the work under way.

import type { GrayImage, Mask, RGBAImage } from '../image'
import { slug } from '../icon/style'
import { zip } from '../icon/files'
import { t } from '../text'
import { litSphere, type Light } from './lit'
import { MAP_KINDS, MAP_STEPS, mapSizes, type MapKind, type Maps, type MapStep } from './pbr'
import type { MapJob } from './maps-worker'
import { cropRect, type Surface } from './surface'
import type { Format, TextureStyle } from './style'

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T

/** The previews are worked out at most this many pixels on the longer side. */
const PREVIEW_SIDE = 1024
const LIT_SIDE = 320

const MIME: Record<Format, string> = { png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp' }

/** File names say what each map is in the words 3D software looks for (basecolor, normal, roughness …). */
const FILE_WORD: Record<MapKind, string> = { base: 'basecolor', height: 'height', normal: 'normal', roughness: 'roughness', ao: 'ao' }

export interface MapArt {
  gray: GrayImage
  mask: Mask
  colour: RGBAImage
}

interface Source {
  name: string
  /** The photo in colour, and its grey (red) and ink (green) packed in one canvas, so both resize alike. */
  colour: HTMLCanvasElement
  data: HTMLCanvasElement
}

let source: Source | null = null
let preview: Maps | null = null
type Size = { width: number; height: number }
const sizeKey = (z: Size) => `${z.width}x${z.height}`
/** Maps made for the current image and settings, by size: the preview's, and at most one other. */
const made = new Map<string, Maps>()
let madeFor = ''
/** The size picked for the files; null until there is a preview. */
let out: Size | null = null
interface Job {
  size: string
  maps: Promise<Maps>
  stop(): void
}
let previewJob: Job | null = null
let job: Job | null = null
let runs = 0
let style: TextureStyle | null = null
let colours = { ink: '#191b1a', paper: '#f5f4ed' }
let light: Light = { x: -0.5, y: 0.6, z: 0.65 }

function canvasOf(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  return c
}

/** The picked image, or null when there is none. */
export function setMapArt(art: MapArt | null, name: string) {
  forget()
  if (!art) {
    source = null
    preview = null
    return
  }
  const { width: w, height: h } = art.gray
  const colour = canvasOf(w, h)
  colour.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(art.colour.data), w, h), 0, 0)
  const data = canvasOf(w, h)
  const img = new ImageData(w, h)
  for (let i = 0, j = 0; i < w * h; i++, j += 4) {
    img.data[j] = art.gray.data[i]
    img.data[j + 1] = art.mask.data[i] ? 255 : 0
    img.data[j + 3] = 255
  }
  data.getContext('2d')!.putImageData(img, 0, 0)
  source = { name, colour, data }
}

/** The source cut to the surface (crop, then the output's proportions) at `w` × `h`. */
function surfaceAt(src: Source, s: TextureStyle, w: number, h: number): Surface {
  const r = cropRect(src.colour.width, src.colour.height, s.surface.crop, s.file.width, s.file.height)
  const read = (from: HTMLCanvasElement) => {
    const c = canvasOf(w, h)
    const g = c.getContext('2d', { willReadFrequently: true })!
    g.imageSmoothingQuality = 'high'
    g.drawImage(from, r.x, r.y, r.width, r.height, 0, 0, w, h)
    return g.getImageData(0, 0, w, h).data
  }
  const colour = read(src.colour)
  const packed = read(src.data)
  const gray = new Uint8Array(w * h)
  const ink = new Uint8Array(w * h)
  for (let i = 0, j = 0; i < w * h; i++, j += 4) {
    gray[i] = packed[j]
    ink[i] = packed[j + 1]
  }
  return { width: w, height: h, colour, gray, ink }
}

/** Make the maps in a worker. `step` hears each step as it finishes; `stop` ends the work. */
function build(src: Source, s: TextureStyle, size: Size, step?: (st: MapStep) => void): Job {
  const surface = surfaceAt(src, s, size.width, size.height)
  const worker = new Worker(new URL('./maps-worker.ts', import.meta.url), { type: 'module' })
  let stop = () => {}
  const maps = new Promise<Maps>((resolve, reject) => {
    stop = () => {
      worker.terminate()
      reject(new Error('stopped'))
    }
    worker.onmessage = (e: MessageEvent<{ step?: MapStep; maps?: Maps; error?: string }>) => {
      if (e.data.step) return step?.(e.data.step)
      worker.terminate()
      if (e.data.maps) resolve(e.data.maps)
      else reject(new Error(e.data.error))
    }
    worker.onerror = (e) => {
      worker.terminate()
      reject(new Error(e.message))
    }
  })
  const msg: MapJob = {
    surface,
    options: s.maps,
    tile: { seamless: s.surface.seamless, seam: s.surface.seam, ragged: s.surface.ragged, seed: s.seed },
    colours,
  }
  worker.postMessage(msg, [surface.colour.buffer, surface.gray.buffer, surface.ink.buffer])
  return { size: sizeKey(size), maps, stop: () => stop() }
}

/** Drop the maps made so far and stop any work on them. */
function forget() {
  previewJob?.stop()
  previewJob = null
  job?.stop()
  job = null
  made.clear()
  madeFor = ''
  showMaking(null)
}

/** The preview's size: the first of the file sizes at most PREVIEW_SIDE on the longer side. */
function previewSize(sizes: Size[]): Size {
  return sizes.find((z) => Math.max(z.width, z.height) <= PREVIEW_SIDE) ?? sizes[sizes.length - 1]
}

/** What the maps depend on, so they are made again only when it changes. */
const mapKey = (s: TextureStyle) => JSON.stringify([s.surface, s.maps, s.file.width, s.file.height, s.seed, colours])

function imageCanvas(m: Maps, kind: MapKind): HTMLCanvasElement {
  const c = canvasOf(m.width, m.height)
  c.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(m.images[kind]), m.width, m.height), 0, 0)
  return c
}

const encode = (c: HTMLCanvasElement, s: TextureStyle) =>
  new Promise<Blob | null>((done) => c.toBlob(done, MIME[s.file.format], s.file.format === 'png' ? undefined : s.file.quality))

function sizeText(bytes: number): string {
  if (bytes < 1024 * 1024) return t('texture.kb', { n: Math.max(1, Math.round(bytes / 1024)) })
  return t('texture.mb', { n: (bytes / 1024 / 1024).toFixed(1) })
}

/** Work out the maps for the current image and settings, and show them. */
export async function renderMaps(s: TextureStyle, scanColours: { ink: string; paper: string }) {
  style = s
  colours = scanColours
  const run = ++runs
  const empty = !source
  for (const id of ['texture-maps-pane', 'texture-tiled-pane', 'texture-lit-pane']) $(id).classList.toggle('empty', empty)
  const key = mapKey(s)
  if (key !== madeFor) forget()
  if (!source) {
    preview = null
    out = null
    $('map-sizes').textContent = ''
    $('map-stats').textContent = ''
    fillFiles()
    return
  }
  madeFor = key
  const sizes = mapSizes(s.file.width, s.file.height)
  const small = previewSize(sizes)
  if (!out || !sizes.some((z) => sizeKey(z) === sizeKey(out!))) out = small
  const t0 = performance.now()
  let maps = made.get(sizeKey(small))
  if (!maps) {
    previewJob?.stop()
    const j = (previewJob = build(source, s, small))
    try {
      maps = await j.maps
    } catch {
      return
    } finally {
      if (previewJob === j) previewJob = null
    }
    if (run !== runs) return
    made.set(sizeKey(small), maps)
  }
  preview = maps
  for (const kind of MAP_KINDS) {
    const c = document.querySelector<HTMLCanvasElement>(`#map-grid [data-map="${kind}"] canvas`)!
    c.width = maps.width
    c.height = maps.height
    c.getContext('2d')!.drawImage(imageCanvas(maps, kind), 0, 0)
  }
  drawTiled()
  drawLit()
  $('map-stats').textContent = t('texture.map-stats', { width: maps.width, height: maps.height, ms: Math.round(performance.now() - t0) })
  fillFiles()
  await showSizes(run)
}

/** The size picker, and what the files row offers for the picked size: downloads when its maps are made, else a button to make them. */
function fillFiles() {
  const select = $<HTMLSelectElement>('map-out')
  const ready = !!out && made.has(sizeKey(out))
  $('map-out-row').hidden = !style || !source
  if (style && source && out) {
    const sizes = mapSizes(style.file.width, style.file.height)
    const small = previewSize(sizes)
    select.replaceChildren(
      ...sizes.map((z) => {
        const k = sizeKey(z)
        const word = made.has(k) ? 'texture.out.ready' : Math.max(z.width, z.height) > Math.max(small.width, small.height) ? 'texture.out.ask' : 'texture.out.quick'
        return new Option(t(word, { width: z.width, height: z.height }), k, false, k === sizeKey(out!))
      }),
    )
  }
  $('map-make-row').hidden = !source || ready || !out
  if (out) $('map-make').textContent = t('texture.make', { width: out.width, height: out.height })
  $('map-zip').closest<HTMLElement>('.row')!.hidden = !ready
  $('map-downloads').hidden = !ready
}

/** The files' sizes at the picked size: exact for the preview and smaller sizes once made, else scaled from the preview by area (big files take long to encode). */
async function showSizes(run = runs) {
  const s = style
  if (!s || !preview || !out) return
  const small = Math.max(out.width, out.height) <= Math.max(preview.width, preview.height)
  const maps = (small && made.get(sizeKey(out))) || preview
  const scale = (out.width * out.height) / (maps.width * maps.height)
  const sizes: string[] = []
  let total = 0
  for (const kind of MAP_KINDS) {
    const b = await encode(imageCanvas(maps, kind), s)
    if (run !== runs) return
    const bytes = (b?.size ?? 0) * scale
    total += bytes
    sizes.push(`${t(`texture.map.${kind}`)} ${sizeText(bytes)}`)
  }
  $('map-sizes').textContent = t(scale === 1 ? 'texture.sizes' : 'texture.sizes-about', {
    format: s.file.format.toUpperCase(),
    sizes: sizes.join(' · '),
    total: sizeText(total),
  })
}

/** Make the maps at the picked size, with the picture of the work over the maps. */
async function makeOut() {
  if (!source || !style || !out) return
  const size = out
  const k = sizeKey(size)
  if (made.has(k) || job?.size === k) return
  job?.stop()
  // Keep the preview's maps and these; let any other size go.
  const keep = preview ? sizeKey(preview) : ''
  for (const other of [...made.keys()]) if (other !== keep) made.delete(other)
  const t0 = performance.now()
  showMaking(size)
  const j = (job = build(source, style, size, (st) => stepDone(st)))
  let maps: Maps
  try {
    maps = await j.maps
  } catch {
    return
  } finally {
    if (job === j) {
      job = null
      showMaking(null)
    }
  }
  made.set(k, maps)
  $('map-stats').textContent = t('texture.made', { width: size.width, height: size.height, s: ((performance.now() - t0) / 1000).toFixed(1) })
  fillFiles()
  void showSizes()
}

/** The picture of the work under way over the maps, or none. */
function showMaking(size: Size | null) {
  const box = $('map-making')
  box.hidden = !size
  $('texture-maps-pane').classList.toggle('making', !!size)
  $<HTMLButtonElement>('map-make').disabled = !!size
  if (!size) return
  $('map-making-text').textContent = t('texture.making', { width: size.width, height: size.height })
  for (const li of box.querySelectorAll<HTMLElement>('[data-step]')) {
    li.classList.remove('done')
    if (li.dataset.step === 'tile') li.hidden = !style?.surface.seamless
  }
  box.querySelector<HTMLElement>('[data-step]:not([hidden])')?.classList.add('now')
}

function stepDone(step: MapStep) {
  const box = $('map-making')
  box.querySelector(`[data-step="${step}"]`)?.classList.replace('now', 'done')
  box.querySelector(`[data-step="${step}"]`)?.classList.add('done')
  const next = MAP_STEPS.slice(MAP_STEPS.indexOf(step) + 1).find((st) => !box.querySelector<HTMLElement>(`[data-step="${st}"]`)?.hidden)
  if (next) box.querySelector(`[data-step="${next}"]`)?.classList.add('now')
}

$('map-out').addEventListener('change', () => {
  const [w, h] = $<HTMLSelectElement>('map-out').value.split('x').map(Number)
  out = { width: w, height: h }
  const small = preview && Math.max(w, h) <= Math.max(preview.width, preview.height)
  fillFiles()
  void showSizes()
  // Smaller than the preview: quick, so made at once. Bigger: only when asked.
  if (small) void makeOut()
})
$('map-make').addEventListener('click', () => void makeOut())
$('map-stop').addEventListener('click', () => {
  job?.stop()
  job = null
  showMaking(null)
  $('map-stats').textContent = t('texture.stopped')
})

/** The chosen map tiled 3 × 3, so seams show. */
function drawTiled() {
  if (!preview) return
  const kind = (document.querySelector<HTMLInputElement>('input[name="tiled-map"]:checked')?.value ?? 'base') as MapKind
  const tile = imageCanvas(preview, kind)
  const k = Math.min(1, 300 / Math.max(tile.width, tile.height))
  const w = Math.round(tile.width * k)
  const h = Math.round(tile.height * k)
  const c = $<HTMLCanvasElement>('texture-tiled')
  c.width = w * 3
  c.height = h * 3
  const g = c.getContext('2d')!
  g.imageSmoothingQuality = 'high'
  for (let y = 0; y < 3; y++) for (let x = 0; x < 3; x++) g.drawImage(tile, x * w, y * h, w, h)
}

let litFrame = 0
function drawLit() {
  if (!preview || !style) return
  const c = $<HTMLCanvasElement>('texture-lit')
  c.width = c.height = LIT_SIDE
  const img = new ImageData(litSphere(preview, LIT_SIDE, light, style.maps.normalY) as Uint8ClampedArray<ArrayBuffer>, LIT_SIDE, LIT_SIDE)
  c.getContext('2d')!.putImageData(img, 0, 0)
}

// The light follows the pointer over the sphere.
$('texture-lit').addEventListener('pointermove', (e) => {
  const c = e.currentTarget as HTMLCanvasElement
  const r = c.getBoundingClientRect()
  const x = ((e.clientX - r.left) / r.width) * 2 - 1
  const y = 1 - ((e.clientY - r.top) / r.height) * 2
  light = { x: x * 1.4, y: y * 1.4, z: 0.6 }
  cancelAnimationFrame(litFrame)
  litFrame = requestAnimationFrame(drawLit)
})

for (const input of document.querySelectorAll<HTMLInputElement>('input[name="tiled-map"]')) input.addEventListener('change', drawTiled)

// ---- Files ----

function download(blob: Blob, filename: string) {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = filename
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 1000)
}

function fileName(s: TextureStyle, kind: MapKind): string {
  const word = kind === 'normal' ? `normal-${s.maps.normalY}` : FILE_WORD[kind]
  return `${slug(source?.name ?? 'texture')}_${word}.${s.file.format}`
}

/** The maps at the picked size, if they are made. */
function outMaps(): Maps | null {
  return out ? (made.get(sizeKey(out)) ?? null) : null
}

/** While files are saved: the download buttons off, and words saying what is under way. */
async function saving(words: string, work: () => Promise<void>) {
  const buttons = [...document.querySelectorAll<HTMLButtonElement>('[data-map-dl], #map-zip')]
  if (buttons.some((b) => b.disabled)) return
  for (const b of buttons) b.disabled = true
  $('map-stats').textContent = words
  // Let the words show before the work starts.
  await new Promise((r) => setTimeout(r, 30))
  try {
    await work()
  } finally {
    for (const b of buttons) b.disabled = false
  }
}

async function downloadMap(kind: MapKind) {
  const s = style
  const maps = outMaps()
  if (!maps || !s) return
  await saving(t('texture.saving', { name: fileName(s, kind) }), async () => {
    const b = await encode(imageCanvas(maps, kind), s)
    if (!b) return
    download(b, fileName(s, kind))
    $('map-stats').textContent = t('texture.saved', { name: fileName(s, kind), size: sizeText(b.size) })
  })
}

async function downloadZip() {
  const s = style
  const maps = outMaps()
  if (!maps || !s) return
  const name = `${slug(source?.name ?? 'texture')}_maps_${maps.width}x${maps.height}.zip`
  await saving(t('texture.packing', { name }), async () => {
    const files = []
    for (const kind of MAP_KINDS) {
      const b = await encode(imageCanvas(maps, kind), s)
      if (b) files.push({ path: fileName(s, kind), data: new Uint8Array(await b.arrayBuffer()) })
    }
    const data = zip(files)
    download(new Blob([data as Uint8Array<ArrayBuffer>], { type: 'application/zip' }), name)
    $('map-stats').textContent = t('texture.saved', { name, size: sizeText(data.length) })
  })
}

for (const b of document.querySelectorAll<HTMLButtonElement>('[data-map-dl]')) {
  b.addEventListener('click', () => void downloadMap(b.dataset.mapDl as MapKind))
}
$('map-zip').addEventListener('click', () => void downloadZip())
