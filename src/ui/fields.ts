// Style controls generated from a list of fields. Each tool describes its style
// settings once; the form, its syncing and validation-on-edit come from here.

import { tOr } from '../text'

export type Field =
  | { kind: 'range'; path: string; label: string; min: number; max: number; step: number; fmt: (v: number) => string }
  | { kind: 'check'; path: string; label: string }
  | { kind: 'select'; path: string; label: string; options: readonly (string | number)[] }
  | { kind: 'multi'; path: string; label: string; options: readonly string[] }
  | { kind: 'color'; path: string; label: string }
  | { kind: 'text'; path: string; label: string; pattern: string }

export interface FieldGroup {
  legend: string
  hint?: string
  /** Buttons that set one field to a preset value, e.g. direction sets; a function is called on each click. */
  presets?: { label: string; path: string; value: unknown; /** hand-icons symbol, e.g. scatter-fill */ icon?: string }[]
  /** Show the group only when this holds for the edited style. */
  when?: (s: never) => boolean
  fields: Field[]
}

export const pct = (v: number) => `${Math.round(v * 100)}%`
export const plain = (v: number) => `${v}`
export const fixed = (n: number) => (v: number) => v.toFixed(n)

export function get(obj: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((o, k) => (o as Record<string, unknown>)?.[k], obj)
}

/** A copy of `obj` with `path` set to `value`. */
export function set<T>(obj: T, path: string, value: unknown): T {
  const copy = structuredClone(obj) as Record<string, unknown>
  const keys = path.split('.')
  let o = copy
  for (const k of keys.slice(0, -1)) o = o[k] as Record<string, unknown>
  o[keys[keys.length - 1]] = value
  return copy as T
}

/**
 * Build the fieldsets into `root`. `current` reads the style being edited and
 * `update` receives each edited copy. Returns a function that refreshes every
 * control from a style.
 */
export function buildFields<T>(
  root: HTMLElement,
  groups: FieldGroup[],
  idPrefix: string,
  current: () => T,
  update: (next: T) => void,
): (s: T) => void {
  const fills: ((s: T) => void)[] = []
  const change = (path: string, value: unknown) => update(set(current(), path, value))
  // Option and preset names from the tab's text file (texture.o.stamp …), else the value itself.
  const textKey = idPrefix === 'tex' ? 'texture' : idPrefix
  const optionText = (o: string | number) => tOr(`${textKey}.o.${o}`, String(o))

  for (const g of groups) {
    const fs = document.createElement('fieldset')
    const lg = document.createElement('legend')
    lg.textContent = g.legend
    fs.append(lg)
    if (g.hint) {
      const p = document.createElement('p')
      p.className = 'hint'
      p.textContent = g.hint
      fs.append(p)
    }
    if (g.presets) {
      const row = document.createElement('div')
      row.className = 'row'
      for (const p of g.presets) {
        const b = document.createElement('button')
        b.type = 'button'
        b.className = 'button small'
        b.textContent = tOr(`${textKey}.preset.${p.label.toLowerCase().replace(/\s+/g, '-')}`, p.label)
        if (p.icon) b.dataset.icon = p.icon
        b.addEventListener('click', () => change(p.path, typeof p.value === 'function' ? p.value() : p.value))
        row.append(b)
      }
      fs.append(row)
    }
    for (const f of g.fields) fs.append(fieldElement(f, `${idPrefix}-${f.path.replace(/\./g, '-')}`, change, fills, optionText))
    if (g.when) {
      const when = g.when as (s: T) => boolean
      fills.push((s) => (fs.hidden = !when(s)))
    }
    root.append(fs)
  }
  return (s) => fills.forEach((fill) => fill(s))
}

function fieldElement<T>(
  f: Field,
  id: string,
  change: (path: string, value: unknown) => void,
  fills: ((s: T) => void)[],
  optionText: (o: string | number) => string,
): HTMLElement {
  if (f.kind === 'multi') {
    const box = document.createElement('div')
    box.className = 'multi'
    box.setAttribute('role', 'group')
    box.setAttribute('aria-label', f.label)
    const checks = f.options.map((opt) => {
      const l = document.createElement('label')
      l.className = 'check'
      const c = document.createElement('input')
      c.type = 'checkbox'
      c.value = opt
      c.addEventListener('change', () => {
        const chosen = checks.filter((x) => x.checked).map((x) => x.value)
        // At least one must stay on.
        if (chosen.length === 0) c.checked = true
        else change(f.path, chosen)
      })
      l.append(c, ` ${optionText(opt)}`)
      box.append(l)
      return c
    })
    fills.push((s) => {
      const v = get(s, f.path) as string[]
      checks.forEach((c) => (c.checked = v.includes(c.value)))
    })
    return box
  }

  const label = document.createElement('label')
  label.className = f.kind === 'check' ? 'check' : f.kind === 'color' ? 'swatch' : f.kind === 'range' ? 'slider' : 'field'
  // A select shares everything used here (value, append, events) with an input.
  const input = document.createElement(f.kind === 'select' ? 'select' : 'input') as HTMLInputElement
  input.id = id

  if (f.kind === 'range') {
    const head = document.createElement('span')
    const out = document.createElement('output')
    head.append(f.label, out)
    input.type = 'range'
    input.min = String(f.min)
    input.max = String(f.max)
    input.step = String(f.step)
    input.addEventListener('input', () => change(f.path, Number(input.value)))
    fills.push((s) => {
      const v = get(s, f.path) as number
      input.value = String(v)
      out.textContent = f.fmt(v)
    })
    label.append(head, input)
  } else if (f.kind === 'check') {
    input.type = 'checkbox'
    input.addEventListener('change', () => change(f.path, input.checked))
    fills.push((s) => (input.checked = Boolean(get(s, f.path))))
    label.append(input, ` ${f.label}`)
  } else if (f.kind === 'select') {
    for (const o of f.options) input.append(new Option(optionText(o), String(o)))
    input.addEventListener('change', () => {
      change(f.path, typeof f.options[0] === 'number' ? Number(input.value) : input.value)
    })
    fills.push((s) => (input.value = String(get(s, f.path))))
    label.append(`${f.label} `, input)
  } else if (f.kind === 'color') {
    input.type = 'color'
    input.addEventListener('input', () => change(f.path, input.value))
    fills.push((s) => (input.value = String(get(s, f.path))))
    label.append(`${f.label} `, input)
  } else {
    input.type = 'text'
    input.pattern = f.pattern
    input.spellcheck = false
    let last = ''
    input.addEventListener('change', () => {
      if (input.checkValidity()) change(f.path, input.value)
      else input.value = last
    })
    fills.push((s) => (input.value = last = String(get(s, f.path))))
    label.append(`${f.label} `, input)
  }
  return label
}
