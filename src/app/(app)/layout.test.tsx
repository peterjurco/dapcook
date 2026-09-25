// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  getCurrentProfile: vi.fn(),
  readOnboardingStatus: vi.fn(),
}))

vi.mock('next/navigation', () => ({
  redirect: vi.fn((url: string) => { throw new Error(`REDIRECT:${url}`) }),
}))
vi.mock('@/lib/auth/current-user', () => ({
  getCurrentUser: mocks.getCurrentUser,
  getCurrentProfile: mocks.getCurrentProfile,
}))
vi.mock('@/lib/onboarding/status', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/onboarding/status')>()),
  readOnboardingStatus: mocks.readOnboardingStatus,
}))
vi.mock('next-intl/server', () => ({ getMessages: vi.fn(async () => ({})), setRequestLocale: vi.fn() }))
vi.mock('next-intl', () => ({ NextIntlClientProvider: ({ children }: { children: unknown }) => children }))
vi.mock('@/components/layout/AppShell', () => ({ AppShell: ({ children }: { children: unknown }) => children }))
vi.mock('@/components/providers/PostHogIdentifier', () => ({ PostHogIdentifier: () => null }))

import AppLayout from './layout'

beforeEach(() => {
  vi.clearAllMocks()
  mocks.getCurrentUser.mockResolvedValue({ id: 'user-1', email: 'a@b.c' })
  mocks.getCurrentProfile.mockResolvedValue({ household_id: 'hh-1', ui_language: 'en' })
})

describe('(app) layout', () => {
  it('sends a user without a household to onboarding', async () => {
    mocks.getCurrentProfile.mockResolvedValue({ household_id: null, ui_language: 'en' })
    await expect(AppLayout({ children: null })).rejects.toThrow('REDIRECT:/onboarding')
  })

  it('sends the creator of a household that has not finished the wizard back to it', async () => {
    mocks.readOnboardingStatus.mockResolvedValue({ step: 'tags', createdBy: 'user-1' })
    await expect(AppLayout({ children: null })).rejects.toThrow('REDIRECT:/onboarding')
    expect(mocks.readOnboardingStatus).toHaveBeenCalledWith('hh-1')
  })

  it('lets a member who joined mid-wizard into the app', async () => {
    mocks.readOnboardingStatus.mockResolvedValue({ step: 'tags', createdBy: 'someone-else' })
    await expect(AppLayout({ children: null })).resolves.toBeDefined()
  })

  it('renders the app once onboarding is finished', async () => {
    mocks.readOnboardingStatus.mockResolvedValue({ step: null, createdBy: 'user-1' })
    await expect(AppLayout({ children: null })).resolves.toBeDefined()
  })
})
