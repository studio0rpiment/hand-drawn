// Two related settings on one globe you roll like a ball. The handle
// (Kevin's spiral) is a mark on the ball's surface: rolling left or right
// sets one value (longitude), rolling up or down the other (latitude). The
// hand-drawn meridians and parallels are on the ball too, so everything
// rolls together, and the ball keeps a little momentum when let go.
//
// Values are continuous; a setting that must be a whole number is rounded,
// while the ball itself keeps moving smoothly. The two range inputs stay in
// the page unseen as the source of truth for the rest of the app.

import { hash } from '../texture/noise'

const SVG_NS = 'http://www.w3.org/2000/svg'
/** How far the mark can roll from the centre, either way (degrees): it never goes out of sight. */
const REACH = 70
const RAD = Math.PI / 180
const MAX = REACH * RAD

type V3 = [number, number, number]

/** Roll the ball: turn by `lon` about the vertical axis, then tip by `lat` about the horizontal one. */
export function rotate(p: V3, lon: number, lat: number): V3 {
  const [x, y, z] = p
  const x1 = x * Math.cos(lon) + z * Math.sin(lon)
  const z1 = -x * Math.sin(lon) + z * Math.cos(lon)
  return [x1, y * Math.cos(lat) + z1 * Math.sin(lat), -y * Math.sin(lat) + z1 * Math.cos(lat)]
}

/** Where the mark (the ball point facing you at rest) is after rolling to `lon`, `lat`. */
export function markAt(lon: number, lat: number): V3 {
  return rotate([0, 0, 1], lon, lat)
}

/** Value 0–1 ↔ roll angle. */
export const toAngle = (f: number) => (Math.max(0, Math.min(1, f)) * 2 - 1) * MAX
export const toFrac = (a: number) => (a / MAX + 1) / 2

export interface GlobeAxis {
  input: HTMLInputElement
  /** Round to whole numbers (grey levels, pixels); otherwise the value is continuous. */
  whole?: boolean
}

function bounds(input: HTMLInputElement) {
  return { min: Number(input.min || 0), max: Number(input.max || 100) }
}

function readFrac(input: HTMLInputElement, value: string): number {
  const { min, max } = bounds(input)
  return max > min ? (Number(value) - min) / (max - min) : 0
}

/** The ball's grid: meridians every 30° and parallels at ±30°, ±60° and the equator, with a hand-drawn wobble. */
function gridLines(seed: number): V3[][] {
  const lines: V3[][] = []
  const wobble = (p: V3, i: number, j: number): V3 => {
    const k = 0.014
    return [
      p[0] + (hash(i, j, seed) - 0.5) * k,
      p[1] + (hash(i, j, seed + 1) - 0.5) * k,
      p[2] + (hash(i, j, seed + 2) - 0.5) * k,
    ]
  }
  for (let m = 0; m < 12; m++) {
    const lam = m * 30 * RAD
    const line: V3[] = []
    for (let s = 0, j = 0; s <= 180; s += 5, j++) {
      const phi = (s - 90) * RAD
      line.push(wobble([Math.cos(phi) * Math.sin(lam), Math.sin(phi), Math.cos(phi) * Math.cos(lam)], m, j))
    }
    lines.push(line)
  }
  for (const [n, deg] of [-60, -30, 0, 30, 60].entries()) {
    const phi = deg * RAD
    const line: V3[] = []
    for (let s = 0, j = 0; s <= 360; s += 5, j++) {
      const lam = s * RAD
      line.push(wobble([Math.cos(phi) * Math.sin(lam), Math.sin(phi), Math.cos(phi) * Math.cos(lam)], 20 + n, j))
    }
    lines.push(line)
  }
  return lines
}

/** The front-facing parts of the grid after rolling, as path data (SVG y down). */
function gridPath(lines: V3[][], lon: number, lat: number): string {
  let d = ''
  for (const line of lines) {
    let open = false
    for (const p of line) {
      const [x, y, z] = rotate(p, lon, lat)
      if (z > 0.02) {
        d += `${open ? 'L' : 'M'}${x.toFixed(4)} ${(-y).toFixed(4)}`
        open = true
      } else open = false
    }
  }
  return d
}

/** A hand-drawn circle for the rim: a little wobble, and a second, fainter pass. */
function rimPath(seed: number, pass: number): string {
  let d = ''
  for (let i = 0; i <= 72; i++) {
    const t = (i / 72) * Math.PI * 2 + pass * 0.4
    const r = 1 + (hash(i % 72, pass, seed) - 0.5) * 0.018 + pass * 0.012
    d += `${i ? 'L' : 'M'}${(Math.cos(t) * r).toFixed(4)} ${(Math.sin(t) * r).toFixed(4)}`
  }
  return d + 'Z'
}

