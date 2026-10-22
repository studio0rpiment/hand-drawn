// The app's own hand-drawn look, from Kevin's hand-icons: icons on buttons,
// and sliders drawn with his single marker line and blob.

import sprite from 'hand-icons/sprite.svg?raw'

const SVG_NS = 'http://www.w3.org/2000/svg'

/** Put the sprite in the page once, so `<use href="#hi-…">` works everywhere. */
export function installSprite() {
  if (document.getElementById('hi-p-blob')) return
  // The sprite hides itself (zero size, absolutely placed); a display:none
  // wrapper would stop <use> from measuring it.
  document.body.insertAdjacentHTML('afterbegin', sprite)
}

/**
 * An icon as markup. `id` is a hand-icons symbol name without the `hi-`
 * prefix, e.g. `arrow-bar-fill-r90`.
 */
export function icon(id: string, cls = ''): string {
  return `<svg class="hi${cls ? ` ${cls}` : ''}" aria-hidden="true" focusable="false"><use href="#hi-${id}"/></svg>`
}

/** Add the icon named in each `data-icon` attribute in front of the element's text. */
export function decorate(root: ParentNode = document) {
  root.querySelectorAll<HTMLElement>('[data-icon]:not([data-iconed])').forEach((el) => {
    el.dataset.iconed = ''
    el.insertAdjacentHTML('afterbegin', icon(el.dataset.icon!))
  })
}

export interface Flip {
  /** Mirror left to right (a half turn about the vertical axis). */
  x: boolean
  /** Mirror top to bottom (a half turn about the line's own axis), so the bend arcs the other way. */
  y: boolean
}

/** A drawn line from the sprite, turned horizontal and cropped to its ink, as an SVG that stretches. */
function drawnLine(pathId: string, cls: string, flip: Flip): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg')
  svg.setAttribute('class', cls)
  svg.setAttribute('aria-hidden', 'true')
  svg.setAttribute('preserveAspectRatio', 'none')
  const box = lineBox(pathId)
  const [bx, by, bw, bh] = box.split(' ').map(Number)
  // Mirrors happen inside the drawing, about the middle of its box, so the
  // slider's fill still runs left to right.
  const mirror = [
    flip.x ? `translate(${2 * bx + bw} 0) scale(-1 1)` : '',
    flip.y ? `translate(0 ${2 * by + bh}) scale(1 -1)` : '',
  ].join(' ')
  const use = document.createElementNS(SVG_NS, 'use')
  use.setAttribute('href', `#${pathId}`)
  // The lines are drawn upright; a quarter turn lays them along the slider.
  use.setAttribute('transform', `${mirror} rotate(-90)`.trim())
  svg.append(use)
  svg.setAttribute('viewBox', box)
  return svg
}

/** A stable pick of one of the four mirrorings, from a name (FNV-1a hash, scrambled so every bit varies). */
export function flipFor(name: string): Flip {
  let h = 0x811c9dc5
  for (let i = 0; i < name.length; i++) h = Math.imul(h ^ name.charCodeAt(i), 0x01000193)
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b)
  h ^= h >>> 13
  return { x: (h & 1) === 1, y: (h & 2) === 2 }
}

const boxes = new Map<string, string>()

/** The turned line's bounding box, measured once in an off-screen SVG. */
function lineBox(pathId: string): string {
  let box = boxes.get(pathId)
  if (box) return box
  const probe = document.createElementNS(SVG_NS, 'svg')
  probe.setAttribute('style', 'position:absolute;width:0;height:0;overflow:hidden')
  const use = document.createElementNS(SVG_NS, 'use')
  use.setAttribute('href', `#${pathId}`)
  probe.append(use)
  document.body.append(probe)
  const b = use.getBBox()
  probe.remove()
  // rotate(-90) maps (x, y) to (y, −x).
  box = `${b.y} ${-(b.x + b.width)} ${b.height} ${b.width}`
  boxes.set(pathId, box)
  return box
}

