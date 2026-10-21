# Sketch to Mark

Turn a phone photo of a hand drawing into clean design files. Runs entirely in
the browser; nothing is uploaded.

```bash
pnpm install
pnpm dev      # http://localhost:5188
pnpm test
```

## How it works

1. **Paper** — finds the sheet in the photo (the largest bright region, grown
   into shadowed parts) and straightens it. Drag the four corners to correct it;
   arrow keys nudge a focused corner (Shift for bigger steps).
2. **Ink** — evens out the light by dividing by an estimate of the bare paper,
   picks an ink cut-off (Otsu), trims the edges, removes specks and fills
   pinholes, adjusts line weight and crops to the drawing.
3. **Vector** — traces the ink with potrace and exports an SVG in plain pixel
   coordinates, a single evenodd path, in any ink colour, with or without a
   background. A transparent PNG of the cleaned ink is exported too.

The code is split so the image processing (`src/image.ts`, `src/paper.ts`,
`src/clean.ts`, `src/svgpath.ts`) has no DOM and is unit tested; `src/main.ts`
is the UI.

## Photos

- Work size is capped at 2400 px on the long side.
- iPhone HEIC photos open in Safari. In Chrome, export them as JPEG first, or
  set the camera to "Most Compatible".
- Best results: daylight, the whole sheet in frame, a darker surface under it.

## Roadmap

- [x] Stage 1: photo cleanup and SVG logo trace
- [ ] Icon and favicon set (16–512 px, `.ico`, Apple and Android icons, manifest)
- [ ] Texture and stamp art (keep the grain; stamp, risograph, halftone)
- [ ] Font from a drawn letter sheet

## Licence note

Tracing uses [esm-potrace-wasm](https://github.com/tomayac/esm-potrace-wasm),
a build of potrace, which is GPL-2.0. That's fine for using this tool; if it is
ever distributed, it has to be under GPL-compatible terms. The SVGs it produces
are yours.
