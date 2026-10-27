import { describe, expect, it } from 'vitest'
import { explanation } from '../src/ui/flags'

describe('tab flags', () => {
  const tabs = ['scan', 'logo', 'icon', 'texture', 'font']

  it('has a flag for each of the five tabs', () => {
    for (const tab of tabs) expect(explanation(`tab.${tab}`)?.text.length).toBeGreaterThan(40)
    expect(explanation('tab.scan')!.title).toBe('Scan')
  })

  it('speaks about the thing, never to the reader', () => {
    for (const tab of tabs) expect(explanation(`tab.${tab}`)!.text).not.toMatch(/\byou(r)?\b/i)
  })
})
