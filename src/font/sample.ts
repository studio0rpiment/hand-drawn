// Sample photos of filled-in letter sheets, so the Font tab can be tried
// without drawing: Kevin's own traced pages where there is one, otherwise a
// made-up photo written with a system handwriting font.

import { random } from '../texture/noise'
import { GUIDES, PAGE, SHEETS, cellOrigin, sheetSvg } from './sheet'

const PX = 6 // pixels per mm on the paper

async function blankSheet(page: number): Promise<HTMLCanvasElement> {
  const url = URL.createObjectURL(new Blob([sheetSvg(page)], { type: 'image/svg+xml' }))
  try {
    const img = new Image()
    img.src = url
    await img.decode()
    const c = document.createElement('canvas')
    c.width = PAGE.width * PX
    c.height = PAGE.height * PX
    c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height)
    return c
  } finally {
    URL.revokeObjectURL(url)
  }
}

/** Kevin's photographed pages, by page index (none yet for page 3). */
const PHOTOS: (string | undefined)[] = ['/sample-sheet-1.jpg', '/sample-sheet-2.jpg']

export async function sampleSheetPhoto(page: number): Promise<HTMLCanvasElement> {
  const url = PHOTOS[page]
  if (url) {
    const res = await fetch(url)
    if (res.ok) {
      const img = await createImageBitmap(await res.blob())
      const c = document.createElement('canvas')
      c.width = img.width
      c.height = img.height
      c.getContext('2d')!.drawImage(img, 0, 0)
      img.close()
      return c
    }
  }
  return madeUpPhoto(page)
}

async function madeUpPhoto(page: number): Promise<HTMLCanvasElement> {
  const sheet = await blankSheet(page)
  const g = sheet.getContext('2d')!
  const rand = random(40 + page)
  // Capitals should reach cap height: most handwriting fonts have caps at about 0.7 em.
  const size = ((GUIDES.baseline - GUIDES.cap) / 0.72) * PX
  g.font = `${size}px "Marker Felt", "Chalkboard SE", "Bradley Hand", "Comic Sans MS", cursive`
  g.fillStyle = '#1b1a22'
  g.textAlign = 'center'
  SHEETS[page].forEach((slot, i) => {
    // Leave a couple of boxes empty, as people do.
    if (rand() < 0.03) return
    const o = cellOrigin(i)
    g.save()
    g.translate((o.x + 8.5) * PX, (o.y + GUIDES.baseline) * PX)
    g.rotate((rand() - 0.5) * 0.08)
    g.fillText(slot.char, (rand() - 0.5) * PX, (rand() - 0.5) * 0.6 * PX)
    g.restore()
  })

  // On a table, turned a little, lit from one side.
  const W = 1700
  const H = 2200
  const c = document.createElement('canvas')
  c.width = W
  c.height = H
  const p = c.getContext('2d')!
  p.fillStyle = '#3b3431'
  p.fillRect(0, 0, W, H)
  p.save()
  p.translate(W / 2, H / 2)
  p.rotate(0.035)
  p.transform(1, 0.015, -0.02, 1, 0, 0)
  const s = 0.85
  p.drawImage(sheet, (-sheet.width * s) / 2, (-sheet.height * s) / 2, sheet.width * s, sheet.height * s)
  p.restore()
  const light = p.createLinearGradient(0, 0, W, H)
  light.addColorStop(0, 'rgba(255,250,240,0.0)')
  light.addColorStop(1, 'rgba(40,30,20,0.28)')
  p.fillStyle = light
  p.fillRect(0, 0, W, H)
  return c
}
