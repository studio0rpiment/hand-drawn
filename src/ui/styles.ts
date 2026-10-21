// Named styles for one tool: built-ins, styles saved in this browser, and the
// one being edited. Plus the Style box that picks, saves, exports and imports them.

import { slug } from '../icon/style'

export interface Named {
  name: string
}

export interface StyleKind<T extends Named> {
  /** Shown in prompts: "icon", "texture". */
  noun: string
  /** localStorage key prefix; saved styles live under `<key>`, the edited one under `<key>.current`. */
  key: string
  builtIn: T[]
  /** Read untrusted JSON into a valid style, falling back to `base`. */
  read: (raw: unknown, base?: T) => T
}

function store(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // Private windows and full storage: styles still work for this visit.
  }
}

function load(key: string): unknown {
  try {
    return JSON.parse(localStorage.getItem(key) ?? 'null')
  } catch {
    return null
  }
}

export class StyleBook<T extends Named> {
  saved: T[]
  /** The built-in or saved style the edits started from. */
  picked: T
  /** The style being edited. */
  current: T

  constructor(readonly kind: StyleKind<T>) {
    const raw = load(kind.key)
    this.saved = Array.isArray(raw) ? raw.map((s) => kind.read(s)) : []
    this.picked = kind.builtIn[0]
    this.current = kind.builtIn[0]
    const cur = load(`${kind.key}.current`) as { picked?: string; style?: unknown } | null
    if (cur?.style) {
      this.current = kind.read(cur.style)
      this.picked = this.all().find((s) => s.name === cur.picked) ?? kind.builtIn[0]
    }
  }

  all(): T[] {
    return [...this.kind.builtIn, ...this.saved]
  }

  isBuiltIn(name: string): boolean {
    return this.kind.builtIn.some((s) => s.name === name)
  }

  /** Has the edited style drifted from the one it was picked from? */
  changed(): boolean {
    return JSON.stringify({ ...this.current, name: this.picked.name }) !== JSON.stringify(this.picked)
  }

  edit(next: T) {
    this.current = this.kind.read(next, this.current)
    store(`${this.kind.key}.current`, { picked: this.picked.name, style: this.current })
  }

  choose(s: T) {
    this.picked = s
    this.edit(s)
  }

  /** Save the edited style under a name, replacing a saved one of that name. */
  saveAs(name: string): T {
    const s = this.kind.read({ ...this.current, name })
    this.saved = [...this.saved.filter((x) => x.name !== name), s]
    store(this.kind.key, this.saved)
    this.choose(s)
    return s
  }

  remove(name: string) {
    this.saved = this.saved.filter((s) => s.name !== name)
    store(this.kind.key, this.saved)
    if (this.picked.name === name) this.choose(this.kind.builtIn[0])
  }

  /** Add an imported style, renaming it if the name is taken. */
  add(raw: unknown): T {
    const s = this.kind.read(raw)
    let name = s.name
    for (let n = 2; this.all().some((x) => x.name === name); n++) name = `${s.name} ${n}`
    const added = { ...s, name }
    this.saved = [...this.saved, added]
    store(this.kind.key, this.saved)
    this.choose(added)
    return added
  }

  /** The edited style under the name it was picked as, for exports. */
  named(): T {
    return { ...this.current, name: this.picked.name }
  }
}

function download(blob: Blob, filename: string) {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = filename
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 1000)
}

/**
 * The Style fieldset: pick a style, save, delete, export, import, reset.
 * `changed` runs after anything replaces the edited style. Returns a refresh function.
 */
export function styleBox<T extends Named>(book: StyleBook<T>, changed: () => void): { element: HTMLElement; refresh: () => void } {
  const fs = document.createElement('fieldset')
  fs.innerHTML = `
    <legend>Style</legend>
    <div class="row">
      <select aria-label="Style" class="style-pick"></select>
      <button class="button small" type="button" data-act="save" data-icon="cross-fill">Save as…</button>
      <button class="button small" type="button" data-act="delete" data-icon="big-x-fill">Delete</button>
    </div>
    <div class="row">
      <button class="button small" type="button" data-act="export" data-icon="arrow-bar-fill-r90">Export style</button>
      <label class="button small" data-icon="arrow-bar-fill-r270">Import style <input type="file" accept="application/json,.json" hidden /></label>
      <button class="button small" type="button" data-act="reset" data-icon="c-spiral-fill">Reset</button>
    </div>
    <p class="hint" aria-live="polite"></p>`
  const pick = fs.querySelector('select')!
  const del = fs.querySelector<HTMLButtonElement>('[data-act="delete"]')!
  const hint = fs.querySelector('.hint')!
  const file = fs.querySelector<HTMLInputElement>('input[type="file"]')!

  const refresh = () => {
    pick.replaceChildren(
      ...book.all().map((s) => new Option(book.isBuiltIn(s.name) ? `${s.name} (built in)` : s.name, s.name)),
    )
    pick.value = book.picked.name
    del.disabled = book.isBuiltIn(book.picked.name)
    hint.textContent = book.changed() ? `Changed from “${book.picked.name}”. Save as… to keep it.` : ''
  }
  const after = () => {
    refresh()
    changed()
  }

  pick.addEventListener('change', () => {
    const s = book.all().find((x) => x.name === pick.value)
    if (s) {
      book.choose(s)
      after()
    }
  })
  fs.querySelector('[data-act="save"]')!.addEventListener('click', () => {
    const suggestion = book.isBuiltIn(book.picked.name) ? `${book.picked.name} variant` : book.picked.name
    const name = prompt(`Name for this ${book.kind.noun} style`, suggestion)?.trim().slice(0, 60)
    if (!name) return
    if (book.isBuiltIn(name)) return alert('That name belongs to a built-in style. Pick another.')
    if (book.saved.some((s) => s.name === name) && !confirm(`Replace the saved style “${name}”?`)) return
    book.saveAs(name)
    after()
  })
  del.addEventListener('click', () => {
    const name = book.picked.name
    if (book.isBuiltIn(name) || !confirm(`Delete the saved style “${name}”?`)) return
    book.remove(name)
    after()
  })
  fs.querySelector('[data-act="reset"]')!.addEventListener('click', () => {
    book.choose(book.picked)
    after()
  })
  fs.querySelector('[data-act="export"]')!.addEventListener('click', () => {
    const s = book.named()
    download(new Blob([JSON.stringify(s, null, 2) + '\n'], { type: 'application/json' }), `${slug(s.name)}.${book.kind.noun}-style.json`)
  })
  file.addEventListener('change', async () => {
    const f = file.files?.[0]
    file.value = ''
    if (!f) return
    let raw: unknown
    try {
      raw = JSON.parse(await f.text())
    } catch {
      return alert('That file isn’t a style (it isn’t JSON).')
    }
    book.add(raw)
    after()
  })
  return { element: fs, refresh }
}
