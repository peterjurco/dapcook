'use client'

import { useDroppable } from '@dnd-kit/core'
import { Plus } from 'lucide-react'
import { SlotCard } from './SlotCard'
import { CustomLabelCard } from './CustomLabelCard'
import { ContinuationBlock } from './ContinuationBlock'
import { RecipeSearch } from './RecipeSearch'
import type { MealSlotWithRecipe } from '@/types/planner'
import type { Recipe } from '@/types/database'

interface DaySlotProps {
  dayLabel: { weekday: string; day: number }
  dayOfWeek: number // 1–7
  slot: MealSlotWithRecipe | null
  /** True if this day is covered by a span from a previous slot */
  coveredBy: MealSlotWithRecipe | null
  isToday: boolean
  maxSpanDays: number
  isSearchOpen: boolean
  onOpenSearch: () => void
  onCloseSearch: () => void
  onAddRecipe: (dayOfWeek: number, recipe: Recipe) => void
  onAddCustom: (dayOfWeek: number, label: string) => void
  onDelete: (slotId: string) => void
  onSpanChange: (slotId: string, delta: number) => void
  onSpanPreview: (slotId: string, newSpan: number) => void
  onSpanCommit: (slotId: string, newSpan: number) => void
}

export function DaySlot({
  dayLabel,
  dayOfWeek,
  slot,
  coveredBy,
  isToday,
  maxSpanDays,
  isSearchOpen,
  onOpenSearch,
  onCloseSearch,
  onAddRecipe,
  onAddCustom,
  onDelete,
  onSpanChange,
  onSpanPreview,
  onSpanCommit,
}: DaySlotProps) {
  const { setNodeRef, isOver } = useDroppable({ id: `day-${dayOfWeek}`, data: { dayOfWeek } })

  const isEmpty = !slot && !coveredBy

  return (
    <div className="flex flex-col min-w-0">
      {/* Day header */}
      <div className={`text-center mb-2 ${isToday ? 'text-gray-900' : 'text-gray-500'}`}>
        <p className={`text-xs font-medium uppercase tracking-wide ${isToday ? 'text-blue-600' : ''}`}>
          {dayLabel.weekday}
        </p>
        <p className={`text-lg font-semibold leading-tight ${isToday ? 'text-blue-600' : ''}`}>
          {dayLabel.day}
        </p>
      </div>

      {/* Slot area */}
      <div
        ref={setNodeRef}
        className={`relative flex-1 min-h-[130px] rounded-xl transition-colors ${
          isOver && isEmpty ? 'bg-blue-50 border-2 border-blue-300 border-dashed' : ''
        }`}
      >
        {slot ? (
          slot.recipe_id ? (
            <SlotCard
              slot={slot}
              onDelete={() => onDelete(slot.id)}
              onSpanPreview={(newSpan) => onSpanPreview(slot.id, newSpan)}
              onSpanCommit={(newSpan) => onSpanCommit(slot.id, newSpan)}
              maxSpanDays={maxSpanDays}
            />
          ) : (
            <CustomLabelCard slot={slot} onDelete={() => onDelete(slot.id)} />
          )
        ) : coveredBy ? (
          <ContinuationBlock
            slot={coveredBy}
            isLastDay={coveredBy.day_of_week + coveredBy.span_days - 1 === dayOfWeek}
            onShrink={() => onSpanChange(coveredBy.id, -1)}
          />
        ) : (
          <div className="h-full relative">
            {isSearchOpen ? (
              <RecipeSearch
                onSelectRecipe={(recipe) => { onCloseSearch(); onAddRecipe(dayOfWeek, recipe) }}
                onSelectCustom={(label) => { onCloseSearch(); onAddCustom(dayOfWeek, label) }}
                onClose={onCloseSearch}
              />
            ) : (
              <button
                type="button"
                onClick={onOpenSearch}
                className={`w-full h-full min-h-[130px] flex flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed transition-colors group ${
                  isOver
                    ? 'border-blue-300 bg-blue-50'
                    : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                }`}
              >
                <Plus size={16} className="text-gray-300 group-hover:text-gray-400" />
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
