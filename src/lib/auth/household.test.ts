import { describe, expect, it, vi, beforeEach } from 'vitest'
import { getCurrentHouseholdId, forgetHouseholdId, householdCacheTag } from './household'

const mocks = vi.hoisted(() => ({
  revalidateTag: vi.fn(),
  cacheKeys: [] as string[][],
  single: vi.fn(),
  eq: vi.fn(),
  getCurrentUser: vi.fn(),
}))

vi.mock('next/cache', () => ({
  // Run the callback straight through; the caching itself is Next's job.
  unstable_cache: (fn: (...a: unknown[]) => unknown, keys: string[]) => {
    mocks.cacheKeys.push(keys)
    return fn
  },
  revalidateTag: mocks.revalidateTag,
}))

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: () => ({
      select: () => ({
        eq: (...args: unknown[]) => {
          mocks.eq(...args)
          return { single: mocks.single }
        },
      }),
    }),
  }),
}))

vi.mock('./current-user', () => ({ getCurrentUser: mocks.getCurrentUser }))

beforeEach(() => {
  vi.clearAllMocks()
  mocks.cacheKeys.length = 0
})

describe('getCurrentHouseholdId', () => {
  it('returns the household the signed-in user belongs to', async () => {
    mocks.getCurrentUser.mockResolvedValue({ id: 'user-1', email: null })
    mocks.single.mockResolvedValue({ data: { household_id: 'house-1' } })

    expect(await getCurrentHouseholdId()).toBe('house-1')
    expect(mocks.eq).toHaveBeenCalledWith('id', 'user-1')
  })

  it('returns null for a user who has not joined a household yet', async () => {
    mocks.getCurrentUser.mockResolvedValue({ id: 'user-1', email: null })
    mocks.single.mockResolvedValue({ data: { household_id: null } })

    expect(await getCurrentHouseholdId()).toBeNull()
  })

  it('does not go to the database when nobody is signed in', async () => {
    mocks.getCurrentUser.mockResolvedValue(null)

    expect(await getCurrentHouseholdId()).toBeNull()
    expect(mocks.single).not.toHaveBeenCalled()
  })

  it('keys the cache by user, so one member never sees another household', async () => {
    mocks.getCurrentUser.mockResolvedValue({ id: 'user-1', email: null })
    mocks.single.mockResolvedValue({ data: { household_id: 'house-1' } })
    await getCurrentHouseholdId()

    mocks.getCurrentUser.mockResolvedValue({ id: 'user-2', email: null })
    mocks.single.mockResolvedValue({ data: { household_id: 'house-2' } })
    expect(await getCurrentHouseholdId()).toBe('house-2')

    const keys = mocks.cacheKeys.map((k) => k.join('/'))
    expect(new Set(keys).size).toBe(keys.length)
    expect(keys.some((k) => k.includes('user-1'))).toBe(true)
    expect(keys.some((k) => k.includes('user-2'))).toBe(true)
  })
})

describe('forgetHouseholdId', () => {
  it('drops just that user’s entry when their household changes', () => {
    forgetHouseholdId('user-1')

    expect(mocks.revalidateTag).toHaveBeenCalledWith(householdCacheTag('user-1'))
    expect(householdCacheTag('user-1')).not.toBe(householdCacheTag('user-2'))
  })
})
