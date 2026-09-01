'use client'

import { useState } from 'react'
import { X, Pencil, Plus, Pin, PinOff, ChevronUp, ChevronDown } from 'lucide-react'
import { ConfirmModal } from '@/components/ui/ConfirmModal'
import type { TagGroup } from '@/types/database'

interface TagGroupsEditorProps {
  initialGroups: TagGroup[]
}

export function TagGroupsEditor({ initialGroups }: TagGroupsEditorProps) {
  const [groups, setGroups] = useState<TagGroup[]>(initialGroups)
  const [newName, setNewName] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [deleteTarget, setDeleteTarget] = useState<TagGroup | null>(null)

  async function handleCreate() {
    const name = newName.trim()
    if (!name) return
    const res = await fetch('/api/tag-groups', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    })
    if (res.ok) {
      const created = await res.json() as TagGroup
      setGroups((prev) => [...prev, created])
      setNewName('')
    }
  }

  async function patchGroup(id: string, updates: Partial<Pick<TagGroup, 'name' | 'is_pinned' | 'position'>>) {
    const res = await fetch(`/api/tag-groups/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    })
    if (res.ok) {
      setGroups((prev) => prev.map((g) => (g.id === id ? { ...g, ...updates } : g)))
    }
  }

  async function handleRename(id: string) {
    const name = renameValue.trim()
    setEditingId(null)
    if (!name) return
    await patchGroup(id, { name })
  }

  async function handleMove(index: number, direction: -1 | 1) {
    const target = index + direction
    if (target < 0 || target >= groups.length) return
    const previous = groups
    const reordered = [...groups]
    const [moved] = reordered.splice(index, 1)
    reordered.splice(target, 0, moved)
    const withPositions = reordered.map((g, i) => ({ ...g, position: i }))
    setGroups(withPositions)
    try {
      const results = await Promise.all(
        withPositions.map((g) =>
          fetch(`/api/tag-groups/${g.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ position: g.position }),
          })
        )
      )
      if (results.some((r) => !r.ok)) setGroups(previous)
    } catch {
      setGroups(previous)
    }
  }

  async function handleDelete(group: TagGroup) {
    const res = await fetch(`/api/tag-groups/${group.id}`, { method: 'DELETE' })
    if (res.ok) setGroups((prev) => prev.filter((g) => g.id !== group.id))
    setDeleteTarget(null)
  }

  return (
    <>
      <div className="space-y-1">
        {groups.map((group, index) => (
          <div key={group.id} className="flex items-center gap-2 py-2 group">
            <button
              type="button"
              onClick={() => patchGroup(group.id, { is_pinned: !group.is_pinned })}
              className={group.is_pinned ? 'text-gray-900' : 'text-gray-300 hover:text-gray-600'}
              title={group.is_pinned ? 'Unpin from the recipe list' : 'Pin to the recipe list'}
            >
              {group.is_pinned ? <Pin size={14} /> : <PinOff size={14} />}
            </button>

            {editingId === group.id ? (
              <input
                autoFocus
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleRename(group.id)
                  if (e.key === 'Escape') setEditingId(null)
                }}
                onBlur={() => handleRename(group.id)}
                className="flex-1 text-sm px-2 py-0.5 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-gray-300"
              />
            ) : (
              <div className="flex items-center gap-1.5 flex-1 min-w-0">
                <span className="text-sm text-gray-900 font-medium">{group.name}</span>
                <button
                  type="button"
                  onClick={() => { setEditingId(group.id); setRenameValue(group.name) }}
                  className="opacity-0 group-hover:opacity-100 transition-opacity text-gray-400 hover:text-gray-700"
                  title="Rename"
                >
                  <Pencil size={12} />
                </button>
              </div>
            )}

            <button
              type="button"
              onClick={() => handleMove(index, -1)}
              disabled={index === 0}
              className="text-gray-300 hover:text-gray-700 disabled:opacity-30"
              title="Move up"
            >
              <ChevronUp size={14} />
            </button>
            <button
              type="button"
              onClick={() => handleMove(index, 1)}
              disabled={index === groups.length - 1}
              className="text-gray-300 hover:text-gray-700 disabled:opacity-30"
              title="Move down"
            >
              <ChevronDown size={14} />
            </button>
            <button
              type="button"
              onClick={() => setDeleteTarget(group)}
              className="opacity-0 group-hover:opacity-100 transition-opacity text-gray-300 hover:text-red-500"
              title="Delete group"
            >
              <X size={14} />
            </button>
          </div>
        ))}
      </div>

      <div className="flex items-center gap-2 mt-3">
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') handleCreate() }}
          placeholder="New group, e.g. Course"
          className="flex-1 text-sm px-2 py-1 border border-gray-200 rounded focus:outline-none focus:ring-2 focus:ring-gray-300"
        />
        <button
          type="button"
          onClick={handleCreate}
          className="inline-flex items-center gap-1 px-2 py-1 text-sm text-gray-700 border border-gray-200 rounded hover:bg-gray-50"
        >
          <Plus size={14} />
          Add
        </button>
      </div>

      {deleteTarget && (
        <ConfirmModal
          message={`Delete the group "${deleteTarget.name}"? Its tags stay on your recipes and simply become ungrouped.`}
          confirmLabel="Delete"
          onConfirm={() => handleDelete(deleteTarget)}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </>
  )
}
