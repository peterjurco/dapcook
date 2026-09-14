import { fireEvent, render, screen } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { DndContext } from '@dnd-kit/core'
import { CustomLabelCard } from './CustomLabelCard'
import { mockTranslate } from '@/test/mockMessages'
import type { TranslationValues } from 'use-intl'
import type { MealSlotWithRecipe } from '@/types/planner'

vi.mock('next-intl', () => ({
  useTranslations: (namespace: string) => (key: string, values?: TranslationValues) =>
    mockTranslate(namespace, key, values),
}))

function customSlot(p: { id: string; day_of_week: number; span_days: number; label: string }): MealSlotWithRecipe {
  return {
    id: p.id,
    week_plan_id: 'w',
    day_of_week: p.day_of_week,
    meal_type: 'lunch',
    recipe_id: null,
    custom_label: p.label,
    servings_scale: 1,
    span_days: p.span_days,
    created_at: '2026-01-01T00:00:00.000Z',
    recipe: null,
  }
}

describe('CustomLabelCard resize', () => {
  beforeEach(() => {
    // Fixed 100px-wide card so the drag-distance → day-count math is predictable (GAP=12, columnWidth=112).
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
      width: 100,
      height: 176,
      top: 0,
      left: 0,
      bottom: 176,
      right: 100,
      x: 0,
      y: 0,
      toJSON: () => {},
    } as DOMRect)
  })

  it('extends a custom entry across days by dragging its resize handle, like a recipe slot', () => {
    const onSpanPreview = vi.fn()
    const onSpanCommit = vi.fn()
    render(
      <DndContext>
        <CustomLabelCard
          slot={customSlot({ id: 's1', day_of_week: 1, span_days: 1, label: 'Takeaway' })}
          onDelete={() => {}}
          startDay={1}
          lane={0}
          span={1}
          maxSpanDays={7}
          onSpanPreview={onSpanPreview}
          onSpanCommit={onSpanCommit}
        />
      </DndContext>,
    )

    const handle = screen.getByTitle('Drag to extend or shrink across days')
    fireEvent.mouseDown(handle, { clientX: 0 })
    fireEvent.mouseMove(document, { clientX: 150 })
    fireEvent.mouseUp(document)

    expect(onSpanCommit).toHaveBeenCalledWith(2)
  })
})
