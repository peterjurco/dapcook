'use client'

import { useEffect, useRef, useState } from 'react'
import { X } from 'lucide-react'
import { useTranslations } from 'next-intl'

interface Props {
  recipeIds: string[]
  targetLanguage?: string
  targetUnits?: 'metric' | 'imperial'
  onClose: () => void
}

type ModalState =
  | { phase: 'processing'; done: number; total: number }
  | { phase: 'complete'; updated: number; failed: number }

export function BulkTransformModal({ recipeIds, targetLanguage, targetUnits, onClose }: Props) {
  const t = useTranslations('settings')
  const [state, setState] = useState<ModalState>({ phase: 'processing', done: 0, total: recipeIds.length })
  const dismissedRef = useRef(false)

  useEffect(() => {
    let updated = 0
    let failed = 0

    async function run() {
      for (const id of recipeIds) {
        if (dismissedRef.current) break

        try {
          const res = await fetch(`/api/recipes/${id}/transform`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ targetLanguage, targetUnits }),
          })
          if (res.ok) { updated++ } else { failed++ }
        } catch {
          failed++
        }

        if (!dismissedRef.current) {
          setState({ phase: 'processing', done: updated + failed, total: recipeIds.length })
        }
      }

      if (!dismissedRef.current) {
        setState({ phase: 'complete', updated, failed })
      }
    }

    void run()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function handleClose() {
    dismissedRef.current = true
    onClose()
  }

  const labelKey =
    targetLanguage && targetUnits
      ? 'translateAndConvert'
      : targetLanguage
        ? 'translate'
        : 'convertUnits'
  const label = t(`bulkTransform.${labelKey}`)

  return (
    <div
      data-testid="bulk-transform-modal"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
    >
      <div className="bg-white rounded-xl shadow-lg p-6 max-w-sm w-full mx-4 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-900">
            {state.phase === 'complete' ? t('bulkTransform.done') : t('bulkTransform.progress', { label })}
          </h2>
          <button
            type="button"
            onClick={handleClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
            aria-label={t('bulkTransform.closeAria')}
          >
            <X size={16} />
          </button>
        </div>

        {state.phase === 'processing' && (
          <div className="space-y-2">
            <p className="text-sm text-gray-500">
              {state.done} / {state.total}
            </p>
            <div className="w-full bg-gray-100 rounded-full h-1.5">
              <div
                className="bg-gray-900 h-1.5 rounded-full transition-all"
                style={{ width: state.total > 0 ? `${(state.done / state.total) * 100}%` : '0%' }}
              />
            </div>
          </div>
        )}

        {state.phase === 'complete' && (
          <p className="text-sm text-gray-500">
            {state.failed === 0
              ? t('bulkTransform.completedUpdated', { count: state.updated })
              : t('bulkTransform.completedWithFailures', { count: state.updated, failed: state.failed })}
          </p>
        )}
      </div>
    </div>
  )
}
