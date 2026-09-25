'use client'

import { Minus, Plus } from 'lucide-react'

interface Props {
  value: number
  min: number
  max: number
  onChange: (value: number) => void
  /** Accessible name of the whole control, e.g. "Portions". */
  label: string
  decreaseLabel: string
  increaseLabel: string
}

// 40px round buttons — comfortable tap targets without a keyboard popping up on mobile.
const buttonClass =
  'w-10 h-10 flex items-center justify-center rounded-full border border-gray-200 text-gray-700 hover:bg-gray-50 active:bg-gray-100 disabled:opacity-30 disabled:hover:bg-transparent transition-colors'

export function Stepper({ value, min, max, onChange, label, decreaseLabel, increaseLabel }: Props) {
  return (
    <div role="group" aria-label={label} className="flex items-center gap-1">
      <button
        type="button"
        onClick={() => onChange(value - 1)}
        disabled={value <= min}
        aria-label={decreaseLabel}
        className={buttonClass}
      >
        <Minus size={16} />
      </button>
      <span aria-live="polite" className="w-8 text-center text-base font-medium text-gray-900 tabular-nums">
        {value}
      </span>
      <button
        type="button"
        onClick={() => onChange(value + 1)}
        disabled={value >= max}
        aria-label={increaseLabel}
        className={buttonClass}
      >
        <Plus size={16} />
      </button>
    </div>
  )
}
