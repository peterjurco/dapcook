'use client'

import { useState, useRef, useLayoutEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { CalendarPlus } from 'lucide-react'
import { cn } from '@/lib/utils/cn'
import { AddToPlanPicker } from './AddToPlanPicker'

interface AddToPlanButtonProps {
  recipeId: string
  variant?: 'overlay' | 'toolbar'
}

const PICKER_WIDTH = 288 // matches w-72 in AddToPlanPicker
const PICKER_EST_HEIGHT = 320 // enough to decide whether to flip upward

export function AddToPlanButton({ recipeId, variant = 'toolbar' }: AddToPlanButtonProps) {
  const [open, setOpen] = useState(false)
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const iconSize = variant === 'overlay' ? 11 : 13

  const updateCoords = useCallback(() => {
    const el = triggerRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    // Right-align to the trigger, clamped to the viewport.
    const left = Math.min(Math.max(8, r.right - PICKER_WIDTH), window.innerWidth - PICKER_WIDTH - 8)
    // Open downward by default; flip up only if it would overflow the bottom and there's room above.
    const openUp = r.bottom + PICKER_EST_HEIGHT > window.innerHeight && r.top > PICKER_EST_HEIGHT
    const top = openUp ? Math.max(8, r.top - PICKER_EST_HEIGHT - 8) : r.bottom + 8
    setCoords({ top, left })
  }, [])

  useLayoutEffect(() => {
    if (!open) return
    updateCoords()
    window.addEventListener('scroll', updateCoords, true)
    window.addEventListener('resize', updateCoords)
    return () => {
      window.removeEventListener('scroll', updateCoords, true)
      window.removeEventListener('resize', updateCoords)
    }
  }, [open, updateCoords])

  function toggle(e: React.MouseEvent<HTMLButtonElement>) {
    // The trigger lives inside a card-wide <Link>; block navigation when toggling.
    e.preventDefault()
    e.stopPropagation()
    setOpen((v) => !v)
  }

  return (
    <div className={variant === 'overlay' ? 'absolute bottom-2 right-2' : 'relative inline-block'}>
      <button
        ref={triggerRef}
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

      {open &&
        coords &&
        createPortal(
          <>
            {/* Click-away backdrop */}
            <div
              className="fixed inset-0 z-40"
              onClick={(e) => {
                e.preventDefault()
                e.stopPropagation()
                setOpen(false)
              }}
            />
            <div
              className="fixed z-50"
              style={{ top: coords.top, left: coords.left }}
              onClick={(e) => e.stopPropagation()}
            >
              <AddToPlanPicker recipeId={recipeId} onClose={() => setOpen(false)} />
            </div>
          </>,
          document.body,
        )}
    </div>
  )
}
