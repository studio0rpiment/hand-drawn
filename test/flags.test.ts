import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { parseFlags } from '../src/ui/flags'

describe('flags.md', () => {
  const flags = parseFlags(readFileSync(new URL('../src/flags.md', import.meta.url), 'utf8'))

  it('has a flag for each of the five tabs', () => {
    expect(Object.keys(flags).sort()).toEqual(['tab.font', 'tab.icon', 'tab.logo', 'tab.scan', 'tab.texture'])
    expect(flags['tab.scan'].title).toBe('Scan')
    expect(flags['tab.scan'].text).toMatch(/^Where every drawing starts\..*tray/)
  })

  it('speaks about the thing, never to the reader', () => {
    for (const f of Object.values(flags)) expect(f.text).not.toMatch(/\byou(r)?\b/i)
  })
})
