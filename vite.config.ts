import { defineConfig } from 'vite'

export default defineConfig({
  // The potrace port ships its own WebAssembly; pre-bundling it breaks the wasm lookup.
  optimizeDeps: { exclude: ['esm-potrace-wasm'] },
  server: { port: 5188 },
  // Two pages: the app and its privacy policy.
  build: { rollupOptions: { input: { main: 'index.html', privacy: 'privacy.html' } } },
})
