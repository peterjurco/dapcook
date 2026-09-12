import { render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { RecipeView } from './RecipeView'
import type { Taxonomy } from '@/lib/tags/taxonomy'
import type { Recipe } from '@/types/database'

vi.mock('next-intl/server', () => ({ getLocale: async () => 'en' }))

const recipe = {
  id: 'recipe-1',
  household_id: 'household-1',
  created_by: 'user-1',
  title: 'Tomato Pasta',
  description: 'Fast pasta',
  source_url: 'https://recipes.test/tomato-pasta',
  image_url: 'https://images.test/pasta.jpg',
  prep_time_min: 10,
  cook_time_min: 20,
  servings: 4,
  tags: ['quick', 'vegetarian'],
  ingredients: [
    { id: 'ingredient-1', quantity: 200, unit: 'g', name: 'pasta', notes: '' },
    { id: 'ingredient-2', quantity: 2, unit: '', name: 'tomato', notes: 'chopped' },
  ],
  steps: [
    { id: 'step-1', order: 0, text: 'Boil pasta.' },
    { id: 'step-2', order: 1, text: 'Add tomato.' },
  ],
  notes: '**Serve immediately.**\n\n- Add basil',
  is_archived: false,
  last_used_at: null,
  share_token: null,
  title_normalized: 'tomato pasta',
  created_at: '2026-06-04T00:00:00.000Z',
  updated_at: '2026-06-04T00:00:00.000Z',
} satisfies Recipe

describe('RecipeView', () => {
  it('presents the complete recipe without application actions', async () => {
    render(await RecipeView({ recipe }))

    expect(screen.getByRole('img', { name: 'Tomato Pasta' })).toHaveAttribute(
      'src',
      'https://images.test/pasta.jpg'
    )
    expect(screen.getByRole('heading', { level: 1, name: 'Tomato Pasta' })).toBeInTheDocument()
    expect(screen.getByText('Fast pasta')).toBeInTheDocument()
    expect(screen.getByText('quick')).toBeInTheDocument()
    expect(screen.getByText('vegetarian')).toBeInTheDocument()
    expect(screen.getByText('10m')).toBeInTheDocument()
    expect(screen.getByText('20m')).toBeInTheDocument()
    expect(screen.getByText('30m')).toBeInTheDocument()
    expect(screen.getByText('4')).toBeInTheDocument()
    expect(within(screen.getByRole('complementary')).getByText('200 g')).toBeInTheDocument()
    expect(within(screen.getByRole('complementary')).getByText('2')).toBeInTheDocument()
    expect(screen.getByText('pasta')).toBeInTheDocument()
    expect(screen.getByText('tomato')).toBeInTheDocument()
    expect(screen.getByText(/chopped/)).toBeInTheDocument()
    expect(screen.getByText('Boil pasta.')).toBeInTheDocument()
    expect(screen.getByText('Add tomato.')).toBeInTheDocument()
    expect(screen.getByText('Serve immediately.')).toBeInTheDocument()
    expect(screen.getByText('Add basil')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Original recipe' })).toHaveAttribute(
      'href',
      'https://recipes.test/tomato-pasta'
    )

    expect(screen.queryByRole('button')).toBeNull()
    expect(screen.queryByRole('link', { name: /edit|planner|share|copy|all recipes/i })).toBeNull()
    expect(document.querySelector('form')).toBeNull()
  })

  it('preserves Markdown note links in authenticated mode', async () => {
    render(await RecipeView({ recipe: { ...recipe, notes: 'See [timing tips](https://notes.test/timing).' } }))

    expect(screen.getByRole('link', { name: 'timing tips' })).toHaveAttribute(
      'href',
      'https://notes.test/timing'
    )
  })

  it('colors every tag from the taxonomy, not just the first', async () => {
    const taxonomy: Taxonomy = {
      groups: [],
      tags: {
        quick: { color: '#b45309', groupId: null },
        vegetarian: { color: '#047857', groupId: null },
      },
    }

    render(await RecipeView({ recipe, taxonomy }))

    expect(screen.getByText('quick')).toHaveStyle({ color: '#b45309' })
    expect(screen.getByText('vegetarian')).toHaveStyle({ color: '#047857' })
  })

  it('falls back to a neutral chip for tags with no configured color', async () => {
    render(await RecipeView({ recipe }))

    expect(screen.getByText('quick')).toHaveClass('bg-gray-100', 'text-gray-600')
    expect(screen.getByText('vegetarian')).toHaveClass('bg-gray-100', 'text-gray-600')
  })

  it('renders Markdown note-link text without an anchor in public mode', async () => {
    render(
      await RecipeView({
        recipe: { ...recipe, notes: 'See [timing tips](https://notes.test/timing).' },
        mode: 'public',
      })
    )

    expect(screen.getByText('timing tips')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'timing tips' })).toBeNull()
    expect(screen.getByRole('link', { name: 'Original recipe' })).toHaveAttribute(
      'href',
      'https://recipes.test/tomato-pasta'
    )
  })
})
