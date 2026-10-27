// Two related settings on one globe you roll like a ball. The handle
// (Kevin's spiral) is a mark on the ball's surface: rolling left or right
// sets one value (longitude), rolling up or down the other (latitude). The
// hand-drawn meridians and parallels are on the ball too, so everything
// rolls together, and the ball keeps a little momentum when let go. Both the
// grid and the rim are Kevin's own drawing (guides/globe-guide.pdf, read by
// guides/read-globe.py): the map is painted onto the ball pixel by pixel.
//
// Values are continuous; a setting that must be a whole number is rounded,
// while the ball itself keeps moving smoothly. The two range inputs stay in
// the page unseen as the source of truth for the rest of the app.

import { t } from '../text'
import mapUrl from './globe-map.png'
import { RIM } from './globe-rim'

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

/** The point on the unrolled ball that `rotate` brings to `q`. */
export function unrotate(q: V3, lon: number, lat: number): V3 {
  const [x1, y2, z2] = q
  const y = y2 * Math.cos(lat) - z2 * Math.sin(lat)
  const z1 = y2 * Math.sin(lat) + z2 * Math.cos(lat)
  return [x1 * Math.cos(lon) - z1 * Math.sin(lon), y, x1 * Math.sin(lon) + z1 * Math.cos(lon)]
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
  const f = max > min ? (Number(value) - min) / (max - min) : 0
  // A value that isn't a number (empty, or a word like "auto") rests the ball in the middle.
  return Number.isFinite(f) ? f : 0.5
}

/** The rim's radius at angle `t` (SVG angle: clockwise from 3 o'clock). */
export function rimAt(t: number): number {
  const f = (((t / (2 * Math.PI)) % 1) + 1) % 1 * RIM.length
  const i = Math.floor(f)
  const w = f - i
  return RIM[i % RIM.length] * (1 - w) + RIM[(i + 1) % RIM.length] * w
}

/** The rim as path data. */
function rimPath(): string {
  return RIM.map((r, i) => {
    const t = (i / RIM.length) * 2 * Math.PI
    return `${i ? 'L' : 'M'}${(Math.cos(t) * r).toFixed(4)} ${(Math.sin(t) * r).toFixed(4)}`
  }).join('') + 'Z'
}

/** The drawn map as ink coverage 0–255 (x: longitude from 0° eastward, y: latitude from the north pole). */
interface Map {
  w: number
  h: number
  ink: Uint8ClampedArray
}

let mapLoad: Promise<Map> | null = null
function loadMap(): Promise<Map> {
  mapLoad ??= new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      const c = document.createElement('canvas')
      c.width = img.naturalWidth
      c.height = img.naturalHeight
      const ctx = c.getContext('2d', { willReadFrequently: true })!
      ctx.drawImage(img, 0, 0)
      const rgba = ctx.getImageData(0, 0, c.width, c.height).data
      const ink = new Uint8ClampedArray(c.width * c.height)
      for (let i = 0; i < ink.length; i++) ink[i] = rgba[i * 4]
      resolve({ w: c.width, h: c.height, ink })
    }
    img.onerror = reject
    img.src = mapUrl
  })
  return mapLoad
}

/** A CSS colour as [r, g, b]. */
function rgb(css: string): [number, number, number] {
  const ctx = document.createElement('canvas').getContext('2d')!
  ctx.fillStyle = css
  const hex = ctx.fillStyle.replace('#', '')
  return [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16)) as [number, number, number]
}

/**
 * Paint the ball: inside the drawn rim, the surface colour, and on it the
 * front half of the drawn map after rolling. Each pixel is traced back to the
 * point of the ball under it, and the map is read there (bilinear).
 */
