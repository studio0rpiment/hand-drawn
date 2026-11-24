# Texture

The words on the Texture tab: PBR maps (the surface, the seamless tile, each map, the files), and the printed looks (colour, size, the style settings, the print and export).

How to edit: change the words after a key; don't change the key in backticks, which ties the words to their place in the app. A long text may run on over several lines; a blank line ends it. {name} is filled in by the app (a number, a name). **bold**, *emphasis* and [a link](https://…) work. The screens show most words in lower case; write them in sentence case here.

## Settings

`texture.settings` Texture settings

## Steps

`texture.step-image` Adjust image
`texture.step-drawing` Adjust drawing
`texture.step-styles` Adjust styles
`texture.step-output` Output and system

## What the tab makes

`texture.g.make` Make
`texture.g.make.hint` PBR maps are the files a 3D material needs: base colour, height, normal, roughness and ambient occlusion. A printed look prints the drawing as stamp, risograph, halftone or ink.
`texture.f.make` Make
`texture.o.maps` PBR maps
`texture.o.print` A printed look

## Adjust drawing (maps)

`texture.g.surface` Surface
`texture.g.surface.hint` The maps are cut from the middle of the image, in the files' proportions. An evenly lit patch of surface works best.
`texture.f.surface-crop` Trim every edge
`texture.f.surface-seamless` Seamless tile
`texture.g.seams` Seams
`texture.g.seams.hint` The image is offset by half its width and height, so its edges meet in the middle; the seams there are covered with the image as it was. Shuffle moves the seams' ragged edge.
`texture.f.surface-seam` Blend width
`texture.f.surface-ragged` Ragged edge

## Maps

`texture.g.height` Height
`texture.g.height.hint` Every other map is worked out from the height. The ink scan suits drawings; brightness suits photos of a surface.
`texture.f.maps-height` Height from
`texture.o.ink-scan` the ink scan
`texture.o.brightness` brightness
`texture.f.maps-darkHigh` Dark parts stand high (off: they sit low)
`texture.f.maps-soften` Softness
`texture.f.maps-detail` Fine detail
`texture.g.normal` Normal
`texture.f.maps-depth` Depth
`texture.f.maps-normalY` Green channel
`texture.o.gl` up: OpenGL (Blender, Godot, Unity)
`texture.o.dx` down: DirectX (Unreal)
`texture.g.roughness` Roughness
`texture.g.roughness.hint` Worked out from brightness. Ink and graphite are often shinier than paper: move dark parts toward smoother.
`texture.f.maps-roughness` Roughness
`texture.f.maps-roughVary` Dark parts rougher (+) or smoother (−)
`texture.g.ao` Ambient occlusion
`texture.f.maps-ao` Strength
`texture.f.maps-aoReach` Reach
`texture.g.base` Base colour
`texture.f.maps-colour` Base colour from
`texture.o.photo` the photo
`texture.o.ink-on-paper` the ink and paper colours
`texture.f.maps-evenLight` Even out the light (photo)

## Map names

`texture.maps` Maps
`texture.map.base` Base colour
`texture.map.height` Height
`texture.map.normal` Normal
`texture.map.roughness` Roughness
`texture.map.ao` Ambient occlusion
`texture.tiled` Tiled, 3 × 3
`texture.tiled-show` Map tiled
`texture.lit` Lit sphere
`texture.lit.hint` The light follows the pointer.

## Files (maps)

`texture.files` Files
`texture.f.file-format` Format
`texture.f.file-quality` Quality
`texture.o.png` PNG
`texture.o.jpg` JPG
`texture.o.webp` WebP
`texture.dl-zip` Download all maps (zip)
`texture.kb` {n} KB
`texture.mb` {n} MB
`texture.sizes` {format}: {sizes} · all {total}
`texture.sizes-about` {format}, about: {sizes} · all {total}
`texture.map-stats` Preview {width} × {height} px · {ms} ms
`texture.out` Files at
`texture.out.ready` {width} × {height} · ready
`texture.out.quick` {width} × {height}
`texture.out.ask` {width} × {height} · made when asked
`texture.make` Make the {width} × {height} maps
`texture.making` Making the {width} × {height} maps
`texture.made` Made the {width} × {height} maps in {s} s
`texture.step.tile` Seamless tile
`texture.stop` Stop
`texture.stopped` Stopped; nothing was made.
`texture.saving` Saving {name}…
`texture.packing` Packing {name}…
`texture.saved` Saved {name}, {size}

