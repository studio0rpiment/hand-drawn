// The maps on a lit sphere: base colour, normal, roughness and ambient
// occlusion shaded by one light, worked out per pixel. Small and plain, so it
// needs no 3D library. No DOM, so it runs in tests.

import type { Maps } from './pbr'

export interface Light {
  /** Direction toward the light, seen from the viewer: x right, y up, z toward the viewer. */
  x: number
  y: number
  z: number
}

/**
 * Shade a sphere `size` pixels across into RGBA. The texture wraps twice
 * round the sphere and once from pole to pole.
 */
export function litSphere(maps: Maps, size: number, light: Light, normalY: 'gl' | 'dx'): Uint8ClampedArray {
  const out = new Uint8ClampedArray(size * size * 4)
  const { width: w, height: h, images } = maps
  const len = Math.hypot(light.x, light.y, light.z) || 1
  const L = [light.x / len, light.y / len, light.z / len]
  // Half-way between the light and the viewer (0, 0, 1), for the highlight.
  const hl = Math.hypot(L[0], L[1], L[2] + 1) || 1
  const H = [L[0] / hl, L[1] / hl, (L[2] + 1) / hl]
  const r = size / 2
  const flip = normalY === 'gl' ? 1 : -1
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      const x = (px + 0.5 - r) / r
      const y = (r - py - 0.5) / r
      const rr = x * x + y * y
      if (rr > 1) continue
      const z = Math.sqrt(1 - rr)
      // Texture position: longitude across, latitude down.
      const lon = Math.atan2(x, z)
      const u = ((lon / Math.PI + 1) % 1 + 1) % 1
      const v = Math.acos(Math.max(-1, Math.min(1, y))) / Math.PI
      const tx = Math.min(w - 1, Math.floor(u * w))
      const ty = Math.min(h - 1, Math.floor(v * h))
      const t = (ty * w + tx) * 4
      // Tangent along longitude, bitangent toward the north pole.
      const T = [Math.cos(lon), 0, -Math.sin(lon)]
      const s = Math.max(1e-4, Math.hypot(x, z))
      const B = [(-x * y) / s, s, (-z * y) / s]
      const nx = (images.normal[t] / 255) * 2 - 1
      const ny = ((images.normal[t + 1] / 255) * 2 - 1) * flip
      const nz = (images.normal[t + 2] / 255) * 2 - 1
      let N0 = T[0] * nx + B[0] * ny + x * nz
      let N1 = T[1] * nx + B[1] * ny + y * nz
      let N2 = T[2] * nx + B[2] * ny + z * nz
      const nl = Math.hypot(N0, N1, N2) || 1
      N0 /= nl
      N1 /= nl
      N2 /= nl
      const rough = Math.max(0.04, images.roughness[t] / 255)
      const ao = images.ao[t] / 255
      const diffuse = Math.max(0, N0 * L[0] + N1 * L[1] + N2 * L[2])
      const nh = Math.max(0, N0 * H[0] + N1 * H[1] + N2 * H[2])
      const shine = 2 / (rough * rough * rough * rough) - 2
      const spec = diffuse > 0 ? nh ** Math.min(2048, shine) * (1 - rough) ** 2 * 0.6 : 0
      const light = 0.18 * ao + 0.9 * diffuse * (0.5 + 0.5 * ao)
      const j = (py * size + px) * 4
      for (let k = 0; k < 3; k++) out[j + k] = images.base[t + k] * light + spec * 255
      out[j + 3] = 255
    }
  }
  return out
}
