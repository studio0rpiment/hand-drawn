// Makes the PBR maps off the page's thread, so big maps don't freeze the page.
// One job per worker: the page ends the worker to stop a job.

import { makeMaps, type MapOptions, type TileOptions } from './pbr'
import type { Surface } from './surface'

export interface MapJob {
  surface: Surface
  options: MapOptions
  tile: TileOptions
  colours: { ink: string; paper: string }
}

self.onmessage = async (e: MessageEvent<MapJob>) => {
  const { surface, options, tile, colours } = e.data
  try {
    const maps = await makeMaps(surface, options, tile, colours, (step) => self.postMessage({ step }))
    const buffers = [maps.heights.buffer, ...Object.values(maps.images).map((a) => a.buffer)] as ArrayBuffer[]
    self.postMessage({ maps }, { transfer: buffers })
  } catch (err) {
    self.postMessage({ error: String(err) })
  }
}
