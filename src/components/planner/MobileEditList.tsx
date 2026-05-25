'use client'

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
import { GripVertical, Trash2, ChevronLeft, ChevronRight } from 'lucide-react'
import type { MealSlotWithRecipe } from '@/types/planner'

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
}

function SortableItem({
  item,
  onDelete,
  onSpanChange,
}: {
  item: WeekItem
  onDelete: () => void
  onSpanChange: (newSpan: number) => void
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
    return (
      <div
        ref={setNodeRef}
        style={style}
        className="flex items-center gap-3 px-4 py-3 rounded-xl border-2 border-dashed border-gray-200"
      >
        <p className="text-base font-bold text-gray-400">{item.dayLabel}</p>
        <p className="text-xs text-gray-300 ml-auto">empty</p>
      </div>
    )
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-center gap-3 bg-white rounded-xl border transition-shadow ${
        isDragging ? 'border-gray-300 shadow-lg' : 'border-gray-200 shadow-sm'
      }`}
    >
      {/* Drag handle */}
      <button
        {...attributes}
        {...listeners}
        className="touch-none pl-3 py-4 text-gray-300 cursor-grab active:cursor-grabbing flex-shrink-0"
        aria-label="Drag to reorder"
      >
        <GripVertical size={22} />
      </button>

      {/* Thumbnail */}
      {slot!.recipe?.image_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={slot!.recipe.image_url}
          alt={title}
          className="w-14 h-14 rounded-lg object-cover flex-shrink-0"
        />
      ) : (
        <div className="w-14 h-14 rounded-lg bg-gray-100 flex items-center justify-center flex-shrink-0">
          <span className="text-xl">🍽️</span>
        </div>
      )}

      {/* Title + day */}
      <div className="flex-1 min-w-0 py-3">
        <p className="text-base font-bold text-gray-700 mb-0.5">{item.dayLabel}</p>
        <p className="text-sm font-semibold text-gray-900 line-clamp-2 leading-snug">{title}</p>
      </div>

      {/* Span controls */}
      <div className="flex flex-col items-center gap-1 pr-1 py-3 flex-shrink-0">
        <button
          type="button"
          onClick={() => onSpanChange(slot!.span_days + 1)}
          disabled={slot!.span_days >= item.maxSpanDays}
          className="flex items-center justify-center w-8 h-8 rounded-lg bg-gray-100 text-gray-600 hover:bg-gray-200 active:bg-gray-300 disabled:opacity-25 disabled:cursor-not-allowed transition-colors"
          aria-label="Extend by one day"
        >
          <ChevronRight size={16} />
        </button>
        <button
          type="button"
          onClick={() => onSpanChange(slot!.span_days - 1)}
          disabled={slot!.span_days <= 1}
          className="flex items-center justify-center w-8 h-8 rounded-lg bg-gray-100 text-gray-600 hover:bg-gray-200 active:bg-gray-300 disabled:opacity-25 disabled:cursor-not-allowed transition-colors"
          aria-label="Shrink by one day"
        >
          <ChevronLeft size={16} />
        </button>
      </div>

      {/* Delete */}
      <button
        type="button"
        onClick={onDelete}
        className="pr-3 py-4 text-gray-300 hover:text-red-500 transition-colors flex-shrink-0"
        aria-label="Remove from plan"
      >
        <Trash2 size={20} />
      </button>
    </div>
  )
}

export function MobileEditList({ weekItems, onReorder, onDelete, onSpanChange }: MobileEditListProps) {
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
            />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  )
}

export { arrayMove }
