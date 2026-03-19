// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { load } from 'cheerio'
import { parseMetaFallback } from './meta'

const URL = 'https://example.com/recipe'

describe('parseMetaFallback', () => {
  it('extracts title from og:title', () => {
    const $ = load('<html><head><meta property="og:title" content="Pasta Carbonara" /></head></html>')
    const result = parseMetaFallback($, URL)
    expect(result.title).toBe('Pasta Carbonara')
  })

  it('falls back to <title> tag when no og:title', () => {
    const $ = load('<html><head><title>My Recipe Page</title></head></html>')
    const result = parseMetaFallback($, URL)
    expect(result.title).toBe('My Recipe Page')
  })

  it('extracts og:image', () => {
    const $ = load('<html><head><meta property="og:image" content="https://example.com/img.jpg" /></head></html>')
    const result = parseMetaFallback($, URL)
    expect(result.image_url).toBe('https://example.com/img.jpg')
  })

  it('returns null image_url when no image meta tag', () => {
    const $ = load('<html><head></head></html>')
    const result = parseMetaFallback($, URL)
    expect(result.image_url).toBeNull()
  })

  it('always returns empty ingredients and steps', () => {
    const $ = load('<html><body><p>200g flour</p><p>Mix and bake</p></body></html>')
    const result = parseMetaFallback($, URL)
    expect(result.rawIngredients).toEqual([])
    expect(result.rawSteps).toEqual([])
  })

  it('always sets partial=true', () => {
    const $ = load('<html></html>')
    const result = parseMetaFallback($, URL)
    expect(result.partial).toBe(true)
  })

  it('sets source_url correctly', () => {
    const $ = load('<html></html>')
    const result = parseMetaFallback($, URL)
    expect(result.source_url).toBe(URL)
  })
})
