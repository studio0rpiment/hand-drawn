// Opening a photo: any image the browser reads, and iPhone HEIC photos in
// browsers that can't (converted in the page). Shared by Scan and the
// generator tabs that take their own photos.

import { t } from '../text'

/** Photos are worked on at this size at most; plenty for a mark, and keeps sliders live. */
export const WORK_SIDE = 2400

/** An iPhone HEIC/HEIF photo, by its type, its name, or the brand in its first bytes. */
async function isHeic(blob: Blob, name: string): Promise<boolean> {
  if (/^image\/hei[cf]/.test(blob.type) || /\.hei[cf]$/i.test(name)) return true
  const head = new TextDecoder().decode(await blob.slice(4, 12).arrayBuffer())
  return /^ftyp(heic|heix|hevc|mif1|msf1)/.test(head)
}

/**
 * The photo as a canvas no larger than WORK_SIDE, or null (after saying so)
 * if the browser can't read it. `converting` is told while a HEIC photo
 * converts, which takes a few seconds the first time.
 */
export async function openImage(blob: Blob, name: string, converting: (on: boolean) => void = () => {}): Promise<HTMLCanvasElement | null> {
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
      alert(t('common.unreadable'))
      return null
    } finally {
      converting(false)
    }
  }
  const c = workCanvas(bitmap, bitmap.width, bitmap.height)
  bitmap.close()
  return c
}

/** An image drawn on a canvas no larger than WORK_SIDE on its long side. */
export function workCanvas(src: CanvasImageSource, w: number, h: number): HTMLCanvasElement {
  const s = Math.min(1, WORK_SIDE / Math.max(w, h))
  const c = document.createElement('canvas')
  c.width = Math.round(w * s)
  c.height = Math.round(h * s)
  c.getContext('2d', { willReadFrequently: true })!.drawImage(src, 0, 0, c.width, c.height)
  return c
}

/** A file name without its extension, for naming what is made from it. */
export const baseName = (name: string, fallback = 'drawing') => name.replace(/\.[^.]+$/, '') || fallback

/**
 * The photo turned by `deg`, on a canvas big enough for all of it. The
 * corners it uncovers are filled with the colour round the photo's edge, so
 * they read as the table, not as ink or paper.
 */
export function turned(src: HTMLCanvasElement, deg: number): HTMLCanvasElement {
  const a = (deg * Math.PI) / 180
  const cos = Math.abs(Math.cos(a))
  const sin = Math.abs(Math.sin(a))
  const c = document.createElement('canvas')
  c.width = Math.round(src.width * cos + src.height * sin)
  c.height = Math.round(src.width * sin + src.height * cos)
  const g = c.getContext('2d', { willReadFrequently: true })!
  g.fillStyle = edgeColour(src)
  g.fillRect(0, 0, c.width, c.height)
  g.translate(c.width / 2, c.height / 2)
  g.rotate(a)
  g.drawImage(src, -src.width / 2, -src.height / 2)
  return c
}

/** The median colour along a canvas's four edges. */
function edgeColour(src: HTMLCanvasElement): string {
  const g = src.getContext('2d', { willReadFrequently: true })!
  const { width: w, height: h } = src
  const strips = [g.getImageData(0, 0, w, 1), g.getImageData(0, h - 1, w, 1), g.getImageData(0, 0, 1, h), g.getImageData(w - 1, 0, 1, h)]
  const ch: number[][] = [[], [], []]
  for (const s of strips) for (let i = 0; i < s.data.length; i += 4) for (let k = 0; k < 3; k++) ch[k].push(s.data[i + k])
  const [r, gr, b] = ch.map((v) => v.sort((x, y) => x - y)[v.length >> 1])
  return `rgb(${r} ${gr} ${b})`
}
