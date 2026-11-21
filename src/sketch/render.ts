// A sketch drawn on the page: its shapes from the worker (with a way to stop
// it), filled shapes traced, and the pictures made from them (the As drawn
// raster with its pencil tones, any SVG rasterised).

import { hexRgb } from '../colour'
import { trace } from '../trace'
import type { Prepared } from './drawing'
import { placement, shapesFor, type Drawn, type Frame, type Shapes } from './make'
import type { SketchStyle } from './style'
import type { ShapesJob } from './worker'

export interface Job<T> {
  result: Promise<T>
  stop: () => void
}

/** The kind's shapes, in a worker unless they are quick (As drawn is the ink as it is). */
export function shapesJob(prepared: Prepared, style: SketchStyle, k: number): Job<Shapes> {
  if (style.kind === 'as-drawn') return { result: Promise.resolve(shapesFor(prepared, style, k)), stop: () => {} }
  const worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' })
  let stop = () => {}
  const result = new Promise<Shapes>((resolve, reject) => {
    stop = () => {
      worker.terminate()
      reject(new Error('stopped'))
    }
    worker.onmessage = (e: MessageEvent<{ shapes?: Shapes; error?: string }>) => {
      worker.terminate()
      if (e.data.shapes) resolve(e.data.shapes)
      else reject(new Error(e.data.error))
    }
    worker.onerror = (e) => {
      worker.terminate()
      reject(new Error(e.message))
    }
  })
  const job: ShapesJob = { prepared, style, k }
  worker.postMessage(job)
  return { result, stop: () => stop() }
}

/** Filled shapes traced to path data; lines are drawn as they are. */
export async function traceShapes(shapes: Shapes): Promise<Drawn> {
  if (shapes.type === 'stroke') return shapes
  const layers: { d: string; opacity: number }[] = []
  for (const l of shapes.layers) {
    const r = await trace(l.mask, { ignore: 2, smoothness: shapes.smoothness, simplify: 0.2 })
    layers.push({ d: r.paths.join(' '), opacity: l.opacity })
  }
  return { type: 'fill', layers }
}

/** The kind's drawing, start to finish; `stop` ends the work under way. */
export function drawnJob(prepared: Prepared, style: SketchStyle, k = 1): Job<Drawn> {
  const job = shapesJob(prepared, style, k)
  let stopped = false
  return {
    result: job.result.then(async (shapes) => {
      if (stopped) throw new Error('stopped')
      return traceShapes(shapes)
    }),
    stop: () => {
      stopped = true
      job.stop()
    },
  }
}

function fill(c: HTMLCanvasElement, background: string | null) {
  if (!background) return
  const g = c.getContext('2d')!
  g.fillStyle = background
  g.fillRect(0, 0, c.width, c.height)
}

/**
 * As drawn, as a picture: the ink in its colour, its pencil tones kept as
 * transparency (`tones`), on the background (none: transparent), in the frame.
 */
export function asDrawnCanvas(p: Prepared, f: Frame, ink: string, background: string | null, tones: boolean): HTMLCanvasElement {
  const img = new ImageData(p.width, p.height)
  const [r, g, b] = hexRgb(ink)
  for (let i = 0, j = 0; i < p.tone.length; i++, j += 4) {
    const a = tones ? p.tone[i] : p.mask.data[i] ? 255 : 0
    if (!a) continue
    img.data[j] = r
    img.data[j + 1] = g
    img.data[j + 2] = b
    img.data[j + 3] = a
  }
  const own = document.createElement('canvas')
  own.width = p.width
  own.height = p.height
  own.getContext('2d')!.putImageData(img, 0, 0)
  const out = document.createElement('canvas')
  out.width = f.outW
  out.height = f.outH
  fill(out, background)
  const at = placement(f)
  const ctx = out.getContext('2d')!
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(own, at.x, at.y, p.width * at.scale, p.height * at.scale)
  return out
}

/** An SVG drawn on a canvas of `w` × `h`. */
export async function svgCanvas(svg: string, w: number, h: number): Promise<HTMLCanvasElement> {
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }))
  try {
    const img = new Image(w, h)
    img.src = url
    await img.decode()
    const c = document.createElement('canvas')
    c.width = w
    c.height = h
    c.getContext('2d')!.drawImage(img, 0, 0, w, h)
    return c
  } finally {
    URL.revokeObjectURL(url)
  }
}

export const canvasBlob = (c: HTMLCanvasElement, type = 'image/png', quality?: number) =>
  new Promise<Blob>((resolve, reject) => c.toBlob((b) => (b ? resolve(b) : reject(new Error('no image'))), type, quality))
