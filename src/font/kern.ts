// Adding kerning to a finished OpenType file. opentype.js writes none, so a
// GPOS table is inserted here: one pair-adjustment lookup (format 1: for each
// first glyph, its second glyphs and how much to move them) under the 'kern'
// feature, for the default and Latin scripts. Text engines apply GPOS kerning
// to fonts with PostScript (CFF) outlines like ours; the older 'kern' table
// they often ignore. The table directory and checksums are redone.

export interface KernPair {
  left: number
  right: number
  value: number
}

function checksum(bytes: Uint8Array): number {
  let sum = 0
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  for (let i = 0; i < bytes.length; i += 4) {
    const word = i + 4 <= bytes.length ? v.getUint32(i) : (bytes[i] << 24) | ((bytes[i + 1] ?? 0) << 16) | ((bytes[i + 2] ?? 0) << 8)
    sum = (sum + (word >>> 0)) >>> 0
  }
  return sum
}

/** Big-endian bytes, written in order. */
class Bytes {
  private parts: number[] = []
  u16(v: number) {
    this.parts.push((v >> 8) & 255, v & 255)
    return this
  }
  i16(v: number) {
    return this.u16(v & 0xffff)
  }
  tag(t: string) {
    for (const ch of t) this.parts.push(ch.charCodeAt(0))
    return this
  }
  get length() {
    return this.parts.length
  }
  append(b: Bytes) {
    this.parts.push(...b.parts)
    return this
  }
  bytes() {
    return Uint8Array.from(this.parts)
  }
}

export function gposTable(pairs: KernPair[]): Uint8Array {
  // PairPos format 1: pair sets per first glyph, second glyphs sorted.
  const byFirst = new Map<number, KernPair[]>()
  for (const p of pairs) byFirst.set(p.left, [...(byFirst.get(p.left) ?? []), p])
  const firsts = [...byFirst.keys()].sort((a, b) => a - b)
  const sets = firsts.map((f) => {
    const recs = byFirst.get(f)!.sort((a, b) => a.right - b.right)
    const b = new Bytes().u16(recs.length)
    for (const r of recs) b.u16(r.right).i16(r.value)
    return b
  })
  const headerLen = 10 + 2 * firsts.length
  const sub = new Bytes().u16(1) // posFormat
  let offset = headerLen
  const setOffsets = sets.map((b) => {
    const o = offset
    offset += b.length
    return o
  })
  sub.u16(offset).u16(0x0004).u16(0).u16(firsts.length) // coverage, XAdvance on the first glyph, nothing on the second
  for (const o of setOffsets) sub.u16(o)
  for (const b of sets) sub.append(b)
  sub.u16(1).u16(firsts.length) // coverage format 1: the first glyphs
  for (const f of firsts) sub.u16(f)

  const lookup = new Bytes().u16(2).u16(0).u16(1).u16(8).append(sub) // pair adjustment, one subtable
  const lookupList = new Bytes().u16(1).u16(4).append(lookup)
  const featureList = new Bytes().u16(1).tag('kern').u16(8).u16(0).u16(1).u16(0)
  // Two scripts, each with a default language system using feature 0.
  const script = () => new Bytes().u16(4).u16(0).u16(0).u16(0xffff).u16(1).u16(0)
  const scriptList = new Bytes().u16(2).tag('DFLT').u16(14).tag('latn').u16(26).append(script()).append(script())

  const head = 10
  const scriptAt = head
  const featureAt = scriptAt + scriptList.length
  const lookupAt = featureAt + featureList.length
  return new Bytes()
    .u16(1)
    .u16(0)
    .u16(scriptAt)
    .u16(featureAt)
    .u16(lookupAt)
    .append(scriptList)
    .append(featureList)
    .append(lookupList)
    .bytes()
}

/** A copy of the font with a GPOS table kerning these pairs. */
export function addKerning(font: ArrayBuffer, pairs: KernPair[]): ArrayBuffer {
  const usable = pairs.filter((p) => p.value !== 0)
  if (!usable.length) return font
  const src = new Uint8Array(font)
  const dv = new DataView(font)
  const version = dv.getUint32(0)
  const numTables = dv.getUint16(4)
  const tables: { tag: string; data: Uint8Array }[] = []
  for (let i = 0; i < numTables; i++) {
    const r = 12 + i * 16
    const tag = String.fromCharCode(src[r], src[r + 1], src[r + 2], src[r + 3])
    if (tag === 'kern' || tag === 'GPOS') continue
    const offset = dv.getUint32(r + 8)
    const length = dv.getUint32(r + 12)
    tables.push({ tag, data: src.slice(offset, offset + length) })
  }
  tables.push({ tag: 'GPOS', data: gposTable(usable) })
  tables.sort((a, b) => (a.tag < b.tag ? -1 : a.tag > b.tag ? 1 : 0))

  const count = tables.length
  const headerSize = 12 + count * 16
  const pad4 = (n: number) => (n + 3) & ~3
  const total = headerSize + tables.reduce((n, t) => n + pad4(t.data.length), 0)
  const out = new Uint8Array(total)
  const ov = new DataView(out.buffer)
  const power = 2 ** Math.floor(Math.log2(count))
  ov.setUint32(0, version)
  ov.setUint16(4, count)
  ov.setUint16(6, power * 16)
  ov.setUint16(8, Math.floor(Math.log2(count)))
  ov.setUint16(10, count * 16 - power * 16)
  let offset = headerSize
  let headOffset = -1
  tables.forEach((t, i) => {
    const r = 12 + i * 16
    for (let k = 0; k < 4; k++) out[r + k] = t.tag.charCodeAt(k)
    if (t.tag === 'head') {
      // checkSumAdjustment is computed over the whole file with this field at zero.
      new DataView(t.data.buffer, t.data.byteOffset, t.data.byteLength).setUint32(8, 0)
      headOffset = offset
    }
    ov.setUint32(r + 4, checksum(t.data))
    ov.setUint32(r + 8, offset)
    ov.setUint32(r + 12, t.data.length)
    out.set(t.data, offset)
    offset += pad4(t.data.length)
  })
  if (headOffset >= 0) ov.setUint32(headOffset + 8, (0xb1b0afba - checksum(out)) >>> 0)
  return out.buffer
}
