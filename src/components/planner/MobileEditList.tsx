'use client'

import { useState } from 'react'
import {
  DndContext,
  closestCenter,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { GripVertical, Trash2, ChevronLeft, ChevronRight, Plus } from 'lucide-react'
import { RecipeSearch } from './RecipeSearch'
import type { MealSlotWithRecipe } from '@/types/planner'
import type { Recipe } from '@/types/database'

export interface WeekItem {
  /** slot.id for filled days; 'day-N' for empty days */
  id: string
  dayOfWeek: number
  slot: MealSlotWithRecipe | null
  dayLabel: string
  maxSpanDays: number
}

interface MobileEditListProps {
  weekItems: WeekItem[]
  onReorder: (activeId: string, overId: string) => void
  onDelete: (slotId: string) => void
  onSpanChange: (slotId: string, newSpan: number) => void
  onAddRecipe: (dayOfWeek: number, recipe: Recipe) => void
  onAddCustom: (dayOfWeek: number, label: string) => void
}

function SortableItem({
  item,
  onDelete,
  onSpanChange,
  isSearchOpen,
  onOpenSearch,
  onCloseSearch,
  onAddRecipe,
  onAddCustom,
}: {
  item: WeekItem
  onDelete: () => void
  onSpanChange: (newSpan: number) => void
  isSearchOpen: boolean
  onOpenSearch: () => void
  onCloseSearch: () => void
  onAddRecipe: (recipe: Recipe) => void
  onAddCustom: (label: string) => void
}) {
  const isFilled = item.slot !== null
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.id, disabled: !isFilled })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 10 : undefined,
    opacity: isDragging ? 0.7 : 1,
  }

  const slot = item.slot
  const title = slot?.recipe?.title ?? slot?.custom_label ?? 'Meal'

  if (!isFilled) {
    if (isSearchOpen) {
      return (
        <div ref={setNodeRef} style={style} className="relative">
          <RecipeSearch
            onSelectRecipe={(recipe) => { onCloseSearch(); onAddRecipe(recipe) }}
            onSelectCustom={(label) => { onCloseSearch(); onAddCustom(label) }}
            onClose={onCloseSearch}
          />
        </div>
      )
    }
    return (
      <div
        ref={setNodeRef}
        style={style}
        className="flex items-center gap-3 px-4 py-3 rounded-xl border-2 border-dashed border-gray-200"
      >
        <p className="text-base font-bold text-gray-400">{item.dayLabel}</p>
        <button
          type="button"
          onClick={onOpenSearch}
          className="ml-auto flex items-center justify-center w-8 h-8 rounded-lg bg-gray-100 text-gray-500 hover:bg-gray-200 active:bg-gray-300 transition-colors"
          aria-label="Add meal"
        >
          <Plus size={16} />
        </button>
      </div>
    )
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-stretch gap-2 bg-white rounded-xl border transition-shadow ${
        isDragging ? 'border-gray-300 shadow-lg' : 'border-gray-200 shadow-sm'
      }`}
    >
      {/* Left: drag handle */}
      <button
        {...attributes}
        {...listeners}
        className="touch-none pl-3 text-gray-300 cursor-grab active:cursor-grabbing flex-shrink-0 self-center"
        aria-label="Drag to reorder"
      >
        <GripVertical size={22} />
      </button>

      {/* Middle: image + right-side two-row text */}
      <div className="flex-1 min-w-0 py-3 flex items-center gap-3">
        {/* Thumbnail */}
        {slot!.recipe?.image_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={slot!.recipe.image_url}
            alt={title}
            className="w-12 h-12 rounded-lg object-cover flex-shrink-0"
          />
        ) : (
          <div className="w-12 h-12 rounded-lg bg-gray-100 flex items-center justify-center flex-shrink-0">
            <span className="text-lg">🍽️</span>
          </div>
        )}

        {/* Right side: day label + chevrons / recipe name */}
        <div className="flex-1 min-w-0 flex flex-col gap-1">
          {/* Row 1: day label + chevrons */}
          <div className="flex items-center gap-1.5">
            <p className="text-xs font-semibold text-gray-500 leading-none">{item.dayLabel}</p>
            <button
              type="button"
              onClick={() => onSpanChange(slot!.span_days - 1)}
              disabled={slot!.span_days <= 1}
              className="flex items-center justify-center w-5 h-5 rounded bg-gray-100 text-gray-500 hover:bg-gray-200 active:bg-gray-300 disabled:opacity-25 disabled:cursor-not-allowed transition-colors flex-shrink-0"
              aria-label="Shrink by one day"
            >
              <ChevronLeft size={12} />
            </button>
            <button
              type="button"
              onClick={() => onSpanChange(slot!.span_days + 1)}
              disabled={slot!.span_days >= item.maxSpanDays}
              className="flex items-center justify-center w-5 h-5 rounded bg-gray-100 text-gray-500 hover:bg-gray-200 active:bg-gray-300 disabled:opacity-25 disabled:cursor-not-allowed transition-colors flex-shrink-0"
              aria-label="Extend by one day"
            >
              <ChevronRight size={12} />
            </button>
          </div>
          {/* Row 2: recipe name */}
          <p className="text-sm font-semibold text-gray-900 line-clamp-2 leading-snug">{title}</p>
        </div>
      </div>

      {/* Right: delete */}
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

export function MobileEditList({
  weekItems,
  onReorder,
  onDelete,
  onSpanChange,
  onAddRecipe,
  onAddCustom,
}: MobileEditListProps) {
  const [openSearchDay, setOpenSearchDay] = useState<number | null>(null)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 100, tolerance: 5 } }),
  )

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (over && active.id !== over.id) {
      onReorder(String(active.id), String(over.id))
    }
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={weekItems.map((i) => i.id)} strategy={verticalListSortingStrategy}>
        <div className="flex flex-col gap-3">
          {weekItems.map((item) => (
            <SortableItem
              key={item.id}
              item={item}
              onDelete={() => item.slot && onDelete(item.slot.id)}
              onSpanChange={(newSpan) => item.slot && onSpanChange(item.slot.id, newSpan)}
              isSearchOpen={openSearchDay === item.dayOfWeek}
              onOpenSearch={() => setOpenSearchDay(item.dayOfWeek)}
              onCloseSearch={() => setOpenSearchDay(null)}
              onAddRecipe={(recipe) => onAddRecipe(item.dayOfWeek, recipe)}
              onAddCustom={(label) => onAddCustom(item.dayOfWeek, label)}
            />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  )
}

export { arrayMove }
