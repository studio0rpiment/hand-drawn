// The maps side of the Texture tab: the picked image made into PBR maps,
// shown one by one, tiled 3 × 3 and on a lit sphere, with the files' sizes and
// their downloads (one at a time, or all in one zip).

import type { GrayImage, Mask, RGBAImage } from '../image'
import { slug } from '../icon/style'
import { zip } from '../icon/files'
import { t } from '../text'
import { litSphere, type Light } from './lit'
import { MAP_KINDS, makeMaps, type MapKind, type Maps } from './pbr'
import { cropRect, type Surface } from './surface'
import type { Format, TextureStyle } from './style'

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T

/** The previews are worked out at most this many pixels on the longer side. */
const PREVIEW_SIDE = 768
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
/** The maps at the file size, kept until the image or a setting changes. */
let full: { key: string; maps: Maps } | null = null
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
  full = null
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

function build(src: Source, s: TextureStyle, w: number, h: number): Promise<Maps> {
  return makeMaps(
    surfaceAt(src, s, w, h),
    s.maps,
    { seamless: s.surface.seamless, seam: s.surface.seam, ragged: s.surface.ragged, seed: s.seed },
    colours,
  )
}

/** The preview's size: the file's proportions, at most PREVIEW_SIDE on the longer side. */
function previewSize(s: TextureStyle) {
  const k = Math.min(1, PREVIEW_SIDE / Math.max(s.file.width, s.file.height))
  return { w: Math.max(8, Math.round(s.file.width * k)), h: Math.max(8, Math.round(s.file.height * k)), exact: k === 1 }
}

/** What the maps depend on, so the full-size ones are made again only when it changes. */
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
  if (!source) {
    preview = null
    $('map-sizes').textContent = ''
    $('map-stats').textContent = ''
    return
  }
  const { w, h, exact } = previewSize(s)
  const t0 = performance.now()
  const maps = await build(source, s, w, h)
  if (run !== runs) return
  preview = maps
  for (const kind of MAP_KINDS) {
    const c = document.querySelector<HTMLCanvasElement>(`#map-grid [data-map="${kind}"] canvas`)!
    c.width = maps.width
    c.height = maps.height
    c.getContext('2d')!.drawImage(imageCanvas(maps, kind), 0, 0)
  }
  drawTiled()
  drawLit()
  $('map-stats').textContent = t('texture.map-stats', { width: s.file.width, height: s.file.height, ms: Math.round(performance.now() - t0) })
  // The files' sizes: exact when the preview is the file's size, else scaled from it by area.
  const scale = (s.file.width * s.file.height) / (maps.width * maps.height)
  const sizes: string[] = []
  let total = 0
  for (const kind of MAP_KINDS) {
    const b = await encode(imageCanvas(maps, kind), s)
    if (run !== runs) return
    const bytes = (b?.size ?? 0) * scale
    total += bytes
    sizes.push(`${t(`texture.map.${kind}`)} ${sizeText(bytes)}`)
  }
  $('map-sizes').textContent = t(exact ? 'texture.sizes' : 'texture.sizes-about', {
    format: s.file.format.toUpperCase(),
    sizes: sizes.join(' · '),
    total: sizeText(total),
  })
}

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

/** The maps at the file's size, made once per image and settings. */
async function fullMaps(): Promise<Maps | null> {
  if (!source || !style) return null
  const key = mapKey(style)
  if (full?.key === key) return full.maps
  const stats = $('map-stats')
  stats.textContent = t('texture.making', { width: style.file.width, height: style.file.height })
  // Let the words show before the work starts.
  await new Promise((r) => setTimeout(r, 30))
  const maps = await build(source, style, style.file.width, style.file.height)
  full = { key, maps }
  return maps
}

async function downloadMap(kind: MapKind) {
  const s = style
  const maps = await fullMaps()
  if (!maps || !s) return
  const b = await encode(imageCanvas(maps, kind), s)
  if (!b) return
  download(b, fileName(s, kind))
  $('map-stats').textContent = t('texture.saved', { name: fileName(s, kind), size: sizeText(b.size) })
}

async function downloadZip() {
  const s = style
  const maps = await fullMaps()
  if (!maps || !s) return
  const files = []
  for (const kind of MAP_KINDS) {
    const b = await encode(imageCanvas(maps, kind), s)
    if (b) files.push({ path: fileName(s, kind), data: new Uint8Array(await b.arrayBuffer()) })
  }
  const name = `${slug(source?.name ?? 'texture')}_maps_${s.file.width}x${s.file.height}.zip`
  const data = zip(files)
  download(new Blob([data as Uint8Array<ArrayBuffer>], { type: 'application/zip' }), name)
  $('map-stats').textContent = t('texture.saved', { name, size: sizeText(data.length) })
}

for (const b of document.querySelectorAll<HTMLButtonElement>('[data-map-dl]')) {
  b.addEventListener('click', () => void downloadMap(b.dataset.mapDl as MapKind))
}
$('map-zip').addEventListener('click', () => void downloadZip())
