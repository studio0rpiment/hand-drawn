import { describe, expect, it } from 'vitest'
import { flipFor } from '../src/ui/hand'

describe('flipFor', () => {
  it('picks the same mirroring for the same slider every time', () => {
    expect(flipFor('flatten')).toEqual(flipFor('flatten'))
  })

  it('uses all four mirrorings across a page of sliders', () => {
    const ids = ['flatten', 'level', 'weight', 'speck', 'trim', 'pad', 'smooth', 'simplify']
    const seen = new Set(ids.map((id) => JSON.stringify(flipFor(id))))
    expect(seen.size).toBe(4)
  })
})
