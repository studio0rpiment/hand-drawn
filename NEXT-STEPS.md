# Next steps: Hand Drawn

<!-- This layout is fixed: Kevin's dashboard reads it by rule (2026-11-17). Keep the section names and their order.
An entry is a list line that opens with its title in bold, then one or two sentences. Decisions and tasks that are
Kevin's go in the first two sections. Keep a title word for word until the step itself changes; delete a finished
entry. "Build next" is in order and the dashboard shows its first seven. An entry for another site adds
"(site: name)" after its title. No student names or other private names above Notes. Notes may take any shape.
The rule in full: ~/__DEV/__dashboard/coordinator/nextsteps.ts -->

Site: hand-drawn
Written: 2026-11-17
Stands: three tabs (Icons, Textures, Fonts) are deployed to handdrawn.orpiment.studio; Textures and layered icons are still to build.

## Kevin's decisions

- **Which Logo controls stay.** Kept so far: rotate, line spread, ignore spots, square artboard. Paper colour/hue was left out on purpose.
- **Sketches tab proposal.** Approve or change the proposed Sketches tab (output kinds, collections, downloads) and answer its open questions. Details in Notes, section 4.

## Kevin's tasks

- **Click through the live site.** The landing page, the Texture tab and the Font tab; most testing so far was on the Icon tab.
- **Merge pull request 1.** studio0rpiment/hand-drawn#1 (the globe fix, `icons-tab` → `main`) is open; merging it only brings GitHub's `main` up to date with the deployed code.

## Build next

1. **Rename the tabs Icons, Textures, Fonts.** The words are in `src/text/common.md`.
2. **Rebuild Textures.** PBR maps from an image, a seamless tile, and a file size and format converter; today's printed looks may stay. No trained model is needed for a first version. Details in Notes, section 1.
3. **Layered icons.** A Layered mode in the Icons tab: page, viewport frame and link, each set to a drawing from the tray. Details in Notes, section 2.

## Waiting on others

## Known problems

## Later

- **Height and normal model in Variable Machine.** A small U-Net (sketch or photo in, height and normal maps out), exported to ONNX and shipped with the site, so nothing leaves the browser. It feeds Textures and the 3D downloads. Details in Notes, section 1.
- **3D downloads from drawings.** Extruded, relief and inflated shapes as GLB (and STL), made in the browser; whole objects through a hosted image-to-3D model only later. Details in Notes, section 1.

- **Texture "material" output.** Exaggerated ink height as displacement, normal, roughness and AO maps; imprinting a drawing into other 3D surfaces; experimental shaders. Folds into the PBR maps.

## Notes

Planned changes to Hand Drawn. Nothing here is started unless it says so.
Newest decisions first.

### 4. Sketches tab (proposal, 2026-11-17)

A fourth tab, **Sketches**, transfers a sketch at high fidelity instead of
reducing it to an icon. Iterations of one idea stay together as a
**collection**. Proposal only: nothing is built. UI words below are as they
would appear (the screens show them in lower case); they would go in a new
`src/text/sketch.md`.

**Tab and landing page.** Tab label "Sketches" (plural, with the planned
Icons, Textures, Fonts). Landing line: "Create an icon pack, a texture, a
font or a sketch collection from your own drawings." Tab flag: "A photo of a
sketch transferred as it was drawn, or as a clean line drawing, a schematic
or tones. Iterations of one idea are kept together as a collection, compared
side by side and downloaded as one."

**Layout.** The same as Icon: controls on the left by step, previews on the
right. Right column, top to bottom: the upload box (yellow dashed), Image,
Sketch, Collection, Compare. Empty panes are yellow dashed boxes labelled in
silver.

#### Upload (the yellow dashed box, via the scan step's `setup` and `after` slots)

- **Collection** (select of the collections kept in this browser) and a
  **New collection** button (secondary).
- **Collection name** (text). Names the downloads; defaults to the first
  photo's name.
- **Sketch sheet to print** (fold toggle, like Icon template sheet to print)
  and **Drawn on the sketch sheet** (checkbox). The sheet is one large frame
  with the four corner squares of the icon template, in A4 portrait, A4
  landscape and square, plus a line for collection, number and date. Corner
  squares make the flattening exact, which is what fidelity and lining up
  iterations need. Optional: any paper works.
