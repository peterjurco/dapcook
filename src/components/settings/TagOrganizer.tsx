'use client'

import { useState } from 'react'
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core'
import { Plus } from 'lucide-react'
import { GroupModal } from './GroupModal'
import { TagEditModal } from './TagEditModal'
import type { TagData } from '@/app/api/tags/route'
import type { TagGroup } from '@/types/database'

const UNCATEGORIZED = 'uncategorized'

interface TagOrganizerProps {
  initialGroups: TagGroup[]
  initialTags: TagData[]
}

function TagPill({ tag, moving, onClick }: { tag: TagData; moving: boolean; onClick: () => void }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: tag.name })
  const color = tag.color

  return (
    <button
      ref={setNodeRef}
      type="button"
      onClick={onClick}
      className="text-xs px-2.5 py-1 rounded-full font-medium cursor-grab active:cursor-grabbing touch-none relative transition-opacity"
      style={{
        opacity: isDragging ? 0.3 : 1,
        backgroundColor: color ? color + '28' : '#f3f4f6',
        color: color ?? '#4b5563',
      }}
      {...listeners}
      {...attributes}
    >
      {tag.name}
      {moving && (
        <span className="absolute inset-0 flex items-center justify-center bg-white/70 rounded-full">
          <span className="w-3 h-3 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin" />
        </span>
      )}
    </button>
  )
}

function DropZone({ id, children, empty }: { id: string; children: React.ReactNode; empty: boolean }) {
  const { setNodeRef, isOver } = useDroppable({ id })
  return (
    <div
      ref={setNodeRef}
      className={`flex flex-wrap gap-2 min-h-[2rem] rounded-lg p-1.5 -m-1.5 transition-colors ${
        isOver ? 'bg-gray-100' : ''
      }`}
    >
      {children}
      {empty && <span className="text-xs text-gray-300 py-1">No tags yet — drag one here</span>}
    </div>
  )
}

