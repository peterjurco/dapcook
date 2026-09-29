// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  getCurrentProfile: vi.fn(),
  readOnboardingStatus: vi.fn(),
  TourProvider: vi.fn(({ children }: { children: unknown }) => children),
}))

vi.mock('next/navigation', () => ({
  redirect: vi.fn((url: string) => { throw new Error(`REDIRECT:${url}`) }),
}))
vi.mock('@/lib/auth/current-user', () => ({
  getCurrentUser: mocks.getCurrentUser,
  getCurrentProfile: mocks.getCurrentProfile,
}))
vi.mock('@/lib/auth/household', () => ({
  getHouseholdWeekStartDay: vi.fn(async () => 'monday'),
}))
vi.mock('@/lib/onboarding/status', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/onboarding/status')>()),
  readOnboardingStatus: mocks.readOnboardingStatus,
}))
vi.mock('next-intl/server', () => ({ getMessages: vi.fn(async () => ({})), setRequestLocale: vi.fn() }))
vi.mock('next-intl', () => ({ NextIntlClientProvider: ({ children }: { children: unknown }) => children }))
vi.mock('@/components/layout/AppShell', () => ({ AppShell: ({ children }: { children: unknown }) => children }))
vi.mock('@/components/tour/TourProvider', () => ({ TourProvider: mocks.TourProvider }))
vi.mock('@/components/providers/PostHogIdentifier', () => ({ PostHogIdentifier: () => null }))

import AppLayout from './layout'

function findProps(node: unknown, type: unknown): Record<string, unknown> | undefined {
  if (Array.isArray(node)) {
    for (const child of node) {
      const found = findProps(child, type)
      if (found) return found
    }
    return undefined
  }
  if (!node || typeof node !== 'object' || !('props' in node)) return undefined
  const el = node as { type: unknown; props: Record<string, unknown> }
  if (el.type === type) return el.props
  return findProps(el.props.children, type)
}

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

  it('seeds TourProvider with the profile tours_seen', async () => {
    mocks.readOnboardingStatus.mockResolvedValue({ step: null, createdBy: 'user-1' })
    mocks.getCurrentProfile.mockResolvedValue({ household_id: 'hh-1', ui_language: 'en', tours_seen: ['plan-recipe'] })
    const tree = await AppLayout({ children: null })
    expect(findProps(tree, mocks.TourProvider)?.initialSeen).toEqual(['plan-recipe'])
  })

  it('falls back to an empty seen list when the profile has no tours_seen', async () => {
    mocks.readOnboardingStatus.mockResolvedValue({ step: null, createdBy: 'user-1' })
    const tree = await AppLayout({ children: null })
    expect(findProps(tree, mocks.TourProvider)?.initialSeen).toEqual([])
  })
})
