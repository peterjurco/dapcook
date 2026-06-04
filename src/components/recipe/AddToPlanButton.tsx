'use client'

import { useState } from 'react'
import { CalendarPlus, Check, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils/cn'

type AddState = 'idle' | 'loading' | 'done' | 'error'

interface AddToPlanButtonProps {
  recipeId: string
  variant?: 'overlay' | 'toolbar'
}

export function AddToPlanButton({ recipeId, variant = 'toolbar' }: AddToPlanButtonProps) {
  const [addState, setAddState] = useState<AddState>('idle')
  const iconSize = variant === 'overlay' ? 11 : 13

  async function handleAddToPlan(e: React.MouseEvent<HTMLButtonElement>) {
    e.preventDefault()
    e.stopPropagation()
    if (addState !== 'idle') return

    setAddState('loading')
    const res = await fetch('/api/planner/slots/next-empty', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ recipe_id: recipeId }),
    })

    if (res.ok) {
      setAddState('done')
      setTimeout(() => setAddState('idle'), 2000)
    } else {
      setAddState('error')
      setTimeout(() => setAddState('idle'), 2500)
    }
  }

  return (
    <button
      type="button"
      onClick={handleAddToPlan}
      disabled={addState === 'loading'}
      className={cn(
        'inline-flex items-center gap-1.5 whitespace-nowrap font-medium transition-all',
        variant === 'overlay'
          ? 'absolute bottom-2 right-2 px-2.5 py-1.5 rounded-full text-xs shadow-sm opacity-100 sm:opacity-0 sm:group-hover:opacity-100'
          : 'px-3 py-1.5 rounded-lg text-sm',
        addState === 'done'
          ? 'bg-green-500 text-white opacity-100'
          : addState === 'error'
          ? 'bg-red-500 text-white opacity-100'
          : variant === 'overlay'
          ? 'bg-white text-gray-700 hover:bg-gray-900 hover:text-white'
          : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50 hover:text-gray-900'
      )}
      title="Add to weekly plan"
    >
      {addState === 'loading' && <Loader2 size={iconSize} className="animate-spin" />}
      {addState === 'done' && <Check size={iconSize} />}
      {addState === 'idle' && <CalendarPlus size={iconSize} />}
      {addState === 'error' ? 'Full' : addState === 'done' ? 'Added' : addState === 'loading' ? 'Adding...' : 'Add to Plan'}
    </button>
  )
}
