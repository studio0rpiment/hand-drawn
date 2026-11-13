// The four sheet corners over a photo: drag them onto the paper's corners, or
// focus one and nudge it with the arrow keys (Shift for bigger steps).

import type { Quad } from '../image'
import { t } from '../text'

const SVG_NS = 'http://www.w3.org/2000/svg'

export interface CornerHandles {
  /** Redraw after the quad or the photo's size changed. */
  draw: () => void
  clear: () => void
}

/**
 * Handles in `svg`, laid over `canvas` (the photo at its pixel size). `quad`
 * gives the corners to show and edit in place; `moved` runs after each move.
 */
export function cornerHandles(svg: SVGSVGElement, canvas: HTMLCanvasElement, quad: () => Quad | null, moved: () => void): CornerHandles {
  const names = ['tl', 'tr', 'br', 'bl'].map((c) => t(`scan.corner-${c}`))

  function draw() {
    const q = quad()
    if (!q) return
    const { width, height } = canvas
    svg.setAttribute('viewBox', `0 0 ${width} ${height}`)
    svg.style.width = `${canvas.clientWidth}px`
    svg.style.height = `${canvas.clientHeight}px`
    const r = (0.6 * 16 * width) / Math.max(1, canvas.clientWidth)
    if (!svg.firstChild) {
      svg.append(document.createElementNS(SVG_NS, 'polygon'))
      names.forEach((label, i) => {
        const c = document.createElementNS(SVG_NS, 'circle')
        c.setAttribute('tabindex', '0')
        c.setAttribute('role', 'slider')
        c.setAttribute('aria-label', t('scan.corner', { corner: label }))
        c.addEventListener('pointerdown', (e) => startDrag(e, i))
        c.addEventListener('keydown', (e) => nudge(e, i))
        svg.append(c)
      })
    }
    svg.querySelector('polygon')!.setAttribute('points', q.map((p) => `${p.x},${p.y}`).join(' '))
    svg.querySelectorAll('circle').forEach((c, i) => {
      c.setAttribute('cx', String(q[i].x))
      c.setAttribute('cy', String(q[i].y))
      c.setAttribute('r', String(r))
    })
  }

  function toPhoto(e: PointerEvent) {
    const box = canvas.getBoundingClientRect()
    const { width, height } = canvas
    return {
      x: Math.min(Math.max(((e.clientX - box.left) / box.width) * width, 0), width),
      y: Math.min(Math.max(((e.clientY - box.top) / box.height) * height, 0), height),
    }
  }

  function startDrag(e: PointerEvent, i: number) {
    const el = e.target as SVGCircleElement
    el.setPointerCapture(e.pointerId)
    e.preventDefault()
    const move = (ev: PointerEvent) => {
      const q = quad()
      if (!q) return
      q[i] = toPhoto(ev)
      draw()
      moved()
    }
    const up = () => {
      el.removeEventListener('pointermove', move)
      el.removeEventListener('pointerup', up)
      el.removeEventListener('pointercancel', up)
    }
    el.addEventListener('pointermove', move)
    el.addEventListener('pointerup', up)
    el.addEventListener('pointercancel', up)
  }

  function nudge(e: KeyboardEvent, i: number) {
    const step = e.shiftKey ? 20 : 2
    const d = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key]
    const q = quad()
    if (!d || !q) return
    e.preventDefault()
    const p = q[i]
    p.x = Math.min(Math.max(p.x + d[0], 0), canvas.width)
    p.y = Math.min(Math.max(p.y + d[1], 0), canvas.height)
    draw()
    moved()
  }

  new ResizeObserver(draw).observe(canvas)
  return { draw, clear: () => svg.replaceChildren() }
}
