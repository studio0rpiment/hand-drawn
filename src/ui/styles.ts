// Named styles for one tool: built-ins, styles saved in this browser, and the
// one being edited. Plus the Style box that picks, saves, exports and imports them.
// Nothing reaches browser storage unless the person allowed it (see consent.ts);
// until then styles live in this page only.

import { t, tHtml } from '../text'
import { slug } from '../icon/style'
import { onStorageChange, storageAllowed } from './consent'

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
  if (!storageAllowed()) return
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // Private windows and full storage: styles still work for this visit.
  }
}

function load(key: string): unknown {
  if (!storageAllowed()) return null
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
  /** Called after styles kept in storage were brought back, so the controls can refresh. */
  onRestore: (() => void) | null = null

  constructor(readonly kind: StyleKind<T>) {
    this.saved = []
    this.picked = kind.builtIn[0]
    this.current = kind.builtIn[0]
    this.restore()
    // Allowed later: bring back what was kept before, then keep what was made in this page too.
    onStorageChange((allowed) => {
      if (!allowed) return
      const made = this.saved
      const edited = { picked: this.picked, current: this.current }
      this.restore()
      this.saved = [...this.saved.filter((s) => !made.some((m) => m.name === s.name)), ...made]
      if (made.length || JSON.stringify(edited.current) !== JSON.stringify(this.kind.builtIn[0])) {
        this.picked = edited.picked
        this.current = edited.current
      }
      store(this.kind.key, this.saved)
      store(`${this.kind.key}.current`, { picked: this.picked.name, style: this.current })
      this.onRestore?.()
    })
  }

  /** Read what this browser kept, if it allowed keeping anything. */
  private restore() {
    const raw = load(this.kind.key)
    this.saved = Array.isArray(raw) ? raw.map((s) => this.kind.read(s)) : []
    const cur = load(`${this.kind.key}.current`) as { picked?: string; style?: unknown } | null
    if (cur?.style) {
      this.current = this.kind.read(cur.style)
      this.picked = this.all().find((s) => s.name === cur.picked) ?? this.kind.builtIn[0]
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
    <legend>${tHtml('common.style')}</legend>
    <div class="row">
      <select aria-label="${tHtml('common.style')}" class="style-pick"></select>
      <button class="button small" type="button" data-act="save" data-icon="cross-fill">${tHtml('common.style-save')}</button>
      <button class="button small" type="button" data-act="delete" data-icon="big-x-fill">${tHtml('common.style-delete')}</button>
    </div>
    <div class="row">
      <button class="button small" type="button" data-act="export" data-icon="arrow-bar-fill-r90">${tHtml('common.style-export')}</button>
      <label class="button small" data-icon="arrow-bar-fill-r270">${tHtml('common.style-import')} <input type="file" accept="application/json,.json" hidden /></label>
      <button class="button small" type="button" data-act="reset" data-icon="c-spiral-fill">${tHtml('common.style-reset')}</button>
    </div>
    <p class="hint" aria-live="polite"></p>`
  const pick = fs.querySelector('select')!
  const del = fs.querySelector<HTMLButtonElement>('[data-act="delete"]')!
  const hint = fs.querySelector('.hint')!
  const file = fs.querySelector<HTMLInputElement>('input[type="file"]')!

  const refresh = () => {
    pick.replaceChildren(
      ...book.all().map((s) => new Option(book.isBuiltIn(s.name) ? t('common.style-built-in', { name: s.name }) : s.name, s.name)),
    )
    pick.value = book.picked.name
    del.disabled = book.isBuiltIn(book.picked.name)
    hint.textContent = book.changed() ? t('common.style-changed', { name: book.picked.name }) : ''
  }
  const after = () => {
    refresh()
    changed()
  }
  book.onRestore = after

  pick.addEventListener('change', () => {
    const s = book.all().find((x) => x.name === pick.value)
    if (s) {
      book.choose(s)
      after()
    }
  })
  fs.querySelector('[data-act="save"]')!.addEventListener('click', () => {
    const suggestion = book.isBuiltIn(book.picked.name) ? t('common.style-variant', { name: book.picked.name }) : book.picked.name
    const name = prompt(t('common.style-name', { kind: book.kind.noun }), suggestion)?.trim().slice(0, 60)
    if (!name) return
    if (book.isBuiltIn(name)) return alert(t('common.style-taken'))
    if (book.saved.some((s) => s.name === name) && !confirm(t('common.style-replace', { name }))) return
    book.saveAs(name)
    after()
  })
  del.addEventListener('click', () => {
    const name = book.picked.name
    if (book.isBuiltIn(name) || !confirm(t('common.style-delete-ask', { name }))) return
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
      return alert(t('common.style-not-json'))
    }
    book.add(raw)
    after()
  })
  return { element: fs, refresh }
}
