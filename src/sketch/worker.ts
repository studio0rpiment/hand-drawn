// Works out a sketch's shapes off the page's thread, so thinning and
// straightening a large drawing don't freeze the page. One job per worker:
// the page ends the worker to stop a job (as the Texture tab's maps worker).

import type { Prepared } from './drawing'
import { shapesFor, type Shapes } from './make'
import type { SketchStyle } from './style'

export interface ShapesJob {
  prepared: Prepared
  style: SketchStyle
  k: number
}

self.onmessage = (e: MessageEvent<ShapesJob>) => {
  const { prepared, style, k } = e.data
  try {
    const shapes: Shapes = shapesFor(prepared, style, k)
    const buffers = shapes.type === 'fill' ? shapes.layers.map((l) => l.mask.data.buffer as ArrayBuffer) : []
    self.postMessage({ shapes }, { transfer: [...new Set(buffers)] })
  } catch (err) {
    self.postMessage({ error: String(err) })
  }
}
