// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { categorizeScrapeError } from './scrape-error'
import { mockTranslate } from '@/test/mockMessages'

const t = (key: string) => mockTranslate('errors', key)

describe('categorizeScrapeError', () => {
  it('recognizes a 403 as a blocking-type failure', () => {
    const result = categorizeScrapeError(new Error('Failed to fetch URL: 403 Forbidden'), t)
    expect(result.message).toContain('blocking')
    expect(result.message).toContain('manually')
  })

  it('recognizes a 429 as a blocking-type failure', () => {
    const result = categorizeScrapeError(new Error('Failed to fetch URL: 429 Too Many Requests'), t)
    expect(result.message).toContain('blocking')
  })

  it('recognizes a 404', () => {
    const result = categorizeScrapeError(new Error('Failed to fetch URL: 404 Not Found'), t)
    expect(result.message).toContain("couldn't be found")
  })

  it('recognizes an abort/timeout', () => {
    const result = categorizeScrapeError(new Error('This operation was aborted'), t)
    expect(result.message).toContain('too long')
  })

  it('recognizes a DNS/connection failure', () => {
    const result = categorizeScrapeError(new Error('fetch failed: ENOTFOUND'), t)
    expect(result.message).toContain("Couldn't reach")
  })

  it('falls back to a generic message for anything unrecognized', () => {
    const result = categorizeScrapeError(new Error('Failed to fetch URL: 500 Internal Server Error'), t)
    expect(result.message).toBe('Could not import this recipe automatically. Try adding it manually instead.')
  })

  it('handles a non-Error thrown value', () => {
    const result = categorizeScrapeError('some string error', t)
    expect(result.message).toBe('Could not import this recipe automatically. Try adding it manually instead.')
  })
})
