import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { RecipeCard } from './RecipeCard'
import { EMPTY_TAXONOMY, type Taxonomy } from '@/lib/tags/taxonomy'
import type { Recipe } from '@/types/database'

vi.mock('next/link', () => ({
  default: ({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) => (
    <a href={href} className={className}>
      {children}
    </a>
  ),
}))

const baseRecipe = {
  id: 'recipe-1',
  household_id: 'household-1',
  created_by: 'user-1',
  title: 'Tomato Pasta',
  description: null,
  source_url: null,
  image_url: null,
  prep_time_min: null,
  cook_time_min: null,
  servings: null,
  tags: [],
  ingredients: [],
  steps: [],
  notes: null,
  is_archived: false,
  last_used_at: null,
  share_token: null,
  title_normalized: 'tomato pasta',
  created_at: '2026-06-04T00:00:00.000Z',
  updated_at: '2026-06-04T00:00:00.000Z',
} satisfies Recipe

const taxonomy: Taxonomy = {
  groups: [
    { id: 'g-course', name: 'Course', position: 0, is_pinned: true },
    { id: 'g-mood', name: 'Mood', position: 1, is_pinned: false },
  ],
  tags: {
    main: { color: null, groupId: 'g-course' },
    comfort: { color: null, groupId: 'g-mood' },
    quick: { color: null, groupId: null },
    vegan: { color: null, groupId: null },
  },
}

describe('RecipeCard', () => {
  it('keeps the add to plan button visible on mobile and hover-revealed on larger screens', () => {
    render(<RecipeCard recipe={baseRecipe} taxonomy={EMPTY_TAXONOMY} />)

    const planButton = screen.getByRole('button', { name: /add to plan/i })

    expect(planButton).toHaveClass('opacity-100')
    expect(planButton).toHaveClass('sm:opacity-0')
    expect(planButton).toHaveClass('sm:group-hover:opacity-100')
  })

  it('shows pinned-group tags before the rest within the three-tag budget', () => {
    const recipe = { ...baseRecipe, tags: ['quick', 'vegan', 'comfort', 'main'] }
    render(<RecipeCard recipe={recipe} taxonomy={taxonomy} />)

    expect(screen.getByText('main')).toBeInTheDocument()
    expect(screen.getByText('quick')).toBeInTheDocument()
    expect(screen.getByText('vegan')).toBeInTheDocument()
    expect(screen.queryByText('comfort')).not.toBeInTheDocument()
    expect(screen.getByText('+1')).toBeInTheDocument()
  })

  it('preserves the recipe tag order when no groups are pinned', () => {
    const recipe = { ...baseRecipe, tags: ['quick', 'vegan'] }
    render(<RecipeCard recipe={recipe} taxonomy={EMPTY_TAXONOMY} />)

    expect(screen.getByText('quick')).toBeInTheDocument()
    expect(screen.getByText('vegan')).toBeInTheDocument()
    expect(screen.queryByText(/^\+/)).not.toBeInTheDocument()
  })
})
