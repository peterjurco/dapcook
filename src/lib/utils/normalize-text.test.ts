import { describe, expect, it } from 'vitest'
import { normalizeText } from './normalize-text'

describe('normalizeText', () => {
  it('lowercases and strips Slovak diacritics', () => {
    expect(normalizeText('Česnak')).toBe('cesnak')
    expect(normalizeText('ĽADOVÝ šalát, ôsmy')).toBe('ladovy salat, osmy')
  })

  it('leaves plain ASCII untouched apart from case', () => {
    expect(normalizeText('Garlic Bread')).toBe('garlic bread')
  })
})
