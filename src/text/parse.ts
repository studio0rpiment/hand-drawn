// Reading the text files in src/text/: every line that starts with a key in
// backticks begins an entry, and the words after it (and on the lines that
// follow, up to a blank line or a heading) are its text. Everything else in
// the files (headings, notes) is for the person editing them.
//
//   `scan.detect` Find the sheet
//   `flag.scan` Where every drawing starts. A photo of a drawing on paper is
//   straightened, …
//
// A key on a line of its own takes the paragraph under it.

const ENTRY = /^`([a-zA-Z0-9][a-zA-Z0-9._-]*)`\s*(.*)$/

export function parseText(md: string): Record<string, string> {
  const out: Record<string, string> = {}
  let key: string | null = null
  let parts: string[] = []
  const end = () => {
    if (key !== null) out[key] = parts.join(' ').trim()
    key = null
    parts = []
  }
  for (const raw of md.split('\n')) {
    const line = raw.trim()
    const m = ENTRY.exec(line)
    if (m) {
      end()
      key = m[1]
      if (m[2]) parts.push(m[2])
    } else if (!line || line.startsWith('#')) {
      // A blank line ends an entry only once it has words; a key may sit on its own line above them.
      if (key !== null && (parts.length || line.startsWith('#'))) end()
    } else if (key !== null) parts.push(line)
  }
  end()
  return out
}

/** Fill {name} placeholders. */
export function fill(text: string, vars: Record<string, string | number> = {}): string {
  return text.replace(/\{(\w+)\}/g, (all, k: string) => (k in vars ? String(vars[k]) : all))
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/** Text as HTML: escaped, with **bold**, *emphasis* and [links](https://…) made into their tags. */
export function toHtml(text: string): string {
  return esc(text)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/\[([^\]]+)\]\(((?:https?:|mailto:|\.\/)[^)\s]*)\)/g, '<a href="$2">$1</a>')
}
