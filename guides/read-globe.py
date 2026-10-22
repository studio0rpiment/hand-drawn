"""Read a photographed globe sheet (globe-guide.pdf, drawn over) into the
globe's artwork: the map as an equirectangular ink mask and the rim as a
radius for each angle.

    python read-globe.py photo.jpg

Writes src/ui/globe-map.png (1024 × 512, white ink on black; x is longitude
from 0° at meridian 1 eastward, y is latitude from the north pole down) and
src/ui/globe-rim.ts (radii every 2°, clockwise from 3 o'clock, scaled to a
mean of 1). Needs numpy and opencv-python-headless.
"""

import json
import sys
from pathlib import Path

import cv2
import numpy as np

PX = 10  # pixels per mm on the straightened sheet
W, H = 297, 210
# Sheet geometry, from globe-guide.py (mm).
MX, MY, MW, MH = 22, 62, 160, 80
CX, CY, R = 241, MY + MH / 2, 32
MAP_MARKS = [(MX - 9, MY - 9), (MX + MW + 9, MY - 9), (MX + MW + 9, MY + MH + 9), (MX - 9, MY + MH + 9)]
RIM_MARKS = [(CX - R - 6, CY - R - 6), (CX + R + 6, CY - R - 6), (CX + R + 6, CY + R + 6), (CX - R - 6, CY + R + 6)]
OUT = Path(__file__).resolve().parent.parent / 'src' / 'ui'


def find_markers(gray):
    """Centres of the solid black squares, largest first."""
    dark = (gray < 90).astype(np.uint8)
    # Drop thin marker lines that may touch a square; the squares survive.
    dark = cv2.morphologyEx(dark, cv2.MORPH_OPEN, np.ones((11, 11), np.uint8))
    n, _, stats, cents = cv2.connectedComponentsWithStats(dark)
    found = []
    for i in range(1, n):
        x, y, w, h, area = stats[i]
        if area < 60 or not 0.7 < w / h < 1.4:
            continue
        if area / (w * h) < 0.75:
            continue
        found.append((area, tuple(cents[i])))
    found.sort(reverse=True)
    return found


def upright(img):
    """Turn the photo so the sheet's long side runs across."""
    h, w = img.shape[:2]
    return cv2.rotate(img, cv2.ROTATE_90_COUNTERCLOCKWISE) if h > w else img


def straighten(img):
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    marks = find_markers(gray)
    # The eight squares are all the same size: keep those near the median of the largest eight.
    size = np.median([a for a, _ in marks[:8]])
    pts = np.array([c for a, c in marks if 0.5 * size < a < 1.6 * size])
    if len(pts) < 4:
        sys.exit(f"found {len(pts)} squares, need at least the four around the map")
    # The map's squares sit at x 13 and 191 mm, left of all the rim's (203 and 279),
    # so the four leftmost are the map's: TL, TR, BR, BL by their sums and differences.
    four = pts[np.argsort(pts[:, 0])][:4]
    s, d = four.sum(1), four[:, 0] - four[:, 1]
    src = np.array([four[np.argmin(s)], four[np.argmax(d)], four[np.argmax(s)], four[np.argmin(d)]])
    dst = np.array(MAP_MARKS + RIM_MARKS, dtype=np.float64) * PX
    hmat, _ = cv2.findHomography(src, dst[:4])
    # Then every square seen goes to the nearest place a square should be, and the fit is redone
    # with all of them (a rim square or two may be out of the photo).
    seen = cv2.perspectiveTransform(pts.reshape(-1, 1, 2), hmat).reshape(-1, 2)
    pairs = [(p, dst[np.argmin(((dst - q) ** 2).sum(1))]) for p, q in zip(pts, seen)]
    hmat, _ = cv2.findHomography(np.array([p for p, _ in pairs]), np.array([q for _, q in pairs]))
    print(f'{len(pts)} of 8 squares')
    return cv2.warpPerspective(gray, hmat, (W * PX, H * PX), flags=cv2.INTER_CUBIC, borderValue=255)


def ink(gray):
    """Ink as 0–1 coverage: the marker, without the light blue guides or paper shading."""
    blur = cv2.GaussianBlur(gray, (0, 0), 25)
    flat = np.clip(gray.astype(np.float32) / np.maximum(blur.astype(np.float32), 1), 0, 1.2)
    # Guides sit around 0.85 of the paper, marker well under 0.5.
    return np.clip((0.72 - flat) / 0.3, 0, 1)


def read_map(cover):
    # One period of longitude: from 4 mm left of meridian 1 to 4 mm left of its repeat at the right edge,
    # so the line drawn at the right edge (meridian 1 again) is not used twice.
    x0 = (MX - 4) * PX
    strip = cover[MY * PX:(MY + MH) * PX, x0:x0 + MW * PX]
    # Nothing at the poles: a line along the edge would be a single point.
    edge = 3 * PX
    strip[:edge] = 0
    strip[-edge:] = 0
    # Start the map at meridian 1 (4 mm in).
    strip = np.roll(strip, -4 * PX, axis=1)
    out = cv2.resize(strip, (1024, 512), interpolation=cv2.INTER_AREA)
    cv2.imwrite(str(OUT / 'globe-map.png'), np.round(out * 255).astype(np.uint8))


def read_rim(cover):
    radii = []
    for k in range(180):
        t = np.radians(k * 2)
        rs = np.arange((R - 6) * PX, (R + 4) * PX)  # short of the paper edge on the right
        xs = (CX * PX + rs * np.cos(t)).astype(int)
        ys = (CY * PX + rs * np.sin(t)).astype(int)
        v = cover[ys, xs]
        radii.append(float((rs * v).sum() / v.sum()) if v.sum() > 0.5 else None)
    known = [r for r in radii if r is not None]
    mean = sum(known) / len(known)
    # Fill gaps in the line from the neighbours on either side.
    for i, r in enumerate(radii):
        if r is None:
            a = next(radii[(i - j) % 180] for j in range(1, 180) if radii[(i - j) % 180] is not None)
            b = next(radii[(i + j) % 180] for j in range(1, 180) if radii[(i + j) % 180] is not None)
            radii[i] = (a + b) / 2
    (OUT / 'globe-rim.ts').write_text(
        '// The globe\'s rim as Kevin drew it: radius every 2°, clockwise from 3 o\'clock,\n'
        '// scaled to a mean of 1. Written by guides/read-globe.py; do not edit by hand.\n'
        f'export const RIM = {json.dumps([round(r / mean, 4) for r in radii])}\n'
    )


if __name__ == '__main__':
    photo = cv2.imread(sys.argv[1])
    sheet = straighten(upright(photo))
    if len(sys.argv) > 2:
        cv2.imwrite(sys.argv[2], sheet)
    cover = ink(sheet)
    read_map(cover)
    read_rim(cover)
