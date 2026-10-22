"""The printable globe guide: an A4 landscape sheet (mm) with a 2:1 map for
the meridians and parallels and a circle for the rim, in light blue guides
that drop out when the photo is read, and black squares to find each part.
Writes globe-guide.svg next to this file; convert to PDF with any SVG tool
(e.g. CairoSVG: cairosvg globe-guide.svg -o globe-guide.pdf)."""

from pathlib import Path

W, H = 297, 210
GUIDE, FAINT, LABEL = '#c6d6e5', '#dbe5ee', '#a7b4c0'
parts = [f'<rect width="{W}" height="{H}" fill="#fff"/>']


def marker(x, y, s=4):
    parts.append(f'<rect x="{x - s/2}" y="{y - s/2}" width="{s}" height="{s}" fill="#000"/>')


def text(x, y, t, size=2.6, anchor='start', color=LABEL):
    parts.append(f'<text x="{x}" y="{y}" font-size="{size}" text-anchor="{anchor}" font-family="Helvetica, Arial, sans-serif" fill="{color}">{t}</text>')


# The map: 2:1, 160 × 80 mm. Everything stays 10 mm or more inside the paper.
mx, my, mw, mh = 22, 62, 160, 80
xr = mx + mw
parts.append(f'<rect x="{mx}" y="{my}" width="{mw}" height="{mh}" fill="none" stroke="{GUIDE}" stroke-width="0.3" stroke-dasharray="1.5 1"/>')
# 12 meridians, every 1/12 of the width; the right edge is the left edge again.
for k in range(12):
    x = mx + k * mw / 12
    parts.append(f'<line x1="{x}" x2="{x}" y1="{my + 1.5}" y2="{my + mh - 1.5}" stroke="{FAINT}" stroke-width="0.25" stroke-dasharray="0.6 1.2"/>')
    for y1, y2 in ((my - 5, my - 1.5), (my + mh + 1.5, my + mh + 5)):
        parts.append(f'<line x1="{x}" x2="{x}" y1="{y1}" y2="{y2}" stroke="{GUIDE}" stroke-width="0.4"/>')
    text(x, my - 6.5, str(k + 1), 2.2, 'middle')
for y1, y2 in ((my - 5, my - 1.5), (my + mh + 1.5, my + mh + 5)):
    parts.append(f'<line x1="{xr}" x2="{xr}" y1="{y1}" y2="{y2}" stroke="{GUIDE}" stroke-width="0.4" stroke-dasharray="0.8 0.8"/>')
text(xr, my - 6.5, '= 1', 2.2, 'middle')
# 5 parallels: the equator, and 1/6 and 1/3 of the height either side (30° and 60°).
for i, name in ((1, '60° N'), (2, '30° N'), (3, 'equator'), (4, '30° S'), (5, '60° S')):
    y = my + mh * i / 6
    parts.append(f'<line x1="{mx + 1.5}" x2="{xr - 1.5}" y1="{y}" y2="{y}" stroke="{FAINT}" stroke-width="0.25" stroke-dasharray="0.6 1.2"/>')
    for x1, x2 in ((mx - 5, mx - 1.5), (xr + 1.5, xr + 5)):
        parts.append(f'<line x1="{x1}" x2="{x2}" y1="{y}" y2="{y}" stroke="{GUIDE}" stroke-width="0.4"/>')
    text(xr + 6.5, y + 0.9, name, 2.3)
text(mx + mw / 2, my - 11, 'north pole edge: draw nothing along here', 2.6, 'middle')
text(mx + mw / 2, my + mh + 10, 'south pole edge: draw nothing along here', 2.6, 'middle')
text(mx, my - 20, 'MAP', 3.2, 'start', '#7d8b98')
for x, y in ((mx - 9, my - 9), (xr + 9, my - 9), (xr + 9, my + mh + 9), (mx - 9, my + mh + 9)):
    marker(x, y)

# The rim: one circle, 64 mm across.
cx, cy, r = 241, my + mh / 2, 32
parts.append(f'<circle cx="{cx}" cy="{cy}" r="{r}" fill="none" stroke="{GUIDE}" stroke-width="0.35" stroke-dasharray="1.5 1"/>')
parts.append(f'<path d="M{cx - 2} {cy}H{cx + 2}M{cx} {cy - 2}V{cy + 2}" stroke="{GUIDE}" stroke-width="0.3"/>')
text(cx - r - 6, my - 20, 'RIM', 3.2, 'start', '#7d8b98')
text(cx, cy + r + 13, 'one circle over the dashed guide', 2.6, 'middle')
for x, y in ((cx - r - 6, cy - r - 6), (cx + r + 6, cy - r - 6), (cx + r + 6, cy + r + 6), (cx - r - 6, cy + r + 6)):
    marker(x, y)

text(22, 18, 'Hand Drawn · globe sheet', 4.2, 'start', '#7d8b98')
text(22, 25, 'Draw over the light blue guides with your marker; the guides drop out when the photo is read.', 2.7)
text(22, 29.5, 'Map: 12 straight meridians top to bottom, 5 straight parallels side to side. They stay parallel on paper; wrapping round the ball makes them curve.', 2.7)
text(22, 34, 'Wobbles and gaps are welcome, and doodles on the map roll with the ball.', 2.7)
text(22, H - 14, 'Print at actual size (100%, no scaling), landscape. Photograph flat in daylight on a darker surface, with all eight black squares in view.', 2.7)

svg = f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}mm" height="{H}mm" viewBox="0 0 {W} {H}">' + ''.join(parts) + '</svg>\n'
Path(__file__).with_name('globe-guide.svg').write_text(svg)
