import { describe, expect, it, vi, beforeEach } from 'vitest'

const mocks = vi.hoisted(() => ({
  profile: vi.fn(),
  household: vi.fn(),
  householdEq: vi.fn(),
}))

vi.mock('next/cache', () => ({ unstable_cache: (fn: unknown) => fn, revalidateTag: vi.fn() }))
vi.mock('./current-user', () => ({ getCurrentUser: vi.fn(async () => ({ id: 'user-1', email: null })) }))
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: () => ({ select: () => ({ eq: () => ({ single: mocks.profile }) }) }),
  }),
}))
vi.mock('@/lib/supabase/server', () => ({
  createClient: () => ({
    from: () => ({
      select: () => ({
        eq: (...args: unknown[]) => {
          mocks.householdEq(...args)
          return { single: mocks.household }
        },
      }),
    }),
  }),
}))

import { getHouseholdWeekStartDay } from './household'

beforeEach(() => vi.clearAllMocks())

describe('getHouseholdWeekStartDay', () => {
  it("returns the household's week start day", async () => {
    mocks.profile.mockResolvedValue({ data: { household_id: 'hh-1' } })
    mocks.household.mockResolvedValue({ data: { week_start_day: 'sunday' } })
    expect(await getHouseholdWeekStartDay()).toBe('sunday')
    expect(mocks.householdEq).toHaveBeenCalledWith('id', 'hh-1')
  })

  it('falls back to Monday without a household', async () => {
    mocks.profile.mockResolvedValue({ data: { household_id: null } })
    expect(await getHouseholdWeekStartDay()).toBe('monday')
    expect(mocks.household).not.toHaveBeenCalled()
  })

  it('falls back to Monday for an unknown value', async () => {
    mocks.profile.mockResolvedValue({ data: { household_id: 'hh-1' } })
    mocks.household.mockResolvedValue({ data: { week_start_day: 'friday' } })
    expect(await getHouseholdWeekStartDay()).toBe('monday')
  })
})
