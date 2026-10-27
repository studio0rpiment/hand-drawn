// All the words on the screens, from the text files beside this one: one per
// tab, common.md for what every screen shares, and privacy.md for the policy page. The page's own text is
// filled in when it is built ({{key}} in index.html, see vite.config.ts);
// the scripts ask for theirs with t('key').

import common from './common.md?raw'
import font from './font.md?raw'
import icon from './icon.md?raw'
import logo from './logo.md?raw'
import privacy from './privacy.md?raw'
import scan from './scan.md?raw'
import texture from './texture.md?raw'
import { fill, parseText, toHtml } from './parse'

export const FILES = { common, scan, logo, icon, texture, font, privacy }

const TEXT: Record<string, string> = Object.assign({}, ...Object.values(FILES).map(parseText))

/** The words for a key, with {name} placeholders filled from `vars`. */
export function t(key: string, vars?: Record<string, string | number>): string {
  const text = TEXT[key]
  if (text === undefined) {
    console.warn(`No text for ${key}`)
    return key
  }
  return fill(text, vars)
}

/** The same, as HTML: escaped, with **bold** as <strong>. */
export const tHtml = (key: string, vars?: Record<string, string | number>) => toHtml(t(key, vars))

/** For a count: `key.one` when n is 1 (if the files have it), else `key`; {n} is filled with n. */
export function tn(key: string, n: number, vars: Record<string, string | number> = {}): string {
  return t(n === 1 && `${key}.one` in TEXT ? `${key}.one` : key, { n, ...vars })
}

/** Words for a key if the files have them, else `fallback` (for names that are also values, like a style's options). */
export const tOr = (key: string, fallback: string) => (key in TEXT ? TEXT[key] : fallback)
