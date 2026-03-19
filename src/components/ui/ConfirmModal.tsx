'use client'

import { useEffect } from 'react'

interface ConfirmModalProps {
  message: string
  confirmLabel?: string
  onConfirm: () => void
  onCancel: () => void
}

export function ConfirmModal({ message, confirmLabel = 'Remove', onConfirm, onCancel }: ConfirmModalProps) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onCancel()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onCancel])

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onCancel() }}
    >
      <div className="bg-white rounded-xl shadow-xl p-5 w-72 flex flex-col gap-4">
        <p className="text-sm text-gray-700">{message}</p>
        <div className="flex gap-2 justify-end">
          <button
            type="button"
            onClick={onCancel}
            className="px-3 py-1.5 text-sm rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="px-3 py-1.5 text-sm rounded-lg bg-red-500 text-white hover:bg-red-600 transition-colors"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
