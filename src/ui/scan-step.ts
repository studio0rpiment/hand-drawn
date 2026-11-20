// A generator tab's own scan step: its photo, the sheet's corners, the ink,
// the colours, and the drawings on the page, with the tray that picks one.
// The controls are in index.html, each id starting with the tab's prefix
// (icon-flatten, icon-level …); the image work is the same as Scan's.

import { cropMask, despeckle, flattenLight, inkBox, lineWeight, threshold, trimEdges, type Box } from '../clean'
import { hexRgb, hslHex, measureColours, rgbHsl, type RGB } from '../colour'
import { otsu, shrinkGray, toGray, type GrayImage, type Mask, type Quad, type RGBAImage } from '../image'
import { findPaper, findPaperInColour, fullFrame, quadSize, warp } from '../paper'
import { padBox, splitDrawings } from '../split'
import { findSheetMarkers } from '../font/read'
import { FLAG, GRID, MARKER, PAGE, READ_BOX, TEMPLATE_PAGES, boxOrigin, pageFromFlags } from '../icon/template'
import { t } from '../text'
import { cornerHandles, type CornerHandles } from './corners'
import { reserveHoverWidths } from './hand'
import { globePair } from './sphere'
import { baseName, openImage, turned, WORK_SIDE } from './open-image'

/** The ink and paper colours read from the photo, then adjusted. */
export interface ScanColours {
  ink: string
  /** null: the paper is left out (transparent). */
  paper: string | null
}

export interface Scanned {
  /** The photo's name, for naming what is made from it. */
  name: string
  /** Every drawing found, cropped close; one unless the sheet setting is on. Empty with no photo or no ink. */
  drawings: Mask[]
  /** The drawing picked in the tray. */
  pick: number
  /** Several drawings on this sheet is ticked. */
  sheet: boolean
  colours: ScanColours
  /** The picked drawing with the light-evened photo under it and the straightened photo in colour, cropped alike (for textures, which keep the photo's tones). */
  art: { gray: GrayImage; mask: Mask; colour: RGBAImage } | null
  /** Counts the photos opened (and removed), so a new one can be told from new settings. */
  photo: number
  /** A page of the icon template: which page, and each drawing's icon name (in `drawings` order). */
  template: { page: number; names: string[] } | null
}

export interface ScanStepOptions {
  /** Photos are pages of the icon template: placed by their corner squares, read box by box. */
  template?: () => boolean
  /** Several photos chosen at once; without this, the first one opens. */
  files?: (files: File[]) => void
  /** Remove photo, when the tab keeps several (it decides what shows next); without this, the photo goes. */
  remove?: () => void
}

/** While a globe rolls or a slider is dragged, the image is worked out this many times smaller. */
const PREVIEW = 2
const rolling = () => document.documentElement.dataset.rolling === '1'

const SLIDERS = ['turn', 'flatten', 'level', 'weight', 'speck', 'trim', 'gap', 'ink-h', 'ink-s', 'ink-l', 'paper-h', 'paper-s', 'paper-l'] as const
type Slider = (typeof SLIDERS)[number]

const signed = (v: number, unit: string, digits = 0) => `${v > 0 ? '+' : ''}${v.toFixed(digits)}${unit}`
const FORMATS: Record<Slider, (v: number) => string> = {
  turn: (v) => signed(v, '°', 1),
  flatten: (v) => `${Math.round(v * 100)}%`,
  level: (v) => String(v),
  weight: (v) => signed(v, ' px'),
  speck: (v) => (v ? `${v} px` : t('common.off')),
  trim: (v) => `${(v * 100).toFixed(1)}%`,
  gap: (v) => `${v} px`,
  'ink-h': (v) => `${v}°`,
  'ink-s': (v) => `${v}%`,
  'ink-l': (v) => `${v}%`,
  'paper-h': (v) => `${v}°`,
  'paper-s': (v) => `${v}%`,
  'paper-l': (v) => `${v}%`,
}

/** Part of an RGBA image. */
function cropRGBA(img: RGBAImage, box: Box): RGBAImage {
  const data = new Uint8ClampedArray(box.width * box.height * 4)
  for (let y = 0; y < box.height; y++) {
    const from = ((box.y + y) * img.width + box.x) * 4
    data.set(img.data.subarray(from, from + box.width * 4), y * box.width * 4)
  }
  return { data, width: box.width, height: box.height }
}

