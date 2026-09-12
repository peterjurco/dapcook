import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import RecipeDetailPage from './page'
import { mockTranslate } from '@/test/mockMessages'
import type { Recipe } from '@/types/database'

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

vi.mock('next/navigation', () => ({
  notFound: vi.fn(() => {
    throw new Error('not found')
  }),
}))

vi.mock('next-intl/server', () => ({
  getLocale: async () => 'en',
  getTranslations: async ({ namespace }: { namespace: string }) => (key: string) => mockTranslate(namespace, key),
}))

vi.mock('next/link', () => ({
  default: ({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) => (
    <a href={href} className={className}>
      {children}
    </a>
  ),
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: () => ({
    from: (table: string) => {
      if (table === 'recipes') {
        return {
          select: () => ({
            eq: () => ({
              single: async () => ({ data: recipe, error: null }),
            }),
          }),
        }
      }
      if (table === 'tags') {
        return { select: () => Promise.resolve({ data: [], error: null }) }
      }
      if (table === 'tag_groups') {
        return { select: () => ({ order: () => Promise.resolve({ data: [], error: null }) }) }
      }
      throw new Error(`Unexpected table: ${table}`)
    },
  }),
}))

vi.mock('@/components/recipe/DeleteRecipeButton', () => ({
  DeleteRecipeButton: () => <button type="button">Delete</button>,
}))

describe('RecipeDetailPage', () => {
  it('shows add to plan instead of delete in read mode', async () => {
    render(await RecipeDetailPage({ params: { id: 'recipe-1' } }))

    expect(screen.getByRole('button', { name: /add to plan/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Share' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /delete/i })).toBeNull()
  })
})
