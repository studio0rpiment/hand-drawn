import { describe, expect, it } from 'vitest'
import { project, unproject } from '../src/ui/sphere'

describe('globe', () => {
  it('reads back the values it draws, anywhere on the reachable cap', () => {
    for (const px of [0, 0.1, 0.35, 0.5, 0.9, 1]) {
      for (const py of [0, 0.25, 0.5, 0.77, 1]) {
        const p = project(px, py)
        const back = unproject(p.x, p.y)
        expect(back.px).toBeCloseTo(px, 6)
        expect(back.py).toBeCloseTo(py, 6)
      }
    }
  })

  it('puts the middle values at the centre, facing the viewer', () => {
    const p = project(0.5, 0.5)
    expect([p.x, p.y, p.z]).toEqual([0, 0, 1])
  })

  it('foreshortens towards the rim', () => {
    expect(project(0.95, 0.5).z).toBeLessThan(project(0.6, 0.5).z)
    expect(project(1, 1).z).toBeGreaterThan(0)
  })

  it('clamps points past the reachable edge to the nearest value', () => {
    expect(unproject(1.5, 0)).toEqual({ px: 1, py: 0.5 })
    expect(unproject(0, -2)).toEqual({ px: 0.5, py: 0 })
  })
})
