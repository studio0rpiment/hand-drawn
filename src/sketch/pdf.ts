// Small PDF files, written by hand: a line drawing or schematic as vector
// paths on a page of its size, and the collection's contact sheet (every
// sketch as a JPEG, numbered and named). Pure, no DOM.

import { hexRgb } from '../colour'
import type { Drawn, Frame } from './make'
import { placement } from './make'

const enc = new TextEncoder()
const n = (v: number) => String(Math.round(v * 1000) / 1000)

/** An image on a page: JPEG bytes and their size in pixels. */
export interface PdfImage {
  jpeg: Uint8Array
  width: number
  height: number
}

interface Page {
  width: number
  height: number
  content: string
  images: PdfImage[]
}

/** A PDF of pages (sizes in points), each with its drawing commands and images (/Im0, /Im1 …), with Helvetica as /F1. */
function pdf(pages: Page[]): Uint8Array {
  const parts: Uint8Array[] = []
  const offsets: number[] = []
  let length = 0
  const push = (b: Uint8Array | string) => {
    const bytes = typeof b === 'string' ? enc.encode(b) : b
    parts.push(bytes)
    length += bytes.length
  }
  // Object numbers: 1 catalog, 2 pages, 3 font, then per page: page, content, images.
  let next = 4
  const plan = pages.map((p) => {
    const page = next++
    const content = next++
    const images = p.images.map(() => next++)
    return { page, content, images }
  })
  const object = (num: number, body: string | Uint8Array[], dict?: string) => {
    offsets[num] = length
    if (Array.isArray(body)) {
      push(`${num} 0 obj\n${dict}\nstream\n`)
      for (const b of body) push(b)
      push('\nendstream\nendobj\n')
    } else push(`${num} 0 obj\n${body}\nendobj\n`)
  }
  push('%PDF-1.4\n%\xe2\xe3\xcf\xd3\n')
  object(1, '<< /Type /Catalog /Pages 2 0 R >>')
  object(2, `<< /Type /Pages /Kids [${plan.map((p) => `${p.page} 0 R`).join(' ')}] /Count ${pages.length} >>`)
  object(3, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>')
  pages.forEach((p, i) => {
    const o = plan[i]
    const xobj = o.images.length ? ` /XObject << ${o.images.map((num, k) => `/Im${k} ${num} 0 R`).join(' ')} >>` : ''
    object(o.page, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${n(p.width)} ${n(p.height)}] /Resources << /Font << /F1 3 0 R >>${xobj} >> /Contents ${o.content} 0 R >>`)
    const content = enc.encode(p.content)
    object(o.content, [content], `<< /Length ${content.length} >>`)
    p.images.forEach((img, k) => {
      object(o.images[k], [img.jpeg], `<< /Type /XObject /Subtype /Image /Width ${img.width} /Height ${img.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${img.jpeg.length} >>`)
    })
  })
  const xref = length
  const count = next
  let table = `xref\n0 ${count}\n0000000000 65535 f \n`
  for (let i = 1; i < count; i++) table += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`
  push(table)
  push(`trailer\n<< /Size ${count} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`)
  const out = new Uint8Array(length)
  let at = 0
  for (const b of parts) {
    out.set(b, at)
    at += b.length
  }
  return out
}

/**
 * SVG path data (M L H V C Z, absolute or relative) as PDF path operators,
 * each point moved by `to` (from the drawing's pixels to the page's points).
 */
export function pathOps(d: string, to: (x: number, y: number) => [number, number]): string {
  const out: string[] = []
  let x = 0
  let y = 0
  let sx = 0
  let sy = 0
  const pt = (px: number, py: number) => to(px, py).map(n).join(' ')
  for (const [, cmd, args] of d.matchAll(/([MmLlHhVvCcZz])([^MmLlHhVvCcZz]*)/g)) {
    const v = (args.match(/-?\d*\.?\d+(?:e-?\d+)?/g) ?? []).map(Number)
    const rel = cmd === cmd.toLowerCase()
    const c = cmd.toUpperCase()
    if (c === 'Z') {
      out.push('h')
      x = sx
      y = sy
      continue
    }
    const arity = c === 'C' ? 6 : c === 'H' || c === 'V' ? 1 : 2
    for (let i = 0; i + arity <= v.length; i += arity) {
      if (c === 'H') {
        x = rel ? x + v[i] : v[i]
        out.push(`${pt(x, y)} l`)
      } else if (c === 'V') {
        y = rel ? y + v[i] : v[i]
        out.push(`${pt(x, y)} l`)
      } else if (c === 'C') {
        const ox = rel ? x : 0
        const oy = rel ? y : 0
        out.push(`${pt(ox + v[i], oy + v[i + 1])} ${pt(ox + v[i + 2], oy + v[i + 3])} ${pt(ox + v[i + 4], oy + v[i + 5])} c`)
        x = ox + v[i + 4]
        y = oy + v[i + 5]
      } else {
        x = rel ? x + v[i] : v[i]
        y = rel ? y + v[i + 1] : v[i + 1]
        // After a move, further pairs are lines.
        if (c === 'M' && i === 0) {
          out.push(`${pt(x, y)} m`)
          sx = x
          sy = y
        } else out.push(`${pt(x, y)} l`)
      }
    }
  }
  return out.join('\n')
}

const rgb = (hex: string) => hexRgb(hex).map((v) => n(v / 255)).join(' ')

/** A line drawing or schematic as a one-page vector PDF, the page the frame's size at `dpi`. */
export function drawingPdf(d: Drawn, f: Frame, ink: string, background: string | null, dpi: number): Uint8Array {
  const k = 72 / dpi
  const W = f.outW * k
  const H = f.outH * k
  const p = placement(f)
  const to = (x: number, y: number): [number, number] => [(p.x + x * p.scale) * k, H - (p.y + y * p.scale) * k]
  const ops: string[] = []
  if (background) ops.push(`${rgb(background)} rg 0 0 ${n(W)} ${n(H)} re f`)
  if (d.type === 'fill') {
    for (const l of d.layers) {
      if (!l.d) continue
      // Paler levels as a lighter mix towards the background (or white), since plain PDF paths have no opacity.
      const [r, g, b] = hexRgb(ink)
      const [br, bg, bb] = hexRgb(background ?? '#ffffff')
      const mix = (a: number, z: number) => n((z + (a - z) * l.opacity) / 255)
      ops.push(`${mix(r, br)} ${mix(g, bg)} ${mix(b, bb)} rg`, pathOps(l.d, to), 'f*')
    }
  } else {
    ops.push(`${rgb(ink)} RG ${n(d.width * p.scale * k)} w ${d.round ? '1 J 1 j' : ''}`)
    for (const path of d.paths) ops.push(pathOps(path, to), 'S')
    for (const c of d.circles) {
      // A circle as four curves.
      const m = 0.5523 * c.r
      const P = (x: number, y: number) => to(x, y).map(n).join(' ')
      ops.push(
        `${P(c.cx + c.r, c.cy)} m`,
        `${P(c.cx + c.r, c.cy + m)} ${P(c.cx + m, c.cy + c.r)} ${P(c.cx, c.cy + c.r)} c`,
        `${P(c.cx - m, c.cy + c.r)} ${P(c.cx - c.r, c.cy + m)} ${P(c.cx - c.r, c.cy)} c`,
        `${P(c.cx - c.r, c.cy - m)} ${P(c.cx - m, c.cy - c.r)} ${P(c.cx, c.cy - c.r)} c`,
        `${P(c.cx + m, c.cy - c.r)} ${P(c.cx + c.r, c.cy - m)} ${P(c.cx + c.r, c.cy)} c`,
        'h S',
      )
    }
  }
  return pdf([{ width: W, height: H, content: ops.join('\n'), images: [] }])
}

/** Text for a PDF string: Latin-1 only (Helvetica's own), with brackets and backslashes escaped. */
export function pdfText(s: string): string {
  return s
    .replace(/[^\x20-\x7e\xa0-\xff]/g, '?')
    .replace(/[\\()]/g, (c) => `\\${c}`)
}

export interface SheetItem {
  image: PdfImage
  /** Its number in collection order. */
  n: number
  name: string
  favourite: boolean
}

/**
 * The contact sheet: every sketch on one A4 page (landscape), in a grid,
 * each numbered and named, favourites starred, the collection's name above.
 */
export function contactSheet(title: string, items: SheetItem[]): Uint8Array {
  const W = 842
  const H = 595
  const margin = 28
  const head = 30
  const cols = Math.max(1, Math.ceil(Math.sqrt((items.length * (W - 2 * margin)) / (H - 2 * margin - head))))
  const rows = Math.max(1, Math.ceil(items.length / cols))
  const cw = (W - 2 * margin) / cols
  const ch = (H - 2 * margin - head) / rows
  const label = Math.min(10, ch * 0.12)
  const ops = [`BT /F1 14 Tf ${margin} ${H - margin - 14} Td (${pdfText(title)}) Tj ET`]
  items.forEach((it, i) => {
    const col = i % cols
    const row = Math.floor(i / cols)
    const x0 = margin + col * cw
    const top = H - margin - head - row * ch
    const boxW = cw - 8
    const boxH = ch - label - 10
    const s = Math.min(boxW / it.image.width, boxH / it.image.height)
    const w = it.image.width * s
    const h = it.image.height * s
    const x = x0 + (boxW - w) / 2
    // Each picture sits on its name.
    const y = top - boxH
    ops.push(`q ${n(w)} 0 0 ${n(h)} ${n(x)} ${n(y)} cm /Im${i} Do Q`)
    // A star is not in Helvetica's Latin-1; an asterisk marks a favourite.
    const text = `${String(it.n).padStart(2, '0')} ${it.name}${it.favourite ? ' *' : ''}`
    ops.push(`BT /F1 ${n(label)} Tf ${n(x0)} ${n(top - boxH - label - 2)} Td (${pdfText(text)}) Tj ET`)
  })
  return pdf([{ width: W, height: H, content: ops.join('\n'), images: items.map((it) => it.image) }])
}
