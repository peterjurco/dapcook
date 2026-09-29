import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi } from 'vitest'
import { MobileEditList } from './MobileEditList'
import { buildEditDays } from '@/lib/planner/layout'
import { getWeekDays } from '@/lib/utils/week'
import { placeInWeek } from '@/lib/planner/placement'
import { mockTranslate } from '@/test/mockMessages'
import type { TranslationValues } from 'use-intl'
import type { MealSlotWithRecipe } from '@/types/planner'

vi.mock('next-intl', () => ({
  useLocale: () => 'en',
  useTranslations: (namespace: string) => (key: string, values?: TranslationValues) =>
    mockTranslate(namespace, key, values),
}))

function recipeSlot(p: { id: string; date: string; span_days: number; title: string }): MealSlotWithRecipe {
  return {
    id: p.id,
    household_id: 'household-1',
    date: p.date,
    meal_type: 'lunch',
    recipe_id: `r-${p.id}`,
    custom_label: null,
    servings_scale: 1,
    span_days: p.span_days,
    created_at: '2026-01-01T00:00:00.000Z',
    recipe: { id: `r-${p.id}`, title: p.title, image_url: null, cook_time_min: null, prep_time_min: null, servings: null },
  }
}

const weekStart = new Date(2026, 5, 8)
const weekDays = getWeekDays(weekStart)

function setup(slots: MealSlotWithRecipe[]) {
  const onSpanChange = vi.fn()
  const onMove = vi.fn()
  const onDelete = vi.fn()
  render(
    <MobileEditList
      editDays={buildEditDays(placeInWeek(slots, weekStart))}
      weekDays={weekDays}
      onMove={onMove}
      onDelete={onDelete}
      onSpanChange={onSpanChange}
      onAddRecipe={async () => {}}
      onAddCustom={async () => {}}
    />,
  )
  return { onSpanChange, onMove, onDelete }
}

describe('MobileEditList', () => {
  it('renders multiple meals that start on the same day', () => {
    setup([
      recipeSlot({ id: 'a', date: '2026-06-09', span_days: 1, title: 'Meal A' }),
      recipeSlot({ id: 'b', date: '2026-06-09', span_days: 2, title: 'Meal B' }),
    ])
    expect(screen.getByText('Meal A')).toBeInTheDocument()
    expect(screen.getByText('Meal B')).toBeInTheDocument()
  })

  it('renders the range label for a single day and a pluralized multi-day span', () => {
    setup([
      recipeSlot({ id: 'a', date: '2026-06-09', span_days: 1, title: 'Meal A' }),
      recipeSlot({ id: 'b', date: '2026-06-09', span_days: 2, title: 'Meal B' }),
    ])
    // weekDays[0] = Mon 8 Jun 2026 → 2026-06-09 = Tue 9
    expect(screen.getByText('Tue 9 · 1 day')).toBeInTheDocument()
    expect(screen.getByText('Tue 9 → Wed 10 · 2 days')).toBeInTheDocument()
  })

  it('shows an "Add meal" affordance under every day', () => {
    setup([recipeSlot({ id: 'a', date: '2026-06-09', span_days: 1, title: 'Meal A' })])
    expect(screen.getAllByRole('button', { name: /add meal/i })).toHaveLength(7)
  })

  it('extends the span when the right chevron is clicked', async () => {
    const { onSpanChange } = setup([
      recipeSlot({ id: 'b', date: '2026-06-09', span_days: 2, title: 'Meal B' }),
      recipeSlot({ id: 'a', date: '2026-06-09', span_days: 1, title: 'Meal A' }),
    ])
    // Day 2 ordered by compareInDay → longer span first: 'b' then 'a'
    const extend = screen.getAllByRole('button', { name: /extend by one day/i })
    await userEvent.click(extend[0])
    expect(onSpanChange).toHaveBeenCalledWith('b', 3)
  })

  it('disables shrink at span 1 and provides a move handle per meal', () => {
    setup([recipeSlot({ id: 'a', date: '2026-06-09', span_days: 1, title: 'Meal A' })])
    expect(screen.getByRole('button', { name: /shrink by one day/i })).toBeDisabled()
    expect(screen.getAllByRole('button', { name: /drag to move/i })).toHaveLength(1)
  })

  it('marks a meal continuing from last week and locks its span', () => {
    // Starts Sat 6 Jun, 4 days → visible Mon 8 – Tue 9 in this week
    setup([recipeSlot({ id: 'c', date: '2026-06-06', span_days: 4, title: 'Stew' })])
    expect(screen.getByText('From last week · Mon 8 → Tue 9 · 2 days')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /shrink by one day/i })).toBeDisabled()
    expect(screen.getByRole('button', { name: /extend by one day/i })).toBeDisabled()
    expect(screen.getByRole('button', { name: /drag to move/i })).toBeInTheDocument()
  })
})
