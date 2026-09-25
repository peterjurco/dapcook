import { describe, it, expect } from 'vitest'
import { safeNextPath } from './safe-next-path'

describe('safeNextPath', () => {
  it.each(['/recipes', '/join/abc123', '/recipes?tab=all#top', '/'])('accepts same-origin path %s', (path) => {
    expect(safeNextPath(path, '/recipes')).toBe(path)
  })

  it.each([
    null,
    undefined,
    '',
    '@evil.com',
    'evil.com',
    'https://evil.com',
    '//evil.com',
    '/\\evil.com',
    '/\t/evil.com',
    '/\n/evil.com',
    'javascript:alert(1)',
  ])('falls back for %j', (value) => {
    expect(safeNextPath(value, '/recipes')).toBe('/recipes')
  })
})
