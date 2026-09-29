// @vitest-environment node
import { describe, it, expect, vi } from 'vitest'
import { loadHouseholdTagNames } from './household-tags'

function selectChain(data: unknown) {
  return {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    then: (resolve: (v: unknown) => unknown) => Promise.resolve({ data }).then(resolve),
  }
}

function makeSupabase(recipes: unknown, tags: unknown) {
  return {
    from: vi.fn((table: string) => (table === 'recipes' ? selectChain(recipes) : selectChain(tags))),
  }
}

describe('loadHouseholdTagNames', () => {
  it('merges recipe tags and tag-table names, lowercased, unique and sorted', async () => {
    const supabase = makeSupabase(
      [{ tags: ['Quick', 'pasta'] }, { tags: ['pasta'] }, { tags: null }],
      [{ name: 'dinner' }, { name: 'quick' }]
    )
    expect(await loadHouseholdTagNames(supabase as never, 'hh-1')).toEqual(['dinner', 'pasta', 'quick'])
  })

  it('returns an empty list when both queries return nothing', async () => {
    expect(await loadHouseholdTagNames(makeSupabase(null, null) as never, 'hh-1')).toEqual([])
  })

  it('reads only non-archived recipes of the household', async () => {
    const supabase = makeSupabase([], [])
    await loadHouseholdTagNames(supabase as never, 'hh-1')
    const recipesChain = supabase.from.mock.results[0].value
    expect(recipesChain.eq).toHaveBeenCalledWith('household_id', 'hh-1')
    expect(recipesChain.eq).toHaveBeenCalledWith('is_archived', false)
  })
})
