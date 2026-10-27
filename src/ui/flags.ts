// The explanation flags, after Variable Machine's: a slanted outline bubble
// whose tail points at the element it explains. One opens when the pointer
// rests on an element with data-flag="name", or it has keyboard focus; the
// words come from src/text/common.md.
//
// A flag lives in a layer above the page, so panels that scroll can't clip
// it. It fades in after a short CSS delay, so sweeping the pointer across a
// row of tabs doesn't flash every flag. Moving onto the flag keeps it open;
// Esc, a press, a scroll or a resize put it away.

import { t, tOr } from '../text'

export interface Explanation {
  title: string
  text: string
}

/** The flag for a name (data-flag="tab.scan"): flag.<name>.title and flag.<name> in the text files. */
export function explanation(name: string): Explanation | null {
  const text = tOr(`flag.${name}`, '')
  return text ? { title: t(`flag.${name}.title`), text } : null
}

type Side = 'below' | 'above'

/** The tail: a low, wide triangle, its point set off-centre as if the flag were pulled toward its element. */
const TAIL: Record<Side, { box: string; d: string }> = {
  below: { box: '0 0 18 8', d: 'M0 8.5 L6 0 L18 8.5' },
  above: { box: '0 0 18 8', d: 'M0 -0.5 L6 8 L18 -0.5' },
}

const FLAG_W = 24 * 16 // .flag max-width, 24rem
const FLAG_H = 11 * 16 // a typical flag's height

const SVG_NS = 'http://www.w3.org/2000/svg'
let open: { el: HTMLElement; flag: HTMLElement } | null = null

function close() {
  open?.flag.remove()
  open = null
}

function show(el: HTMLElement) {
  const e = explanation(el.dataset.flag!)
  if (!e) return
  if (open?.el === el) return
  close()
  const r = el.getBoundingClientRect()
  if (!r.width || !r.height) return
  const vw = window.innerWidth
  const vh = window.innerHeight
  const side: Side = vh - r.bottom >= FLAG_H || r.top < FLAG_H ? 'below' : 'above'
  const w = Math.min(FLAG_W, vw - 16)
  const left = Math.max(8, Math.min(r.left - 8, vw - w - 8))
  // A flag pushed left to stay on screen keeps its tail over the element.
  const tailX = Math.max(12, Math.min(r.left + Math.min(r.width / 2, 24) - left - 9, w - 30))

  const flag = document.createElement('div')
  flag.className = `flag flag--${side}`
  flag.setAttribute('aria-hidden', 'true')
  flag.style.left = `${left}px`
  flag.style.setProperty('--tail-x', `${tailX}px`)
  if (side === 'below') flag.style.top = `${r.bottom}px`
  else flag.style.bottom = `${vh - r.top}px`
  const tail = document.createElementNS(SVG_NS, 'svg')
  tail.setAttribute('class', 'flag__tail')
  tail.setAttribute('viewBox', TAIL[side].box)
  const path = document.createElementNS(SVG_NS, 'path')
  path.setAttribute('d', TAIL[side].d)
  tail.append(path)
  const body = document.createElement('div')
  body.className = 'flag__body'
  const title = document.createElement('span')
  title.className = 'flag__title'
  title.textContent = e.title
  const text = document.createElement('span')
  text.className = 'flag__text'
  text.textContent = e.text
  body.append(title, text)
  flag.append(tail, body)
  flag.addEventListener('pointerleave', (ev) => {
    if (!(ev.relatedTarget instanceof Node && el.contains(ev.relatedTarget))) close()
  })
  document.body.append(flag)
  open = { el, flag }
}

/** Give every element with data-flag its flag, and a description for screen readers. */
export function installFlags(root: ParentNode = document) {
  root.querySelectorAll<HTMLElement>('[data-flag]').forEach((el) => {
    const e = explanation(el.dataset.flag!)
    if (!e || el.dataset.flagged) return
    el.dataset.flagged = '1'
    // What a screen reader reads; the visible flag repeats it for the eye.
    const desc = document.createElement('span')
    desc.id = `flag-${el.dataset.flag!.replace(/\W/g, '-')}`
    desc.hidden = true
    desc.textContent = `${e.title}. ${e.text}`
    document.body.append(desc)
    el.setAttribute('aria-describedby', desc.id)
    el.addEventListener('pointerenter', () => show(el))
    el.addEventListener('pointerleave', (ev) => {
      if (open && ev.relatedTarget instanceof Node && open.flag.contains(ev.relatedTarget)) return
      if (document.activeElement !== el) close()
    })
    el.addEventListener('focus', () => show(el))
    el.addEventListener('blur', close)
    el.addEventListener('keydown', (ev) => {
      if (ev.key === 'Escape') close()
    })
  })
}

// Anything that would leave a flag pointing at the wrong place puts it away.
if (typeof window !== 'undefined') {
  for (const type of ['scroll', 'pointerdown', 'resize'] as const) {
    window.addEventListener(type, () => close(), { capture: true, passive: true })
  }
}
