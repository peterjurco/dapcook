/**
 * Server-rendered recipe pages must pick up the user's interface language.
 *
 * They call `getTranslations()` without a locale, which only works because
 * `i18n/request.ts` falls back to the profile's `ui_language` — relying on
 * `setRequestLocale()` from the layout is not enough, since Next renders
 * layouts and pages in parallel. These tests drive the real i18n pipeline
 * instead of stubbing translations, so a regression shows up as English copy.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import type { Recipe } from '@/types/database'

const { mockGetCurrentProfile } = vi.hoisted(() => ({ mockGetCurrentProfile: vi.fn() }))

vi.mock('@/lib/auth/current-user', () => ({
  getCurrentProfile: mockGetCurrentProfile,
  getCurrentUser: async () => ({ id: 'user-1' }),
}))

type RequestConfigFn = (args: {
  locale: string | undefined
  requestLocale: Promise<string | undefined>
}) => Promise<{ locale: string; messages: Record<string, Record<string, unknown>> }>

vi.mock('next-intl/server', () => {
  async function loadConfig(locale?: string) {
    const mod = await import('@/i18n/request')
    return (mod.default as unknown as RequestConfigFn)({
      locale,
      requestLocale: Promise.resolve(undefined),
    })
  }

  return {
    getRequestConfig: (fn: unknown) => fn,
    getLocale: async () => (await loadConfig()).locale,
    getTranslations: async (arg: string | { locale?: string; namespace: string }) => {
      const namespace = typeof arg === 'string' ? arg : arg.namespace
      const explicitLocale = typeof arg === 'string' ? undefined : arg.locale
      const config = await loadConfig(explicitLocale)
      const { createTranslator } = await import('use-intl')
      return createTranslator({ locale: config.locale as 'en' | 'sk', namespace, messages: config.messages })
    },
  }
})

const recipe = {
  id: 'recipe-1',
  household_id: 'household-1',
  created_by: 'user-1',
  title: 'Tomato Pasta',
  description: null,
  source_url: null,
  image_url: null,
  prep_time_min: 10,
  cook_time_min: 20,
  servings: 4,
  tags: [],
  ingredients: [{ id: 'i1', quantity: 2, unit: 'ČL', name: 'soľ', notes: '' }],
  steps: [{ id: 's1', order: 1, text: 'Uvarte cestoviny.' }],
  notes: null,
  is_archived: false,
  last_used_at: null,
  share_token: null,
  title_normalized: 'tomato pasta',
  created_at: '2026-06-04T00:00:00.000Z',
  updated_at: '2026-06-04T00:00:00.000Z',
} satisfies Recipe

vi.mock('@/lib/supabase/server', () => ({
  createClient: () => ({
    from: (table: string) => {
      if (table === 'recipes') {
        return { select: () => ({ eq: () => ({ single: async () => ({ data: recipe, error: null }) }) }) }
      }
      if (table === 'tags') return { select: async () => ({ data: [], error: null }) }
      if (table === 'tag_groups') {
        return { select: () => ({ order: async () => ({ data: [], error: null }) }) }
      }
      throw new Error(`Unexpected table: ${table}`)
    },
  }),
}))

vi.mock('next/navigation', () => ({ notFound: vi.fn(() => { throw new Error('not found') }) }))
vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a>,
}))
vi.mock('@/components/recipe/AddToPlanButton', () => ({ AddToPlanButton: () => <button type="button">plan</button> }))
vi.mock('@/components/recipe/ShareRecipeButton', () => ({ ShareRecipeButton: () => <button type="button">share</button> }))
vi.mock('@/components/recipe/RecipeForm', () => ({ RecipeForm: () => <form /> }))

import RecipeDetailPage from './[id]/page'
import EditRecipePage from './[id]/edit/page'
import NewRecipePage from './new/page'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('recipe pages — interface language', () => {
  describe('with a Slovak profile', () => {
    beforeEach(() => {
      mockGetCurrentProfile.mockResolvedValue({ ui_language: 'sk' })
    })

    it('renders the detail page in Slovak', async () => {
      render(await RecipeDetailPage({ params: { id: 'recipe-1' } }))

      expect(screen.getByText('Suroviny')).toBeInTheDocument()
      expect(screen.getByText('Postup')).toBeInTheDocument()
      expect(screen.getByText('Upraviť')).toBeInTheDocument()
      expect(screen.getByText('Všetky recepty')).toBeInTheDocument()
      expect(screen.getByText('Porcie')).toBeInTheDocument()
      expect(screen.getByText('Príprava')).toBeInTheDocument()
    })

    it('renders the edit page in Slovak', async () => {
      render(await EditRecipePage({ params: { id: 'recipe-1' } }))

      expect(screen.getByText('Upraviť recept')).toBeInTheDocument()
      expect(screen.getByText('Späť na recept')).toBeInTheDocument()
    })

    it('renders the new recipe page in Slovak', async () => {
      render(await NewRecipePage())

      expect(screen.getByText('Nový recept')).toBeInTheDocument()
      expect(screen.getByText('Pridajte recept od začiatku')).toBeInTheDocument()
    })
  })

  describe('without a profile language', () => {
    beforeEach(() => {
      mockGetCurrentProfile.mockResolvedValue({ ui_language: null })
    })

    it('falls back to English', async () => {
      render(await RecipeDetailPage({ params: { id: 'recipe-1' } }))

      expect(screen.getByText('Ingredients')).toBeInTheDocument()
      expect(screen.getByText('Edit')).toBeInTheDocument()
    })
  })
})
