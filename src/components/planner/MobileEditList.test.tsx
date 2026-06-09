import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi } from 'vitest'
import { MobileEditList } from './MobileEditList'
import { buildEditDays } from '@/lib/planner/layout'
import { getWeekDays } from '@/lib/utils/week'
import type { MealSlotWithRecipe } from '@/types/planner'

function recipeSlot(p: { id: string; day_of_week: number; span_days: number; title: string }): MealSlotWithRecipe {
  return {
    id: p.id,
    week_plan_id: 'w',
    day_of_week: p.day_of_week,
    meal_type: 'lunch',
    recipe_id: `r-${p.id}`,
    custom_label: null,
    servings_scale: 1,
    span_days: p.span_days,
    recipe: { id: `r-${p.id}`, title: p.title, image_url: null, cook_time_min: null, prep_time_min: null, servings: null },
  }
}

const weekDays = getWeekDays(new Date('2026-06-08T00:00:00.000Z'))

function setup(slots: MealSlotWithRecipe[]) {
  const onSpanChange = vi.fn()
  const onMove = vi.fn()
  const onDelete = vi.fn()
  render(
    <MobileEditList
      editDays={buildEditDays(slots)}
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
      recipeSlot({ id: 'a', day_of_week: 2, span_days: 1, title: 'Meal A' }),
      recipeSlot({ id: 'b', day_of_week: 2, span_days: 2, title: 'Meal B' }),
    ])
    expect(screen.getByText('Meal A')).toBeInTheDocument()
    expect(screen.getByText('Meal B')).toBeInTheDocument()
  })

  it('shows an "Add meal" affordance under every day', () => {
    setup([recipeSlot({ id: 'a', day_of_week: 2, span_days: 1, title: 'Meal A' })])
    expect(screen.getAllByRole('button', { name: /add meal/i })).toHaveLength(7)
  })

  it('extends the span when the right chevron is clicked', async () => {
    const { onSpanChange } = setup([
      recipeSlot({ id: 'b', day_of_week: 2, span_days: 2, title: 'Meal B' }),
      recipeSlot({ id: 'a', day_of_week: 2, span_days: 1, title: 'Meal A' }),
    ])
    // Day 2 ordered by compareInDay → longer span first: 'b' then 'a'
    const extend = screen.getAllByRole('button', { name: /extend by one day/i })
    await userEvent.click(extend[0])
    expect(onSpanChange).toHaveBeenCalledWith('b', 3)
  })

  it('disables shrink at span 1 and provides a move handle per meal', () => {
    setup([recipeSlot({ id: 'a', day_of_week: 2, span_days: 1, title: 'Meal A' })])
    expect(screen.getByRole('button', { name: /shrink by one day/i })).toBeDisabled()
    expect(screen.getAllByRole('button', { name: /drag to move/i })).toHaveLength(1)
  })
})
