'use client'

import { useState } from 'react'
import { X, Check, Pencil } from 'lucide-react'
import { ConfirmModal } from '@/components/ui/ConfirmModal'
import type { TagData } from '@/app/api/tags/route'

const PALETTE = [
  '#ef4444', '#f97316', '#eab308', '#22c55e',
  '#14b8a6', '#3b82f6', '#8b5cf6', '#ec4899', '#6b7280',
]

interface TagsEditorProps {
  initialTags: TagData[]
}

export function TagsEditor({ initialTags }: TagsEditorProps) {
  const [tags, setTags] = useState<TagData[]>(initialTags)
  const [editingName, setEditingName] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [colorPickerFor, setColorPickerFor] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null)

  async function handleRename(oldName: string) {
    const newName = renameValue.trim().toLowerCase()
    if (!newName || newName === oldName) { setEditingName(null); return }

    const res = await fetch(`/api/tags/${encodeURIComponent(oldName)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ newName }),
    })
    if (res.ok) {
      setTags((prev) => prev.map((t) => t.name === oldName ? { ...t, name: newName } : t))
    }
    setEditingName(null)
  }

  async function handleColorChange(name: string, color: string | null) {
    const res = await fetch(`/api/tags/${encodeURIComponent(name)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ color }),
    })
    if (res.ok) {
      setTags((prev) => prev.map((t) => t.name === name ? { ...t, color } : t))
    }
    setColorPickerFor(null)
  }

  async function handleDelete(name: string) {
    const res = await fetch(`/api/tags/${encodeURIComponent(name)}`, { method: 'DELETE' })
    if (res.ok) setTags((prev) => prev.filter((t) => t.name !== name))
    setDeleteTarget(null)
  }

  if (tags.length === 0) {
    return <p className="text-sm text-gray-400">No tags yet. Add some to your recipes.</p>
  }

  return (
    <>
      <div className="space-y-1">
        {tags.map((tag) => (
          <div key={tag.name} className="flex items-center gap-3 py-2 group">
            {/* Color dot / picker toggle */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setColorPickerFor(colorPickerFor === tag.name ? null : tag.name)}
                className="w-5 h-5 rounded-full border border-gray-200 hover:ring-2 hover:ring-offset-1 hover:ring-gray-300 transition-all flex-shrink-0"
                style={{ backgroundColor: tag.color ?? '#e5e7eb' }}
                title="Change color"
              />
              {colorPickerFor === tag.name && (
                <div className="absolute z-10 top-7 left-0 bg-white border border-gray-200 rounded-lg shadow-lg p-2 flex flex-wrap gap-1.5 w-48">
                  {PALETTE.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => handleColorChange(tag.name, c)}
                      className="w-6 h-6 rounded-full hover:scale-110 transition-transform relative"
                      style={{ backgroundColor: c }}
                    >
                      {tag.color === c && (
                        <Check size={12} className="absolute inset-0 m-auto text-white" strokeWidth={3} />
                      )}
                    </button>
                  ))}
                  {tag.color && (
                    <button
                      type="button"
                      onClick={() => handleColorChange(tag.name, null)}
                      className="w-6 h-6 rounded-full border border-gray-200 bg-white hover:bg-gray-50 flex items-center justify-center"
                      title="Remove color"
                    >
                      <X size={10} className="text-gray-400" />
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Name / rename input */}
            {editingName === tag.name ? (
              <input
                autoFocus
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleRename(tag.name)
                  if (e.key === 'Escape') setEditingName(null)
                }}
                onBlur={() => handleRename(tag.name)}
                className="flex-1 text-sm px-2 py-0.5 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-gray-300"
              />
            ) : (
              <div className="flex items-center gap-1.5 flex-1 min-w-0">
                <span
                  className="text-sm text-gray-900 font-medium"
                  style={tag.color ? { color: tag.color } : undefined}
                >
                  {tag.name}
                </span>
                <span className="text-xs text-gray-400">{tag.count > 0 ? `${tag.count} recipe${tag.count !== 1 ? 's' : ''}` : 'unused'}</span>
                <button
                  type="button"
                  onClick={() => { setEditingName(tag.name); setRenameValue(tag.name) }}
                  className="opacity-0 group-hover:opacity-100 transition-opacity text-gray-400 hover:text-gray-700"
                  title="Rename"
                >
                  <Pencil size={12} />
                </button>
              </div>
            )}

            {/* Delete */}
            <button
              type="button"
              onClick={() => setDeleteTarget(tag.name)}
              className="opacity-0 group-hover:opacity-100 transition-opacity text-gray-300 hover:text-red-500 flex-shrink-0"
              title="Delete tag"
            >
              <X size={14} />
            </button>
          </div>
        ))}
      </div>

      {deleteTarget && (
        <ConfirmModal
          message={
            tags.find((t) => t.name === deleteTarget)?.count
              ? `Remove tag "${deleteTarget}" from all recipes? This cannot be undone.`
              : `Delete unused tag "${deleteTarget}"?`
          }
          confirmLabel="Delete"
          onConfirm={() => handleDelete(deleteTarget)}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </>
  )
}
