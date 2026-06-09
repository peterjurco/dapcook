'use client'

import { useState } from 'react'
import { useDraggable } from '@dnd-kit/core'
import { CSS } from '@dnd-kit/utilities'
import { GripVertical, X, UtensilsCrossed, ShoppingBag, Soup } from 'lucide-react'
import { ConfirmModal } from '@/components/ui/ConfirmModal'
import type { MealSlotWithRecipe } from '@/types/planner'

const LABEL_STYLES: Record<string, { bg: string; text: string; icon: React.ReactNode }> = {
  Leftovers: {
    bg: 'bg-amber-50 border-amber-200',
    text: 'text-amber-800',
    icon: <Soup size={20} className="text-amber-400" />,
  },
  'Eating out': {
    bg: 'bg-purple-50 border-purple-200',
    text: 'text-purple-800',
    icon: <UtensilsCrossed size={20} className="text-purple-400" />,
  },
  Takeaway: {
    bg: 'bg-blue-50 border-blue-200',
    text: 'text-blue-800',
    icon: <ShoppingBag size={20} className="text-blue-400" />,
  },
  Fasting: {
    bg: 'bg-gray-50 border-gray-200',
    text: 'text-gray-500',
    icon: <span className="text-lg">⏸</span>,
  },
}

function getStyle(label: string) {
  return LABEL_STYLES[label] ?? {
    bg: 'bg-orange-50 border-orange-200',
    text: 'text-orange-800',
    icon: <span className="text-lg">📌</span>,
  }
}

interface CustomLabelCardProps {
  slot: MealSlotWithRecipe
  onDelete: () => void
  /** Desktop lane-grid placement. When omitted, the card does not self-place. */
  startDay?: number
  lane?: number
  span?: number
}

export function CustomLabelCard({ slot, onDelete, startDay, lane, span }: CustomLabelCardProps) {
  const [confirming, setConfirming] = useState(false)
  const label = slot.custom_label ?? 'Custom'
  const style = getStyle(label)

  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: slot.id,
    data: { slot },
  })

  const placement: React.CSSProperties =
    startDay != null && span != null
      ? { gridColumn: `${startDay} / ${startDay + span}`, gridRow: (lane ?? 0) + 1 }
      : {}

  const css: React.CSSProperties = transform
    ? { ...placement, transform: CSS.Translate.toString(transform), zIndex: 50, opacity: 0.9 }
    : placement

  return (
    <>
      <div
        ref={setNodeRef}
        style={css}
        className={`relative h-full rounded-lg border overflow-hidden group ${style.bg} ${
          isDragging ? 'shadow-lg ring-2 ring-gray-300' : ''
        }`}
      >
        <div className="flex flex-col items-center justify-center gap-1.5 px-2 py-4 h-full">
          {style.icon}
          <p className={`text-xs font-semibold text-center leading-tight ${style.text}`}>{label}</p>
        </div>

        {/* Drag handle */}
        <button
          {...attributes}
          {...listeners}
          className="absolute top-1.5 left-1.5 p-0.5 rounded bg-white/70 text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity cursor-grab active:cursor-grabbing"
          aria-label="Drag to reorder"
        >
          <GripVertical size={12} />
        </button>

        {/* Delete */}
        <button
          type="button"
          onClick={() => setConfirming(true)}
          className="absolute top-1.5 right-1.5 p-0.5 rounded bg-white/70 text-gray-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
          aria-label="Remove"
        >
          <X size={12} />
        </button>
      </div>

      {confirming && (
        <ConfirmModal
          message={`Remove "${label}" from the plan?`}
          confirmLabel="Remove"
          onConfirm={() => { setConfirming(false); onDelete() }}
          onCancel={() => setConfirming(false)}
        />
      )}
    </>
  )
}
