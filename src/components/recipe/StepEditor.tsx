'use client'

import { Trash2, Plus } from 'lucide-react'
import type { Step } from '@/types/recipe'

interface StepEditorProps {
  steps: Step[]
  onChange: (steps: Step[]) => void
}

export function StepEditor({ steps, onChange }: StepEditorProps) {
  function update(id: string, text: string) {
    onChange(steps.map((s) => (s.id === id ? { ...s, text } : s)))
  }

  function remove(id: string) {
    const updated = steps
      .filter((s) => s.id !== id)
      .map((s, i) => ({ ...s, order: i + 1 }))
    onChange(updated)
  }

  function add() {
    onChange([
      ...steps,
      { id: crypto.randomUUID(), order: steps.length + 1, text: '' },
    ])
  }

  return (
    <div className="space-y-3">
      {steps.map((step, index) => (
        <div key={step.id} className="flex gap-3 group">
          <div className="flex-shrink-0 w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center text-sm font-semibold text-gray-500 mt-1.5">
            {index + 1}
          </div>

          <textarea
            value={step.text}
            onChange={(e) => update(step.id, e.target.value)}
            placeholder="Describe this step..."
            rows={2}
            className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-gray-300 resize-none leading-relaxed"
            onInput={(e) => {
              const el = e.currentTarget
              el.style.height = 'auto'
              el.style.height = el.scrollHeight + 'px'
            }}
          />

          <button
            type="button"
            onClick={() => remove(step.id)}
            className="p-1 text-gray-300 hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100 mt-2 flex-shrink-0"
            aria-label="Remove step"
          >
            <Trash2 size={14} />
          </button>
        </div>
      ))}

      <button
        type="button"
        onClick={add}
        className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-gray-700 transition-colors"
      >
        <Plus size={14} />
        Add step
      </button>
    </div>
  )
}
