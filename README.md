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
4. **Icon** — the second tab turns the cleaned ink into an icon family under a
   *style* (see below): line, fill and tint variants, rotations and mirrors,
   an optional container, light and dark colours, favicons and a sprite.

The code is split so the image processing (`src/image.ts`, `src/paper.ts`,
`src/clean.ts`, `src/svgpath.ts`, and in `src/icon/` everything but `ui.ts`
and `pack.ts`) has no DOM and is unit tested; `src/main.ts` and
`src/icon/ui.ts` are the UI.

## Icon styles

A style is every choice that makes a set of icons one family, kept as plain
JSON. The built-in **hand-icons** style uses the constants from the
`hand-icons` repo's build scripts: 1024 canvas, 12% clear space (16% when the
set includes 45° turns), line width 6, gaps up to 41 bridged before closed
shapes are filled, trace settings turdsize 8 / alphamax 0.8 / opttolerance 0.2,
black on white and white on black, sprite ids `hi-<name>-<variant>[-<dir>]` in
`currentColor`.

What a style varies:

| | Settings |
| --- | --- |
| Shape | clear space (plain and for 45° turns), fill closed shapes, gap bridging, pinhole filling, trace smoothness / simplify / speck size, canvas size |
| Variants | line (stroked outline of the ink), fill (solid), tint (solid at an opacity behind the ink); line width; tint strength |
| Orientation | base, r45, r90, r135, r180, r270, mh, mv, mhv; presets by symmetry (rotate, rotate45, mirror) |
| Container | none, circle, square, rounded (corner radius), squircle; clear space is measured inside it |
| Colours | ink and background, light and dark |
| Favicon and sprite | favicon variant, variant at 48 px and under, sprite id prefix |

Edit any setting, then **Save as…** to keep it as a named style (stored in this
browser), or **Export style** to a `.style.json` file and **Import style** on
another machine. Every icon pack also carries the `style.json` it was made with.

One difference from hand-icons: "fill closed shapes" only fills an enclosed
space with nothing else drawn in it, so a ring around a note stays a ring.

### The icon pack

```
<name>-icons/
  favicon/   favicon.svg (switches light/dark), favicon.ico (16, 32, 48),
             apple-touch-icon.png, icon-192.png, icon-512.png,
             icon-maskable-512.png, site.webmanifest, head.html
  svg/<variant>/<name>[-<dir>].svg              currentColor
  png/<variant>-<light|dark>/<name>[-<dir>]-<512|128>.png
  sprite/<name>.svg, sprite/<name>.json          hand-icons symbols + manifest entry
  style.json
```

## Photos

- Work size is capped at 2400 px on the long side.
- iPhone HEIC photos open in Safari. In Chrome, export them as JPEG first, or
  set the camera to "Most Compatible".
- Best results: daylight, the whole sheet in frame, a darker surface under it.

## Roadmap

- [x] Stage 1: photo cleanup and SVG logo trace
- [x] Stage 2: icon family and favicon set, driven by saved styles
- [ ] Texture and stamp art (keep the grain; stamp, risograph, halftone)
- [ ] Font from a drawn letter sheet

## Licence note

Tracing uses [esm-potrace-wasm](https://github.com/tomayac/esm-potrace-wasm),
a build of potrace, which is GPL-2.0. That's fine for using this tool; if it is
ever distributed, it has to be under GPL-compatible terms. The SVGs it produces
are yours.
