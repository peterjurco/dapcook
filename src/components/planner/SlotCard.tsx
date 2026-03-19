'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useDraggable } from '@dnd-kit/core'
import { CSS } from '@dnd-kit/utilities'
import { GripVertical, X, ChevronRight, ChevronLeft } from 'lucide-react'
import { ConfirmModal } from '@/components/ui/ConfirmModal'
import type { MealSlotWithRecipe } from '@/types/planner'

interface SlotCardProps {
  slot: MealSlotWithRecipe
  onDelete: () => void
  onSpanChange: (delta: number) => void
  maxSpanDays: number // how many days remain in the week from this slot
}

export function SlotCard({ slot, onDelete, onSpanChange, maxSpanDays }: SlotCardProps) {
  const [confirming, setConfirming] = useState(false)

  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: slot.id,
    data: { slot },
  })

  const style = transform
    ? { transform: CSS.Translate.toString(transform), zIndex: 50, opacity: 0.9 }
    : undefined

  const canExpand = slot.span_days < maxSpanDays && slot.span_days < 7
  const canShrink = slot.span_days > 1

  return (
    <>
      <div
        ref={setNodeRef}
        style={style}
        className={`relative bg-white border rounded-lg overflow-hidden shadow-sm group ${
          isDragging ? 'shadow-lg ring-2 ring-gray-300' : 'border-gray-200'
        }`}
      >
        {/* Thumbnail — links to recipe */}
        <Link href={`/recipes/${slot.recipe_id}`} className="block aspect-[4/3] bg-gray-100 overflow-hidden">
          {slot.recipe?.image_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={slot.recipe.image_url}
              alt={slot.recipe.title}
              className="w-full h-full object-cover hover:scale-105 transition-transform duration-200"
            />
          ) : (
            <div className="w-full h-full bg-gradient-to-br from-gray-100 to-gray-200 flex items-center justify-center">
              <span className="text-2xl">🍽️</span>
            </div>
          )}
        </Link>

        {/* Title — links to recipe */}
        <div className="px-2 py-1.5">
          <Link
            href={`/recipes/${slot.recipe_id}`}
            className="text-xs font-medium text-gray-900 line-clamp-2 leading-snug hover:text-blue-600 transition-colors"
          >
            {slot.recipe?.title ?? 'Recipe'}
          </Link>
          {slot.span_days > 1 && (
            <p className="text-xs text-gray-400 mt-0.5">{slot.span_days} days</p>
          )}
        </div>

        {/* Drag handle */}
        <button
          {...attributes}
          {...listeners}
          className="absolute top-1.5 left-1.5 p-0.5 rounded bg-white/80 text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity cursor-grab active:cursor-grabbing"
          aria-label="Drag to reorder"
        >
          <GripVertical size={12} />
        </button>

        {/* Delete */}
        <button
          type="button"
          onClick={() => setConfirming(true)}
          className="absolute top-1.5 right-1.5 p-0.5 rounded bg-white/80 text-gray-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
          aria-label="Remove from plan"
        >
          <X size={12} />
        </button>

        {/* Span controls */}
        {(canExpand || canShrink) && (
          <div className="absolute bottom-1.5 right-1.5 flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
            {canShrink && (
              <button
                type="button"
                onClick={() => onSpanChange(-1)}
                className="p-0.5 rounded bg-white/80 text-gray-400 hover:text-gray-700"
                title="Reduce to fewer days"
              >
                <ChevronLeft size={11} />
              </button>
            )}
            {canExpand && (
              <button
                type="button"
                onClick={() => onSpanChange(1)}
                className="p-0.5 rounded bg-white/80 text-gray-400 hover:text-gray-700"
                title="Extend to next day"
              >
                <ChevronRight size={11} />
              </button>
            )}
          </div>
        )}
      </div>

      {confirming && (
        <ConfirmModal
          message={`Remove "${slot.recipe?.title ?? 'this recipe'}" from the plan?`}
          confirmLabel="Remove"
          onConfirm={() => { setConfirming(false); onDelete() }}
          onCancel={() => setConfirming(false)}
        />
      )}
    </>
  )
}
