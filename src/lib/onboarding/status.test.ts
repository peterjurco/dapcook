import { describe, expect, it, vi, beforeEach } from 'vitest'
import { readOnboardingStatus, needsOnboarding, forgetOnboardingStep, onboardingCacheTag } from './status'

const mocks = vi.hoisted(() => ({
  revalidateTag: vi.fn(),
  single: vi.fn(),
  eq: vi.fn(),
}))

vi.mock('next/cache', () => ({
  // Run the callback straight through; the caching itself is Next's job.
  unstable_cache: (fn: (...a: unknown[]) => unknown) => fn,
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

beforeEach(() => {
  vi.clearAllMocks()
})

describe('readOnboardingStatus', () => {
  it('returns the household’s current step and its creator', async () => {
    mocks.single.mockResolvedValue({ data: { onboarding_step: 'tags', created_by: 'user-1' }, error: null })

    expect(await readOnboardingStatus('house-1')).toEqual({ step: 'tags', createdBy: 'user-1' })
    expect(mocks.eq).toHaveBeenCalledWith('id', 'house-1')
  })

  it('returns a null step once onboarding is finished', async () => {
    mocks.single.mockResolvedValue({ data: { onboarding_step: null, created_by: null }, error: null })

    expect(await readOnboardingStatus('house-1')).toEqual({ step: null, createdBy: null })
  })

  it('throws instead of caching a false "finished" when the query errors', async () => {
    mocks.single.mockResolvedValue({ data: null, error: { message: 'boom' } })

    await expect(readOnboardingStatus('house-1')).rejects.toThrow()
  })
})

describe('needsOnboarding', () => {
  it('is true only for the creator of a household still in the wizard', () => {
    expect(needsOnboarding({ step: 'tags', createdBy: 'user-1' }, 'user-1')).toBe(true)
    expect(needsOnboarding({ step: 'tags', createdBy: 'user-1' }, 'user-2')).toBe(false)
    expect(needsOnboarding({ step: 'tags', createdBy: null }, 'user-1')).toBe(false)
    expect(needsOnboarding({ step: null, createdBy: 'user-1' }, 'user-1')).toBe(false)
  })
})

describe('forgetOnboardingStep', () => {
  it('invalidates that household’s cache entry', () => {
    forgetOnboardingStep('house-1')

    expect(mocks.revalidateTag).toHaveBeenCalledWith(onboardingCacheTag('house-1'))
  })
})
