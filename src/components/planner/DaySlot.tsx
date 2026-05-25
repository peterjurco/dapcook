'use client'

import { useDroppable } from '@dnd-kit/core'
import { Plus } from 'lucide-react'
import { SlotCard } from './SlotCard'
import { CustomLabelCard } from './CustomLabelCard'
import { RecipeSearch } from './RecipeSearch'
import type { MealSlotWithRecipe } from '@/types/planner'
import type { Recipe } from '@/types/database'

interface DaySlotProps {
  dayOfWeek: number // 1–7
  slot: MealSlotWithRecipe | null
  /** How many grid columns this slot occupies */
  gridColSpan: number
  maxSpanDays: number
  /** Mobile-only date label, e.g. "Mon 25" or "Mon 25 – Wed 27" */
  mobileDateLabel: string
  /** Whether this slot's date range contains today (for mobile highlight) */
  mobileIsToday: boolean
  isSearchOpen: boolean
  onOpenSearch: () => void
  onCloseSearch: () => void
  onAddRecipe: (dayOfWeek: number, recipe: Recipe) => void
  onAddCustom: (dayOfWeek: number, label: string) => void
  onDelete: (slotId: string) => void
  onSpanPreview: (slotId: string, newSpan: number) => void
  onSpanCommit: (slotId: string, newSpan: number) => void
}

export function DaySlot({
  dayOfWeek,
  slot,
  gridColSpan,
  maxSpanDays,
  mobileDateLabel,
  mobileIsToday,
  isSearchOpen,
  onOpenSearch,
  onCloseSearch,
  onAddRecipe,
  onAddCustom,
  onDelete,
  onSpanPreview,
  onSpanCommit,
}: DaySlotProps) {
  const { setNodeRef, isOver } = useDroppable({ id: `day-${dayOfWeek}`, data: { dayOfWeek } })

  // Tailwind col-span classes written explicitly so JIT picks them up.
  // Only applied at md+ — on mobile the single-column grid ignores col-span.
  const colSpanClass = (
    gridColSpan === 7 ? 'md:col-span-7' :
    gridColSpan === 6 ? 'md:col-span-6' :
    gridColSpan === 5 ? 'md:col-span-5' :
    gridColSpan === 4 ? 'md:col-span-4' :
    gridColSpan === 3 ? 'md:col-span-3' :
    gridColSpan === 2 ? 'md:col-span-2' :
    'md:col-span-1'
  )

  return (
    <div className={`min-w-0 ${colSpanClass}`}>
      {/* Mobile header — date title only, hidden on desktop */}
      <div className="md:hidden mb-1">
        <p className={`text-xl font-bold ${mobileIsToday ? 'text-blue-600' : 'text-gray-800'}`}>
          {mobileDateLabel}
        </p>
      </div>
      <div
        ref={setNodeRef}
        className={`relative rounded-xl transition-colors ${
          isOver && !slot ? 'bg-blue-50 border-2 border-blue-300 border-dashed' : ''
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
        ) : (
          <>
            {/* Mobile: dashed placeholder, no interaction */}
            <div className="md:hidden min-h-[130px] rounded-xl border-2 border-dashed border-gray-200" />

            {/* Desktop: clickable + RecipeSearch */}
            <div className="hidden md:block h-full">
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
          </>
        )}
      </div>
    </div>
  )
}
