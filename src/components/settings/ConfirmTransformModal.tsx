'use client'

interface Props {
  recipeCount: number
  message: string
  confirmLabel: string
  onConfirm: () => void
  onCancel: () => void
}

export function ConfirmTransformModal({ recipeCount, message, confirmLabel, onConfirm, onCancel }: Props) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-lg p-6 max-w-sm w-full mx-4 space-y-4">
        <h2 className="text-sm font-semibold text-gray-900">{message}</h2>
        <p className="text-xs text-gray-400">
          {recipeCount} recipe{recipeCount === 1 ? '' : 's'} will be updated. This may take a moment.
        </p>
        <div className="flex gap-2 justify-end pt-1">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700 transition-colors"
          >
            Not now
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="px-4 py-2 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-700 transition-colors"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
