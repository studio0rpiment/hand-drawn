// Turning a cleaned ink mask into icon paths, and the paths into a downloadable pack.

import type { Mask } from '../image'
import { trace } from '../trace'
import { ico, zip, type ZipFile } from './files'
import { iconMasks, placeOnSquare } from './shape'
import { effectivePadding, slug, type Direction, type IconStyle, type Variant } from './style'
import { faviconSvg, sprite, standaloneSvg, type IconPaths } from './svg'

export interface IconBuild {
  paths: IconPaths
  /** The placed ink, for previews of what was traced. */
  ink: Mask
}

/** Place, clean and trace the mark under a style. Only the shape settings matter here. */
export async function buildIcon(mask: Mask, s: IconStyle): Promise<IconBuild> {
  const placed = placeOnSquare(mask, s.canvas, effectivePadding(s))
  const m = iconMasks(placed, s)
  const opts = { ignore: s.trace.ignore, smoothness: s.trace.smoothness, simplify: s.trace.simplify, decimals: 0 }
  const ink = (await trace(m.ink, opts)).paths.join('')
  const solid = m.solid === m.ink ? ink : (await trace(m.solid, opts)).paths.join('')
  return { paths: { ink, solid }, ink: m.ink }
}

/** The settings buildIcon depends on, to know when a retrace is needed. */
export function shapeKey(s: IconStyle): string {
  return JSON.stringify([s.canvas, effectivePadding(s), s.fillClosed, s.bridge, s.pinholes, s.trace])
}

/** Render an SVG string to a PNG at size × size. */
export async function rasterize(svg: string, size: number): Promise<Uint8Array<ArrayBuffer>> {
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }))
  try {
    const img = new Image()
    img.src = url
    await img.decode()
    const c = document.createElement('canvas')
    c.width = c.height = size
    const g = c.getContext('2d')!
    g.imageSmoothingQuality = 'high'
    g.drawImage(img, 0, 0, size, size)
    const blob = await new Promise<Blob>((ok, fail) => c.toBlob((b) => (b ? ok(b) : fail(new Error('PNG failed'))), 'image/png'))
    return new Uint8Array(await blob.arrayBuffer())
  } finally {
    URL.revokeObjectURL(url)
  }
}

/** Which variant to draw at a given favicon size. */
export function faviconVariant(s: IconStyle, size: number): Variant {
  return size <= 48 ? s.favicon.small : s.favicon.variant
}

/** How much to shrink the mark so its padded square sits inside a maskable icon's safe circle (radius 40%). */
export function maskableScale(s: IconStyle): number {
  const extent = (1 - 2 * effectivePadding(s)) * Math.SQRT2
  return Math.min(1, 0.8 / extent)
}

export function headSnippet(): string {
  return `<link rel="icon" href="/favicon.ico" sizes="32x32">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<link rel="manifest" href="/site.webmanifest">
`
}

export function webManifest(title: string, s: IconStyle): string {
  return (
    JSON.stringify(
      {
        name: title,
        icons: [
          { src: '/icon-192.png', type: 'image/png', sizes: '192x192' },
          { src: '/icon-512.png', type: 'image/png', sizes: '512x512' },
          { src: '/icon-maskable-512.png', type: 'image/png', sizes: '512x512', purpose: 'maskable' },
        ],
        theme_color: s.light.bg,
        background_color: s.light.bg,
      },
      null,
      2,
    ) + '\n'
  )
}

/** Every file of the icon pack, under a folder named after the mark. */
export async function packFiles(title: string, p: IconPaths, s: IconStyle): Promise<ZipFile[]> {
  const name = slug(title)
  const root = `${name}-icons`
  const files: ZipFile[] = []
  const add = (path: string, data: Uint8Array | string) => files.push({ path: `${root}/${path}`, data })
  const svgFor = (v: Variant, d: Direction, scheme: IconStyle['light'] | null, extra = {}) =>
    standaloneSvg(v, d, p, s, { scheme, ...extra })

  // Favicons and app icons.
  add('favicon/favicon.svg', faviconSvg(p, s))
  const icoSizes = [16, 32, 48]
  const icoPngs = await Promise.all(
    icoSizes.map(async (size) => ({ size, png: await rasterize(svgFor(faviconVariant(s, size), 'base', s.light), size) })),
  )
  add('favicon/favicon.ico', ico(icoPngs))
  add('favicon/apple-touch-icon.png', await rasterize(svgFor(s.favicon.variant, 'base', s.light, { fullBleed: true }), 180))
  for (const size of [192, 512]) {
    add(`favicon/icon-${size}.png`, await rasterize(svgFor(s.favicon.variant, 'base', s.light), size))
  }
  add(
    'favicon/icon-maskable-512.png',
    await rasterize(svgFor(s.favicon.variant, 'base', s.light, { fullBleed: true, scale: maskableScale(s) }), 512),
  )
  add('favicon/site.webmanifest', webManifest(title, s))
  add('favicon/head.html', headSnippet())

  // Every variant and direction: SVG in currentColor, PNG in both schemes.
  for (const v of s.variants) {
    for (const d of s.directions) {
      const file = d === 'base' ? name : `${name}-${d}`
      add(`svg/${v}/${file}.svg`, svgFor(v, d, null))
      for (const [scheme, colors] of [['light', s.light], ['dark', s.dark]] as const) {
        for (const size of [512, 128]) {
          add(`png/${v}-${scheme}/${file}-${size}.png`, await rasterize(svgFor(v, d, colors), size))
        }
      }
    }
  }

  // The sprite and manifest entry, ready to join a hand-icons style library.
  const sp = sprite(name, p, s)
  add(`sprite/${name}.svg`, sp.svg)
  add(`sprite/${name}.json`, JSON.stringify(sp.entry, null, 1) + '\n')
  add('style.json', JSON.stringify(s, null, 2) + '\n')
  return files
}

export async function packZip(title: string, p: IconPaths, s: IconStyle): Promise<Blob> {
  const bytes = zip(await packFiles(title, p, s))
  return new Blob([bytes.buffer as ArrayBuffer], { type: 'application/zip' })
}
