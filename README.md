# Hand Drawn

Turn your sketches into SVG icons, logos, textures, and typefaces. Take a
phone photo of a drawing and get clean design files back. Runs entirely in
the browser; nothing is uploaded.

```bash
pnpm install
pnpm dev      # http://localhost:5188
pnpm test
```

## How it works

1. **Scan** — the first tab captures the drawing, once, for every output:
   - **Paper:** finds the sheet in the photo (the largest bright region,
     grown into shadowed parts) and straightens it. Drag the four corners to
     correct it; arrow keys nudge a focused corner (Shift for bigger steps).
   - **Ink:** evens out the light by dividing by an estimate of the bare
     paper, picks an ink cut-off (Otsu), trims the edges, removes specks and
     fills pinholes, and adjusts line weight.
   - **Colour:** reads the ink and paper colours from the photo (the middle
     of each, so blended edges, shadows and glare don't count) and lets you
     adjust them in hue, saturation and lightness, or leave the paper out.
     Logo, icons and textures use these colours unless set to their own.
   - **Sheet:** finds every drawing on a page; the one picked in the tray is
     what every output works on.
2. **Logo** — traces the ink with potrace and exports an SVG in plain pixel
   coordinates, a single evenodd path, in the scan's colours or its own, with
   or without a background. A transparent PNG of the cleaned ink too.
3. **Icon** — turns the cleaned ink into an icon family under a
   *style* (see below): line, fill and tint variants, rotations and mirrors,
   an optional container, light and dark colours (by default the scan's, with
   the dark version's lightness turned over), favicons and a sprite.
4. **Texture** — prints the drawing with its hand-made quality
   kept: rubber stamp, risograph, halftone or the ink as drawn, once or as a
   seamless repeating tile. Also driven by styles.
5. **Font** — prints a two-page letter sheet, reads photos of
   it, and builds an OpenType font under a font style.

The code is split so the image processing (`src/image.ts`, `src/paper.ts`,
`src/clean.ts`, `src/svgpath.ts`, and in `src/icon/`, `src/texture/` and
`src/font/` everything but `ui.ts`, `pack.ts`, `compose.ts`, `make.ts` and
`sample.ts`) has no DOM and is unit tested. `src/ui/` holds what the tools share: style books and the
field-driven style controls.

## Sheets of drawings

Tick **Several drawings on this sheet** (Scan panel) for a page of icons or of
logo iterations. Every separate drawing is found and numbered row by row;
ink closer than the chosen distance counts as one drawing, and a mark inside
another drawing (a dot in a ring) always stays with it. A strip of numbered
thumbnails above the scan picks the drawing every output works on.

- **Logo:** *Download all SVGs* traces every drawing with the current settings
  into one zip, for comparing iterations.
- **Icon:** the *Icon set* panel builds every drawing in the current icon
  style; *Download icon set* gives one sprite with all of them (hand-icons
  symbol names, numbered manifest), an SVG per icon, variant and direction,
  and the style. Clicking an icon picks it for the detailed previews.

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

## Texture styles

Texture styles work like icon styles: built-ins, **Save as…**, **Export
style** / **Import style**, kept apart from the icon styles. Every random
choice comes from the style's *variation* number, so a style prints the same
way every time; **Shuffle** picks a new one.

| | Settings |
| --- | --- |
| Look | stamp, riso, halftone or ink; variation; which greys print as full and as no ink, tone curve; print grain |
| Stamp | ink spread, ragged edge and its wobble size, worn patches and their size, uneven pressure |
| Risograph | second drum on or off, misregistration across and down |
| Halftone | dots or lines, cell size, screen angle |
| Colours | ink, second ink, paper, print on paper or transparent, paper texture |
| Layout | single, grid, half-drop or scatter; print size, random turn, margin, tile size, gap, number of prints |

The drawing is printed at 1200 px on its long side, whatever the photo's size,
so pixel settings (spread, dot size, offsets) look the same on every drawing.
Inks overprint (multiply) on paper, as real ink does. Patterns fit a whole
number of cells per tile and draw prints across the edges again on the other
side, so tiles join without seams; scatter spreads prints evenly around the
wrap. Built-in colours come from the Orpiment palette.

Exports: a PNG (transparent unless printed on paper) and a CSS
`background` line for it.

## Fonts from a letter sheet

1. **Print page 1** and **Print page 2** (or **Download sheets** as SVG). They
   print at true size on A4.
2. Draw each character in its box. Letters sit on the solid line; capitals
   reach the upper dashed line, small letters the lower one. Accent marks on
   page 2 are drawn on their own.
3. Photograph each page flat, all four corner squares in view, and open the
   photos one after the other. Each page is recognised by its markers (page 2
   has an extra square at the top), and a new photo of a page replaces it.

The corner squares are found in the photo and the boxes are read through
them, so a page straightened slightly off still lands every box. Guide lines
and labels are printed light enough to drop out. Ink spilling in from a
neighbouring box (a sliver under 2 mm wide at a side edge) is ignored.

Page 1 holds A–Z, a–z, 0–9 and `.,!?'"-&`. Page 2 holds
`()[]:;/@#%+=*_<>«»€$£¿¡ßœŒæÆøØ‘’“”–…·` and seven accents (´ ` ˆ ¨ ˜ ¸ ˚).
Accented letters for German, French and Spanish (À–ÿ, Ç, Ñ, Å …) are built
from a drawn letter plus a drawn accent, centred over it, with a dotless i
under accents on i. Anything drawn in its own box wins.

Font styles, like the others, can be saved, exported and imported:

| | Settings |
| --- | --- |
| Ink | cut-off (or automatic), speck size, weight (thicker / thinner strokes), even out weight |
| Outline | smoothness, curve simplification |
| Spacing | space by letter shape, automatic kerning, space beside letters, tracking, word space, monospaced, tabular figures, room before : ; ? !, extra line spacing |
| Character | slant, bounce (random rise per letter), wobble (random turn), variation, overshoot of round letters |
| Accents | gap above letters, accent size |

### Type design rules

From Jost Hochuli, *Detail in Typography*, and Karen Cheng, *Designing Type*
(read in full from a local copy). Where the books give no number, the default
is ours and the code says so.

- **Spacing** (*Space by letter shape*): Walter Tracy's method as Cheng sets
  it out (pp. 220–221). The drawn H and n give the references: each H side is
  a third of the space between its stems, the n's left 28% of its counter and
  its right a little less, and O and o a little less than H and n. Every other
  letter takes its sides from Tracy's table: A V W X Y T at the minimum, L as
  H then minimum, D as H then O, c as o then a little less, and so on. Letters
  Tracy leaves to the eye (S a g s t z f) are spaced from their measured side
  shape. Accented letters space like their base letter.
- **Punctuation and figures** (Cheng, pp. 224–225): comma, full stop, colon,
  semicolon and single quotes centred in a quarter em; double quotes and ?
  in about 40%; ! a little more than a quarter; tabular figures in an en.
- **Kerning** (*Kern pairs automatically*): Hochuli's pairs, Cheng's table of
  commonly kerned pairs (p. 227), and every pair where a facing side is
  diagonal or open. Each gap is brought toward that of two straight letters
  (nn, HH), judged more by the upper half of the letters (Hochuli), never
  letting ink touch, and kept well under Cheng's 3000 pairs. Written as GPOS
  kerning, which browsers and apps apply.
- **Accents** (Cheng, pp. 200–211): centred on the letter's optical centre,
  not its box; an acute nudged right and a grave left so the thin end sits
  over it; on capitals a narrower gap (two thirds) and a slightly smaller
  accent; a dieresis on small letters at the height of the i's dot; a
  cedilla hung from the optical centre of the letter's bottom.
- **Word space** 250 units, a quarter of the em (Hochuli; Cheng: slightly
  more than a quarter); **line spacing** about 1.2 (Hochuli, after Tinker).
- **Overshoot**: O C G Q S, o c e s and 0 3 6 8 pass the guide lines by
  1.5% of the cap height if drawn without it (Cheng: about 2% for an O;
  Hochuli: circles must pass the lines to look as tall as squares).
- **Even out weight** (off by default, on in *Tidy*): a letter more than 12%
  heavier or lighter than its group's median stroke is thickened or thinned
  toward it (Cheng: one family, one weight).
- **Room before : ; ? !** (option): moves them right, away from the letter
  before (Cheng; usual in French).
- **Checks**: the Font tab lists what the books would point out, such as a
  group drawn consistently taller than its guide, letters that stray from
  their group, overshoots added, weights evened out, and slant past 10°
  (Hochuli warns against electronic slanting).

Built-ins: As drawn, Tidy, Bouncy, Bold marker, Slanted, Typewriter. The style
name becomes the font's style name, so one drawing can give a family (*My Hand
Bouncy*, *My Hand Bold marker* …). Exports an `.otf` (cubic outlines, cap
height 700 of a 1000 em) and an `@font-face` rule. **Sample page 1 / 2** fill
the sheet with a system handwriting font, to try it without drawing. Tick **with letters to trace** before
printing to get light Helvetica letters in every box (wide capitals are
narrowed to fit): trace them with a marker to test the whole font pipeline.
The light print drops out when the photo is read. A ready-made copy is in
`guides/letter-sheet-trace.pdf`.

## Photos

- Work size is capped at 2400 px on the long side.
- iPhone HEIC photos open anywhere. Safari reads them itself; in other
  browsers they are converted to PNG in the page by
  [heic-to](https://github.com/hoppergee/heic-to) (libheif, LGPL-3.0), which
  only loads when a HEIC photo comes in.
- Best results: daylight, the whole sheet in frame, a darker surface under it.

## Roadmap

- [x] Stage 1: photo cleanup and SVG logo trace
- [x] Stage 2: icon family and favicon set, driven by saved styles
- [x] Stage 3: texture and stamp art (stamp, risograph, halftone, ink; seamless patterns), driven by styles
- [x] Stage 4: font from a drawn letter sheet, with accents built in, driven by styles

## Globe sheet

The globes' lines are to be hand-drawn. `guides/globe-guide.pdf` (A4
landscape, print at 100%) has a 2:1 map for the meridians and parallels,
which wraps around the ball so they roll with it, and a circle for the rim,
in light blue guides that drop out when the photo is read. `guides/globe-guide.py`
regenerates the SVG.

## Privacy

Hand Drawn sets no cookies, has no analytics or tracking, and loads nothing
from other companies. Photos are processed in the browser and never leave it.
Nothing is stored in the browser either until the person allows it: the
first-visit notice offers *Remember my settings*, and only then are saved
settings (styles) kept in local storage. Declining isn't stored (that would be storing
something), so the notice asks again next visit. *Privacy settings* in the
footer shows what is kept and deletes it.

`privacy.html` is the privacy policy. Its list of storage entries comes from
`STORED` in `src/ui/consent.ts`, the same list the app uses to clear storage,
so the policy and the app can't disagree. Privacy contact:
support@orpiment.studio. Hosting: Vercel (the policy points to Vercel's own
privacy policy for its request logs). Not legal
advice; have the text reviewed.

## The look

The app wears Kevin's [hand-icons](https://github.com/studio0rpiment/hand-icons):
the icons on tabs and buttons come from its sprite, and every slider is drawn
with its single marker line (11, `line-solid`): bright up to the value, muted
after, and the same line stood upright as the handle, in Pantone 115 C yellow
(#FDDA24) on a dark background. Each slider shows the line mirrored its own
way (left–right, top–bottom, both or neither, picked from the slider's name),
so the bends differ down the page and stay put between visits. The real
slider sits invisibly on top, so keyboard, screen readers and touch work as
usual.

Text is set lowercase in NaN Gothic UI Mono ExtraLight, the typeface of the
musician-site template's admin; letters of buttons, tabs, labels and headings
spread a little under the pointer. Buttons reserve their spread width up
front, so hovering never reflows the page. The font is licensed and not in
this repository: put `NaNGothicUIMono-ExtraLight.woff2`, `-Regular.woff2` and
`-Bold.woff2` in `public/fonts/` (git-ignored) to use it; without them the app
falls back to the system monospace, still lowercase.
hand-icons is installed straight from its GitHub repository.

## Licence note

The hand-icons drawings are © Kevin Patton, CC-BY-4.0 (its code is MIT).
Fonts are written with [opentype.js](https://github.com/opentypejs/opentype.js) (MIT).
Tracing uses [esm-potrace-wasm](https://github.com/tomayac/esm-potrace-wasm),
a build of potrace, which is GPL-2.0. That's fine for using this tool; if it is
ever distributed, it has to be under GPL-compatible terms. What it produces
(SVGs, PNGs, fonts) is yours.
