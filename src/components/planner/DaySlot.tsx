'use client'

import { useState } from 'react'
import { useDroppable } from '@dnd-kit/core'
import { Plus } from 'lucide-react'
import { SlotCard } from './SlotCard'
import { CustomLabelCard } from './CustomLabelCard'
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
  onAddRecipe: (dayOfWeek: number, recipe: Recipe) => void
  onAddCustom: (dayOfWeek: number, label: string) => void
  onDelete: (slotId: string) => void
  onSpanChange: (slotId: string, delta: number) => void
}

export function DaySlot({
  dayLabel,
  dayOfWeek,
  slot,
  coveredBy,
  isToday,
  maxSpanDays,
  onAddRecipe,
  onAddCustom,
  onDelete,
  onSpanChange,
}: DaySlotProps) {
  const [searching, setSearching] = useState(false)

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
              onSpanChange={(delta) => onSpanChange(slot.id, delta)}
              maxSpanDays={maxSpanDays}
            />
          ) : (
            <CustomLabelCard slot={slot} onDelete={() => onDelete(slot.id)} />
          )
        ) : coveredBy ? (
          <div className="h-full rounded-lg bg-gray-50 border border-dashed border-gray-200 flex items-center justify-center px-2 py-4">
            <p className="text-xs text-gray-400 text-center leading-tight">
              ← {coveredBy.recipe?.title ?? coveredBy.custom_label ?? 'continues'}
            </p>
          </div>
        ) : (
          <div className="h-full relative">
            {searching ? (
              <RecipeSearch
                onSelectRecipe={(recipe) => { setSearching(false); onAddRecipe(dayOfWeek, recipe) }}
                onSelectCustom={(label) => { setSearching(false); onAddCustom(dayOfWeek, label) }}
                onClose={() => setSearching(false)}
              />
            ) : (
              <button
                type="button"
                onClick={() => setSearching(true)}
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
