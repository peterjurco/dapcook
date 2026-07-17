import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { RecipeCard } from './RecipeCard'
import type { Recipe } from '@/types/database'

vi.mock('next/link', () => ({
  default: ({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) => (
    <a href={href} className={className}>
      {children}
    </a>
  ),
}))

const recipe = {
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

describe('RecipeCard', () => {
  it('keeps the add to plan button visible on mobile and hover-revealed on larger screens', () => {
    render(<RecipeCard recipe={recipe} tagColors={{}} />)

    const planButton = screen.getByRole('button', { name: /add to plan/i })

    expect(planButton).toHaveClass('opacity-100')
    expect(planButton).toHaveClass('sm:opacity-0')
    expect(planButton).toHaveClass('sm:group-hover:opacity-100')
  })
})
