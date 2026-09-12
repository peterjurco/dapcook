'use client'

import { useDroppable } from '@dnd-kit/core'
import { useLocale } from 'next-intl'
import { Plus } from 'lucide-react'
import { DayHeader } from './DayHeader'
import { SlotCard } from './SlotCard'
import { CustomLabelCard } from './CustomLabelCard'
import { RecipeSearch } from './RecipeSearch'
import { packLanes, maxSpanForStart } from '@/lib/planner/layout'
import { formatDayLabel, toDateString } from '@/lib/utils/week'
import type { MealSlotWithRecipe } from '@/types/planner'
import type { Recipe } from '@/types/database'

interface PlannerDesktopGridProps {
  weekDays: Date[]
  today: Date
  slots: MealSlotWithRecipe[]
  openSearchDay: number | null
  addingToDay: number | null
  onOpenSearch: (day: number) => void
  onCloseSearch: () => void
  onAddRecipe: (day: number, recipe: Recipe) => void
  onAddCustom: (day: number, label: string) => void
  onDelete: (slotId: string) => void
  onSpanPreview: (slotId: string, newSpan: number) => void
  onSpanCommit: (slotId: string, newSpan: number) => void
}

/** Full-height droppable behind a day column so dropping anywhere in it targets that day. */
function DayColumnDroppable({ day }: { day: number }) {
  const { setNodeRef, isOver } = useDroppable({ id: `day-${day}`, data: { dayOfWeek: day } })
  return (
    <div
      ref={setNodeRef}
      style={{ gridColumn: day }}
      className={`h-full rounded-xl transition-colors ${isOver ? 'bg-blue-50 ring-2 ring-inset ring-blue-300' : ''}`}
    />
  )
}

export function PlannerDesktopGrid({
  weekDays,
  today,
  slots,
  openSearchDay,
  addingToDay,
  onOpenSearch,
  onCloseSearch,
  onAddRecipe,
  onAddCustom,
  onDelete,
  onSpanPreview,
  onSpanCommit,
}: PlannerDesktopGridProps) {
  const locale = useLocale()
  const lanes = packLanes(slots)
  const todayStr = toDateString(today)

  // Lowest lane occupied by any meal covering this day (-1 if the day is empty).
  function maxCoveringLane(day: number): number {
    let max = -1
    for (const s of slots) {
      if (s.day_of_week <= day && day < s.day_of_week + s.span_days) {
        max = Math.max(max, lanes.get(s.id) ?? 0)
      }
    }
    return max
  }

  return (
    <div data-testid="planner-grid">
      {/* Day headers */}
      <div className="grid grid-cols-7 gap-3 mb-2">
        {weekDays.map((date, index) => {
          const { weekday, day } = formatDayLabel(date, locale)
          return (
            <DayHeader
              key={index}
              weekday={weekday}
              day={day}
              isToday={toDateString(date) === todayStr}
            />
          )
        })}
      </div>

      <div className="relative">
        {/* Background droppable columns — single full-height row so each column's
            droppable spans the whole grid (otherwise the rects collapse to 0 height
            and pointerWithin never finds a drop target). pointer-events-none lets
            clicks fall through to the cards; dnd-kit detects droppables by rect. */}
        <div className="absolute inset-0 grid grid-cols-7 grid-rows-1 gap-3 pointer-events-none">
          {Array.from({ length: 7 }, (_, i) => (
            <DayColumnDroppable key={i} day={i + 1} />
          ))}
        </div>

        {/* Meal cards + per-day add affordances */}
        <div className="relative grid grid-cols-7 gap-3" style={{ gridAutoRows: 'auto' }}>
          {slots.map((slot) => {
            const lane = lanes.get(slot.id) ?? 0
            const span = slot.span_days
            return slot.recipe_id ? (
              <SlotCard
                key={slot.id}
                slot={slot}
                startDay={slot.day_of_week}
                lane={lane}
                span={span}
                maxSpanDays={maxSpanForStart(slot.day_of_week)}
                onDelete={() => onDelete(slot.id)}
                onSpanPreview={(newSpan) => onSpanPreview(slot.id, newSpan)}
                onSpanCommit={(newSpan) => onSpanCommit(slot.id, newSpan)}
              />
            ) : (
              <CustomLabelCard
                key={slot.id}
                slot={slot}
                startDay={slot.day_of_week}
                lane={lane}
                span={span}
                onDelete={() => onDelete(slot.id)}
              />
            )
          })}

          {/* Per-day add affordance: full slot in row 1 for empty days, otherwise a
              small "+" directly under that day's last meal. */}
          {weekDays.map((_, index) => {
            const day = index + 1
            const maxLane = maxCoveringLane(day)
            const isEmptyDay = maxLane === -1
            const gridRow = isEmptyDay ? 1 : maxLane + 2
            const weekday = formatDayLabel(weekDays[index], locale).weekday

            const search = (
              <RecipeSearch
                onSelectRecipe={(recipe) => {
                  onCloseSearch()
                  onAddRecipe(day, recipe)
                }}
                onSelectCustom={(label) => {
                  onCloseSearch()
                  onAddCustom(day, label)
                }}
                onClose={onCloseSearch}
              />
            )

            return (
              <div
                key={`add-${day}`}
                className={`relative ${isEmptyDay ? '' : 'self-start'}`}
                style={{ gridColumn: day, gridRow }}
              >
                {isEmptyDay ? (
                  addingToDay === day ? (
                    <div className="h-full min-h-[11rem] flex items-center justify-center rounded-xl border-2 border-dashed border-gray-200">
                      <span className="w-5 h-5 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
                    </div>
                  ) : openSearchDay === day ? (
                    search
                  ) : (
                    <button
                      type="button"
                      onClick={() => onOpenSearch(day)}
                      aria-label={`Add meal to ${weekday}`}
                      className="w-full h-full min-h-[11rem] flex items-center justify-center rounded-xl border-2 border-dashed border-gray-200 text-gray-300 transition-colors hover:border-gray-300 hover:bg-gray-50 hover:text-gray-400"
                    >
                      <Plus size={16} />
                    </button>
                  )
                ) : addingToDay === day ? (
                  <div className="flex justify-center pt-1">
                    <span className="w-5 h-5 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
                  </div>
                ) : openSearchDay === day ? (
                  search
                ) : (
                  <div className="flex justify-center pt-1">
                    <button
                      type="button"
                      onClick={() => onOpenSearch(day)}
                      aria-label={`Add meal to ${weekday}`}
                      className="flex items-center justify-center w-9 h-9 rounded-lg border-2 border-dashed border-gray-200 text-gray-300 transition-colors hover:border-gray-300 hover:bg-gray-50 hover:text-gray-400"
                    >
                      <Plus size={16} />
                    </button>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
