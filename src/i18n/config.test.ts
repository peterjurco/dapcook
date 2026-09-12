// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { isLocale, resolveLocale } from './config'

describe('isLocale', () => {
  it('recognizes en as a valid locale', () => {
    expect(isLocale('en')).toBe(true)
  })

  it('recognizes sk as a valid locale', () => {
    expect(isLocale('sk')).toBe(true)
  })

  it('rejects an unsupported locale', () => {
    expect(isLocale('fr')).toBe(false)
  })

  it('rejects null', () => {
    expect(isLocale(null)).toBe(false)
  })

  it('rejects undefined', () => {
    expect(isLocale(undefined)).toBe(false)
  })
})

describe('resolveLocale', () => {
  it('falls back to the ambient requestLocale when no explicit locale override is passed', () => {
    expect(resolveLocale(undefined, 'sk')).toBe('sk')
  })

  it('falls back to defaultLocale when neither locale nor requestLocale resolve to a supported locale', () => {
    expect(resolveLocale(undefined, undefined)).toBe('en')
  })

  it('prefers an explicit locale override over the ambient requestLocale', () => {
    expect(resolveLocale('en', 'sk')).toBe('en')
  })

  it('falls back to defaultLocale when requestLocale resolves to an unsupported locale', () => {
    expect(resolveLocale(undefined, 'fr')).toBe('en')
  })

  it('falls back to defaultLocale when the explicit locale override is unsupported', () => {
    expect(resolveLocale('fr', 'sk')).toBe('en')
  })
})
