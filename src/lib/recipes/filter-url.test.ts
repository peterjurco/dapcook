import { describe, expect, it } from 'vitest'
import { parseFilterParams, serializeFilterParams, type ListFilterState } from './filter-url'

const empty: ListFilterState = { search: '', tags: null, time: null, servings: null, ingredient: '' }

function parse(qs: string) {
  return parseFilterParams(new URLSearchParams(qs))
}

describe('parseFilterParams', () => {
  it('reads nothing from an empty query', () => {
    expect(parse('')).toEqual(empty)
  })

  it('reads every filter', () => {
    expect(parse('q=gulas&tag=main&tag=italian&time=-30&portions=3-4&ing=cesnak')).toEqual({
      search: 'gulas',
      tags: ['main', 'italian'],
      time: { min: null, max: 30 },
      servings: { min: 3, max: 4 },
      ingredient: 'cesnak',
    })
  })

  it('reads open-ended ranges', () => {
    expect(parse('time=61-').time).toEqual({ min: 61, max: null })
  })

  it('tells an explicitly empty tag selection apart from an untouched one', () => {
    expect(parse('all=1').tags).toEqual([])
    expect(parse('q=x').tags).toBeNull()
  })

  it('ignores malformed ranges', () => {
    expect(parse('time=abc').time).toBeNull()
    expect(parse('time=-').time).toBeNull()
    expect(parse('portions=1-2-3').servings).toBeNull()
  })
})

describe('serializeFilterParams', () => {
  it('is empty when nothing is filtered, so the URL stays plain /recipes', () => {
    expect(serializeFilterParams(empty)).toBe('')
  })

  it('marks an explicitly cleared tag selection so it does not fall back to the default', () => {
    expect(serializeFilterParams({ ...empty, tags: [] })).toBe('all=1')
  })

  it('omits blank search and ingredient text', () => {
    expect(serializeFilterParams({ ...empty, search: '  ', ingredient: ' ' })).toBe('')
  })

  it('round-trips every filter', () => {
    const state: ListFilterState = {
      search: 'guláš',
      tags: ['main', 'a,b'],
      time: { min: 16, max: 30 },
      servings: { min: 5, max: null },
      ingredient: 'česnak',
    }
    expect(parse(serializeFilterParams(state))).toEqual(state)
  })
})
