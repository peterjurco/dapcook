import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { buildRecipeJsonLd } from '@/lib/recipes/recipe-json-ld'
import type { Recipe } from '@/types/database'
import SharedRecipePage, { dynamic, metadata } from './page'

const recipe = {
  id: 'recipe-1',
  household_id: 'household-1',
  created_by: 'user-1',
  title: 'Tomato < Pasta',
  description: 'Fast pasta',
  source_url: null,
  image_url: null,
  prep_time_min: 10,
  cook_time_min: 20,
  servings: 4,
  tags: ['quick'],
  ingredients: [{ id: 'ingredient-1', quantity: 200, unit: 'g', name: 'pasta', notes: '' }],
  steps: [{ id: 'step-1', order: 0, text: 'Boil pasta.' }],
  notes: null,
  is_archived: false,
  last_used_at: null,
  share_token: 'public-token',
  title_normalized: 'tomato pasta',
  created_at: '2026-06-04T00:00:00.000Z',
  updated_at: '2026-06-04T00:00:00.000Z',
} satisfies Recipe

const mocks = vi.hoisted(() => {
  const maybeSingle = vi.fn()
  const eq = vi.fn()
  const select = vi.fn()
  const from = vi.fn()
  const notFound = vi.fn(() => {
    throw new Error('not found')
  })
  const noStore = vi.fn()

  return { maybeSingle, eq, select, from, notFound, noStore }
})

vi.mock('next/cache', () => ({ unstable_noStore: mocks.noStore }))
vi.mock('next/navigation', () => ({ notFound: mocks.notFound }))
vi.mock('next-intl/server', () => ({
  getLocale: async () => 'en',
  getTranslations: async () => (key: string) => key,
}))

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({ from: mocks.from }),
}))

vi.mock('@/components/recipe/RecipeView', () => ({
  RecipeView: ({ recipe: renderedRecipe, toolbar, mode }: { recipe: Recipe; toolbar?: React.ReactNode; mode?: string }) => (
    <div data-testid="recipe-view" data-recipe-id={renderedRecipe.id} data-has-toolbar={Boolean(toolbar)} data-mode={mode} />
  ),
}))

function setQueryResult(data: Recipe | null, error: unknown = null) {
  mocks.maybeSingle.mockResolvedValue({ data, error })
  mocks.eq.mockReturnValue({ eq: mocks.eq, maybeSingle: mocks.maybeSingle })
  mocks.select.mockReturnValue({ eq: mocks.eq })
  mocks.from.mockImplementation((table: string) => {
    if (table === 'recipes') return { select: mocks.select }
    if (table === 'tags') return { select: () => ({ eq: () => Promise.resolve({ data: [], error: null }) }) }
    if (table === 'tag_groups') {
      return { select: () => ({ eq: () => ({ order: () => Promise.resolve({ data: [], error: null }) }) }) }
    }
    throw new Error(`Unexpected table: ${table}`)
  })
}

describe('SharedRecipePage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('queries an exact token and requires is_archived=false', async () => {
    setQueryResult(recipe)

    await SharedRecipePage({ params: { token: 'public-token' } })

    expect(mocks.from).toHaveBeenCalledWith('recipes')
    expect(mocks.select).toHaveBeenCalledWith('*')
    expect(mocks.eq).toHaveBeenNthCalledWith(1, 'share_token', 'public-token')
    expect(mocks.eq).toHaveBeenNthCalledWith(2, 'is_archived', false)
    expect(mocks.maybeSingle).toHaveBeenCalledOnce()
  })

  it('renders RecipeView and Recipe JSON-LD for an active token', async () => {
    setQueryResult(recipe)

    const { container } = render(await SharedRecipePage({ params: { token: 'public-token' } }))

    expect(container.querySelector('main')).toHaveClass('min-h-dvh', 'bg-gray-50', 'text-gray-900')
    expect(screen.getByTestId('recipe-view')).toHaveAttribute('data-recipe-id', recipe.id)
    expect(screen.getByTestId('recipe-view')).toHaveAttribute('data-has-toolbar', 'false')
    expect(screen.getByTestId('recipe-view')).toHaveAttribute('data-mode', 'public')

    const script = container.querySelector('script[type="application/ld+json"]')
    expect(script).not.toBeNull()
    expect(script?.textContent).not.toContain('<')
    expect(JSON.parse(script!.textContent!)).toEqual(buildRecipeJsonLd(recipe))
  })

  it('calls notFound for an unknown token', async () => {
    setQueryResult(null)

    await expect(SharedRecipePage({ params: { token: 'missing-token' } })).rejects.toThrow('not found')

    expect(mocks.notFound).toHaveBeenCalledOnce()
  })

  it('exports noindex and nofollow metadata', () => {
    expect(metadata.robots).toEqual({ index: false, follow: false })
  })

  it('forces dynamic rendering and disables the server cache', async () => {
    setQueryResult(recipe)

    await SharedRecipePage({ params: { token: 'public-token' } })

    expect(dynamic).toBe('force-dynamic')
    expect(mocks.noStore).toHaveBeenCalledOnce()
  })
})
