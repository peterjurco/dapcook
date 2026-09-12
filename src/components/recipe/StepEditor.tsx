'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { Trash2, Plus, ClipboardPaste, X } from 'lucide-react'
import type { Step } from '@/types/recipe'

interface StepEditorProps {
  steps: Step[]
  onChange: (steps: Step[]) => void
}

function autoResizeTextarea(el: HTMLTextAreaElement | null) {
  if (!el) return
  const borderY = parseFloat(getComputedStyle(el).borderTopWidth) + parseFloat(getComputedStyle(el).borderBottomWidth)
  el.style.height = 'auto'
  el.style.height = `${el.scrollHeight + borderY}px`
}

export function StepEditor({ steps, onChange }: StepEditorProps) {
  const t = useTranslations('recipes')
  const [pasteMode, setPasteMode] = useState(false)
  const [pasteText, setPasteText] = useState('')
  const [isParsing, setIsParsing] = useState(false)

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

  async function handleParse() {
    if (!pasteText.trim()) return
    setIsParsing(true)
    const res = await fetch('/api/recipes/parse-text', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ steps_text: pasteText }),
    })
    if (res.ok) {
      const data = await res.json() as { steps: Step[] }
      onChange(data.steps)
      setPasteMode(false)
      setPasteText('')
    }
    setIsParsing(false)
  }

  if (pasteMode) {
    return (
      <div className="space-y-2">
        <textarea
          autoFocus
          value={pasteText}
          onChange={(e) => setPasteText(e.target.value)}
          placeholder={t('stepEditor.parsePlaceholder')}
          rows={8}
          className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-300 font-mono leading-relaxed resize-y"
        />
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleParse}
            disabled={isParsing || !pasteText.trim()}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isParsing ? (
              <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <ClipboardPaste size={14} />
            )}
            {t('stepEditor.parse')}
          </button>
          <button
            type="button"
            onClick={() => { setPasteMode(false); setPasteText('') }}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-500 hover:text-gray-900 border border-gray-200 rounded-lg transition-colors"
          >
            <X size={14} />
            {t('stepEditor.cancel')}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {steps.map((step, index) => (
        <div key={step.id} className="flex gap-3 group">
          <div className="flex-shrink-0 w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center text-sm font-semibold text-gray-500 mt-1.5">
            {index + 1}
          </div>

          <textarea
            ref={autoResizeTextarea}
            value={step.text}
            onChange={(e) => update(step.id, e.target.value)}
            placeholder={t('stepEditor.rowPlaceholder')}
            rows={2}
            className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-gray-300 resize-none overflow-hidden leading-relaxed"
            onInput={(e) => autoResizeTextarea(e.currentTarget)}
          />

          <button
            type="button"
            onClick={() => remove(step.id)}
            className="p-1 text-gray-300 hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100 mt-2 flex-shrink-0"
            aria-label={t('stepEditor.removeAria')}
          >
            <Trash2 size={14} />
          </button>
        </div>
      ))}

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={add}
          className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-gray-700 transition-colors"
        >
          <Plus size={14} />
          {t('stepEditor.add')}
        </button>
        <button
          type="button"
          onClick={() => setPasteMode(true)}
          className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-gray-700 transition-colors"
        >
          <ClipboardPaste size={14} />
          {t('stepEditor.pasteText')}
        </button>
      </div>
    </div>
  )
}