## Upload and adjust image

`texture.upload` Upload a drawing (photo)
`texture.scan-colours` Texture in these colours (off: the style’s own)
`texture.sheet.hint` For a page of drawings: each one is found and numbered, row by row. Pick one in the tray under the image; that's the one printed. Small drawings found as one: lower the group marks limit.
`texture.presets` Preset styles

## Size

`texture.size` Size
`texture.preset` Preset
`texture.width` Width
`texture.height` Height
`texture.swap` Swap width and height
`texture.lock` Keep the proportions
`texture.fit` Single print: canvas fits the print instead
`texture.custom` Custom
`texture.fits` The canvas fits the print and its margin.
`texture.one-print` One print, centred
`texture.tile` A seamless tile
`texture.size-note` {what} · {inW} × {inH} in, {mmW} × {mmH} mm at {dpi} dpi

## Size presets

`texture.size-group.tiles` Square tiles
`texture.size-group.screens` Screens
`texture.size-group.print` Print at 300 dpi
`texture.size.square-512` 512 × 512
`texture.size.square-1024` 1024 × 1024
`texture.size.square-2048` 2048 × 2048
`texture.size.square-4096` 4096 × 4096
`texture.size.hd` HD 1920 × 1080
`texture.size.4k` 4K 3840 × 2160
`texture.size.post` Post 4:5, 1080 × 1350
`texture.size.story` Story 9:16, 1080 × 1920
`texture.size.banner` Banner 3:1, 1500 × 500
`texture.size.phone` Phone wallpaper, 1290 × 2796
`texture.size.a5` A5, 148 × 210 mm
`texture.size.a4` A4, 210 × 297 mm
`texture.size.letter` US Letter, 8.5 × 11 in
`texture.size.5x7` 5 × 7 in
`texture.size.8x10` 8 × 10 in
`texture.size.11x14` 11 × 14 in
`texture.size.12x12` 12 × 12 in

## Look

`texture.g.look` Look
`texture.f.look` Print as
`texture.f.seed` Variation
`texture.f.tone-black` Full ink at grey
`texture.f.tone-white` No ink at grey
`texture.f.tone-gamma` Tone curve
`texture.f.grain` Print grain
`texture.preset.shuffle` Shuffle

## Stamp

`texture.g.stamp` Stamp
`texture.f.stamp-bleed` Ink spread
`texture.f.stamp-rough` Ragged edge
`texture.f.stamp-roughSize` Edge wobble size
`texture.f.stamp-wear` Worn patches
`texture.f.stamp-wearSize` Patch size
`texture.f.stamp-pressure` Uneven pressure

## Risograph

`texture.g.risograph` Risograph
`texture.f.riso-second` Print a second drum
`texture.f.riso-offsetX` Misregister across
`texture.f.riso-offsetY` Misregister down

## Halftone

`texture.g.halftone` Halftone
`texture.f.halftone-shape` Screen
`texture.f.halftone-cell` Cell size
`texture.f.halftone-angle` Screen angle

## Colours

`texture.g.colours` Colours
`texture.f.colors-ink2` Second ink
`texture.f.colors-paperGrain` Paper texture

## Own colours

`texture.g.own-colours` Own colours
`texture.f.colors-ink` Ink
`texture.f.colors-paper` Paper
`texture.f.colors-onPaper` Print on paper (off: transparent)

## Layout

`texture.g.layout` Layout
`texture.f.layout-mode` Arrange
`texture.f.layout-scale` Print size
`texture.f.layout-jitter` Random turn
`texture.f.layout-margin` Margin (single)
`texture.f.layout-gap` Gap (grids)
`texture.f.layout-count` Prints (scatter)

## Option names

`texture.o.ink` ink
`texture.o.stamp` stamp
`texture.o.riso` riso
`texture.o.halftone` halftone
`texture.o.single` single
`texture.o.grid` grid
`texture.o.half-drop` half-drop
`texture.o.scatter` scatter
`texture.o.dot` dot
`texture.o.line` line

## Export

`texture.export` Export
`texture.dl-png` Download PNG
`texture.copy-css` Copy CSS

## Status

`texture.stats` {width} × {height} px · {prints}{seamless} · {ms} ms
`texture.prints` {n} prints
`texture.prints.one` 1 print
`texture.seamless` · tiles seamlessly

## The print

`texture.print` Print
`texture.repeat` Repeat, 2 × 2
