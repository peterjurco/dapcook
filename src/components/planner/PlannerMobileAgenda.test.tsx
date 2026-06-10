import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { PlannerMobileAgenda } from './PlannerMobileAgenda'
import { getWeekDays } from '@/lib/utils/week'
import type { MealSlotWithRecipe } from '@/types/planner'

vi.mock('next/link', () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a>,
}))

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
    created_at: '2026-01-01T00:00:00.000Z',
    recipe: { id: `r-${p.id}`, title: p.title, image_url: null, cook_time_min: null, prep_time_min: null, servings: null },
  }
}

const weekDays = getWeekDays(new Date('2026-06-08T00:00:00.000Z'))
const farPast = new Date('2000-01-01T00:00:00.000Z')

describe('PlannerMobileAgenda', () => {
  it('shows a multi-day meal on each covered day with day x/y', () => {
    const soup = recipeSlot({ id: 'soup', day_of_week: 2, span_days: 4, title: 'Soup' }) // Tue–Fri
    render(<PlannerMobileAgenda weekDays={weekDays} today={farPast} slots={[soup]} />)

    expect(screen.getAllByText('Soup')).toHaveLength(4)
    expect(screen.getByText('day 1/4')).toBeInTheDocument()
    expect(screen.getByText('day 4/4')).toBeInTheDocument()
  })

  it('renders empty days as "Nothing planned"', () => {
    render(<PlannerMobileAgenda weekDays={weekDays} today={farPast} slots={[]} />)
    expect(screen.getAllByText('Nothing planned')).toHaveLength(7)
  })

  it('does not show a day badge for single-day meals', () => {
    const lunch = recipeSlot({ id: 'l', day_of_week: 1, span_days: 1, title: 'Lunch' })
    render(<PlannerMobileAgenda weekDays={weekDays} today={farPast} slots={[lunch]} />)
    expect(screen.getByText('Lunch')).toBeInTheDocument()
    expect(screen.queryByText(/day \d+\/\d+/)).toBeNull()
  })
})