export class ScanStep {
  private readonly el: <T extends HTMLElement = HTMLElement>(id: string) => T
  private readonly sliders: Record<Slider, HTMLInputElement>
  private readonly photoCanvas: HTMLCanvasElement
  private readonly inkCanvas: HTMLCanvasElement
  private readonly flatCanvas: HTMLCanvasElement
  private readonly handles: CornerHandles
  private readonly changed: (s: Scanned) => void

  private name = 'drawing'
  private photoCount = 0
  /** The photo as opened, before any turn; every turn starts from it. */
  private unturned: HTMLCanvasElement | null = null
  private quarters = 0
  private photo: RGBAImage | null = null
  private quad: Quad | null = null
  private flat: RGBAImage | null = null
  private gray: GrayImage | null = null
  private flattened: { strength: number; image: GrayImage } | null = null
  /** The half-size copy for rolling, and its light evened out. */
  private small: { gray: GrayImage; strength: number; image: GrayImage | null } | null = null
  /** The last run was the quick half-size one: a full one follows when the globe or slider rests. */
  private previewed = false
  private page: { base: GrayImage; key: string; mask: Mask } | null = null
  private split: { mask: Mask; gap: number; boxes: Box[] } | null = null
  /** The straightened photo the colours were last read from; a new one is read again. */
  private measuredFor: RGBAImage | null = null
  private boxes: Box[] = []
  private pick = 0
  private drawings: Mask[] = []
  private timer = 0
  private turnTimer = 0
  /** The page was placed by the template's corner squares (so its boxes can be read). */
  private onMarkers = false
  private templateRead: { page: number; names: string[] } | null = null
  private readonly options: ScanStepOptions

  constructor(
    readonly prefix: string,
    changed: (s: Scanned) => void,
    options: ScanStepOptions = {},
  ) {
    this.changed = changed
    this.options = options
    this.el = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(`${prefix}-${id}`) as T
    this.sliders = Object.fromEntries(SLIDERS.map((k) => [k, this.el<HTMLInputElement>(k)])) as Record<Slider, HTMLInputElement>
    this.photoCanvas = this.el<HTMLCanvasElement>('photo')
    this.inkCanvas = this.el<HTMLCanvasElement>('ink-view')
    this.flatCanvas = this.el<HTMLCanvasElement>('flat-view')
    this.handles = cornerHandles(this.el('handles') as unknown as SVGSVGElement, this.photoCanvas, () => this.quad, () => this.soon(true))
    for (const k of ['flatten', 'weight', 'speck', 'trim', 'gap'] as const) this.sliders[k].addEventListener('input', () => this.soon())
    this.sliders.level.addEventListener('input', () => {
      this.el<HTMLInputElement>('level-auto').checked = false
      this.soon()
    })
    this.el('level-auto').addEventListener('change', () => this.soon())
    this.el('sheet-on').addEventListener('change', () => this.soon())
    for (const k of ['ink-h', 'ink-s', 'ink-l', 'paper-h', 'paper-s', 'paper-l'] as const) this.sliders[k].addEventListener('input', () => this.colourChanged())
    this.el('paper-on').addEventListener('change', () => this.colourChanged())
    this.el('measure').addEventListener('click', () => {
      this.measuredFor = null
      this.soon()
    })
    this.el('detect').addEventListener('click', () => this.findSheet())
    this.el('whole').addEventListener('click', () => this.wholePhoto())
    this.sliders.turn.addEventListener('input', () => this.applyTurn())
    this.el('turn-90').addEventListener('click', () => {
      this.quarters = (this.quarters + 1) % 4
      this.applyTurn()
    })
    this.el('remove').addEventListener('click', () => (this.options.remove ? this.options.remove() : this.remove()))
    this.el('upload').addEventListener('click', () => this.el('file').click())
    this.el<HTMLInputElement>('file').addEventListener('change', (e) => {
      const input = e.target as HTMLInputElement
      const files = [...(input.files ?? [])]
      input.value = ''
      if (this.options.files) this.options.files(files)
      else if (files[0]) void this.open(files[0], files[0].name)
    })
    // Related pairs become one globe, rolled to set both (the paper's colour stays as sliders).
    const arc = this.el('globes')
    globePair(t('scan.globe-light'), { input: this.sliders.flatten }, { input: this.sliders.level, whole: true }, arc)
    globePair(t('scan.globe-ink'), { input: this.sliders.weight, whole: true }, { input: this.sliders.speck, whole: true }, arc)
    globePair(t('scan.globe-ink-colour'), { input: this.sliders['ink-h'], whole: true }, { input: this.sliders['ink-s'], whole: true }, arc)
    // A globe came to rest, or a slider was let go: the full-size pass, after the quick ones.
    addEventListener('globe-rest', () => {
      if (this.previewed) this.soon()
    })
    // Sliders work like the globes: the quick preview while dragged, the full pass when let go.
    let sliding = false
    document.addEventListener('pointerdown', (e) => {
      const target = e.target as HTMLElement
      if (!(target instanceof HTMLInputElement) || target.type !== 'range' || !target.closest(`#${this.prefix}-app`)) return
      sliding = true
      document.documentElement.dataset.rolling = '1'
    })
    addEventListener('pointerup', () => {
      if (!sliding) return
      sliding = false
      delete document.documentElement.dataset.rolling
      dispatchEvent(new Event('globe-rest'))
    })
    this.el('inset-size').addEventListener('click', (e) => {
      const btn = e.currentTarget as HTMLButtonElement
      const big = this.el('inset').classList.toggle('big')
      btn.setAttribute('aria-pressed', String(big))
      btn.textContent = big ? t('scan.shrink') : t('scan.enlarge')
      this.handles.draw()
    })
    document.querySelectorAll<HTMLInputElement>(`input[name="${this.prefix}-view"]`).forEach((r) =>
      r.addEventListener('change', () => {
        this.inkCanvas.hidden = r.value !== 'ink'
        this.flatCanvas.hidden = r.value !== 'flat'
      }),
    )
    this.showValues()
    this.showEmpty()
  }

