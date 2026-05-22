'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useDraggable } from '@dnd-kit/core'
import { CSS } from '@dnd-kit/utilities'
import { GripVertical, X, GripHorizontal } from 'lucide-react'
import { ConfirmModal } from '@/components/ui/ConfirmModal'
import type { MealSlotWithRecipe } from '@/types/planner'

interface SlotCardProps {
  slot: MealSlotWithRecipe
  onDelete: () => void
  /** Called on every column boundary crossed during drag — update state only, no API */
  onSpanPreview: (newSpan: number) => void
  /** Called on mouseup — persist the final span to the API */
  onSpanCommit: (newSpan: number) => void
  maxSpanDays: number
}

export function SlotCard({ slot, onDelete, onSpanPreview, onSpanCommit, maxSpanDays }: SlotCardProps) {
  const [confirming, setConfirming] = useState(false)
  const [isResizing, setIsResizing] = useState(false)

  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: slot.id,
    data: { slot },
  })

  const style = transform
    ? { transform: CSS.Translate.toString(transform), zIndex: 50, opacity: 0.9 }
    : undefined

  const canExpand = slot.span_days < maxSpanDays && slot.span_days < 7

  function handleResizeMouseDown(e: React.MouseEvent<HTMLDivElement>) {
    e.preventDefault()
    e.stopPropagation() // don't let dnd-kit pick this up as a move drag

    // Use the card element (parent of the resize handle) to measure column width
    const cardEl = e.currentTarget.parentElement as HTMLElement
    const cardWidth = cardEl.getBoundingClientRect().width
    const columnWidth = cardWidth + 12 // gap-3 = 12px

    const startX = e.clientX
    const startSpan = slot.span_days
    let liveSpan = startSpan

    setIsResizing(true)
    document.body.style.cursor = 'ew-resize'
    document.body.style.userSelect = 'none'

    function onMouseMove(e: MouseEvent) {
      const dx = e.clientX - startX
      // Snap at 40% into the next column in either direction
      const daysToAdd = Math.floor((dx + columnWidth * 0.4) / columnWidth)
      const newSpan = Math.max(1, Math.min(maxSpanDays, startSpan + daysToAdd))
      if (newSpan !== liveSpan) {
        liveSpan = newSpan
        onSpanPreview(newSpan)
      }
    }

    function onMouseUp() {
      setIsResizing(false)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('mouseup', onMouseUp)
      if (liveSpan !== startSpan) {
        onSpanCommit(liveSpan)
      }
    }

    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('mouseup', onMouseUp)
  }

  return (
    <>
      <div
        ref={setNodeRef}
        style={style}
        className={`relative h-full flex flex-col bg-white border rounded-lg shadow-sm group ${
          isDragging ? 'shadow-lg ring-2 ring-gray-300' : 'border-gray-200'
        }`}
      >
        {/* Thumbnail — links to recipe */}
        <Link href={`/recipes/${slot.recipe_id}`} className="block aspect-[4/3] bg-gray-100 overflow-hidden rounded-t-lg">
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

        {/* Title */}
        <div className="px-2 py-1.5 pr-6">
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

        {/* Move drag handle */}
        <button
          {...attributes}
          {...listeners}
          className="absolute top-1.5 left-1.5 p-0.5 rounded bg-white/80 text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity cursor-grab active:cursor-grabbing"
          aria-label="Drag to move"
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

        {/* Resize handle — drag right/left to extend or shrink span */}
        {canExpand && (
          <div
            onMouseDown={handleResizeMouseDown}
            className={`absolute top-0 bottom-0 right-[-10px] w-7 flex flex-col items-center justify-center cursor-ew-resize rounded-r-lg z-10 transition-opacity ${
              isResizing
                ? 'opacity-100 bg-gradient-to-l from-blue-200/90 via-blue-100/60 to-transparent'
                : 'opacity-0 group-hover:opacity-100 bg-gradient-to-l from-blue-100/90 via-blue-50/60 to-transparent hover:from-blue-200/90'
            }`}
            title="Drag to extend across days"
            aria-label="Drag to extend across days"
          >
            <GripHorizontal size={12} className={isResizing ? 'text-blue-600' : 'text-blue-400'} />
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
