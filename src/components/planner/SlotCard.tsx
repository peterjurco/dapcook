'use client'

import { useState, useEffect } from 'react'
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
  /** Desktop lane-grid placement. When omitted, the card does not self-place. */
  startDay?: number
  lane?: number
  span?: number
}

export function SlotCard({
  slot,
  onDelete,
  onSpanPreview,
  onSpanCommit,
  maxSpanDays,
  startDay,
  lane,
  span,
}: SlotCardProps) {
  const [confirming, setConfirming] = useState(false)
  const [isResizing, setIsResizing] = useState(false)
  const [savedPortions, setSavedPortions] = useState<number | null>(null)

  useEffect(() => {
    if (!slot.recipe_id) return
    try {
      const raw = localStorage.getItem('recipe_portions')
      if (raw) {
        const data = JSON.parse(raw) as Record<string, number>
        setSavedPortions(data[slot.recipe_id] ?? null)
      }
    } catch {
      // ignore storage errors
    }
  }, [slot.recipe_id])

  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: slot.id,
    data: { slot },
  })

  // Desktop lane-grid placement (no effect outside a grid, e.g. the drag overlay).
  const placement: React.CSSProperties =
    startDay != null && span != null
      ? { gridColumn: `${startDay} / ${startDay + span}`, gridRow: (lane ?? 0) + 1 }
      : {}

  const style: React.CSSProperties = transform
    ? { ...placement, transform: CSS.Translate.toString(transform), zIndex: 50, opacity: 0.9 }
    : placement

  const canExpand = slot.span_days < maxSpanDays && slot.span_days < 7
  const showResizeHandle = canExpand || slot.span_days > 1

  function handleResizeMouseDown(e: React.MouseEvent<HTMLDivElement>) {
    e.preventDefault()
    e.stopPropagation() // prevent dnd-kit from treating this as a move drag

    const cardEl = e.currentTarget.parentElement as HTMLElement
    const cardRect = cardEl.getBoundingClientRect()
    const GAP = 12 // gap-3
    const singleColWidth = (cardRect.width - (slot.span_days - 1) * GAP) / slot.span_days
    const columnWidth = singleColWidth + GAP

    const startX = e.clientX
    const startWidth = cardRect.width
    const startSpan = slot.span_days
    let liveSpan = startSpan

    // Lock to pixel width and lift above adjacent slots so overflow is visible
    cardEl.style.width = `${startWidth}px`
    cardEl.style.zIndex = '20'

    setIsResizing(true)
    document.body.style.cursor = 'ew-resize'
    document.body.style.userSelect = 'none'

    function onMouseMove(ev: MouseEvent) {
      const dx = ev.clientX - startX
      // Stretch/shrink the card DOM element directly — no React re-render during drag
      const maxWidth = maxSpanDays * singleColWidth + (maxSpanDays - 1) * GAP
      const newWidth = Math.max(singleColWidth * 0.5, Math.min(maxWidth, startWidth + dx))
      cardEl.style.width = `${newWidth}px`

      // Track discrete snap so we know what to commit on mouseup
      const daysToAdd = Math.round(dx / columnWidth)
      liveSpan = Math.max(1, Math.min(maxSpanDays, startSpan + daysToAdd))
    }

    function onMouseUp() {
      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('mouseup', onMouseUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''

      if (liveSpan !== startSpan) {
        // Snap the card to the exact snapped width so the transition to the new
        // grid cell is invisible (card is already at that pixel width when React commits)
        const snappedWidth = liveSpan * singleColWidth + (liveSpan - 1) * GAP
        cardEl.style.width = `${snappedWidth}px`
        onSpanPreview(liveSpan)
        onSpanCommit(liveSpan)
      }

      // After React commits the new grid column span, clear the explicit width
      // rAF fires after microtasks (where React flushes state), so the grid
      // has already updated by the time we clear — no flash
      requestAnimationFrame(() => {
        cardEl.style.width = ''
        cardEl.style.zIndex = ''
        setIsResizing(false)
      })
    }

    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('mouseup', onMouseUp)
  }

  return (
    <>
      <div
        ref={setNodeRef}
        style={style}
        className={`relative h-full min-h-[11rem] flex flex-col bg-white border rounded-lg shadow-sm group ${
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
            className="text-base font-medium text-gray-900 line-clamp-2 leading-snug hover:text-blue-600 transition-colors"
          >
            {slot.recipe?.title ?? 'Recipe'}
            {savedPortions != null && (
              <span className="text-gray-400 text-xs font-normal ml-1">({savedPortions} portions)</span>
            )}
          </Link>
        </div>

        {/* Move drag handle — desktop only */}
        <button
          {...attributes}
          {...listeners}
          className="hidden md:block absolute top-1.5 left-1.5 p-0.5 rounded bg-white/80 text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity cursor-grab active:cursor-grabbing"
          aria-label="Drag to move"
        >
          <GripVertical size={12} />
        </button>

        {/* Delete — desktop only */}
        <button
          type="button"
          onClick={() => setConfirming(true)}
          className="hidden md:block absolute top-1.5 right-1.5 p-0.5 rounded bg-white/80 text-gray-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity z-20"
          aria-label="Remove from plan"
        >
          <X size={12} />
        </button>

        {/* Resize handle — desktop only, drag right to extend / left to shrink */}
        {showResizeHandle && (
          <div
            onMouseDown={handleResizeMouseDown}
            className={`hidden md:flex absolute top-0 bottom-0 right-[-10px] w-7 flex-col items-center justify-center cursor-ew-resize rounded-r-lg z-10 transition-opacity ${
              isResizing ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
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
