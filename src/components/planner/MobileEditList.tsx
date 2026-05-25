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
import { GripVertical, Trash2 } from 'lucide-react'
import type { MealSlotWithRecipe } from '@/types/planner'

interface MobileEditListProps {
  slots: MealSlotWithRecipe[]
  onReorder: (activeId: string, overId: string) => void
  onDelete: (slotId: string) => void
}

interface SortableItemProps {
  slot: MealSlotWithRecipe
  onDelete: () => void
}

function SortableItem({ slot, onDelete }: SortableItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: slot.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 10 : undefined,
    opacity: isDragging ? 0.75 : 1,
  }

  const title = slot.recipe?.title ?? slot.custom_label ?? 'Meal'

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
      {slot.recipe?.image_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={slot.recipe.image_url}
          alt={title}
          className="w-14 h-14 rounded-lg object-cover flex-shrink-0"
        />
      ) : (
        <div className="w-14 h-14 rounded-lg bg-gray-100 flex items-center justify-center flex-shrink-0">
          <span className="text-xl">🍽️</span>
        </div>
      )}

      {/* Title */}
      <div className="flex-1 min-w-0 py-4">
        <p className="text-sm font-semibold text-gray-900 line-clamp-2 leading-snug">
          {title}
        </p>
        {slot.span_days > 1 && (
          <p className="text-xs text-gray-400 mt-0.5">{slot.span_days} days</p>
        )}
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

export function MobileEditList({ slots, onReorder, onDelete }: MobileEditListProps) {
  const sorted = [...slots].sort((a, b) => a.day_of_week - b.day_of_week)

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

  if (sorted.length === 0) {
    return (
      <p className="text-sm text-gray-400 text-center py-8">No meals planned this week.</p>
    )
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={sorted.map((s) => s.id)} strategy={verticalListSortingStrategy}>
        <div className="flex flex-col gap-3">
          {sorted.map((slot) => (
            <SortableItem
              key={slot.id}
              slot={slot}
              onDelete={() => onDelete(slot.id)}
            />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  )
}

// Re-export arrayMove so PlannerClient can import it from here
export { arrayMove }
