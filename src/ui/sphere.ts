// Two related settings on one globe. The handle (Kevin's spiral) rides the
// front of a sphere: turning it left or right sets one value (longitude),
// tipping it up or down sets the other (latitude). It foreshortens towards
// the rim like a mark on a real ball. The two range inputs stay in the page,
// unseen, as the source of truth: everything else keeps reading and setting them.

const SVG_NS = 'http://www.w3.org/2000/svg'
/** How far round the globe the handle can go, either way (degrees). */
const REACH = 70
const RAD = Math.PI / 180

export interface GlobeAxis {
  input: HTMLInputElement
  /** The axis hint shown in the legend, e.g. "← →". */
  hint: string
}

let count = 0

/** Where a 0–1 pair of values sits on the front of the sphere (unit radius, y up). */
export function project(px: number, py: number) {
  const lon = (px * 2 - 1) * REACH * RAD
  const lat = (py * 2 - 1) * REACH * RAD
  return {
    x: Math.cos(lat) * Math.sin(lon),
    y: Math.sin(lat),
    /** Towards the viewer: 1 at the centre, near 0 at the rim. */
    z: Math.cos(lat) * Math.cos(lon),
  }
}

/** The 0–1 pair of values for a point on the disc, clamped to the reachable cap. */
export function unproject(x: number, y: number): { px: number; py: number } {
  const lat = Math.asin(Math.max(-1, Math.min(1, y)))
  const c = Math.cos(lat)
  const lon = c > 1e-6 ? Math.asin(Math.max(-1, Math.min(1, x / c))) : 0
  const clamp = (a: number) => Math.max(0, Math.min(1, (a / (REACH * RAD) + 1) / 2))
  return { px: clamp(lon), py: clamp(lat) }
}

function frac(input: HTMLInputElement, value = Number(input.value)): number {
  const min = Number(input.min || 0)
  const max = Number(input.max || 100)
  return max > min ? (value - min) / (max - min) : 0
}

function setFrac(input: HTMLInputElement, f: number) {
  const min = Number(input.min || 0)
  const max = Number(input.max || 100)
  const before = input.value
  input.value = String(min + f * (max - min))
  if (input.value !== before) input.dispatchEvent(new Event('input', { bubbles: true }))
}

/** A path for the meridian at longitude `lon` (radians), as seen from the front. */
function meridian(lon: number): string {
  const rx = Math.abs(Math.sin(lon))
  const sweep = lon > 0 ? 1 : 0
  return rx < 1e-3 ? 'M0 -1V1' : `M0 -1A${rx} 1 0 0 ${sweep} 0 1`
}

/** A path for the parallel at latitude `lat` (radians): a straight chord from the front. */
function parallel(lat: number): string {
  const y = -Math.sin(lat)
  const w = Math.cos(lat)
  return `M${-w} ${y}H${w}`
}

/**
 * Replace two range inputs, each inside its own `label.slider`, with one globe.
 * `x` turns around the globe, `y` tips toward the poles.
 */
