import { describe, expect, it } from 'vitest'
import { GRID, MARKER, PAGE, PAGE_FLAGS, READ_BOX, TEMPLATE_PAGES, boxOrigin, iconSheetSvg, pageFromFlags } from '../src/icon/template'

describe('the icon template', () => {
  it('holds the 169 common icons on four pages, each name once', () => {
    expect(TEMPLATE_PAGES.map((p) => p.length)).toEqual([48, 48, 48, 25])
    const names = TEMPLATE_PAGES.flat().map((i) => i.name)
    expect(names).toHaveLength(169)
    expect(new Set(names).size).toBe(169)
    // A note on the box stays on the box, not in the file name.
    const thumbs = TEMPLATE_PAGES.flat().find((i) => i.label.startsWith('thumbs-up'))!
    expect(thumbs.name).toBe('thumbs-up')
    expect(thumbs.label).toContain('·')
  })

  it('keeps every box between the corner squares', () => {
    const last = boxOrigin(GRID.cols * GRID.rows - 1)
    expect(boxOrigin(0)).toEqual({ x: GRID.x, y: GRID.y })
    expect(last.x + GRID.cell).toBeLessThan(PAGE.width - MARKER.inset - MARKER.size / 2)
    expect(last.y + GRID.cell).toBeLessThan(PAGE.height - MARKER.inset - MARKER.size / 2)
    expect(READ_BOX.x + READ_BOX.width).toBeLessThanOrEqual(GRID.cell)
    expect(READ_BOX.y + READ_BOX.height).toBeLessThanOrEqual(GRID.cell)
  })

  it('tells the pages apart by their top squares', () => {
    PAGE_FLAGS.forEach((flags, page) => expect(pageFromFlags((x) => flags.includes(x))).toBe(page))
    // Squares that match no page: read as page 1.
    expect(pageFromFlags((x) => x === 85)).toBe(0)
  })

  it('prints each page with its names and squares, without guide drawings', () => {
    const svg = iconSheetSvg(1)
    expect(svg).toContain('width="210mm"')
    for (const icon of TEMPLATE_PAGES[1]) expect(svg).toContain(`>${icon.label.replace(/&/g, '&amp;')}<`)
    // Four corner squares and this page's one top square.
    expect(svg.match(/fill="#000"/g)).toHaveLength(4 + PAGE_FLAGS[1].length)
    expect(svg).not.toContain('<path')
  })
})
