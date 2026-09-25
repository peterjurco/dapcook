// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  getCurrentProfile: vi.fn(),
  readOnboardingStep: vi.fn(),
}))

vi.mock('next/navigation', () => ({
  redirect: vi.fn((url: string) => { throw new Error(`REDIRECT:${url}`) }),
}))
vi.mock('@/lib/auth/current-user', () => ({
  getCurrentUser: mocks.getCurrentUser,
  getCurrentProfile: mocks.getCurrentProfile,
}))
vi.mock('@/lib/onboarding/status', () => ({ readOnboardingStep: mocks.readOnboardingStep }))
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

  it('sends a household that has not finished the wizard back to it', async () => {
    mocks.readOnboardingStep.mockResolvedValue('tags')
    await expect(AppLayout({ children: null })).rejects.toThrow('REDIRECT:/onboarding')
    expect(mocks.readOnboardingStep).toHaveBeenCalledWith('hh-1')
  })

  it('renders the app once onboarding is finished', async () => {
    mocks.readOnboardingStep.mockResolvedValue(null)
    await expect(AppLayout({ children: null })).resolves.toBeDefined()
  })
})