function paint(canvas: HTMLCanvasElement, map: Map | null, lon: number, lat: number) {
  const size = Math.round(canvas.clientWidth * devicePixelRatio)
  if (!size) return
  if (canvas.width !== size) canvas.width = canvas.height = size
  const ctx = canvas.getContext('2d')!
  const img = ctx.createImageData(size, size)
  const out = img.data
  const style = getComputedStyle(canvas)
  const bg = rgb(style.getPropertyValue('--surface'))
  const fg = rgb(style.getPropertyValue('--globe-ink'))
  const span = 2.24 // the SVG viewBox, -1.12 to 1.12
  const px = span / size
  for (let j = 0; j < size; j++) {
    const sy = -1.12 + (j + 0.5) * px
    for (let i = 0; i < size; i++) {
      const sx = -1.12 + (i + 0.5) * px
      const r = Math.hypot(sx, sy)
      const edge = rimAt(Math.atan2(sy, sx))
      // Soft edge one pixel wide, under the drawn rim.
      const a = Math.max(0, Math.min(1, (edge - r) / px + 0.5))
      if (!a) continue
      let ink = 0
      if (map) {
        // Fit the sphere to the drawn rim, then trace back to the ball's own coordinates.
        const x = sx / edge
        const y = -sy / edge
        const z = Math.sqrt(Math.max(0, 1 - x * x - y * y))
        const p = unrotate([x, y, z], lon, lat)
        const u = ((Math.atan2(p[0], p[2]) / (2 * Math.PI)) % 1 + 1) % 1 * map.w - 0.5
        const v = (0.5 - Math.asin(Math.max(-1, Math.min(1, p[1]))) / Math.PI) * map.h - 0.5
        const u0 = Math.floor(u)
        const v0 = Math.max(0, Math.min(map.h - 2, Math.floor(v)))
        const fu = u - u0
        const fv = Math.max(0, Math.min(1, v - v0))
        const a0 = ((u0 % map.w) + map.w) % map.w
        const a1 = (a0 + 1) % map.w
        const r0 = v0 * map.w
        const r1 = r0 + map.w
        ink =
          ((map.ink[r0 + a0] * (1 - fu) + map.ink[r0 + a1] * fu) * (1 - fv) +
            (map.ink[r1 + a0] * (1 - fu) + map.ink[r1 + a1] * fu) * fv) /
          255
      }
      const k = (j * size + i) * 4
      out[k] = bg[0] + (fg[0] - bg[0]) * ink
      out[k + 1] = bg[1] + (fg[1] - bg[1]) * ink
      out[k + 2] = bg[2] + (fg[2] - bg[2]) * ink
      out[k + 3] = a * 255
    }
  }
  ctx.putImageData(img, 0, 0)
}

/**
 * Replace two range inputs (each inside its own `label.slider`) with one
 * globe, placed in `into` under a `title` saying what the pair is for. The y
 * value shows at the globe's top right, the x value at its bottom right, and
 * both names in a list underneath.
 */
export function globePair(title: string, x: GlobeAxis, y: GlobeAxis, into: HTMLElement) {
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
  svg.setAttribute('aria-label', t('common.globe-label', { title, x: xName, y: yName }))
  svg.innerHTML = `
    <g class="globe-handle"><use href="#hi-spiral-tight-fill" x="-0.17" y="-0.17" width="0.34" height="0.34"/></g>
    <path d="${rimPath()}" class="globe-rim"/>`
  // The ball's surface and the drawn map, painted under the handle and the rim.
  const surface = document.createElement('canvas')
  surface.className = 'globe-paint'
  surface.setAttribute('aria-hidden', 'true')

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
  ball.append(surface, svg, yOut, xOut)
  const heading = document.createElement('h3')
  heading.className = 'globe-title'
  heading.textContent = title
  block.append(heading, ball, names)
  into.append(block)

  // The inputs stay, labelled and working, out of sight and out of the tab order.
  for (const [axis, label] of [[x, xLabel], [y, yLabel]] as const) {
    label.classList.add('visually-hidden')
    axis.input.tabIndex = -1
    axis.input.dataset.hand = ''
    axis.input.step = axis.whole ? '1' : 'any'
    block.append(label)
  }

  let map: Map | null = null
  const handle = svg.querySelector<SVGGElement>('.globe-handle')!

  const proto = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!
  const get = (input: HTMLInputElement) => proto.get!.call(input) as string
  let lon = toAngle(readFrac(x.input, get(x.input)))
  let lat = toAngle(readFrac(y.input, get(y.input)))

  const render = () => {
    paint(surface, map, lon, lat)
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

  const clamp = (a: number) => (Number.isFinite(a) ? Math.max(-MAX, Math.min(MAX, a)) : 0)

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
        rest()
      }
    }
  })()
  const animate = () => {
    if (!frame) frame = requestAnimationFrame(tick)
  }

  // While rolling, the page may work on quicker previews (see main.ts); say when it stops.
  const rolling = () => (document.documentElement.dataset.rolling = '1')
  const rest = () => {
    if (document.documentElement.dataset.rolling !== '1') return
    delete document.documentElement.dataset.rolling
    dispatchEvent(new Event('globe-rest'))
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
    rolling()
  })
  svg.addEventListener('pointermove', (e) => {
    if (!drag) return
    const radius = svg.getBoundingClientRect().width / 2.24
    // A ball with no size on screen (its view hidden mid-drag) can't be rolled.
    if (!(radius > 0)) return
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
    if (!vLon && !vLat) {
      // Let go without a throw: at rest now, no frames needed.
      send(true)
      rest()
      return
    }
    animate()
    // Momentum fades within a second; if no frames run (a background tab), still come to rest.
    clearTimeout(restTimer)
    restTimer = window.setTimeout(() => {
      if (document.documentElement.dataset.rolling !== '1') return
      cancelAnimationFrame(frame)
      frame = 0
      vLon = vLat = 0
      send(true)
      rest()
    }, 1500)
  }
  let restTimer = 0
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
  // Repaint once the drawing has loaded, and whenever the ball changes size.
  loadMap().then((m) => {
    map = m
    render()
  })
  new ResizeObserver(() => render()).observe(surface)
}