export function TagOrganizer({ initialGroups, initialTags }: TagOrganizerProps) {
  const [groups, setGroups] = useState<TagGroup[]>(initialGroups)
  const [tags, setTags] = useState<TagData[]>(initialTags)
  const [editingGroup, setEditingGroup] = useState<TagGroup | 'new' | null>(null)
  const [editingTag, setEditingTag] = useState<TagData | null>(null)
  // Two distinct states: activeDragId drives the live drag ghost/overlay,
  // movingTag drives the "saving" spinner once dropped, while the PATCH is
  // in flight. They don't overlap — the drag gesture ends before the
  // network call starts.
  const [activeDragId, setActiveDragId] = useState<string | null>(null)
  const [movingTag, setMovingTag] = useState<string | null>(null)
  const [banner, setBanner] = useState<string | null>(null)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  )

  function flashError(message: string) {
    setBanner(message)
    setTimeout(() => setBanner((current) => (current === message ? null : current)), 4000)
  }

  async function handleGroupCreate(name: string): Promise<boolean> {
    const res = await fetch('/api/tag-groups', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    })
    if (!res.ok) return false
    const created = await res.json() as TagGroup
    setGroups((prev) => [created, ...prev])
    return true
  }

  async function handleGroupRename(group: TagGroup, name: string): Promise<boolean> {
    const res = await fetch(`/api/tag-groups/${group.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    })
    if (!res.ok) return false
    setGroups((prev) => prev.map((g) => (g.id === group.id ? { ...g, name } : g)))
    return true
  }

  async function handleGroupDelete(group: TagGroup): Promise<boolean> {
    const res = await fetch(`/api/tag-groups/${group.id}`, { method: 'DELETE' })
    if (!res.ok) return false
    setGroups((prev) => prev.filter((g) => g.id !== group.id))
    setTags((prev) => prev.map((t) => (t.groupId === group.id ? { ...t, groupId: null } : t)))
    return true
  }

  async function handleTagSave(tag: TagData, updates: { name: string; color: string | null }): Promise<boolean> {
    const res = await fetch(`/api/tags/${encodeURIComponent(tag.name)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ newName: updates.name, color: updates.color }),
    })
    if (!res.ok) return false
    setTags((prev) => prev.map((t) => (t.name === tag.name ? { ...t, name: updates.name, color: updates.color } : t)))
    return true
  }

  async function handleTagDelete(tag: TagData): Promise<boolean> {
    const res = await fetch(`/api/tags/${encodeURIComponent(tag.name)}`, { method: 'DELETE' })
    if (!res.ok) return false
    setTags((prev) => prev.filter((t) => t.name !== tag.name))
    return true
  }

  function handleDragStart(event: DragStartEvent) {
    setActiveDragId(String(event.active.id))
  }

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    setActiveDragId(null)
    if (!over) return

    const tagName = String(active.id)
    const targetGroupId = over.id === UNCATEGORIZED ? null : String(over.id)
    const tag = tags.find((t) => t.name === tagName)
    if (!tag || tag.groupId === targetGroupId) return

    const previousGroupId = tag.groupId
    setTags((prev) => prev.map((t) => (t.name === tagName ? { ...t, groupId: targetGroupId } : t)))
    setMovingTag(tagName)

    const res = await fetch(`/api/tags/${encodeURIComponent(tagName)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ groupId: targetGroupId }),
    })
    if (!res.ok) {
      setTags((prev) => prev.map((t) => (t.name === tagName ? { ...t, groupId: previousGroupId } : t)))
      flashError(`Couldn't move "${tagName}". Reverted.`)
    }
    setMovingTag(null)
  }

  const uncategorized = tags.filter((t) => t.groupId === null)

  if (tags.length === 0 && groups.length === 0) {
    return <p className="text-sm text-gray-400">No tags yet. Add some to your recipes.</p>
  }

  return (
    <div>
      {banner && (
        <p className="text-xs text-red-500 mb-3" role="status">{banner}</p>
      )}

      <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
        <div className="space-y-5">
          {groups.map((group) => {
            const groupTags = tags.filter((t) => t.groupId === group.id)
            return (
              <div key={group.id}>
                <button
                  type="button"
                  onClick={() => setEditingGroup(group)}
                  className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5 hover:text-gray-900 transition-colors"
                >
                  {group.name}
                </button>
                <DropZone id={group.id} empty={groupTags.length === 0}>
                  {groupTags.map((tag) => (
                    <TagPill
                      key={tag.name}
                      tag={tag}
                      moving={movingTag === tag.name}
                      onClick={() => setEditingTag(tag)}
                    />
                  ))}
                </DropZone>
              </div>
            )
          })}

          <div>
            <p className="text-xs font-semibold text-gray-300 uppercase tracking-wide mb-1.5">Uncategorized</p>
            <DropZone id={UNCATEGORIZED} empty={uncategorized.length === 0}>
              {uncategorized.map((tag) => (
                <TagPill
                  key={tag.name}
                  tag={tag}
                  moving={movingTag === tag.name}
                  onClick={() => setEditingTag(tag)}
                />
              ))}
            </DropZone>
          </div>
        </div>

        <DragOverlay>
          {activeDragId && (() => {
            const tag = tags.find((t) => t.name === activeDragId)
            return tag ? (
              <span
                className="text-xs px-2.5 py-1 rounded-full font-medium shadow-lg"
                style={{ backgroundColor: tag.color ? tag.color + '28' : '#f3f4f6', color: tag.color ?? '#4b5563' }}
              >
                {tag.name}
              </span>
            ) : null
          })()}
        </DragOverlay>
      </DndContext>

      <button
        type="button"
        onClick={() => setEditingGroup('new')}
        className="mt-4 inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900 transition-colors"
      >
        <Plus size={14} />
        New group
      </button>

      {editingGroup === 'new' && (
        <GroupModal
          onSave={handleGroupCreate}
          onClose={() => setEditingGroup(null)}
        />
      )}
      {editingGroup !== null && editingGroup !== 'new' && (
        <GroupModal
          initialName={editingGroup.name}
          onSave={(name) => handleGroupRename(editingGroup, name)}
          onDelete={() => handleGroupDelete(editingGroup)}
          onClose={() => setEditingGroup(null)}
        />
      )}
      {editingTag && (
        <TagEditModal
          tag={editingTag}
          onSave={(updates) => handleTagSave(editingTag, updates)}
          onDelete={() => handleTagDelete(editingTag)}
          onClose={() => setEditingTag(null)}
        />
      )}
    </div>
  )
}
