import { afterEach, describe, expect, it, vi } from 'vitest'
import { recallListUrl, rememberListUrl } from './list-url-memory'

afterEach(() => {
  vi.restoreAllMocks()
  sessionStorage.clear()
})

describe('list URL memory', () => {
  it('falls back to plain /recipes when nothing was remembered', () => {
    expect(recallListUrl()).toBe('/recipes')
  })

  it('recalls the last remembered list URL', () => {
    rememberListUrl('/recipes?time=-30')
    rememberListUrl('/recipes?tag=main')
    expect(recallListUrl()).toBe('/recipes?tag=main')
  })

  it('ignores anything that is not the recipe list', () => {
    sessionStorage.setItem('dapcook:recipe-list-url', 'https://evil.example/recipes')
    expect(recallListUrl()).toBe('/recipes')
    sessionStorage.setItem('dapcook:recipe-list-url', '/recipes/abc')
    expect(recallListUrl()).toBe('/recipes')
  })

  it('survives storage being unavailable', () => {
    rememberListUrl('/recipes?q=before')
    // With site data blocked, merely reading `window.sessionStorage` throws.
    vi.spyOn(window, 'sessionStorage', 'get').mockImplementation(() => {
      throw new DOMException('blocked', 'SecurityError')
    })
    expect(() => rememberListUrl('/recipes?q=x')).not.toThrow()
    expect(recallListUrl()).toBe('/recipes')
  })
})
