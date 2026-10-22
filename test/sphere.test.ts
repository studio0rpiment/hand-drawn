import { describe, expect, it } from 'vitest'
import { markAt, rimAt, rotate, toAngle, toFrac, unrotate } from '../src/ui/sphere'

describe('globe', () => {
  it('maps values to roll angles and back, continuously', () => {
    for (const f of [0, 0.013, 0.35, 0.5, 0.777, 1]) expect(toFrac(toAngle(f))).toBeCloseTo(f, 9)
    expect(toAngle(0.5)).toBe(0)
  })

  it('faces the viewer at rest, and rolls right and up for positive angles', () => {
    expect(markAt(0, 0)).toEqual([0, 0, 1])
    expect(markAt(0.3, 0)[0]).toBeGreaterThan(0)
    expect(markAt(0, 0.3)[1]).toBeGreaterThan(0)
  })

  it('keeps the mark in sight even at both extremes', () => {
    for (const fx of [0, 1]) for (const fy of [0, 1]) expect(markAt(toAngle(fx), toAngle(fy))[2]).toBeGreaterThan(0.1)
  })

  it('rolls the whole ball rigidly (lengths and angles kept)', () => {
    const a = rotate([0.3, -0.5, 0.81], 0.7, -0.4)
    const b = rotate([0, 1, 0], 0.7, -0.4)
    expect(Math.hypot(...a)).toBeCloseTo(Math.hypot(0.3, -0.5, 0.81), 9)
    const dot = (p: number[], q: number[]) => p[0] * q[0] + p[1] * q[1] + p[2] * q[2]
    expect(dot(a, b)).toBeCloseTo(dot([0.3, -0.5, 0.81], [0, 1, 0]), 9)
  })
})

describe('unrotate', () => {
  it('undoes a roll', () => {
    const p: [number, number, number] = [0.3, -0.5, Math.sqrt(1 - 0.34)]
    const back = unrotate(rotate(p, 0.7, -0.4), 0.7, -0.4)
    back.forEach((v, i) => expect(v).toBeCloseTo(p[i], 10))
  })
})

describe('rimAt', () => {
  it('stays close to the unit circle and wraps round', () => {
    for (let t = -7; t < 7; t += 0.37) expect(Math.abs(rimAt(t) - 1)).toBeLessThan(0.1)
    expect(rimAt(0)).toBeCloseTo(rimAt(2 * Math.PI), 10)
  })
})
