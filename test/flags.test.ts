import { describe, expect, it } from 'vitest'
import { explanation } from '../src/ui/flags'

describe('tab flags', () => {
  const tabs = ['icon', 'texture', 'font']

  it('has a flag for each of the three tabs', () => {
    for (const tab of tabs) expect(explanation(`tab.${tab}`)?.text.length).toBeGreaterThan(40)
    expect(explanation('tab.icon')!.title).toBe('Icon')
  })

  it('speaks about the thing, never to the reader', () => {
    for (const tab of tabs) expect(explanation(`tab.${tab}`)!.text).not.toMatch(/\byou(r)?\b/i)
  })
})