let count = 0

/**
 * Replace two range inputs (each inside its own `label.slider`) with one
 * globe, placed in `into`. The y value shows at the globe's top right, the
 * x value at its bottom right, and both names in a list underneath.
 */
export function globePair(x: GlobeAxis, y: GlobeAxis, into: HTMLElement) {
  const seed = 31 + ++count * 7
  const xLabel = x.input.closest('label')!
  const yLabel = y.input.closest('label')!
  const nameOf = (label: HTMLLabelElement) => label.querySelector('span')!.firstChild!.textContent!.trim()
  const xName = nameOf(xLabel)
  const yName = nameOf(yLabel)

  const block = document.createElement('div')
  block.className = 'globe-pair'
  const svg = document.createElementNS(SVG_NS, 'svg')
  svg.setAttribute('viewBox', '-1.12 -1.12 2.24 2.24')
  svg.setAttribute('class', 'globe')
  svg.setAttribute('tabindex', '0')
  svg.setAttribute('role', 'group')
  svg.setAttribute('aria-label', `${xName} and ${yName}. Left and right change ${xName}, up and down change ${yName}.`)
  svg.innerHTML = `
    <circle r="1" class="globe-body"/>
    <path class="globe-grid"/>
    <g class="globe-handle"><use href="#hi-spiral-tight-fill" x="-0.17" y="-0.17" width="0.34" height="0.34"/></g>
    <path d="${rimPath(seed, 0)}" class="globe-rim"/>
    <path d="${rimPath(seed, 1)}" class="globe-rim globe-rim-2"/>`

  // The values sit in the corners: y at the top right, x at the bottom right.
  const yOut = yLabel.querySelector('output')!
  const xOut = xLabel.querySelector('output')!
  yOut.classList.add('globe-val', 'globe-val-y')
  xOut.classList.add('globe-val', 'globe-val-x')

  const names = document.createElement('ul')
  names.className = 'globe-names'
  names.innerHTML = `<li><span aria-hidden="true">↗</span> ${yName}</li><li><span aria-hidden="true">↘</span> ${xName}</li>`

  const ball = document.createElement('div')
  ball.className = 'globe-ball'
  ball.append(svg, yOut, xOut)
  block.append(ball, names)
  into.append(block)

  // The inputs stay, labelled and working, out of sight and out of the tab order.
  for (const [axis, label] of [[x, xLabel], [y, yLabel]] as const) {
    label.classList.add('visually-hidden')
    axis.input.tabIndex = -1
    axis.input.dataset.hand = ''
    axis.input.step = axis.whole ? '1' : 'any'
    block.append(label)
  }

  const lines = gridLines(seed)
  const grid = svg.querySelector<SVGPathElement>('.globe-grid')!
  const handle = svg.querySelector<SVGGElement>('.globe-handle')!

  const proto = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!
  const get = (input: HTMLInputElement) => proto.get!.call(input) as string
  let lon = toAngle(readFrac(x.input, get(x.input)))
  let lat = toAngle(readFrac(y.input, get(y.input)))

  const render = () => {
    grid.setAttribute('d', gridPath(lines, lon, lat))
    // The spiral is drawn on the ball's surface: its two axes are the ball's
    // local directions at the mark, projected, so it tilts and foreshortens as it rolls.
    const [mx, my, mz] = markAt(lon, lat)
    const e1 = rotate([1, 0, 0], lon, lat)
    const e2 = rotate([0, 1, 0], lon, lat)
    const s = 0.85 + 0.15 * mz
    handle.setAttribute(
      'transform',
      `matrix(${e1[0] * s} ${-e1[1] * s} ${-e2[0] * s} ${e2[1] * s} ${mx} ${-my})`,
    )
  }

  // Push values into the inputs. While rolling, the image work behind them runs
  // a few times a second, not every frame, so the ball stays smooth.
  let driving = false
  let lastSent = 0
  let trailing = 0
  const send = (now = false) => {
    const write = () => {
      lastSent = performance.now()
      driving = true
      for (const [axis, angle] of [[x, lon], [y, lat]] as const) {
        const { min, max } = bounds(axis.input)
        let v = min + toFrac(angle) * (max - min)
        if (axis.whole) v = Math.round(v)
        const before = get(axis.input)
        proto.set!.call(axis.input, String(v))
        if (get(axis.input) !== before) axis.input.dispatchEvent(new Event('input', { bubbles: true }))
      }
      driving = false
    }
    clearTimeout(trailing)
    if (now || performance.now() - lastSent > 120) write()
    else trailing = window.setTimeout(write, 120)
  }

  const clamp = (a: number) => Math.max(-MAX, Math.min(MAX, a))

  // Momentum, and gentle easing for keyboard steps and values set from outside.
  let frame = 0
  let vLon = 0
  let vLat = 0
  let target: { lon: number; lat: number } | null = null
  const tick = (() => {
    let last = performance.now()
    return (t: number) => {
      const dt = Math.min(48, t - last)
      last = t
      if (target) {
        const k = 1 - Math.exp(-dt / 70)
        lon += (target.lon - lon) * k
        lat += (target.lat - lat) * k
        if (Math.abs(target.lon - lon) < 1e-4 && Math.abs(target.lat - lat) < 1e-4) {
          lon = target.lon
          lat = target.lat
          target = null
        }
      } else {
        lon = clamp(lon + vLon * dt)
        lat = clamp(lat + vLat * dt)
        if (Math.abs(lon) >= MAX) vLon = 0
        if (Math.abs(lat) >= MAX) vLat = 0
        const friction = Math.exp(-dt / 220)
        vLon *= friction
        vLat *= friction
      }
      render()
      const moving = target || Math.abs(vLon) > 2e-6 || Math.abs(vLat) > 2e-6
      if (moving) {
        if (!target) send()
        frame = requestAnimationFrame(tick)
      } else {
        frame = 0
        send(true)
      }
    }
  })()
  const animate = () => {
    if (!frame) frame = requestAnimationFrame(tick)
  }

  // Rolling under the pointer: the surface follows the drag, one radius of drag per radian.
  let drag: { x: number; y: number; t: number } | null = null
  svg.addEventListener('pointerdown', (e) => {
    svg.setPointerCapture(e.pointerId)
    svg.focus()
    cancelAnimationFrame(frame)
    frame = 0
    target = null
    vLon = vLat = 0
    drag = { x: e.clientX, y: e.clientY, t: e.timeStamp }
    block.classList.add('dragging')
  })
  svg.addEventListener('pointermove', (e) => {
    if (!drag) return
    const radius = svg.getBoundingClientRect().width / 2.24
    const dLon = (e.clientX - drag.x) / radius
    const dLat = -(e.clientY - drag.y) / radius
    const dt = Math.max(1, e.timeStamp - drag.t)
    // Smoothed velocity, for the momentum after letting go.
    vLon = vLon * 0.6 + (dLon / dt) * 0.4
    vLat = vLat * 0.6 + (dLat / dt) * 0.4
    lon = clamp(lon + dLon)
    lat = clamp(lat + dLat)
    drag = { x: e.clientX, y: e.clientY, t: e.timeStamp }
    render()
    send()
  })
  const release = (e: PointerEvent) => {
    if (!drag) return
    // A pause before letting go means no throw.
    if (e.timeStamp - drag.t > 80) vLon = vLat = 0
    drag = null
    block.classList.remove('dragging')
    animate()
  }
  svg.addEventListener('pointerup', release)
  svg.addEventListener('pointercancel', release)

  svg.addEventListener('keydown', (e) => {
    const step = (e.shiftKey ? 0.1 : 0.02) * 2 * MAX
    const from = target ?? { lon, lat }
    const next = { ...from }
    if (e.key === 'ArrowRight') next.lon = clamp(from.lon + step)
    else if (e.key === 'ArrowLeft') next.lon = clamp(from.lon - step)
    else if (e.key === 'ArrowUp') next.lat = clamp(from.lat + step)
    else if (e.key === 'ArrowDown') next.lat = clamp(from.lat - step)
    else return
    e.preventDefault()
    vLon = vLat = 0
    target = next
    animate()
  })

  // Values set by code (style syncing, the automatic cut-off): roll there.
  for (const axis of [x, y]) {
    Object.defineProperty(axis.input, 'value', {
      configurable: true,
      get: () => get(axis.input),
      set: (v: string) => {
        proto.set!.call(axis.input, v)
        if (driving || drag) return
        vLon = vLat = 0
        target = {
          lon: axis === x ? toAngle(readFrac(x.input, v)) : (target?.lon ?? lon),
          lat: axis === y ? toAngle(readFrac(y.input, v)) : (target?.lat ?? lat),
        }
        animate()
      },
    })
  }

  render()
}