- **Upload sketches (photos)** (primary), with the count beside it ("12").
  Several photos may be chosen at once; each adds a sketch to the
  collection, loaded one at a time as Icon does. **Remove photo**
  (secondary) removes the active sketch.
- Under the button: a chip per sketch, "{n} · {name}" (Icon's image chips),
  to switch the active sketch.

#### Adjust image (shared scan step, unchanged apart from two defaults)

Paper, Ink, Colour, Several drawings on this sheet. Defaults change for
sketches: Several drawings on this sheet reads **Several sketches on this
sheet** here and starts **off** (a sketch often
has separate strokes that must not be split), and **Ignore spots under**
starts lower (4 px instead of 40 px), so fine hatching and dots survive.
New in Ink: **Keep pencil tones** (on by default here): the ink keeps its
grey levels as transparency instead of being cut to black and white. Only
As drawn and Tones use the tones.

#### Adjust drawing (for the active sketch only)

- **Fine tuning** (from Icon): **Rotate**, **Line spread**, plus
  **Margin** (space around the drawing, % of its size).
- **Marks:** **Pick marks to leave out** (secondary; then each tap on a mark
  in the Image pane leaves it out, shown in silver) and **Bring all back**.
  For smudges, notes in the margin, construction lines. The count shows
  under it ("3 marks left out").
- **Line up:** **Line up with** (select: none, sketch 1, … , the first
  favourite). Scales, turns and moves this sketch to match another, so
  iterations sit in the same place for Compare and for the downloads.

#### Adjust styles

The style box (preset styles, Save as…, Export style, Import style, Reset)
as on every tab. One style applies to the whole collection, as one style
applies to an icon set.

**Output kind** (yellow choices, one at a time):

| Output kind | What it does to the drawing | Its own controls |
|---|---|---|
| **As drawn** | The faithful transfer. The ink as photographed: pressure, pencil tones and texture kept; paper removed, light evened, nothing redrawn. | none beyond the scan step |
| **Line drawing** | Lines cleaned and traced as smooth vector curves; smudges and faint marks dropped. | **Line width** (as drawn … even), **Smoothness**, **Drop faint lines under**, **Close gaps under**, **Trace as** (outlines / centre lines) |
| **Schematic** | Lines made exact: near-straight strokes become straight, near-right angles square, near-circles round, ends that nearly meet are joined, one line width. | **Straighten**, **Snap angles** (off, 15°, 45°, 90°), **Join ends within**, **Snap to grid** (off or a size), **Line width** |
| **Tones** | Shading kept as a few flat grey levels, each a vector layer (for shaded or washed sketches). | **Tone levels** (2–5), **Smoothness** |

"Centre lines" in Line drawing traces each stroke as a single path, not an
outline: for pen plotters, laser cutters and drawing animations.
Considered and left out: Silhouette (the Icon tab already does it) and
Blueprint (a colour preset of Schematic, not its own kind).

**Colours:** **Ink**, **Background** (none, paper, colour). **Size:** the
Texture tab's size fields (preset, width, height, lock, dpi).

#### Previews

- **Image:** the shared image pane (Ink / Flat, photo inset with corner
  handles, globes).
- **Sketch:** the active sketch in the chosen output kind, large, on Light
  or Dark.
- **Collection:** a tile per sketch in the current style, numbered, with a
  star; the active one has the yellow ring. Stats: "12 sketches · 3
  favourites". **Download collection** (primary) in its head.
- **Compare:** empty until two sketches are ticked in the Collection, then
  **Side by side** or **Overlay** (the second sketch in silver over the
  first in ink, with a **Blend** slider).

#### Collections

- **Naming:** each collection has a name (Collection name); each sketch has
  a name, from its photo or a template box, editable in **Name** under
  Export.
- **Ordering:** order of upload by default. Tiles drag to reorder (the Font
  tab's freehand drag code). **Order:** as uploaded, by name, favourites
  first, by date taken (from the photo's date where present). Numbers follow
  the order.
- **Comparing:** tick two tiles; Compare shows them side by side or as an
  overlay. Line up makes the overlay meaningful.
- **Favourites:** the star on a tile marks a favourite; any number may be
  starred. **Favourites only** (secondary toggle) shows only those.
- **Keeping:** collections are kept in this browser (IndexedDB) between
  visits, with the flattened photos, names, order, favourites and style.
  Nothing leaves the browser.
- **Exporting:** see below. The zip also opens again as a collection
  (**Open collection**), so a collection can move between browsers.

#### Output and system (downloads and file names)

- **Download sketch** (primary): the active sketch. **Copy SVG**
  (secondary). Formats as checkboxes: **SVG**, **PNG**, **PDF**.
- **Download collection** (primary, Collection pane): one zip.
- **Download favourites** (secondary): the same zip, favourites only.
- Stats line: paths, file size ("412 paths · SVG 38 KB").
- The style box's system buttons sit at the bottom, as on every tab.

What each kind gives: As drawn → PNG (full resolution, transparent, tones
kept) and SVG (traced outlines; tones are lost there, the PNG keeps them).
Line drawing, Schematic → SVG, PNG, PDF. Tones → SVG (a group per tone
level), PNG.

File names: slug of the collection name, two-digit number in collection
order, slug of the sketch name, output kind (`as-drawn`, `line`,
`schematic`, `tones`).

```
chair-study.zip
  chair-study-03-side-view-line.svg
  chair-study-03-side-view-line.png
  ...
  contact-sheet.pdf     every sketch on one page, numbered, named, favourites starred
  collection.json       name, order, favourites, sketch names, photo names and dates
  style.json            the style, as Export style gives it
  photos/               the flattened photos, JPG (only if "Include photos" is ticked)
```

A single sketch downloads as `chair-study-03-side-view-line.svg`.

#### What it reuses and what is new

Reused: the scan step whole (`scan-markup.ts`, `scan-step.ts`, with the
`setup` and `after` slots); Icon's multi-photo loading, set name, image
chips, set tiles and one-at-a-time building; Icon's fine tuning (rotate,
line spread); tracing (`trace.ts`, `svgpath.ts`); the icon template's corner
squares and reading; the Texture tab's size fields; the style box and its
system buttons; the Font tab's drag code; the download helper.

New: pencil tones (grey ink instead of a mask); leaving marks out; lining up
one sketch with another; the Schematic straightening and snapping;
centre-line tracing; tone levels; Compare (side by side, overlay);
favourites and ordering; collections kept in IndexedDB; the zip with
`collection.json` and the contact sheet PDF; the sketch sheet template.

#### Open questions

1. Keep collections in the browser between visits (IndexedDB), or only until
   the page closes, as icon sets are now?
2. One style per collection, or may one sketch differ from the rest?
3. Upload simply adds sketches, or a fixed **Sketches in this collection**
   count as on Icon (Images in this set)?
4. Is Tones worth a kind of its own, and should Centre lines be its own kind
   instead of a choice inside Line drawing?
5. Formats: is PDF enough for Schematic, or is DXF (for CAD) wanted?
6. A sketch sheet template: wanted, and should its number and date be read
   (handwriting) or only printed?
7. Favourites: any number, or one "pick" per collection?
8. A short note per sketch (what changed in this iteration), kept in
   `collection.json`?

### 1. Three tabs: Icons, Fonts, Textures (2026-11-13)

Hand Drawn narrows to three tabs, each a generator with its own scan step,
the way the Font tab already works.

**Done (2026-11-13, branch `icons-tab`):** Scan and Logo are removed; a
landing page ("Hand Drawn", and create an icon pack, a texture or a font)
comes first. Icon and Texture each have the scan step (`src/ui/scan-step.ts`)
with Scan's globes (not paper colour); Icon has Logo's fine tuning, the Tune
globe and the plain SVG/PNG downloads; Font reads its own photos and splits a
page that isn't a letter sheet into freehand drawings.

**Since then (2026-11-13 to 2026-11-16):**

- The three speck controls are one ("ignore spots under a size").
- Icon sets come from several images: set name, how many images, a button
  for each image, and the icon template (four pages of named empty boxes),
  read box by box. Photos load one at a time and the set builds icon by icon,
  so the page never freezes. "Several drawings on this sheet" starts on.
- The globes keep up on the Icon and Texture tabs: a half-size preview while
  a globe rolls, quicker closing of shapes, and one globe can no longer end
  another's roll.
- Deployed to handdrawn.orpiment.studio on 2026-11-16. Pull request
  studio0rpiment/hand-drawn#1 (the globe fix, `icons-tab` → `main`) is open;
  merging it only brings GitHub's `main` up to date with the deployed code.

**Still to do here:**

1. Rename the tabs Icons, Textures, Fonts (the words are in `src/text/common.md`).
2. Click through the landing page, the Texture tab and the Font tab on the
   live site; most testing so far was on the Icon tab.
3. Rebuild Textures (below).
4. Layered icons (section 2).
5. Decide which Logo controls stay. Kept so far: rotate, line spread,
   ignore spots, square artboard. Paper colour/hue was left out on purpose.

| Today | Planned |
|---|---|
| Scan | moves into each generator tab as its first step |
| Logo | removed; the controls that matter move to Icons |
| Icon | becomes **Icons** |
| Texture | becomes **Textures**, rebuilt (below) |
| Font | **Fonts**, unchanged; it is the model for the others |

#### Icons

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

#### Textures

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

#### One small model for textures and 3D (2026-11-17)

A small model trained in Variable Machine (sketch or photo in, height and
normal maps out) serves three outputs at once:

1. **Textures:** the displacement (height) and normal maps above.
2. **Relief and inflated shapes:** the height made into a mesh in the
   browser and downloaded as GLB (glTF), with no server. Relief: darker ink
   stands higher, like a stamp. Inflated: closed shapes puffed up by their
   distance from the edge. Extruding the traced outlines (Three.js
   `ExtrudeGeometry` and `GLTFExporter`) needs no model at all; STL for 3D
   printing comes almost free.
3. **Whole objects (later, optional):** the normal map stands in for the
   shaded picture that open image-to-3D models (TRELLIS, TripoSR, both MIT)
   expect; they do poorly on bare line drawings. These models are too large
   for the page, so this step alone needs a GPU server, such as a Hugging
   Face Space, and drawings would then leave the browser (the consent card
   and privacy page must say so).

**Hosted with the site.** If the model is small enough, it ships with Hand
Drawn as a static file (for example `public/models/height-normal.onnx`),
served from handdrawn.orpiment.studio with the long cache `/assets/` already
has, and run by onnxruntime-web. The current Content-Security-Policy already
allows it (`'wasm-unsafe-eval'`, `connect-src 'self'`), as long as
onnxruntime's wasm files are served from the site too, not a CDN. Aim for a
few MB after int8 quantisation, so it loads on a phone; check Vercel's
per-file limit before shipping a larger one. Nothing leaves the browser.

**Order:**

1. Textures with no model: height from the ink scan or Depth Anything V2
   Small, normals from height by maths, roughness and AO estimated (as above).
   This shows where the estimates fall short.
2. Train the model in Variable Machine (the new image-to-image path): a small
   U-Net, trained on pairs made by rendering 3D objects (for example from
   Objaverse) and turning each render into a sketch, through Hand Drawn's own
   ink step so the sketches look hand-drawn. Export to ONNX.
3. Ship the model with the site; swap it into Textures; add relief, inflated
   and extruded GLB downloads.
4. Only if 3 leaves Kevin wanting more: whole objects through a Space.

FBX is Autodesk's closed format with no good browser writer: download GLB
(plus OBJ or STL for printing) and convert to FBX in Blender when needed.

### 2. Layered icons (2026-11-13)

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

### 3. Earlier items

- **Pick a drawing inside the generator tabs** (2026-10-27). Today the picker
  is only in Scan. Covered by section 1, since Scan moves into each tab.
- **Texture "material" output** (2026-10-24): exaggerated ink height as
  displacement, normal, roughness and AO maps; imprinting a drawing (a letter
  C, say) into other 3D surfaces; experimental algorithmic shaders and maps.
  Folds into the PBR maps in section 1.
- Done: the image window keeps its size while size settings are adjusted
  (2026-10-27).

### Design rules to carry over (Font tab, as of 2026-11-02)

- Yellow: primary actions and selectable choices.
- Dashed silver outline, no fill: secondary buttons.
- Silver: a choice still shown that no longer holds (a changed preset).
- Labels in white.
- Template and upload in one yellow dashed box above the preview; an empty
  result area is a yellow dashed box labelled in silver.
