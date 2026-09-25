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

// 40px filled rounded-square buttons — comfortable tap targets without a keyboard popping up on mobile.
// Disabled keeps its filled shape (lighter) instead of fading out, so the pair stays balanced.
const buttonClass =
  'w-10 h-10 flex items-center justify-center rounded-lg bg-gray-200 text-gray-900 hover:bg-gray-300 active:bg-gray-400 disabled:bg-gray-100 disabled:text-gray-300 disabled:cursor-not-allowed transition-colors'

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
        <Minus size={18} strokeWidth={2.5} />
      </button>
      <span aria-live="polite" className="w-8 text-center text-lg font-semibold text-gray-900 tabular-nums">
        {value}
      </span>
      <button
        type="button"
        onClick={() => onChange(value + 1)}
        disabled={value >= max}
        aria-label={increaseLabel}
        className={buttonClass}
      >
        <Plus size={18} strokeWidth={2.5} />
      </button>
    </div>
  )
}
