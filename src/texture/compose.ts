// Colouring the ink layers and drawing them where the plan puts them.

import { hash } from './noise'
import type { Plan } from './layout'
import type { Print } from './looks'
import type { TextureStyle } from './style'

function rgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

/** One ink layer as a canvas: the ink colour with the coverage as alpha. */
function layer(alpha: Float32Array, w: number, h: number, color: string): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  const img = new ImageData(w, h)
  const [r, g, b] = rgb(color)
  for (let i = 0, j = 0; i < alpha.length; i++, j += 4) {
    img.data[j] = r
    img.data[j + 1] = g
    img.data[j + 2] = b
    img.data[j + 3] = Math.round(alpha[i] * 255)
  }
  c.getContext('2d')!.putImageData(img, 0, 0)
  return c
}

/** Paper colour with a faint fibre texture. */
function paper(g: CanvasRenderingContext2D, w: number, h: number, s: TextureStyle) {
  g.fillStyle = s.colors.paper
  g.fillRect(0, 0, w, h)
  const amount = s.colors.paperGrain
  if (amount <= 0) return
  const img = g.getImageData(0, 0, w, h)
  for (let i = 0, j = 0; i < w * h; i++, j += 4) {
    const x = i % w
    const y = (i - x) / w
    // Fine tooth plus a slower mottle; tiles wrap, so mottle uses the same pixel grid.
    const n = (hash(x, y, s.seed + 77) - 0.5) * 0.6 + (hash(x >> 3, y >> 3, s.seed + 78) - 0.5) * 0.4
    const d = n * amount * 24
    img.data[j] = img.data[j] + d
    img.data[j + 1] = img.data[j + 1] + d
    img.data[j + 2] = img.data[j + 2] + d
  }
  g.putImageData(img, 0, 0)
}

/** Draw the print at every placement, and again across the edges when the plan wraps. */
function stampAll(g: CanvasRenderingContext2D, src: HTMLCanvasElement, p: Plan) {
  const shifts = p.wrap ? [-1, 0, 1] : [0]
  for (const it of p.items) {
    const half = (Math.hypot(src.width, src.height) * it.scale) / 2
    for (const sx of shifts) {
      for (const sy of shifts) {
        const x = it.x + sx * p.width
        const y = it.y + sy * p.height
        // Skip copies that cannot touch the canvas.
        if (x + half < 0 || y + half < 0 || x - half > p.width || y - half > p.height) continue
        g.save()
        g.translate(x, y)
        g.rotate((it.angle * Math.PI) / 180)
        g.scale(it.scale, it.scale)
        g.drawImage(src, -src.width / 2, -src.height / 2)
        g.restore()
      }
    }
  }
}

/** The finished texture as a canvas. */
export function compose(print: Print, p: Plan, s: TextureStyle): HTMLCanvasElement {
  const out = document.createElement('canvas')
  out.width = p.width
  out.height = p.height
  const g = out.getContext('2d')!
  g.imageSmoothingQuality = 'high'
  if (s.colors.onPaper) paper(g, p.width, p.height, s)
  // On paper the inks overprint like real ink; on transparent they simply stack.
  const blend: GlobalCompositeOperation = s.colors.onPaper ? 'multiply' : 'source-over'
  if (print.b) {
    g.globalCompositeOperation = blend
    stampAll(g, layer(print.b, print.width, print.height, s.colors.ink2), p)
  }
  g.globalCompositeOperation = blend
  stampAll(g, layer(print.a, print.width, print.height, s.colors.ink), p)
  g.globalCompositeOperation = 'source-over'
  return out
}
