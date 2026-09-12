import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { GenerateShoppingPage } from './GenerateShoppingPage'
import { mockTranslate } from '@/test/mockMessages'
import type { TranslationValues } from 'use-intl'
import type { MealSlotWithRecipe } from '@/types/planner'

const mockPush = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: mockPush }) }))
vi.mock('next-intl', () => ({
  useLocale: () => 'en',
  useTranslations: (namespace: string) => (key: string, values?: TranslationValues) =>
    mockTranslate(namespace, key, values),
}))

beforeEach(() => {
  vi.clearAllMocks()
  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ items: [], categories: [] }),
  } as Response)
})

function recipeSlot(p: { id: string; day_of_week: number; title: string; servings: number | null }): MealSlotWithRecipe {
  return {
    id: `slot-${p.id}`,
    week_plan_id: 'w',
    day_of_week: p.day_of_week,
    meal_type: 'lunch',
    recipe_id: p.id,
    custom_label: null,
    servings_scale: 1,
    span_days: 1,
    created_at: '2026-01-01T00:00:00.000Z',
    recipe: { id: p.id, title: p.title, image_url: null, cook_time_min: null, prep_time_min: null, servings: p.servings },
  }
}

function customSlot(p: { id: string; day_of_week: number; label: string }): MealSlotWithRecipe {
  return {
    id: `slot-${p.id}`,
    week_plan_id: 'w',
    day_of_week: p.day_of_week,
    meal_type: 'lunch',
    recipe_id: null,
    custom_label: p.label,
    servings_scale: 1,
    span_days: 1,
    created_at: '2026-01-01T00:00:00.000Z',
    recipe: null,
  }
}

const weekStart = new Date('2026-06-08T00:00:00.000Z')

function lastFetchBody() {
  const calls = (global.fetch as unknown as { mock: { calls: unknown[][] } }).mock.calls
  const init = calls[calls.length - 1][1] as RequestInit
  return JSON.parse(init.body as string) as {
    recipes: { recipe_id: string; portions: number }[]
    customItems: { name: string; portions: number }[]
  }
}

describe('GenerateShoppingPage', () => {
  it('lists typed custom meals but excludes preset status labels', () => {
    render(
      <GenerateShoppingPage
        weekStart={weekStart}
        slots={[
          recipeSlot({ id: 'r1', day_of_week: 1, title: 'Pasta', servings: 2 }),
          customSlot({ id: 'c1', day_of_week: 2, label: 'rice' }),
          customSlot({ id: 'c2', day_of_week: 3, label: 'Eating out' }),
        ]}
      />,
    )
    expect(screen.getByText('Pasta')).toBeInTheDocument()
    expect(screen.getByText('rice')).toBeInTheDocument()
    expect(screen.queryByText('Eating out')).toBeNull()
  })

  it('sends custom meals as customItems with portions (default 1)', async () => {
    render(
      <GenerateShoppingPage
        weekStart={weekStart}
        slots={[
          recipeSlot({ id: 'r1', day_of_week: 1, title: 'Pasta', servings: 2 }),
          customSlot({ id: 'c1', day_of_week: 2, label: 'rice' }),
        ]}
      />,
    )

    await userEvent.click(screen.getByRole('button', { name: /generate shopping list/i }))

    await waitFor(() => expect(global.fetch).toHaveBeenCalledWith('/api/shopping/preview', expect.anything()))
    const body = lastFetchBody()
    expect(body.recipes).toEqual([{ recipe_id: 'r1', portions: 2 }])
    expect(body.customItems).toEqual([{ name: 'rice', portions: 1 }])
  })

  it('collapses the same custom meal across days into one row', () => {
    render(
      <GenerateShoppingPage
        weekStart={weekStart}
        slots={[
          customSlot({ id: 'c1', day_of_week: 1, label: 'rice' }),
          customSlot({ id: 'c2', day_of_week: 3, label: 'rice' }),
        ]}
      />,
    )
    expect(screen.getAllByText('rice')).toHaveLength(1)
  })
})
