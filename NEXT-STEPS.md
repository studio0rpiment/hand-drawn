# Next steps

Planned changes to Hand Drawn. Nothing here is started unless it says so.
Newest decisions first.

## 1. Three tabs: Icons, Fonts, Textures (2026-11-13)

Hand Drawn narrows to three tabs, each a generator with its own scan step,
the way the Font tab already works.

**Done (2026-11-13, branch `icons-tab`):** Scan and Logo are removed; a
landing page ("Hand Drawn", and create an icon pack, a texture or a font)
comes first. Icon and Texture each have the scan step (`src/ui/scan-step.ts`)
with Scan's globes (not paper colour); Icon has Logo's fine tuning, the Tune
globe and the plain SVG/PNG downloads; Font reads its own photos and splits a
page that isn't a letter sheet into freehand drawings. Still to do here: the
tab names (Icons, Textures, Fonts), the Textures rebuild, layered icons.

| Today | Planned |
|---|---|
| Scan | moves into each generator tab as its first step |
| Logo | removed; the controls that matter move to Icons |
| Icon | becomes **Icons** |
| Texture | becomes **Textures**, rebuilt (below) |
| Font | **Fonts**, unchanged; it is the model for the others |

### Icons

One flow, top to bottom, like Fonts: upload image → adjust image → adjust
drawing → adjust styles → output and system. The "system" area holds the
preset controls (save, delete, export, import, reset) at the bottom with the
downloads.

- Scan's controls (paper corners, ink, colour, sheet of drawings) become the
  "adjust image" step.
- From Logo, keep: fine tuning (rotate, line spread, ignore spots under a
  size, square artboard) and the plain SVG and PNG downloads of the traced
  mark. *To decide: which Logo controls go and which stay.*
- Picking a drawing from a sheet happens inside the tab (the tray), not in a
  separate Scan tab.
- Layered icons are built here (section 2).

### Textures

A plain JPG or PNG already works as a texture, so Textures only earns its
place by doing what an image can't do on its own:

1. **PBR maps from an image.** From one photo or drawing, make the maps a 3D
   material needs: height (displacement), normal, roughness and ambient
   occlusion, with base colour from the image. Cropping works differently
   here than for icons: a square, evenly lit patch of surface rather than a
   single drawing.
2. **Seamless tile.** Make any image repeat without visible seams, by the
   same steps as by hand in Photoshop:
   1. crop to remove the edges;
   2. offset by 50% horizontally and vertically, with wrap-around, so the
      edges meet in the middle and the seams show;
   3. paint over the seams in the middle from the surrounding detail (the
      Clone Stamp step), done automatically by blending or filling.
   Show the result tiled 3 × 3 so seams are easy to spot.
3. **File size and converter.** Output size in pixels, format (PNG, JPG,
   WebP, maybe KTX2 for 3D), quality, and the file size it will come out at.
4. **Today's printed looks** (stamp, risograph, halftone, ink) may stay as an
   option on a seamless tile, or go. *To decide.*

Reference for the kind of tool: <https://www.playtex.ai/image-to-texture-generator>
(image to seamless PBR texture set).

**Do PBR and seamless tiles need a trained model?** Not for a first version:

- **Height:** Depth Anything V2 Small already runs in the browser through
  onnxruntime-web (Variable Machine's image segmentation tab uses it), and
  the ink scan itself is a usable height for drawings.
- **Normal:** computed from height (slope in x and y). No model.
- **Roughness and ambient occlusion:** estimated from height and brightness.
  No model.
- **Seamless:** offset and blend, as above. No model.

A small trained model would help with photos where light and shadow fool the
estimates (baked-in shadows read as height), or to fill seams with believable
detail instead of a blend. Variable Machine (`~/__DEV/retension`) trains
language models, a model that sees (SmolVLM) and gestures, and runs
ready-made image models in the page, but it doesn't train an image-to-image
model yet. Training one (for example a small U-Net: photo in, height or
normal map out, exported to ONNX for the browser) would be a new path in
Variable Machine. Try the no-model version first and train only if it falls
short.

## 2. Layered icons (2026-11-13)

A layered icon is drawn as separate parts and put together by code. The first
one is the viewport icon for a link map:

- **Page:** outline, nav, image boxes with a hill, text lines.
- **Viewport frame:** phone, band or corners. It magnifies the page under it.
- **Link:** a button pill or an underline, in a link colour (coral #D85A30
  by default).

The parts are traced from sheet 1 of the hand-icons trace sheets
(`~/__DEV/hand-icons-repo/build/guides/icon-sheets.pdf`, made by
`build/guides/icon-sheet.py`, which also holds the composing maths as
`page_body`, `frame`, `link` and `composed`). The page and the link are drawn
at 2× and the frame at 1×, each at its place on the 24-unit grid, so they line
up when layered.

**In the Icons tab:** a **Layered** mode next to Single.

- The sheet tray tags each drawing with a role (page, phone, band, corners,
  link).
- **Layers:** Page, Viewport and Link each set to a drawing from the tray,
  plus the link colour. Parts are traced in the current style and keep their
  grid position; they aren't centred one by one.
- **Placement:** link on page (snaps to a text line, which the link covers),
  viewport on page, magnify 1.0–1.6, viewport follows link, fade page outside
  (0.35; the link stays full colour).
- **Composing:** the page and link are clipped outside the frame and drawn
  again inside its window, scaled around the link's y (or the viewport's y
  if it is more than 4 units away), with the stroke divided by the
  magnification. The frame goes on top.
- **Previews:** large, dark, 32 px and 16 px.

**The pack contains the composing script.** The icon is rendered later, when
it's used, from data (where the link sits on the page):

```
viewport-icons/
  sprite/viewport.svg   the parts as symbols: hi-viewport-page,
                        hi-viewport-phone (or band, corners), hi-viewport-link
  compose.js            compose({ link, viewport, frame, ... }) → SVG
  svg/                  a fixed top, middle and bottom set, for places
                        where no script can run
  style.json
```

`compose.js` is plain JavaScript with no dependencies. It runs in a browser
or in a site build. It holds no drawing, only placement, clipping, magnifying,
fade and colour, so it's the same file for every layered icon. Later,
hand-icons may carry `hi-viewport` as three parts plus `compose` in `dist/`.

## 3. Earlier items

- **Pick a drawing inside the generator tabs** (2026-10-27). Today the picker
  is only in Scan. Covered by section 1, since Scan moves into each tab.
- **Texture "material" output** (2026-10-24): exaggerated ink height as
  displacement, normal, roughness and AO maps; imprinting a drawing (a letter
  C, say) into other 3D surfaces; experimental algorithmic shaders and maps.
  Folds into the PBR maps in section 1.
- Done: the image window keeps its size while size settings are adjusted
  (2026-10-27).

## Design rules to carry over (Font tab, as of 2026-11-02)

- Yellow: primary actions and selectable choices.
- Dashed silver outline, no fill: secondary buttons.
- Silver: a choice still shown that no longer holds (a changed preset).
- Labels in white.
- Template and upload in one yellow dashed box above the preview; an empty
  result area is a yellow dashed box labelled in silver.
