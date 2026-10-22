// SVG output for icons: standalone files, a light/dark favicon, and a sprite
// with a manifest entry in the hand-icons format.

import type { Direction, IconStyle, Variant } from './style'

export interface IconPaths {
  /** The ink as drawn. */
  ink: string
  /** The ink with closed shapes filled. */
  solid: string
}

export function directionTransform(d: Direction, size: number): string {
  const c = size / 2
  switch (d) {
    case 'base':
      return ''
    case 'mh':
      return `translate(${size} 0) scale(-1 1)`
    case 'mv':
      return `translate(0 ${size}) scale(1 -1)`
    case 'mhv':
      return `translate(${size} ${size}) scale(-1 -1)`
    default:
      return `rotate(${d.slice(1)} ${c} ${c})`
  }
}

const tf = (d: Direction, size: number) => {
  const t = directionTransform(d, size)
  return t ? ` transform="${t}"` : ''
}

/** Superellipse (|x|^n + |y|^n = 1) outline, the soft square of app icons. */
function squirclePath(size: number, n = 5): string {
  const c = size / 2
  const pts: string[] = []
  const steps = 96
  for (let i = 0; i < steps; i++) {
    const t = (i / steps) * Math.PI * 2
    const cos = Math.cos(t)
    const sin = Math.sin(t)
    const x = c + c * Math.sign(cos) * Math.abs(cos) ** (2 / n)
    const y = c + c * Math.sign(sin) * Math.abs(sin) ** (2 / n)
    pts.push(`${Math.round(x * 10) / 10} ${Math.round(y * 10) / 10}`)
  }
  return `M${pts.join('L')}Z`
}

/** The container shape as an element with the given extra attributes, or '' for none. */
export function containerElement(s: IconStyle, attrs: string, fullBleed = false): string {
  const S = s.canvas
  const shape = fullBleed ? 'square' : s.container.shape
  switch (shape) {
    case 'none':
      return ''
    case 'circle':
      return `<circle cx="${S / 2}" cy="${S / 2}" r="${S / 2}"${attrs}/>`
    case 'square':
      return `<rect width="${S}" height="${S}"${attrs}/>`
    case 'rounded': {
      const r = Math.round(s.container.radius * S)
      return `<rect width="${S}" height="${S}" rx="${r}"${attrs}/>`
    }
    case 'squircle':
      return `<path d="${squirclePath(S)}"${attrs}/>`
  }
}

/**
 * The mark for one variant, coloured with `ink` (a colour or currentColor).
 * With `ink` null it carries classes instead (ink, ink-line) for a stylesheet to colour.
 */
export function markElement(v: Variant, p: IconPaths, s: IconStyle, ink: string | null, d: Direction): string {
  const t = tf(d, s.canvas)
  const fill = ink ? `fill="${ink}"` : 'class="ink"'
  const line = ink ? `fill="none" stroke="${ink}"` : 'class="ink-line"'
  switch (v) {
    case 'line':
      return `<path d="${p.ink}" ${line} stroke-width="${s.stroke}" stroke-linejoin="round" stroke-linecap="round"${t}/>`
    case 'fill':
      return `<path d="${p.solid}" ${fill} fill-rule="evenodd"${t}/>`
    case 'tint':
      return (
        `<g${t}><path d="${p.solid}" ${fill} fill-opacity="${s.tintOpacity}" fill-rule="evenodd"/>` +
        `<path d="${p.ink}" ${fill} fill-rule="evenodd"/></g>`
      )
  }
}

export interface StandaloneOptions {
  /** A colour scheme, or null to draw in currentColor without a container fill. */
  scheme: { ink: string; bg: string } | null
  /** Paint the whole square (Apple and maskable icons must be opaque). */
  fullBleed?: boolean
  /** Shrink the mark around the centre, e.g. to keep it inside a maskable safe zone. */
  scale?: number
}