  // ---- Opening ----

  async open(blob: Blob, name: string) {
    const c = await openImage(blob, name)
    if (!c) return
    this.openCanvas(c, baseName(name))
  }

  /** A photo already on a canvas; `whole` uses all of it (a page that fills the photo, with no table round it). */
  openCanvas(c: HTMLCanvasElement, name: string, whole = false) {
    this.unturned = c
    this.quarters = 0
    this.sliders.turn.value = '0'
    this.measuredFor = null
    this.pick = 0
    this.photoCount++
    this.show(c, name, whole)
  }

  private show(c: HTMLCanvasElement, name: string, whole = false) {
    this.photo = c.getContext('2d', { willReadFrequently: true })!.getImageData(0, 0, c.width, c.height)
    this.name = name
    this.photoCanvas.width = c.width
    this.photoCanvas.height = c.height
    this.photoCanvas.getContext('2d')!.drawImage(c, 0, 0)
    this.showEmpty()
    reserveHoverWidths(this.el('image-pane'))
    if (whole) this.wholePhoto()
    else this.findSheet()
  }

  /** Read the photo now rather than once the controls settle (when opening several in a row). */
  flush() {
    clearTimeout(this.timer)
    this.run()
  }

  /** The template was turned on or off: place the page again. */
  retemplate() {
    if (this.photo) this.findSheet()
  }

  remove() {
    this.unturned = this.photo = this.quad = this.flat = this.gray = null
    this.flattened = this.page = this.split = this.small = null
    this.previewed = false
    clearTimeout(this.timer)
    this.measuredFor = null
    this.name = 'drawing'
    this.boxes = []
    this.drawings = []
    this.pick = 0
    this.photoCount++
    for (const c of [this.photoCanvas, this.inkCanvas, this.flatCanvas]) c.width = c.height = 1
    this.handles.clear()
    this.showEmpty()
    this.showTray()
    this.publish()
  }

  /** No photo yet: the image pane is an empty box with its name. */
  private showEmpty() {
    this.el('image-pane').classList.toggle('empty', !this.photo)
    this.el<HTMLButtonElement>('remove').hidden = !this.photo
  }

  // ---- Paper ----

  private findSheet() {
    if (!this.photo) return
    // A template page is placed by its corner squares, exactly.
    const markers = this.options.template?.() ? findSheetMarkers(toGray(this.photo)) : null
    this.onMarkers = !!markers
    // Otherwise by colour first (paper is grey, tables are not), then by brightness, else the whole photo.
    this.quad = markers ?? findPaperInColour(this.photo) ?? findPaper(toGray(this.photo)) ?? fullFrame(this.photo.width, this.photo.height)
    this.handles.draw()
    this.soon(true)
  }

  private wholePhoto() {
    if (!this.photo) return
    this.onMarkers = false
    this.quad = fullFrame(this.photo.width, this.photo.height)
    this.handles.draw()
    this.soon(true)
  }

