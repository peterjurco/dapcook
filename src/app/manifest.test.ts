import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import manifest from './manifest'

describe('manifest', () => {
  it('opens as a standalone app', () => {
    expect(manifest().display).toBe('standalone')
  })

  it('provides the icon sizes Android needs to install the app', () => {
    const icons = manifest().icons ?? []

    expect(icons).toContainEqual(expect.objectContaining({ sizes: '192x192', purpose: 'any' }))
    expect(icons).toContainEqual(expect.objectContaining({ sizes: '512x512', purpose: 'any' }))
    expect(icons).toContainEqual(expect.objectContaining({ sizes: '512x512', purpose: 'maskable' }))
  })

  it('points every icon at a file in public/', () => {
    for (const icon of manifest().icons ?? []) {
      expect(existsSync(join(process.cwd(), 'public', icon.src))).toBe(true)
    }
  })
})
