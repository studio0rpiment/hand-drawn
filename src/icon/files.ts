// Binary containers for the icon pack: .ico (PNG entries) and .zip (stored, no compression).

export interface PngEntry {
  size: number
  png: Uint8Array
}

/** A .ico holding PNG images, which every current browser and Windows read. */
export function ico(entries: PngEntry[]): Uint8Array {
  const header = 6 + 16 * entries.length
  const total = header + entries.reduce((n, e) => n + e.png.length, 0)
  const out = new Uint8Array(total)
  const v = new DataView(out.buffer)
  v.setUint16(2, 1, true) // type: icon
  v.setUint16(4, entries.length, true)
  let offset = header
  entries.forEach((e, i) => {
    const d = 6 + 16 * i
    out[d] = e.size >= 256 ? 0 : e.size // 0 means 256
    out[d + 1] = e.size >= 256 ? 0 : e.size
    v.setUint16(d + 4, 1, true) // colour planes
    v.setUint16(d + 6, 32, true) // bits per pixel
    v.setUint32(d + 8, e.png.length, true)
    v.setUint32(d + 12, offset, true)
    out.set(e.png, offset)
    offset += e.png.length
  })
  return out
}

const CRC_TABLE = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  return t
})()

export function crc32(data: Uint8Array): number {
  let c = 0xffffffff
  for (let i = 0; i < data.length; i++) c = CRC_TABLE[(c ^ data[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

export interface ZipFile {
  path: string
  data: Uint8Array | string
}

/** A zip archive with the files stored uncompressed (PNGs are compressed already). */
export function zip(files: ZipFile[], date = new Date()): Uint8Array {
  const enc = new TextEncoder()
  const time = (date.getHours() << 11) | (date.getMinutes() << 5) | (date.getSeconds() >> 1)
  const day = ((date.getFullYear() - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate()
  const locals: Uint8Array[] = []
  const centrals: Uint8Array[] = []
  let offset = 0
  for (const f of files) {
    const name = enc.encode(f.path)
    const data = typeof f.data === 'string' ? enc.encode(f.data) : f.data
    const crc = crc32(data)
    const local = new Uint8Array(30 + name.length + data.length)
    const lv = new DataView(local.buffer)
    lv.setUint32(0, 0x04034b50, true)
    lv.setUint16(4, 20, true) // version needed
    lv.setUint16(6, 0x0800, true) // UTF-8 names
    lv.setUint16(10, time, true)
    lv.setUint16(12, day, true)
    lv.setUint32(14, crc, true)
    lv.setUint32(18, data.length, true)
    lv.setUint32(22, data.length, true)
    lv.setUint16(26, name.length, true)
    local.set(name, 30)
    local.set(data, 30 + name.length)

    const central = new Uint8Array(46 + name.length)
    const cv = new DataView(central.buffer)
    cv.setUint32(0, 0x02014b50, true)
    cv.setUint16(4, 20, true) // version made by
    cv.setUint16(6, 20, true)
    cv.setUint16(8, 0x0800, true)
    cv.setUint16(12, time, true)
    cv.setUint16(14, day, true)
    cv.setUint32(16, crc, true)
    cv.setUint32(20, data.length, true)
    cv.setUint32(24, data.length, true)
    cv.setUint16(28, name.length, true)
    cv.setUint32(42, offset, true)
    central.set(name, 46)

    locals.push(local)
    centrals.push(central)
    offset += local.length
  }
  const centralSize = centrals.reduce((n, c) => n + c.length, 0)
  const end = new Uint8Array(22)
  const ev = new DataView(end.buffer)
  ev.setUint32(0, 0x06054b50, true)
  ev.setUint16(8, files.length, true)
  ev.setUint16(10, files.length, true)
  ev.setUint32(12, centralSize, true)
  ev.setUint32(16, offset, true)
  const out = new Uint8Array(offset + centralSize + 22)
  let p = 0
  for (const part of [...locals, ...centrals, end]) {
    out.set(part, p)
    p += part.length
  }
  return out
}
