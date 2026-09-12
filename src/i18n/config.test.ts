// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { isLocale } from './config'

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
