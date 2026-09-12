'use client'

import { useState } from 'react'
import {
  DndContext,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  useDraggable,
  useDroppable,
  pointerWithin,
  DragEndEvent,
} from '@dnd-kit/core'
import { CSS } from '@dnd-kit/utilities'
import { useLocale } from 'next-intl'
import { GripVertical, Trash2, ChevronLeft, ChevronRight, Plus } from 'lucide-react'
import { RecipeSearch } from './RecipeSearch'
import { maxSpanForStart, type EditDay } from '@/lib/planner/layout'
import { formatDayLabel } from '@/lib/utils/week'
import type { Locale } from '@/i18n/config'
import type { MealSlotWithRecipe } from '@/types/planner'
import type { Recipe } from '@/types/database'

interface MobileEditListProps {
  editDays: EditDay[]
  weekDays: Date[]
  onMove: (slotId: string, newDay: number) => void
  onDelete: (slotId: string) => void
  onSpanChange: (slotId: string, newSpan: number) => void
  onAddRecipe: (dayOfWeek: number, recipe: Recipe) => Promise<void>
  onAddCustom: (dayOfWeek: number, label: string) => Promise<void>
}

/** "Tue 9" for a single day, "Tue 9 → Fri 12 · 4 days" for a span. */
function rangeLabel(slot: MealSlotWithRecipe, weekDays: Date[], locale: Locale): string {
  const start = formatDayLabel(weekDays[slot.day_of_week - 1], locale)
  if (slot.span_days <= 1) return `${start.weekday} ${start.day} · 1 day`
  const end = formatDayLabel(weekDays[slot.day_of_week + slot.span_days - 2], locale)
  return `${start.weekday} ${start.day} → ${end.weekday} ${end.day} · ${slot.span_days} days`
}

