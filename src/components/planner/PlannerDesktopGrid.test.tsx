import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { DndContext } from '@dnd-kit/core'
import { PlannerDesktopGrid } from './PlannerDesktopGrid'
import { getWeekDays } from '@/lib/utils/week'
import { mockTranslate } from '@/test/mockMessages'
import type { TranslationValues } from 'use-intl'
import type { MealSlotWithRecipe } from '@/types/planner'

vi.mock('next/link', () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a>,
}))

vi.mock('next-intl', () => ({
  useLocale: () => 'en',
  useTranslations: (namespace: string) => (key: string, values?: TranslationValues) =>
    mockTranslate(namespace, key, values),
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
const noop = () => {}

function renderGrid(slots: MealSlotWithRecipe[]) {
  render(
    <DndContext>
      <PlannerDesktopGrid
        weekDays={weekDays}
        today={new Date('2000-01-01T00:00:00.000Z')}
        slots={slots}
        openSearchDay={null}
        addingToDay={null}
        onOpenSearch={noop}
        onCloseSearch={noop}
        onAddRecipe={noop}
        onAddCustom={noop}
        onDelete={noop}
        onSpanPreview={noop}
        onSpanCommit={noop}
      />
    </DndContext>,
  )
}

describe('PlannerDesktopGrid', () => {
  it('renders one add affordance per day and the meal cards', () => {
    renderGrid([
      recipeSlot({ id: 'a', day_of_week: 3, span_days: 1, title: 'Kurča' }),
      recipeSlot({ id: 'b', day_of_week: 4, span_days: 1, title: 'Špagety' }),
    ])
    expect(screen.getAllByRole('button', { name: /add meal to/i })).toHaveLength(7)
    expect(screen.getByText('Kurča')).toBeInTheDocument()
    expect(screen.getByText('Špagety')).toBeInTheDocument()
  })

  it('places an empty day add slot in the first grid row, and a non-empty day add below its meal', () => {
    renderGrid([recipeSlot({ id: 'a', day_of_week: 3, span_days: 1, title: 'Kurča' })])
    const buttons = screen.getAllByRole('button', { name: /add meal to/i })
    // Each add affordance lives in a positioned grid cell; row 1 = empty day, row 2 = under a meal.
    const cells = buttons.map((b) => (b.closest('[style*="grid-row"]') as HTMLElement)?.style.gridRow)
    // Day 3 (has a meal) → its add cell is row 2; the rest (empty) → row 1.
    expect(cells.filter((r) => r === '1')).toHaveLength(6)
    expect(cells.filter((r) => r === '2')).toHaveLength(1)
  })
})