export function standaloneSvg(v: Variant, d: Direction, p: IconPaths, s: IconStyle, o: StandaloneOptions): string {
  const S = s.canvas
  const ink = o.scheme ? o.scheme.ink : 'currentColor'
  const bg = o.scheme ? containerElement(s, ` fill="${o.scheme.bg}"`, o.fullBleed) : ''
  let mark = markElement(v, p, s, ink, d)
  if (o.scale && o.scale !== 1) {
    const k = S / 2
    mark = `<g transform="translate(${k} ${k}) scale(${o.scale}) translate(${-k} ${-k})">${mark}</g>`
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${S} ${S}" width="${S}" height="${S}">${bg}${mark}</svg>`
}

/** favicon.svg: switches to the dark scheme with the browser's colour scheme. */
export function faviconSvg(p: IconPaths, s: IconStyle): string {
  const S = s.canvas
  const paint = (c: { ink: string; bg: string }) =>
    `.bg{fill:${c.bg}}.ink{fill:${c.ink}}.ink-line{fill:none;stroke:${c.ink}}`
  const css = `${paint(s.light)}@media (prefers-color-scheme:dark){${paint(s.dark)}}`
  const bg = containerElement(s, ' class="bg"')
  const mark = markElement(s.favicon.variant, p, s, null, 'base')
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${S} ${S}"><style>${css}</style>${bg}${mark}</svg>`
}

export interface ManifestEntry {
  name: string
  solid: boolean
  directions: string[]
  symbols: Record<string, Record<string, string>>
}

/**
 * A sprite with one <symbol> per variant × direction, drawn in currentColor,
 * plus the matching hand-icons manifest entry.
 */
export function sprite(name: string, p: IconPaths, s: IconStyle): { svg: string; entry: ManifestEntry } {
  const part = spritePart(name, p, s)
  return { svg: wrapSprite([part]), entry: part.entry }
}

/** One sprite holding a whole set of icons, with the hand-icons manifest for all of them. */
export function spriteSet(
  icons: { name: string; paths: IconPaths }[],
  s: IconStyle,
): { svg: string; manifest: { viewBox: number; stroke: number; icons: (ManifestEntry & { number: number })[] } } {
  const parts = icons.map((i) => spritePart(i.name, i.paths, s))
  return {
    svg: wrapSprite(parts),
    manifest: { viewBox: s.canvas, stroke: s.stroke, icons: parts.map((p, i) => ({ number: i + 1, ...p.entry })) },
  }
}

interface SpritePart {
  defs: string[]
  symbols: string[]
  entry: ManifestEntry
}

function wrapSprite(parts: SpritePart[]): string {
  return (
    '<svg xmlns="http://www.w3.org/2000/svg" style="position:absolute;width:0;height:0;overflow:hidden" aria-hidden="true">' +
    `<defs>${parts.flatMap((p) => p.defs).join('')}</defs>${parts.flatMap((p) => p.symbols).join('')}</svg>`
  )
}

function spritePart(name: string, p: IconPaths, s: IconStyle): SpritePart {
  const S = s.canvas
  const pre = `${s.prefix}-p-${name}`
  const solid = p.solid !== p.ink
  const defs = [`<path id="${pre}" d="${p.ink}"/>`]
  if (solid) defs.push(`<path id="${pre}-solid" d="${p.solid}"/>`)
  const solidRef = solid ? `${pre}-solid` : pre
  const bg = containerElement(s, ` style="fill:var(--icon-bg, ${s.light.bg})"`)
  const symbols: string[] = []
  const ids: Record<string, Record<string, string>> = {}
  for (const d of s.directions) {
    const suffix = d === 'base' ? '' : `-${d}`
    const t = tf(d, S)
    ids[d] = {}
    for (const v of s.variants) {
      const id = `${s.prefix}-${name}-${v}${suffix}`
      ids[d][v] = id
      let body: string
      if (v === 'line') {
        body = `<use href="#${pre}" fill="none" stroke="currentColor" stroke-width="${s.stroke}" stroke-linejoin="round" stroke-linecap="round"${t}/>`
      } else if (v === 'fill') {
        body = `<use href="#${solidRef}" fill="currentColor" fill-rule="evenodd"${t}/>`
      } else {
        body =
          `<g${t}><use href="#${solidRef}" fill="currentColor" fill-rule="evenodd" style="fill-opacity:var(--icon-fill-opacity, ${s.tintOpacity})"/>` +
          `<use href="#${pre}" fill="currentColor" fill-rule="evenodd"/></g>`
      }
      symbols.push(`<symbol id="${id}" viewBox="0 0 ${S} ${S}">${bg}${body}</symbol>`)
    }
  }
  return { defs, symbols, entry: { name, solid, directions: [...s.directions], symbols: ids } }
}
