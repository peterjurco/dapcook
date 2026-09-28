import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { DndContext } from '@dnd-kit/core'
import { SlotCard } from './SlotCard'
import { mockTranslate } from '@/test/mockMessages'
import type { TranslationValues } from 'use-intl'
import type { MealSlotWithRecipe } from '@/types/planner'

vi.mock('next-intl', () => ({
  useTranslations: (namespace: string) => (key: string, values?: TranslationValues) =>
    mockTranslate(namespace, key, values),
}))

function recipeSlot(p: { id: string; date: string; span_days: number }): MealSlotWithRecipe {
  return {
    id: p.id,
    household_id: 'household-1',
    date: p.date,
    meal_type: 'lunch',
    recipe_id: 'recipe-1',
    custom_label: null,
    servings_scale: 1,
    span_days: p.span_days,
    created_at: '2026-01-01T00:00:00.000Z',
    recipe: {
      id: 'recipe-1',
      title: 'Soup',
      image_url: null,
      cook_time_min: null,
      prep_time_min: null,
      servings: null,
    },
  }
}

describe('SlotCard continuing from last week', () => {
  it('shows the continuation cue and no resize handle', () => {
    render(
      <DndContext>
        <SlotCard
          slot={recipeSlot({ id: 's1', date: '2026-06-06', span_days: 3 })}
          onDelete={() => {}}
          startDay={1}
          lane={0}
          span={1}
          maxSpanDays={7}
          continued
          onSpanPreview={() => {}}
          onSpanCommit={() => {}}
        />
      </DndContext>,
    )
    expect(screen.getByRole('img', { name: 'Continues from last week' })).toBeInTheDocument()
    expect(screen.queryByTitle('Drag to extend or shrink across days')).toBeNull()
  })
})
