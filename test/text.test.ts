import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { fill, parseText, toHtml } from '../src/text/parse'
import { FILES } from '../src/text'

const root = join(__dirname, '..')
const read = (p: string) => readFileSync(join(root, p), 'utf8')
const TEXT: Record<string, string> = Object.assign({}, ...Object.values(FILES).map(parseText))

/** Every .ts file under src/. */
function sources(dir = 'src'): string[] {
  return readdirSync(join(root, dir), { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? sources(`${dir}/${e.name}`) : e.name.endsWith('.ts') ? [`${dir}/${e.name}`] : [],
  )
}

describe('the text files', () => {
  it('read keys, run-on lines and placeholders', () => {
    const t = parseText('# Title\n\nA note.\n\n`a.b` One\n`a.c` Two\nand more\n\n`a.d`\nUnder its key.\n')
    expect(t).toEqual({ 'a.b': 'One', 'a.c': 'Two and more', 'a.d': 'Under its key.' })
    expect(fill('{n} of {total}', { n: 2, total: 5 })).toBe('2 of 5')
    expect(toHtml('**No** *cookies* <b> [here](https://x.org)')).toBe(
      '<strong>No</strong> <em>cookies</em> &lt;b&gt; <a href="https://x.org">here</a>',
    )
  })

  it('give each key once', () => {
    const seen = new Map<string, string>()
    for (const [file, md] of Object.entries(FILES)) {
      for (const key of Object.keys(parseText(md))) {
        expect(seen.get(key), `${key} is in both ${seen.get(key)}.md and ${file}.md`).toBeUndefined()
        seen.set(key, file)
      }
    }
  })

  it('have words for every {{key}} in the pages, and the pages hold no loose text', () => {
    for (const page of ['index.html', 'privacy.html']) {
      const html = read(page)
      for (const [, key] of html.matchAll(/\{\{([a-zA-Z0-9][a-zA-Z0-9._-]*)\}\}/g)) expect(TEXT[key], `${page}: ${key}`).toBeDefined()
      const body = html.replace(/<script[\s\S]*?<\/script>|<!--[\s\S]*?-->/g, '')
      const loose = [...body.matchAll(/>([^<>]*[A-Za-z]{2,}[^<>]*)</g)].map((m) => m.at(1)!.trim()).filter((s) => s && !/^\{\{[^}]+\}\}$/.test(s))
      expect(loose, page).toEqual([])
      expect([...body.matchAll(/(?:aria-label|title|alt|placeholder|content)="([^"{]*[A-Za-z][^"]*)"/g)].map((m) => m[1]).filter((v) => !/width=device-width/.test(v))).toEqual([])
    }
  })

  it('have words for every key the scripts ask for', () => {
    // src/text/ is the lookup itself; its comments show t('key') as an example.
    for (const file of sources().filter((f) => !f.startsWith('src/text/'))) {
      const code = read(file)
      for (const [, key] of code.matchAll(/\b(?:t|tHtml|tn)\('([a-zA-Z0-9][a-zA-Z0-9._-]*)'/g)) expect(TEXT[key], `${file}: ${key}`).toBeDefined()
    }
  })

  it('have words for the keys the scripts build from names', () => {
    const want = [
      ...['tl', 'tr', 'br', 'bl'].map((c) => `scan.corner-${c}`),
      'icon.light',
      'icon.dark',
      ...['acute', 'grave', 'circumflex', 'dieresis', 'tilde', 'cedilla', 'ring'].map((m) => `font.mark.${m}`),
      ...[1, 2, 3].map((n) => `font.sheet-note-${n}`),
      ...['tiles', 'screens', 'print'].map((g) => `texture.size-group.${g}`),
      ...['square-512', 'square-1024', 'square-2048', 'square-4096', 'hd', '4k', 'post', 'story', 'banner', 'phone'].map((s) => `texture.size.${s}`),
      ...['a5', 'a4', 'letter', '5x7', '8x10', '11x14', '12x12'].map((s) => `texture.size.${s}`),
      ...['scan', 'logo', 'icon', 'texture', 'font'].flatMap((tab) => [`flag.tab.${tab}`, `flag.tab.${tab}.title`]),
      ...['consent', 'icon', 'icon-current', 'texture', 'texture-current', 'font', 'font-current'].map((s) => `privacy.store-${s}`),
    ]
    for (const key of want) expect(TEXT[key], key).toBeDefined()
  })
})