  private applyTurn() {
    this.showValues()
    // Turning finds the sheet again, which takes a moment: once the slider rests briefly.
    clearTimeout(this.turnTimer)
    this.turnTimer = window.setTimeout(() => {
      if (!this.unturned) return
      const deg = this.quarters * 90 + Number(this.sliders.turn.value)
      this.show(deg ? turned(this.unturned, deg) : this.unturned, this.name)
    }, 80)
  }

  // ---- Ink ----

  /** Run the pipeline once the current input settles; `straighten` when the corners moved. */
  private soon(straighten = false) {
    if (straighten) this.flat = null
    clearTimeout(this.timer)
    this.timer = window.setTimeout(() => this.run(), 30)
  }

  private run() {
    this.showValues()
    if (!this.photo || !this.quad) return
    if (!this.flat) {
      const { width, height } = quadSize(this.quad, WORK_SIDE)
      try {
        this.flat = warp(this.photo, this.quad, width, height)
      } catch {
        return
      }
      this.flatCanvas.width = width
      this.flatCanvas.height = height
      this.flatCanvas.getContext('2d')!.putImageData(new ImageData(this.flat.data, width, height), 0, 0)
      this.gray = null
    }
    if (!this.gray) {
      this.gray = toGray(this.flat)
      this.flattened = this.small = null
    }
    if (rolling()) return this.preview()
    this.previewed = false
    const strength = Number(this.sliders.flatten.value)
    if (this.flattened?.strength !== strength) this.flattened = { strength, image: flattenLight(this.gray, strength) }
    const base = this.flattened.image
    if (this.el<HTMLInputElement>('level-auto').checked) this.sliders.level.value = String(otsu(base))
    const v = (k: Slider) => Number(this.sliders[k].value)
    const key = [v('level'), v('trim'), v('speck'), v('weight')].join('|')
    if (this.page?.base !== base || this.page.key !== key) {
      let m = threshold(base, v('level'))
      m = trimEdges(m, v('trim'))
      // Specks go before the weight change, so thickening never grows them past the limit.
      m = despeckle(m, v('speck'))
      m = lineWeight(m, v('weight'))
      this.page = { base, key, mask: m }
    }
    const mask = this.page.mask
    this.templateRead = null
    if (this.onMarkers && this.options.template?.()) {
      // A template page: one drawing per box that has ink in it, named as printed.
      const read = this.readTemplate(base, mask)
      this.boxes = read.boxes
      this.templateRead = { page: read.page, names: read.names }
    } else if (this.el<HTMLInputElement>('sheet-on').checked) {
      // A sheet of drawings: find each one; the one picked in the tray is what the tab works on.
      const gap = v('gap')
      if (this.split?.mask !== mask || this.split.gap !== gap) {
        this.split = { mask, gap, boxes: splitDrawings(mask, gap, Math.max(30, v('speck'))) }
      }
      this.boxes = this.split.boxes
    } else {
      const box = inkBox(mask, 0)
      this.boxes = box ? [box] : []
    }
    this.pick = Math.min(this.pick, Math.max(0, this.boxes.length - 1))
    this.drawings = this.boxes.map((b) => cropMask(mask, padBox(b, 2, mask.width, mask.height)))
    if (this.measuredFor !== this.flat) {
      this.measuredFor = this.flat
      this.readColours(this.flat, mask)
    }
    this.showValues()
    this.drawInk()
    this.showTray()
    this.publish()
  }

  /**
   * The quick pass while a globe rolls or a slider is dragged: the ink on a
   * half-size copy, shown in the image only. The drawings and what is made
   * from them wait for the full pass, when it rests.
   */
  private preview() {
    this.previewed = true
    const k = PREVIEW
    this.small ??= { gray: shrinkGray(this.gray!, k), strength: -1, image: null }
    const strength = Number(this.sliders.flatten.value)
    if (this.small.strength !== strength || !this.small.image) {
      this.small.image = flattenLight(this.small.gray, strength)
      this.small.strength = strength
    }
    const base = this.small.image
    if (this.el<HTMLInputElement>('level-auto').checked) this.sliders.level.value = String(otsu(base))
    const v = (key: Slider) => Number(this.sliders[key].value)
    // Pixel settings shrink with the copy.
    let m = threshold(base, v('level'))
    m = trimEdges(m, v('trim'))
    m = despeckle(m, v('speck') / (k * k))
    m = lineWeight(m, Math.round(v('weight') / k))
    this.showValues()
    this.drawInk(m)
  }

