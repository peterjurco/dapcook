// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'

const mocks = vi.hoisted(() => ({
  getCurrentProfile: vi.fn(),
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`)
  }),
  household: null as Record<string, unknown> | null,
  categories: [] as unknown[],
  rules: [] as unknown[],
  tagGroups: [] as unknown[],
  tags: [] as unknown[],
}))

function chain(resolve: () => Promise<{ data: unknown }>) {
  const builder = {
    select: () => builder,
    eq: () => builder,
    order: () => resolve(),
    single: () => resolve(),
  }
  return builder
}

vi.mock('next/navigation', () => ({ redirect: mocks.redirect }))
vi.mock('@/lib/auth/current-user', () => ({ getCurrentProfile: mocks.getCurrentProfile }))
vi.mock('@/lib/supabase/server', () => ({
  createClient: () => ({
    from: (table: string) => {
      if (table === 'households') return chain(async () => ({ data: mocks.household }))
      if (table === 'shopping_categories') return chain(async () => ({ data: mocks.categories }))
      if (table === 'shopping_rules') return chain(async () => ({ data: mocks.rules }))
      if (table === 'tag_groups') return chain(async () => ({ data: mocks.tagGroups }))
      if (table === 'tags') return chain(async () => ({ data: mocks.tags }))
      throw new Error(`unexpected table ${table}`)
    },
  }),
}))
vi.mock('@/components/onboarding/OnboardingWizard', () => ({
  OnboardingWizard: () => null,
}))

import OnboardingPage from './page'

beforeEach(() => {
  vi.clearAllMocks()
  mocks.household = null
  mocks.categories = []
  mocks.rules = []
  mocks.tagGroups = []
  mocks.tags = []
})

describe('OnboardingPage', () => {
  it('starts a user without a household at the language step', async () => {
    mocks.getCurrentProfile.mockResolvedValue({ household_id: null, ui_language: 'en' })

    const result = await OnboardingPage()

    expect(result.props.initialStep).toBe('language')
    expect(result.props.locale).toBe('en')
    expect(result.props.household).toBeUndefined()
  })

  it('resumes a household at its stored onboarding step', async () => {
    mocks.getCurrentProfile.mockResolvedValue({ id: 'user-1', household_id: 'hh-1', ui_language: 'sk' })
    mocks.household = {
      onboarding_step: 'tags',
      created_by: 'user-1',
      translation_enabled: true,
      preferred_language: 'sk',
      preferred_units: 'metric',
    }
    mocks.categories = [{ id: 'cat-1' }]
    mocks.rules = [{ id: 'rule-1' }]

    const result = await OnboardingPage()

    expect(result.props.initialStep).toBe('tags')
    expect(result.props.locale).toBe('sk')
    expect(result.props.household).toEqual({
      translationEnabled: true,
      preferredLanguage: 'sk',
      preferredUnits: 'metric',
    })
    expect(result.props.categories).toEqual([{ id: 'cat-1' }])
    expect(result.props.rules).toEqual([{ id: 'rule-1' }])
  })

  it('passes the saved tags in, mapped onto the catalog', async () => {
    mocks.getCurrentProfile.mockResolvedValue({ id: 'user-1', household_id: 'hh-1', ui_language: 'en' })
    mocks.household = {
      onboarding_step: 'shopping_categories',
      created_by: 'user-1',
      translation_enabled: false,
      preferred_language: 'en',
      preferred_units: 'metric',
    }
    mocks.tagGroups = [{ id: 'g1', name: 'Course' }, { id: 'g2', name: 'Diet' }]
    mocks.tags = [
      { name: 'Soup', group_id: 'g1' },
      { name: 'Paleo', group_id: 'g2' },
      { name: 'loose', group_id: null },
    ]

    const result = await OnboardingPage()

    expect(result.props.tags).toEqual({
      selected: { course: ['Soup'], diet: ['Paleo'] },
      custom: { diet: ['Paleo'] },
    })
  })

  it('sends a household that has finished onboarding to recipes', async () => {
    mocks.getCurrentProfile.mockResolvedValue({ id: 'user-1', household_id: 'hh-1', ui_language: 'en' })
    mocks.household = {
      onboarding_step: null,
      created_by: 'user-1',
      translation_enabled: false,
      preferred_language: 'en',
      preferred_units: 'metric',
    }

    await expect(OnboardingPage()).rejects.toThrow('REDIRECT:/recipes')
  })

  it('sends a member who is not the household creator to recipes', async () => {
    mocks.getCurrentProfile.mockResolvedValue({ id: 'user-2', household_id: 'hh-1', ui_language: 'en' })
    mocks.household = {
      onboarding_step: 'tags',
      created_by: 'user-1',
      translation_enabled: false,
      preferred_language: 'en',
      preferred_units: 'metric',
    }

    await expect(OnboardingPage()).rejects.toThrow('REDIRECT:/recipes')
  })

  it('starts at the done screen when the stored step is no longer known', async () => {
    mocks.getCurrentProfile.mockResolvedValue({ id: 'user-1', household_id: 'hh-1', ui_language: 'en' })
    mocks.household = {
      onboarding_step: 'shopping_rules',
      created_by: 'user-1',
      translation_enabled: false,
      preferred_language: 'en',
      preferred_units: 'metric',
    }

    const result = await OnboardingPage()

    expect(result.props.initialStep).toBe('done')
  })
})