/**
 * Draw a range input with Kevin's single marker line: bright up to the value,
 * muted after it, and the blob as the handle. The real input
 * stays on top, invisible, so keyboard, screen readers and pointer all work.
 */
export function handSlider(input: HTMLInputElement) {
  if (input.dataset.hand !== undefined) return
  input.dataset.hand = ''
  const valueDescriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!
  const wrap = document.createElement('span')
  wrap.className = 'hand-range'
  // Each slider shows Kevin's line mirrored its own way, so the bends differ
  // down the page; picked from the slider's id, it stays put between visits.
  const flip = flipFor(input.id || input.name || input.closest('label')?.textContent || '')
  const rest = drawnLine('hi-p-line-solid', 'hr-line hr-rest', flip)
  const done = drawnLine('hi-p-line-solid', 'hr-line hr-done', flip)
  const thumb = document.createElementNS(SVG_NS, 'svg')
  thumb.setAttribute('class', 'hr-thumb')
  thumb.setAttribute('aria-hidden', 'true')
  thumb.setAttribute('viewBox', '0 0 1024 1024')
  thumb.innerHTML = '<use href="#hi-blob-fill"/>'
  input.replaceWith(wrap)
  wrap.append(rest, done, thumb, input)

  const draw = () => {
    const min = Number(input.min || 0)
    const max = Number(input.max || 100)
    const p = max > min ? (Number(valueDescriptor.get!.call(input)) - min) / (max - min) : 0
    wrap.style.setProperty('--p', String(Math.min(1, Math.max(0, p))))
  }
  // Code sets values directly (syncing a style, automatic cut-offs); redraw then too.
  Object.defineProperty(input, 'value', {
    configurable: true,
    get: () => valueDescriptor.get!.call(input),
    set: (v: string) => {
      valueDescriptor.set!.call(input, v)
      draw()
    },
  })
  input.addEventListener('input', draw)
  draw()
}

/** Turn every range input under `root` into a hand-drawn one. */
export function handSliders(root: ParentNode = document) {
  root.querySelectorAll<HTMLInputElement>('input[type="range"]').forEach(handSlider)
}

/** The tab icon: the star scribble in grasshopper green. */
export function favicon() {
  const d = document.getElementById('hi-p-star-scribble-solid')?.getAttribute('d')
  if (!d) return
  const svg = `<svg xmlns="${SVG_NS}" viewBox="0 0 1024 1024"><path d="${d}" fill="#869c42"/></svg>`
  const link = document.createElement('link')
  link.rel = 'icon'
  link.type = 'image/svg+xml'
  link.href = `data:image/svg+xml,${encodeURIComponent(svg)}`
  document.head.append(link)
}

/** Say "Copied" on a button for a moment, keeping its icon. */
export function flash(btn: HTMLElement, text = 'Copied') {
  const label = [...btn.childNodes].reverse().find((n) => n.nodeType === Node.TEXT_NODE && n.textContent!.trim())
  if (!label) return
  const was = label.textContent
  label.textContent = ` ${text}`
  setTimeout(() => (label.textContent = was), 1200)
}

/**
 * Letters spread on hover; give each button and tab the room its spread text
 * needs up front, so hovering never reflows the row (which on a narrow screen
 * would push the button out from under the pointer and back, flickering).
 */
export async function reserveHoverWidths(root: ParentNode = document) {
  await document.fonts.ready
  root.querySelectorAll<HTMLElement>('.button, .tab').forEach((el) => {
    el.style.minWidth = ''
    el.style.transition = 'none'
    // .is-wide is styled exactly like hover (see style.css).
    el.classList.add('is-wide')
    const w = el.getBoundingClientRect().width
    el.classList.remove('is-wide')
    el.style.transition = ''
    // Hidden views measure as zero; they get measured when shown.
    if (w > 0) el.style.minWidth = `${Math.ceil(w)}px`
  })
}
