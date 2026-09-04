'use client'

import { useEffect, useState } from 'react'
import { Check, Trash2 } from 'lucide-react'
import { ConfirmModal } from '@/components/ui/ConfirmModal'
import type { TagData } from '@/app/api/tags/route'

const PALETTE = [
  '#ef4444', '#f87171', '#dc2626', '#f43f5e', '#fb7185', '#be185d', '#ec4899', '#f9a8d4',
  '#f97316', '#fb923c', '#ea580c', '#f59e0b', '#fbbf24', '#eab308', '#ca8a04', '#d97706',
  '#22c55e', '#4ade80', '#16a34a', '#84cc16', '#a3e635', '#65a30d', '#10b981', '#34d399',
  '#3b82f6', '#60a5fa', '#1d4ed8', '#06b6d4', '#22d3ee', '#0891b2', '#0ea5e9', '#38bdf8',
  '#8b5cf6', '#a78bfa', '#7c3aed', '#a855f7', '#c084fc', '#9333ea', '#6366f1', '#818cf8',
  '#6b7280', '#9ca3af', '#374151', '#14b8a6', '#2dd4bf', '#0d9488', '#64748b', '#475569',
]

interface TagEditModalProps {
  tag: TagData
  onSave: (updates: { name: string; color: string | null }) => Promise<boolean>
  onDelete: () => Promise<boolean>
  onClose: () => void
}

export function TagEditModal({ tag, onSave, onDelete, onClose }: TagEditModalProps) {
  const [name, setName] = useState(tag.name)
  const [color, setColor] = useState<string | null>(tag.color)
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
    const trimmed = name.trim().toLowerCase()
    if (!trimmed) {
      setError('Name cannot be empty.')
      return
    }
    setSaving(true)
    setError(null)
    const ok = await onSave({ name: trimmed, color })
    setSaving(false)
    if (ok) onClose()
    else setError("Couldn't save. Try again.")
  }

  async function handleDelete() {
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
          <label className="text-xs text-gray-500 mb-1 block">Name</label>
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleSave() }}
            disabled={saving}
            className="w-full text-sm px-3 py-1.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-300 disabled:opacity-50"
          />
        </div>

        <div>
          <label className="text-xs text-gray-500 mb-1 block">Color</label>
          <div className="flex flex-wrap gap-1.5">
            {PALETTE.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setColor(c)}
                disabled={saving}
                className="w-6 h-6 rounded-full hover:scale-110 transition-transform relative disabled:opacity-50"
                style={{ backgroundColor: c }}
              >
                {color === c && <Check size={12} className="absolute inset-0 m-auto text-white" strokeWidth={3} />}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setColor(null)}
              disabled={saving}
              className="w-6 h-6 rounded-full border border-gray-200 bg-white hover:bg-gray-50 flex items-center justify-center disabled:opacity-50"
              title="No color"
            >
              {color === null && <Check size={12} className="text-gray-400" strokeWidth={3} />}
            </button>
          </div>
        </div>

        {error && <p className="text-xs text-red-500">{error}</p>}

        <div className="flex items-center justify-between gap-2 pt-1">
          <button
            type="button"
            onClick={() => setConfirmingDelete(true)}
            disabled={saving}
            className="text-gray-300 hover:text-red-500 transition-colors disabled:opacity-50"
            title="Delete tag"
          >
            <Trash2 size={16} />
          </button>
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
              Save
            </button>
          </div>
        </div>
      </div>

      {confirmingDelete && (
        <ConfirmModal
          message={
            tag.count > 0
              ? `Remove tag "${tag.name}" from all recipes? This cannot be undone.`
              : `Delete unused tag "${tag.name}"?`
          }
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
