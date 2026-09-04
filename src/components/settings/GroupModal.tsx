'use client'

import { useEffect, useState } from 'react'
import { Trash2 } from 'lucide-react'
import { ConfirmModal } from '@/components/ui/ConfirmModal'

interface GroupModalProps {
  /** Omit to create a new group; pass a name to edit/rename an existing one. */
  initialName?: string
  onSave: (name: string) => Promise<boolean>
  onDelete?: () => Promise<boolean>
  onClose: () => void
}

export function GroupModal({ initialName, onSave, onDelete, onClose }: GroupModalProps) {
  const isEdit = initialName !== undefined
  const [name, setName] = useState(initialName ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && !confirmingDelete) onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose, confirmingDelete])

  async function handleSave() {
    const trimmed = name.trim()
    if (!trimmed) {
      setError('Name cannot be empty.')
      return
    }
    setSaving(true)
    setError(null)
    const ok = await onSave(trimmed)
    setSaving(false)
    if (ok) onClose()
    else setError("Couldn't save. Try again.")
  }

  async function handleDelete() {
    if (!onDelete) return
    setDeleting(true)
    setDeleteError(null)
    const ok = await onDelete()
    setDeleting(false)
    if (ok) onClose()
    else setDeleteError("Couldn't delete. Try again.")
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30"
      onMouseDown={(e) => { if (e.target === e.currentTarget && !saving) onClose() }}
    >
      <div className="bg-white rounded-xl shadow-xl p-5 w-80 flex flex-col gap-4">
        <div>
          <label className="text-xs text-gray-500 mb-1 block">Group name</label>
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleSave() }}
            placeholder="e.g. Course"
            disabled={saving}
            className="w-full text-sm px-3 py-1.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-300 disabled:opacity-50"
          />
        </div>

        {error && <p className="text-xs text-red-500">{error}</p>}

        <div className="flex items-center justify-between gap-2 pt-1">
          {isEdit && onDelete ? (
            <button
              type="button"
              onClick={() => setConfirmingDelete(true)}
              disabled={saving}
              className="text-gray-300 hover:text-red-500 transition-colors disabled:opacity-50"
              title="Delete group"
            >
              <Trash2 size={16} />
            </button>
          ) : <span />}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="px-3 py-1.5 text-sm rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="px-3 py-1.5 text-sm rounded-lg bg-gray-900 text-white hover:bg-gray-700 transition-colors disabled:opacity-50 inline-flex items-center gap-1.5"
            >
              {saving && <span className="w-3 h-3 border-2 border-white/40 border-t-white rounded-full animate-spin" />}
              {isEdit ? 'Save' : 'Create'}
            </button>
          </div>
        </div>
      </div>

      {confirmingDelete && (
        <ConfirmModal
          message={`Delete the group "${initialName}"? Its tags stay on your recipes and simply become uncategorized.`}
          confirmLabel="Delete"
          pending={deleting}
          error={deleteError}
          onConfirm={handleDelete}
          onCancel={() => { setConfirmingDelete(false); setDeleteError(null) }}
        />
      )}
    </div>
  )
}
