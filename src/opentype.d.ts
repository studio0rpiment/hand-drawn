// The small part of opentype.js used here (it ships without types).
declare module 'opentype.js' {
  export class Path {
    commands: PathCommand[]
    moveTo(x: number, y: number): void
    lineTo(x: number, y: number): void
    curveTo(x1: number, y1: number, x2: number, y2: number, x: number, y: number): void
    close(): void
  }
  export type PathCommand =
    | { type: 'M' | 'L'; x: number; y: number }
    | { type: 'C'; x1: number; y1: number; x2: number; y2: number; x: number; y: number }
    | { type: 'Q'; x1: number; y1: number; x: number; y: number }
    | { type: 'Z' }
  export class Glyph {
    constructor(o: { name: string; unicode?: number; unicodes?: number[]; advanceWidth: number; path: Path })
    name: string
    unicode?: number
    advanceWidth: number
    path: Path
  }
  export class Font {
    constructor(o: {
      familyName: string
      styleName: string
      unitsPerEm: number
      ascender: number
      descender: number
      designer?: string
      glyphs: Glyph[]
    })
    glyphs: { length: number; get(i: number): Glyph }
    unitsPerEm: number
    ascender: number
    descender: number
    names: Record<string, Record<string, Record<string, string>>>
    charToGlyph(c: string): Glyph
    getKerningValue(left: Glyph, right: Glyph): number
    toArrayBuffer(): ArrayBuffer
  }
  export function parse(buffer: ArrayBuffer): Font
}