  /**
   * The boxes of a template page in the straightened photo, which spans the
   * corner squares' centres: which page it is (its top squares), and the ink
   * in each box below the name, as a box round that ink.
   */
  private readTemplate(base: GrayImage, mask: Mask): { page: number; boxes: Box[]; names: string[] } {
    const span = { w: PAGE.width - 2 * MARKER.inset, h: PAGE.height - 2 * MARKER.inset }
    const kx = mask.width / span.w
    const ky = mask.height / span.h
    const px = (x: number, y: number) => ({
      x: Math.min(mask.width, Math.max(0, Math.round((x - MARKER.inset) * kx))),
      y: Math.min(mask.height, Math.max(0, Math.round((y - MARKER.inset) * ky))),
    })
    const level = otsu(base)
    // A top square sits on the line between the top corner squares; half of it is inside the photo.
    const dark = (fx: number) => {
      let n = 0
      let ink = 0
      const half = FLAG.size * 0.3
      for (let y = 0.3; y <= half; y += 0.2) {
        for (let x = -half; x <= half; x += 0.2) {
          const p = px(fx + x, FLAG.y + y)
          if (p.x < 0 || p.y < 0 || p.x >= base.width || p.y >= base.height) continue
          n++
          if (base.data[p.y * base.width + p.x] <= level) ink++
        }
      }
      return n > 0 && ink / n > 0.5
    }
    const page = pageFromFlags(dark)
    const boxes: Box[] = []
    const names: string[] = []
    TEMPLATE_PAGES[page].forEach((icon, i) => {
      const o = boxOrigin(i)
      const a = px(o.x + READ_BOX.x, o.y + READ_BOX.y)
      const b = px(o.x + READ_BOX.x + READ_BOX.width, o.y + READ_BOX.y + READ_BOX.height)
      const cell = cropMask(mask, { x: a.x, y: a.y, width: Math.max(1, b.x - a.x), height: Math.max(1, b.y - a.y) })
      const ink = inkBox(cell, 0)
      // Too little ink to be a drawing: an empty box (a stray mark, or the box's own print).
      if (!ink || ink.width * ink.height < (GRID.cell * kx * 0.06) ** 2) return
      boxes.push({ x: a.x + ink.x, y: a.y + ink.y, width: ink.width, height: ink.height })
      names.push(icon.name)
    })
    return { page, boxes, names }
  }

  private publish() {
    const box = this.boxes[this.pick]
    const page = this.page
    const art = box && page ? (() => {
      const b = padBox(box, 2, page.mask.width, page.mask.height)
      return { gray: cropMask(page.base, b), mask: cropMask(page.mask, b), colour: cropRGBA(this.flat!, b) }
    })() : null
    this.changed({
      name: this.name,
      drawings: this.drawings,
      pick: this.pick,
      sheet: this.el<HTMLInputElement>('sheet-on').checked || !!this.templateRead,
      colours: this.colours(),
      art,
      photo: this.photoCount,
      template: this.templateRead,
    })
  }

  /** Pick a drawing of the sheet (from the tray, or from the tab's own set of icons). */
  choose(i: number) {
    if (i === this.pick || i < 0 || i >= this.drawings.length) return
    this.pick = i
    this.drawInk()
    this.showTray()
    this.publish()
  }

  // ---- Colour ----

  private hsl(k: 'ink' | 'paper') {
    return { h: Number(this.sliders[`${k}-h`].value), s: Number(this.sliders[`${k}-s`].value), l: Number(this.sliders[`${k}-l`].value) }
  }

  colours(): ScanColours {
    return { ink: hslHex(this.hsl('ink')), paper: this.el<HTMLInputElement>('paper-on').checked ? hslHex(this.hsl('paper')) : null }
  }

  /** The paper's colour even while it is left out (for a filled background). */
  paperColour(): string {
    return hslHex(this.hsl('paper'))
  }

  private readColours(flat: RGBAImage, mask: Mask) {
    const got = measureColours(flat, mask)
    if (!got) return
    for (const [k, rgb] of [['ink', got.ink], ['paper', got.paper]] as ['ink' | 'paper', RGB][]) {
      const c = rgbHsl(rgb)
      this.sliders[`${k}-h`].value = String(Math.round(c.h))
      this.sliders[`${k}-s`].value = String(Math.round(c.s))
      this.sliders[`${k}-l`].value = String(Math.round(c.l))
    }
  }

