'use client'

import { X } from 'lucide-react'
import type { MealSlotWithRecipe } from '@/types/planner'

interface ContinuationBlockProps {
  slot: MealSlotWithRecipe
  /** True when this is the last covered day — shows the shrink handle */
  isLastDay: boolean
  onShrink: () => void
}

export function ContinuationBlock({ slot, isLastDay, onShrink }: ContinuationBlockProps) {
  const title = slot.recipe?.title ?? slot.custom_label ?? 'continues'

  return (
    <div className="relative h-full flex flex-col bg-blue-50 border border-blue-100 rounded-lg overflow-hidden group -ml-2 pl-2">
      {/* Left accent bar — implies continuation from the card to the left */}
      <div className="absolute left-0 top-0 bottom-0 w-[3px] bg-blue-300 rounded-l-lg" />

      {/* Content */}
      <div className="flex-1 flex flex-col items-center justify-center px-3 pl-4 text-center gap-2">
        <div className="text-blue-300 text-lg">🍽️</div>
        <p className="text-xs font-medium text-blue-700 line-clamp-3 leading-snug">
          {title}
        </p>
      </div>

      {/* Shrink handle — only on the last covered day */}
      {isLastDay && (
        <button
          type="button"
          onClick={onShrink}
          className="absolute top-1.5 right-1.5 p-0.5 rounded bg-white/80 text-blue-300 hover:text-blue-600 opacity-0 group-hover:opacity-100 transition-opacity"
          title="Shorten plan by 1 day"
          aria-label="Shorten plan by 1 day"
        >
          <X size={12} />
        </button>
      )}
    </div>
  )
}
