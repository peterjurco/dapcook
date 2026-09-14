'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useDraggable } from '@dnd-kit/core'
import { CSS } from '@dnd-kit/utilities'
import { useTranslations } from 'next-intl'
import { GripVertical, X } from 'lucide-react'
import { ConfirmModal } from '@/components/ui/ConfirmModal'
import { ResizeHandle } from './ResizeHandle'
import { useSpanResize } from './useSpanResize'
import type { MealSlotWithRecipe } from '@/types/planner'
import Image from 'next/image'

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
  const t = useTranslations('planner')
  const [confirming, setConfirming] = useState(false)
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

  const { isResizing, showResizeHandle, handleResizeMouseDown } = useSpanResize({
    spanDays: slot.span_days,
    maxSpanDays,
    onSpanPreview,
    onSpanCommit,
  })

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
        <Link href={`/recipes/${slot.recipe_id}`} className="relative block h-32 bg-gray-100 overflow-hidden rounded-t-lg">
          {slot.recipe?.image_url ? (
            <Image
              src={slot.recipe.image_url}
              alt={slot.recipe.title}
              fill
              sizes="(max-width: 1024px) 50vw, 220px"
              className="object-cover hover:scale-105 transition-transform duration-200"
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
            {slot.recipe?.title ?? t('slotCard.recipeFallback')}
            {savedPortions != null && (
              <span className="text-gray-400 text-xs font-normal ml-1">{t('slotCard.portions', { count: savedPortions })}</span>
            )}
          </Link>
        </div>

        {/* Move drag handle — desktop only */}
        <button
          {...attributes}
          {...listeners}
          className="hidden md:block absolute top-1.5 left-1.5 p-0.5 rounded bg-white/80 text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity cursor-grab active:cursor-grabbing"
          aria-label={t('slotCard.dragAria')}
        >
          <GripVertical size={12} />
        </button>

        {/* Delete — desktop only */}
        <button
          type="button"
          onClick={() => setConfirming(true)}
          className="hidden md:block absolute top-1.5 right-1.5 p-0.5 rounded bg-white/80 text-gray-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity z-20"
          aria-label={t('slotCard.removeAria')}
        >
          <X size={12} />
        </button>

        {/* Resize handle — desktop only, drag right to extend / left to shrink */}
        <ResizeHandle
          show={showResizeHandle}
          isResizing={isResizing}
          title={t('slotCard.extendTitle')}
          onMouseDown={handleResizeMouseDown}
        />

      </div>

      {confirming && (
        <ConfirmModal
          message={t('slotCard.removeConfirm', { title: slot.recipe?.title ?? t('slotCard.removeConfirmFallback') })}
          confirmLabel={t('slotCard.removeConfirmLabel')}
          onConfirm={() => { setConfirming(false); onDelete() }}
          onCancel={() => setConfirming(false)}
        />
      )}
    </>
  )
}
