import { describe, expect, it, vi, beforeEach } from 'vitest'
import { readOnboardingStep, forgetOnboardingStep, onboardingCacheTag } from './status'

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

describe('readOnboardingStep', () => {
  it('returns the household’s current step', async () => {
    mocks.single.mockResolvedValue({ data: { onboarding_step: 'tags' }, error: null })

    expect(await readOnboardingStep('house-1')).toBe('tags')
    expect(mocks.eq).toHaveBeenCalledWith('id', 'house-1')
  })

  it('returns null once onboarding is finished', async () => {
    mocks.single.mockResolvedValue({ data: { onboarding_step: null }, error: null })

    expect(await readOnboardingStep('house-1')).toBeNull()
  })

  it('throws instead of caching a false "finished" when the query errors', async () => {
    mocks.single.mockResolvedValue({ data: null, error: { message: 'boom' } })

    await expect(readOnboardingStep('house-1')).rejects.toThrow()
  })
})

describe('forgetOnboardingStep', () => {
  it('invalidates that household’s cache entry', () => {
    forgetOnboardingStep('house-1')

    expect(mocks.revalidateTag).toHaveBeenCalledWith(onboardingCacheTag('house-1'))
  })
})
