// Colours of a scanned drawing: read from the photo, adjusted in HSL, shared
// by every output. Pure functions, no DOM.

import type { Mask, RGBAImage } from './image'

export type RGB = [number, number, number]

/** Hue 0–360, saturation and lightness 0–100. */
export interface HSL {
  h: number
  s: number
  l: number
}

export function hexRgb(hex: string): RGB {
  const n = parseInt(hex.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

export const rgbHex = (c: RGB) => '#' + c.map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('')

export function rgbHsl([r, g, b]: RGB): HSL {
  const [R, G, B] = [r / 255, g / 255, b / 255]
  const max = Math.max(R, G, B)
  const min = Math.min(R, G, B)
  const l = (max + min) / 2
  const d = max - min
  if (!d) return { h: 0, s: 0, l: l * 100 }
  const s = d / (1 - Math.abs(2 * l - 1))
  const h = max === R ? ((G - B) / d + 6) % 6 : max === G ? (B - R) / d + 2 : (R - G) / d + 4
  return { h: h * 60, s: s * 100, l: l * 100 }
}

export function hslRgb({ h, s, l }: HSL): RGB {
  const S = s / 100
  const L = l / 100
  const c = (1 - Math.abs(2 * L - 1)) * S
  const hp = (((h % 360) + 360) % 360) / 60
  const x = c * (1 - Math.abs((hp % 2) - 1))
  const [r, g, b] = hp < 1 ? [c, x, 0] : hp < 2 ? [x, c, 0] : hp < 3 ? [0, c, x] : hp < 4 ? [0, x, c] : hp < 5 ? [x, 0, c] : [c, 0, x]
  const m = L - c / 2
  return [(r + m) * 255, (g + m) * 255, (b + m) * 255]
}

export const hslHex = (c: HSL) => rgbHex(hslRgb(c))
export const hexHsl = (hex: string) => rgbHsl(hexRgb(hex))

/** The same colour with its lightness turned over: dark ink becomes light, for a dark version. */
export function flipLightness(hex: string): string {
  const c = hexHsl(hex)
  return hslHex({ ...c, l: 100 - c.l })
}

/**
 * The ink and paper colours of a straightened photo, given which pixels are
 * ink. Edge pixels blend ink and paper, so each takes the mean of its own
 * middle: the darker half of the ink (leaving out the very darkest tenth,
 * shadows and glare), and the lighter half of the paper (leaving out the
 * brightest tenth).
 */
export function measureColours(photo: RGBAImage, mask: Mask, step = 3): { ink: RGB; paper: RGB } | null {
  const ink: number[] = []
  const paper: number[] = []
  const lum = (i: number) => 0.299 * photo.data[i * 4] + 0.587 * photo.data[i * 4 + 1] + 0.114 * photo.data[i * 4 + 2]
  for (let y = 0; y < mask.height; y += step) {
    for (let x = 0; x < mask.width; x += step) {
      const i = y * mask.width + x
      ;(mask.data[i] ? ink : paper).push(i)
    }
  }
  if (ink.length < 8 || paper.length < 8) return null
  const mean = (px: number[], from: number, to: number): RGB => {
    const sorted = px.sort((a, b) => lum(a) - lum(b))
    const part = sorted.slice(Math.floor(sorted.length * from), Math.max(Math.floor(sorted.length * from) + 1, Math.floor(sorted.length * to)))
    const sum: RGB = [0, 0, 0]
    for (const i of part) for (let k = 0; k < 3; k++) sum[k] += photo.data[i * 4 + k]
    return sum.map((v) => v / part.length) as RGB
  }
  return { ink: mean(ink, 0.1, 0.5), paper: mean(paper, 0.5, 0.9) }
}
