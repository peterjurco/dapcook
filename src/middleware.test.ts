import { describe, expect, it } from 'vitest'
import { isPublicPath } from './middleware'

describe('isPublicPath', () => {
  it.each(['/s', '/s/public-token'])('treats %s as public', (pathname) => {
    expect(isPublicPath(pathname)).toBe(true)
  })

  it('keeps recipe detail routes protected', () => {
    expect(isPublicPath('/recipes/recipe-1')).toBe(false)
  })

  it('allows crawlers to fetch the robots policy', () => {
    expect(isPublicPath('/robots.txt')).toBe(true)
  })
})
