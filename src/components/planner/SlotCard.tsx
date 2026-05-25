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
  /** Called on every column boundary crossed during drag — updates state only, no API */
  onSpanPreview: (newSpan: number) => void
  /** Called once on mouseup — persists the final span to the API */
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
  const showResizeHandle = canExpand || slot.span_days > 1

  function handleResizeMouseDown(e: React.MouseEvent<HTMLDivElement>) {
    e.preventDefault()
    e.stopPropagation() // prevent dnd-kit from treating this as a move drag

    const cardEl = e.currentTarget.parentElement as HTMLElement
    const cardRect = cardEl.getBoundingClientRect()
    // When the card spans N days its width is N*col + (N-1)*gap, so invert that
    // to get a single-column step size for accurate snap in both directions.
    const GAP = 12 // gap-3
    const singleColWidth = (cardRect.width - (slot.span_days - 1) * GAP) / slot.span_days
    const columnWidth = singleColWidth + GAP

    const startX = e.clientX
    const startSpan = slot.span_days
    let liveSpan = startSpan

    setIsResizing(true)
    document.body.style.cursor = 'ew-resize'
    document.body.style.userSelect = 'none'

    function onMouseMove(ev: MouseEvent) {
      const dx = ev.clientX - startX
      // Snap span at 50% into each column (Math.round)
      const daysToAdd = Math.round(dx / columnWidth)
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
          isDragging ? 'shadow-lg ring-2 ring-gray-300' : isResizing ? 'border-gray-400 shadow-md' : 'border-gray-200'
        }`}
      >
        {/* Thumbnail — links to recipe. Fixed height so it stays compact even when spanning multiple columns */}
        <Link href={`/recipes/${slot.recipe_id}`} className="block h-32 bg-gray-100 overflow-hidden rounded-t-lg">
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
          className="absolute top-1.5 right-1.5 p-0.5 rounded bg-white/80 text-gray-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity z-10"
          aria-label="Remove from plan"
        >
          <X size={12} />
        </button>

        {/* Resize handle — drag right to extend, left to shrink */}
        {showResizeHandle && (
          <div
            onMouseDown={handleResizeMouseDown}
            className={`absolute top-0 bottom-0 right-[-10px] w-7 flex flex-col items-center justify-center cursor-ew-resize rounded-r-lg z-10 transition-opacity ${
              isResizing
                ? 'opacity-100'
                : 'opacity-0 group-hover:opacity-100'
            }`}
            title="Drag to extend or shrink across days"
            aria-label="Drag to extend or shrink across days"
          >
            <GripHorizontal size={12} className="text-gray-400" />
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