export function globePair(x: GlobeAxis, y: GlobeAxis, title: string) {
  const id = `globe-${++count}`
  const xLabel = x.input.closest('label')!
  const yLabel = y.input.closest('label')!

  const block = document.createElement('div')
  block.className = 'globe-pair'
  const svg = document.createElementNS(SVG_NS, 'svg')
  svg.setAttribute('viewBox', '-1.12 -1.12 2.24 2.24')
  svg.setAttribute('class', 'globe')
  svg.setAttribute('tabindex', '0')
  svg.setAttribute('role', 'group')
  svg.setAttribute('aria-label', `${title}. Left and right arrows change the first value, up and down the second.`)

  const grid = [-50, -25, 25, 50].map((d) => meridian(d * RAD)).join('') + [-50, -25, 25, 50].map((d) => parallel(d * RAD)).join('')
  svg.innerHTML = `
    <defs>
      <radialGradient id="${id}-shade" cx="0.36" cy="0.32" r="0.75">
        <stop offset="0" class="globe-lit"/>
        <stop offset="0.55" class="globe-mid"/>
        <stop offset="1" class="globe-dark"/>
      </radialGradient>
    </defs>
    <circle r="1" fill="url(#${id}-shade)" class="globe-body"/>
    <path d="${grid}${meridian(0)}${parallel(0)}" class="globe-grid"/>
    <path class="globe-track globe-lon"/>
    <path class="globe-track globe-lat"/>
    <g class="globe-handle"><use href="#hi-spiral-tight-fill" x="-0.17" y="-0.17" width="0.34" height="0.34"/></g>
    <circle r="1" class="globe-rim"/>`

  const legend = document.createElement('div')
  legend.className = 'globe-legend'
  const names = new Map<HTMLLabelElement, string>()
  for (const [axis, label] of [[x, xLabel], [y, yLabel]] as const) {
    const row = document.createElement('div')
    row.className = 'globe-row'
    const name = label.querySelector('span')!
    names.set(label, name.firstChild?.textContent?.trim() ?? '')
    // Keep the label's own output (the app writes the value into it).
    row.append(...name.childNodes)
    const hint = document.createElement('span')
    hint.className = 'globe-hint'
    hint.textContent = axis.hint
    hint.setAttribute('aria-hidden', 'true')
    row.append(hint)
    legend.append(row)
  }

  xLabel.before(block)
  block.append(svg, legend)
  // The inputs stay, labelled and working, but out of sight and out of the tab order.
  for (const label of [xLabel, yLabel]) {
    label.classList.add('visually-hidden')
    label.querySelector('input')!.tabIndex = -1
    label.querySelector('input')!.dataset.hand = ''
    // The visible name moved into the legend; keep an accessible one.
    label.prepend(document.createTextNode(`${names.get(label)} `))
  }
  block.append(xLabel, yLabel)

  const handle = svg.querySelector<SVGGElement>('.globe-handle')!
  const lonPath = svg.querySelector<SVGPathElement>('.globe-lon')!
  const latPath = svg.querySelector<SVGPathElement>('.globe-lat')!

  const draw = () => {
    const fx = frac(x.input)
    const fy = frac(y.input)
    const p = project(fx, fy)
    lonPath.setAttribute('d', meridian((fx * 2 - 1) * REACH * RAD))
    latPath.setAttribute('d', parallel((fy * 2 - 1) * REACH * RAD))
    // Foreshorten along the direction to the rim, by how much the surface faces away.
    const theta = Math.atan2(-p.y, p.x) / RAD
    const squash = Math.max(0.2, p.z)
    const size = 0.75 + 0.25 * p.z
    handle.setAttribute(
      'transform',
      `translate(${p.x} ${-p.y}) rotate(${theta}) scale(${squash * size} ${size}) rotate(${-theta})`,
    )
  }

  // Values set by code (style syncing, the automatic cut-off) redraw too.
  const proto = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!
  for (const { input } of [x, y]) {
    Object.defineProperty(input, 'value', {
      configurable: true,
      get: () => proto.get!.call(input),
      set: (v: string) => {
        proto.set!.call(input, v)
        draw()
      },
    })
    input.addEventListener('input', draw)
  }

  const fromPointer = (e: PointerEvent) => {
    const box = svg.getBoundingClientRect()
    // viewBox is 2.24 wide, centred on the globe.
    const ux = ((e.clientX - box.left) / box.width - 0.5) * 2.24
    const uy = -((e.clientY - box.top) / box.height - 0.5) * 2.24
    const { px, py } = unproject(ux, uy)
    setFrac(x.input, px)
    setFrac(y.input, py)
  }
  svg.addEventListener('pointerdown', (e) => {
    svg.setPointerCapture(e.pointerId)
    svg.focus()
    block.classList.add('dragging')
    fromPointer(e)
  })
  svg.addEventListener('pointermove', (e) => {
    if (svg.hasPointerCapture(e.pointerId)) fromPointer(e)
  })
  const end = () => block.classList.remove('dragging')
  svg.addEventListener('pointerup', end)
  svg.addEventListener('pointercancel', end)

  svg.addEventListener('keydown', (e) => {
    const step = e.shiftKey ? 10 : 1
    const nudge = (input: HTMLInputElement, dir: number) => {
      for (let i = 0; i < step; i++) dir > 0 ? input.stepUp() : input.stepDown()
      input.dispatchEvent(new Event('input', { bubbles: true }))
    }
    if (e.key === 'ArrowRight') nudge(x.input, 1)
    else if (e.key === 'ArrowLeft') nudge(x.input, -1)
    else if (e.key === 'ArrowUp') nudge(y.input, 1)
    else if (e.key === 'ArrowDown') nudge(y.input, -1)
    else return
    e.preventDefault()
  })

  draw()
}
