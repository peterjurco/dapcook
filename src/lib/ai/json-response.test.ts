import { describe, it, expect } from 'vitest'
import { parseJsonFromText } from './json-response'

describe('parseJsonFromText', () => {
  it('parses JSON wrapped in prose or a code fence', () => {
    expect(parseJsonFromText('Sure!\n```json\n{"a": [1]}\n```')).toEqual({ ok: true, value: { a: [1] } })
  })

  it('reports a reply with no JSON', () => {
    expect(parseJsonFromText('Sorry')).toEqual({ ok: false, error: 'No JSON found' })
  })

  it('reports malformed JSON', () => {
    const result = parseJsonFromText('{ "a": [oops] }')
    expect(result.ok).toBe(false)
    expect(!result.ok && result.error).toMatch(/^Malformed JSON/)
  })
})
