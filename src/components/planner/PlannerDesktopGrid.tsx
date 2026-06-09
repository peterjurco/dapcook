'use client'

import { useDroppable } from '@dnd-kit/core'
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
      className={`rounded-xl transition-colors ${isOver ? 'bg-blue-50 ring-2 ring-inset ring-blue-300' : ''}`}
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
  const lanes = packLanes(slots)
  const laneCount = slots.length ? Math.max(...Array.from(lanes.values())) + 1 : 0
  const addRow = laneCount + 1 // grid row index (1-based) for the per-day "+" cells
  const todayStr = toDateString(today)

  return (
    <div data-testid="planner-grid">
      {/* Day headers */}
      <div className="grid grid-cols-7 gap-3 mb-2">
        {weekDays.map((date, index) => {
          const { weekday, day } = formatDayLabel(date)
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
        {/* Background droppable columns */}
        <div className="absolute inset-0 grid grid-cols-7 gap-3 pointer-events-none">
          {Array.from({ length: 7 }, (_, i) => (
            <div key={i} className="pointer-events-auto" style={{ gridColumn: i + 1 }}>
              <DayColumnDroppable day={i + 1} />
            </div>
          ))}
        </div>

        {/* Meal cards + add row */}
        <div
          className="relative grid grid-cols-7 gap-3"
          style={{ gridAutoRows: 'minmax(11rem, auto)' }}
        >
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

          {/* Per-day add cells on the row below the last lane */}
          {weekDays.map((_, index) => {
            const day = index + 1
            return (
              <div key={`add-${day}`} className="relative" style={{ gridColumn: day, gridRow: addRow }}>
                {addingToDay === day ? (
                  <div className="h-full min-h-[3rem] flex items-center justify-center rounded-xl border-2 border-dashed border-gray-200">
                    <span className="w-5 h-5 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
                  </div>
                ) : openSearchDay === day ? (
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
                ) : (
                  <button
                    type="button"
                    onClick={() => onOpenSearch(day)}
                    aria-label={`Add meal to ${formatDayLabel(weekDays[index]).weekday}`}
                    className="w-full min-h-[3rem] h-full flex items-center justify-center rounded-xl border-2 border-dashed border-gray-200 text-gray-300 transition-colors hover:border-gray-300 hover:bg-gray-50 hover:text-gray-400"
                  >
                    <Plus size={16} />
                  </button>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