  private colourChanged() {
    this.showValues()
    this.drawInk()
    this.showTray()
    this.publish()
  }

  // ---- Showing ----

  private showValues() {
    for (const k of SLIDERS) {
      const out = this.el(`${k}-out`)
      if (out) out.textContent = FORMATS[k](Number(this.sliders[k].value))
    }
    if (this.quarters) this.el('turn-out').textContent += ` · ${this.quarters * 90}°`
    const paperOn = this.el<HTMLInputElement>('paper-on').checked
    for (const k of ['paper-h', 'paper-s', 'paper-l'] as const) this.sliders[k].closest('label')!.classList.toggle('off', !paperOn)
    const sheet = this.el<HTMLInputElement>('sheet-on').checked
    const n = this.boxes.length
    this.el('sheet-count').textContent = this.templateRead
      ? t('icon.template-read', { page: this.templateRead.page + 1, n })
      : !sheet || !this.photo ? '' : n === 0 ? t('scan.found-none') : n === 1 ? t('scan.found-one') : t('scan.found', { n, pick: this.pick + 1 })
  }

  /**
   * The straightened page's ink, in the ink colour on the paper (or on the
   * checks), the picked drawing outlined; or `quick`, the half-size preview's.
   */
  private drawInk(quick?: Mask) {
    const m = quick ?? this.page?.mask
    if (!m) return
    const { ink, paper } = this.colours()
    const img = new ImageData(m.width, m.height)
    const [r, g, b] = hexRgb(ink)
    const [pr, pg, pb] = hexRgb(paper ?? '#ffffff')
    for (let i = 0, j = 0; i < m.data.length; i++, j += 4) {
      if (m.data[i]) {
        img.data[j] = r
        img.data[j + 1] = g
        img.data[j + 2] = b
        img.data[j + 3] = 255
      } else if (paper) {
        img.data[j] = pr
        img.data[j + 1] = pg
        img.data[j + 2] = pb
        img.data[j + 3] = 255
      }
    }
    this.inkCanvas.width = m.width
    this.inkCanvas.height = m.height
    const ctx = this.inkCanvas.getContext('2d')!
    ctx.putImageData(img, 0, 0)
    const box = this.boxes[this.pick]
    if (box && this.boxes.length > 1 && !quick) {
      const w = Math.max(2, Math.round(m.width / 400))
      ctx.setLineDash([w * 4, w * 3])
      ctx.lineWidth = w
      ctx.strokeStyle = '#fdda24'
      ctx.strokeRect(box.x - 2 * w, box.y - 2 * w, box.width + 4 * w, box.height + 4 * w)
    }
  }

  /** The numbered drawings of a sheet, to pick from. */
  private showTray() {
    const tray = this.el('pieces')
    const sheet = this.el<HTMLInputElement>('sheet-on').checked || !!this.templateRead
    tray.hidden = !sheet || !this.drawings.length
    if (tray.hidden) return tray.replaceChildren()
    const [r, g, b] = hexRgb(this.colours().ink)
    tray.replaceChildren(
      ...this.drawings.map((full, i) => {
        const btn = document.createElement('button')
        btn.type = 'button'
        btn.className = 'piece'
        btn.setAttribute('role', 'option')
        btn.setAttribute('aria-selected', String(i === this.pick))
        btn.setAttribute('aria-label', this.templateRead?.names[i] ?? t('scan.drawing', { n: i + 1 }))
        const img = new ImageData(full.width, full.height)
        for (let p = 0, j = 0; p < full.data.length; p++, j += 4) {
          if (!full.data[p]) continue
          img.data[j] = r
          img.data[j + 1] = g
          img.data[j + 2] = b
          img.data[j + 3] = 255
        }
        const tmp = document.createElement('canvas')
        tmp.width = full.width
        tmp.height = full.height
        tmp.getContext('2d')!.putImageData(img, 0, 0)
        const s = Math.min(1, 72 / Math.max(full.width, full.height))
        const c = document.createElement('canvas')
        c.width = Math.max(1, Math.round(full.width * s))
        c.height = Math.max(1, Math.round(full.height * s))
        const ctx = c.getContext('2d')!
        ctx.imageSmoothingQuality = 'high'
        ctx.drawImage(tmp, 0, 0, c.width, c.height)
        const num = document.createElement('span')
        num.textContent = String(i + 1)
        btn.append(c, num)
        btn.addEventListener('click', () => this.choose(i))
        return btn
      }),
    )
  }
}