function MealRow({
  slot,
  weekDays,
  onDelete,
  onSpanChange,
}: {
  slot: MealSlotWithRecipe
  weekDays: Date[]
  onDelete: () => void
  onSpanChange: (newSpan: number) => void
}) {
  const locale = useLocale()
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: slot.id,
    data: { slot },
  })
  const style = {
    transform: CSS.Translate.toString(transform),
    zIndex: isDragging ? 10 : undefined,
    opacity: isDragging ? 0.7 : 1,
  }
  const title = slot.recipe?.title ?? slot.custom_label ?? 'Meal'
  const maxSpan = maxSpanForStart(slot.day_of_week)

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-stretch gap-2 bg-white rounded-xl border transition-shadow ${
        isDragging ? 'border-gray-300 shadow-lg' : 'border-gray-200 shadow-sm'
      }`}
    >
      {/* Drag handle — move between days */}
      <button
        {...attributes}
        {...listeners}
        className="touch-none pl-3 text-gray-300 cursor-grab active:cursor-grabbing flex-shrink-0 self-center"
        aria-label="Drag to move to another day"
      >
        <GripVertical size={22} />
      </button>

      <div className="flex-1 min-w-0 py-3 flex items-center gap-3">
        {slot.recipe?.image_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={slot.recipe.image_url} alt={title} className="w-12 h-12 rounded-lg object-cover flex-shrink-0" />
        ) : (
          <div className="w-12 h-12 rounded-lg bg-gray-100 flex items-center justify-center flex-shrink-0">
            <span className="text-lg">🍽️</span>
          </div>
        )}

        <div className="flex-1 min-w-0 flex flex-col gap-1">
          <div className="flex items-center gap-1.5">
            <p className="text-xs font-semibold text-gray-500 leading-none">{rangeLabel(slot, weekDays, locale)}</p>
            <button
              type="button"
              onClick={() => onSpanChange(slot.span_days - 1)}
              disabled={slot.span_days <= 1}
              className="flex items-center justify-center w-5 h-5 rounded bg-gray-100 text-gray-500 hover:bg-gray-200 active:bg-gray-300 disabled:opacity-25 disabled:cursor-not-allowed transition-colors flex-shrink-0"
              aria-label="Shrink by one day"
            >
              <ChevronLeft size={12} />
            </button>
            <button
              type="button"
              onClick={() => onSpanChange(slot.span_days + 1)}
              disabled={slot.span_days >= maxSpan}
              className="flex items-center justify-center w-5 h-5 rounded bg-gray-100 text-gray-500 hover:bg-gray-200 active:bg-gray-300 disabled:opacity-25 disabled:cursor-not-allowed transition-colors flex-shrink-0"
              aria-label="Extend by one day"
            >
              <ChevronRight size={12} />
            </button>
          </div>
          <p className="text-sm font-semibold text-gray-900 line-clamp-2 leading-snug">{title}</p>
        </div>
      </div>

      <button
        type="button"
        onClick={onDelete}
        className="pr-3 text-gray-300 hover:text-red-500 transition-colors flex-shrink-0 self-center"
        aria-label="Remove from plan"
      >
        <Trash2 size={20} />
      </button>
    </div>
  )
}

function DaySection({
  editDay,
  weekDays,
  isSearchOpen,
  isLoading,
  onOpenSearch,
  onCloseSearch,
  onAddRecipe,
  onAddCustom,
  onDelete,
  onSpanChange,
}: {
  editDay: EditDay
  weekDays: Date[]
  isSearchOpen: boolean
  isLoading: boolean
  onOpenSearch: () => void
  onCloseSearch: () => void
  onAddRecipe: (recipe: Recipe) => void
  onAddCustom: (label: string) => void
  onDelete: (slotId: string) => void
  onSpanChange: (slotId: string, newSpan: number) => void
}) {
  const locale = useLocale()
  const { setNodeRef, isOver } = useDroppable({
    id: `day-${editDay.dayOfWeek}`,
    data: { dayOfWeek: editDay.dayOfWeek },
  })
  const { weekday, day } = formatDayLabel(weekDays[editDay.dayOfWeek - 1], locale)

  return (
    <section
      ref={setNodeRef}
      className={`rounded-xl transition-colors ${isOver ? 'bg-blue-50 ring-2 ring-inset ring-blue-300' : ''}`}
    >
      <p className="text-base font-bold text-gray-800 mb-2">
        {weekday} {day}
      </p>

      <div className="flex flex-col gap-2">
        {editDay.slots.map((slot) => (
          <MealRow
            key={slot.id}
            slot={slot}
            weekDays={weekDays}
            onDelete={() => onDelete(slot.id)}
            onSpanChange={(newSpan) => onSpanChange(slot.id, newSpan)}
          />
        ))}

        {isLoading ? (
          <div className="flex items-center justify-center px-4 py-3 rounded-xl border-2 border-dashed border-gray-200 h-[52px]">
            <span className="w-5 h-5 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : isSearchOpen ? (
          <div className="relative">
            <RecipeSearch
              onSelectRecipe={(recipe) => {
                onCloseSearch()
                onAddRecipe(recipe)
              }}
              onSelectCustom={(label) => {
                onCloseSearch()
                onAddCustom(label)
              }}
              onClose={onCloseSearch}
            />
          </div>
        ) : (
          <button
            type="button"
            onClick={onOpenSearch}
            className="flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl border-2 border-dashed border-gray-200 text-sm font-medium text-gray-500 hover:bg-gray-50 active:bg-gray-100 transition-colors"
            aria-label={`Add meal to ${weekday} ${day}`}
          >
            <Plus size={16} />
            Add meal
          </button>
        )}
      </div>
    </section>
  )
}

export function MobileEditList({
  editDays,
  weekDays,
  onMove,
  onDelete,
  onSpanChange,
  onAddRecipe,
  onAddCustom,
}: MobileEditListProps) {
  const [openSearchDay, setOpenSearchDay] = useState<number | null>(null)
  const [loadingDay, setLoadingDay] = useState<number | null>(null)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 100, tolerance: 5 } }),
  )

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over) return
    const targetDay = over.data.current?.dayOfWeek as number | undefined
    if (targetDay) onMove(String(active.id), targetDay)
  }

  async function handleAddRecipe(dayOfWeek: number, recipe: Recipe) {
    setLoadingDay(dayOfWeek)
    await onAddRecipe(dayOfWeek, recipe)
    setLoadingDay(null)
  }

  async function handleAddCustom(dayOfWeek: number, label: string) {
    setLoadingDay(dayOfWeek)
    await onAddCustom(dayOfWeek, label)
    setLoadingDay(null)
  }

  return (
    <DndContext sensors={sensors} collisionDetection={pointerWithin} onDragEnd={handleDragEnd}>
      <div className="flex flex-col gap-5">
        {editDays.map((editDay) => (
          <DaySection
            key={editDay.dayOfWeek}
            editDay={editDay}
            weekDays={weekDays}
            isSearchOpen={openSearchDay === editDay.dayOfWeek}
            isLoading={loadingDay === editDay.dayOfWeek}
            onOpenSearch={() => setOpenSearchDay(editDay.dayOfWeek)}
            onCloseSearch={() => setOpenSearchDay(null)}
            onAddRecipe={(recipe) => handleAddRecipe(editDay.dayOfWeek, recipe)}
            onAddCustom={(label) => handleAddCustom(editDay.dayOfWeek, label)}
            onDelete={onDelete}
            onSpanChange={onSpanChange}
          />
        ))}
      </div>
    </DndContext>
  )
}
