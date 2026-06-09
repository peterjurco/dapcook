'use client'

import { useState } from 'react'
import { CalendarPlus } from 'lucide-react'
import { cn } from '@/lib/utils/cn'
import { AddToPlanPicker } from './AddToPlanPicker'

interface AddToPlanButtonProps {
  recipeId: string
  variant?: 'overlay' | 'toolbar'
}

export function AddToPlanButton({ recipeId, variant = 'toolbar' }: AddToPlanButtonProps) {
  const [open, setOpen] = useState(false)
  const iconSize = variant === 'overlay' ? 11 : 13

  function toggle(e: React.MouseEvent<HTMLButtonElement>) {
    e.preventDefault()
    e.stopPropagation()
    setOpen((v) => !v)
  }

  return (
    <div className={variant === 'overlay' ? 'absolute bottom-2 right-2' : 'relative inline-block'}>
      <button
        type="button"
        onClick={toggle}
        className={cn(
          'inline-flex items-center gap-1.5 whitespace-nowrap font-medium transition-all',
          variant === 'overlay'
            ? 'px-2.5 py-1.5 rounded-full text-xs shadow-sm bg-white text-gray-700 hover:bg-gray-900 hover:text-white opacity-100 sm:opacity-0 sm:group-hover:opacity-100'
            : 'px-3 py-1.5 rounded-lg text-sm bg-white text-gray-600 border border-gray-200 hover:bg-gray-50 hover:text-gray-900',
        )}
        title="Add to weekly plan"
        aria-expanded={open}
      >
        <CalendarPlus size={iconSize} />
        Add to Plan
      </button>

      {open && (
        <>
          {/* Click-away backdrop */}
          <div
            className="fixed inset-0 z-20"
            onClick={(e) => {
              e.preventDefault()
              e.stopPropagation()
              setOpen(false)
            }}
          />
          <div
            className={cn(
              'absolute z-30',
              variant === 'overlay' ? 'bottom-full right-0 mb-2' : 'top-full right-0 mt-2',
            )}
            onClick={(e) => e.stopPropagation()}
          >
            <AddToPlanPicker recipeId={recipeId} onClose={() => setOpen(false)} />
          </div>
        </>
      )}
    </div>
  )
}
