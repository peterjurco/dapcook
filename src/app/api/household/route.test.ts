// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const mocks = vi.hoisted(() => ({
  update: vi.fn(),
  single: vi.fn(),
  forgetOnboardingStep: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: () => ({
    from: () => ({
      update: (values: unknown) => {
        mocks.update(values)
        return { eq: () => ({ select: () => ({ single: mocks.single }) }) }
      },
    }),
  }),
}))
vi.mock('@/lib/auth/current-user', () => ({ getCurrentUser: vi.fn(async () => ({ id: 'user-1', email: null })) }))
vi.mock('@/lib/auth/household', async () => ({
  getCurrentHouseholdId: (await import('@/test/householdMock')).householdIdMock,
}))
vi.mock('@/lib/onboarding/status', () => ({ forgetOnboardingStep: mocks.forgetOnboardingStep }))

import { PATCH } from './route'
import { householdIdMock } from '@/test/householdMock'

function patch(body: unknown) {
  return PATCH(new NextRequest('http://localhost/api/household', { method: 'PATCH', body: JSON.stringify(body) }))
}

beforeEach(() => {
  vi.clearAllMocks()
  householdIdMock.mockResolvedValue('hh-1')
  mocks.single.mockResolvedValue({ data: { id: 'hh-1' }, error: null })
})

describe('PATCH /api/household', () => {
  it('renames the household, trimming whitespace', async () => {
    const res = await patch({ name: '  Our kitchen ' })
    expect(res.status).toBe(200)
    expect(mocks.update).toHaveBeenCalledWith({ name: 'Our kitchen' })
  })

  it('rejects an empty or overlong name', async () => {
    expect((await patch({ name: '   ' })).status).toBe(400)
    expect((await patch({ name: 'x'.repeat(81) })).status).toBe(400)
    expect(mocks.update).not.toHaveBeenCalled()
  })

  it('stores the onboarding step and invalidates the cached status', async () => {
    const res = await patch({ onboarding_step: 'tags' })
    expect(res.status).toBe(200)
    expect(mocks.update).toHaveBeenCalledWith({ onboarding_step: 'tags' })
    expect(mocks.forgetOnboardingStep).toHaveBeenCalledWith('hh-1')
  })

  it('accepts null to finish onboarding', async () => {
    await patch({ onboarding_step: null })
    expect(mocks.update).toHaveBeenCalledWith({ onboarding_step: null })
  })

  it('rejects steps that are not stored in the database', async () => {
    expect((await patch({ onboarding_step: 'household' })).status).toBe(400)
  })

  it('does not touch the onboarding cache for other updates', async () => {
    await patch({ preferred_units: 'imperial' })
    expect(mocks.forgetOnboardingStep).not.toHaveBeenCalled()
  })

  it('rejects an empty update', async () => {
    expect((await patch({})).status).toBe(400)
  })
})
