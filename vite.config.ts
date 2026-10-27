import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { defineConfig, type Plugin } from 'vite'
import { parseText, toHtml } from './src/text/parse'

const TEXT_DIR = join(__dirname, 'src/text')

/**
 * The pages' words come from the text files in src/text/: each {{key}} in an
 * HTML page is replaced with that key's words when the page is served or
 * built. A key with no words stops the build, so nothing ships half-written.
 */
function textFiles(): Plugin {
  const load = () =>
    Object.assign(
      {},
      ...readdirSync(TEXT_DIR)
        .filter((f) => f.endsWith('.md'))
        .map((f) => parseText(readFileSync(join(TEXT_DIR, f), 'utf8'))),
    ) as Record<string, string>
  return {
    name: 'hand-drawn-text',
    transformIndexHtml(html) {
      const text = load()
      return html.replace(/\{\{([a-zA-Z0-9][a-zA-Z0-9._-]*)\}\}/g, (_, key: string) => {
        if (!(key in text)) throw new Error(`No text for {{${key}}} in src/text/*.md`)
        return toHtml(text[key])
      })
    },
    // Editing a text file reloads the page, so the change shows at once.
    configureServer(server) {
      server.watcher.add(TEXT_DIR)
      server.watcher.on('change', (file) => {
        if (file.startsWith(TEXT_DIR) && file.endsWith('.md')) server.ws.send({ type: 'full-reload' })
      })
    },
  }
}

export default defineConfig({
  plugins: [textFiles()],
  // The potrace port ships its own WebAssembly; pre-bundling it breaks the wasm lookup.
  optimizeDeps: { exclude: ['esm-potrace-wasm'] },
  server: { port: 5188 },
  // Two pages: the app and its privacy policy.
  build: { rollupOptions: { input: { main: 'index.html', privacy: 'privacy.html' } } },
})
