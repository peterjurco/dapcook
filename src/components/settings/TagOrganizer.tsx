'use client'

import { useState } from 'react'
import {
  DndContext,
  DragOverlay,
  MeasuringStrategy,
  PointerSensor,
  closestCenter,
  pointerWithin,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core'
import { SortableContext, arrayMove, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { GripVertical, Plus } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { GroupModal } from './GroupModal'
import { TagEditModal } from './TagEditModal'
import type { TagData } from '@/app/api/tags/route'
import type { TagGroup } from '@/types/database'

const UNCATEGORIZED_ZONE = 'zone:uncategorized'

// The default measuring strategy (WhileDragging) only (re)measures droppable
// rects around drag start/end, sourced from whatever's already tracked at
// that moment. A group created moments earlier can still be mid-registration
// in that tracking, so its drop zone silently has no rect yet — collisions
// against it fail with no visual feedback at all, exactly as if it weren't
// droppable. Always keeps rects continuously fresh instead, at a cost
// (continuous ResizeObserver-driven remeasurement) that's irrelevant for a
// settings page with at most a few dozen groups.
const MEASURING_CONFIG = { droppable: { strategy: MeasuringStrategy.Always } }

function zoneId(groupId: string) {
  return `zone:${groupId}`
}

/** Which droppable "target type" a given drag type is allowed to land on.
 *  A tag drag lands in a zone; a group drag lands on another group (to
 *  reorder). No droppable is ever registered with `type: 'tag'`, so
 *  filtering the droppable pool by `=== dragType` directly — instead of
 *  through this mapping — silently matches nothing for every tag drag:
 *  `over` is always null and the drop is a no-op, with zero visual
 *  feedback. Group drags happened to work regardless, since a group's own
 *  drag type coincidentally equals its valid target type. */
export function targetTypeFor(dragType: unknown): 'zone' | 'group' {
  return dragType === 'group' ? 'group' : 'zone'
}

function TagPill({ tag, moving, onClick }: { tag: TagData; moving: boolean; onClick: () => void }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: tag.name,
    data: { type: 'tag' },
  })
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

function DropZone({ id, children, empty, emptyLabel }: { id: string; children: React.ReactNode; empty: boolean; emptyLabel: string }) {
  const { setNodeRef, isOver } = useDroppable({ id, data: { type: 'zone' } })
  return (
    <div
      ref={setNodeRef}
      className={`flex flex-wrap gap-2 min-h-[2rem] rounded-lg p-1.5 -m-1.5 transition-colors ${
        isOver ? 'bg-gray-100' : ''
      }`}
    >
      {children}
      {empty && <span className="text-xs text-gray-300 py-1">{emptyLabel}</span>}
    </div>
  )
}

interface SortableGroupProps {
  t: ReturnType<typeof useTranslations>
  group: TagGroup
  onEdit: () => void
  children: React.ReactNode
}

function SortableGroup({ t, group, onEdit, children }: SortableGroupProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: group.id,
    data: { type: 'group' },
  })
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  return (
    <div ref={setNodeRef} style={style}>
      <div className="flex items-center gap-1 mb-1.5">
        <button
          type="button"
          className="text-gray-300 hover:text-gray-500 cursor-grab active:cursor-grabbing touch-none flex-shrink-0"
          aria-label={t('tagOrganizer.dragGroupAria', { groupName: group.name })}
          {...listeners}
          {...attributes}
        >
          <GripVertical size={14} />
        </button>
        <button
          type="button"
          onClick={onEdit}
          className="text-xs font-semibold text-gray-500 uppercase tracking-wide hover:text-gray-900 transition-colors"
        >
          {group.name}
        </button>
      </div>
      {children}
    </div>
  )
}

interface TagOrganizerProps {
  initialGroups: TagGroup[]
  initialTags: TagData[]
}

export function TagOrganizer({ initialGroups, initialTags }: TagOrganizerProps) {
  const t = useTranslations('settings')
  const [groups, setGroups] = useState<TagGroup[]>(initialGroups)
  const [tags, setTags] = useState<TagData[]>(initialTags)
  const [editingGroup, setEditingGroup] = useState<TagGroup | 'new' | null>(null)
  const [editingTag, setEditingTag] = useState<TagData | null>(null)
  // Two distinct states: activeDrag drives the live drag ghost/overlay,
  // movingTag drives the "saving" spinner once a tag is dropped, while the
  // PATCH is in flight. They don't overlap — the drag gesture ends before
  // the network call starts.
  const [activeDrag, setActiveDrag] = useState<{ type: 'tag' | 'group'; id: string } | null>(null)
  const [movingTag, setMovingTag] = useState<string | null>(null)
  const [banner, setBanner] = useState<string | null>(null)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  )

  // Tag drags and group-reorder drags run in the same DndContext but must
  // never collide with each other's targets: a tag can only land in a zone,
  // a group can only land on another group. Route each drag to its own pool.
  //
  // Within that pool, prefer pointerWithin (is the pointer literally over
  // this drop target?) over closestCenter (which drop target's center is
  // nearest?). closestCenter alone effectively never picks a small/empty
  // zone next to a much larger populated one — the populated zone's center
  // stays closer even when the pointer is directly over the empty zone's
  // placeholder text. Fall back to closestCenter only when the pointer
  // isn't over any candidate, so a fast drag still resolves to something.
  const collisionDetection: CollisionDetection = (args) => {
    const targetType = targetTypeFor(args.active.data.current?.type)
    const pool = args.droppableContainers.filter((c) => c.data.current?.type === targetType)
    const scopedArgs = { ...args, droppableContainers: pool }
    const pointerHits = pointerWithin(scopedArgs)
    return pointerHits.length > 0 ? pointerHits : closestCenter(scopedArgs)
  }

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
    setTags((prev) => prev.map((tag) => (tag.groupId === group.id ? { ...tag, groupId: null } : tag)))
    return true
  }

  async function handleGroupReorder(activeId: string, overId: string) {
    if (activeId === overId) return
    const oldIndex = groups.findIndex((g) => g.id === activeId)
    const newIndex = groups.findIndex((g) => g.id === overId)
    if (oldIndex === -1 || newIndex === -1) return

    const previous = groups
    const reordered = arrayMove(groups, oldIndex, newIndex).map((g, i) => ({ ...g, position: i }))
    setGroups(reordered)

    try {
      const results = await Promise.all(
        reordered.map((g) =>
          fetch(`/api/tag-groups/${g.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ position: g.position }),
          })
        )
      )
      if (results.some((r) => !r.ok)) {
        setGroups(previous)
        flashError(t('tagOrganizer.reorderFailed'))
      }
    } catch {
      setGroups(previous)
      flashError(t('tagOrganizer.reorderFailed'))
    }
  }

  async function handleTagSave(tag: TagData, updates: { name: string; color: string | null }): Promise<boolean> {
    const res = await fetch(`/api/tags/${encodeURIComponent(tag.name)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ newName: updates.name, color: updates.color }),
    })
    if (!res.ok) return false
    setTags((prev) => prev.map((tg) => (tg.name === tag.name ? { ...tg, name: updates.name, color: updates.color } : tg)))
    return true
  }

  async function handleTagDelete(tag: TagData): Promise<boolean> {
    const res = await fetch(`/api/tags/${encodeURIComponent(tag.name)}`, { method: 'DELETE' })
    if (!res.ok) return false
    setTags((prev) => prev.filter((tg) => tg.name !== tag.name))
    return true
  }

  async function handleTagMove(tagName: string, targetZoneId: string) {
    const targetGroupId = targetZoneId === UNCATEGORIZED_ZONE ? null : targetZoneId.replace(/^zone:/, '')
    const tag = tags.find((tag) => tag.name === tagName)
    if (!tag || tag.groupId === targetGroupId) return

    const previousGroupId = tag.groupId
    setTags((prev) => prev.map((tag) => (tag.name === tagName ? { ...tag, groupId: targetGroupId } : tag)))
    setMovingTag(tagName)

    const res = await fetch(`/api/tags/${encodeURIComponent(tagName)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ groupId: targetGroupId }),
    })
    if (!res.ok) {
      setTags((prev) => prev.map((tag) => (tag.name === tagName ? { ...tag, groupId: previousGroupId } : tag)))
      flashError(t('tagOrganizer.moveFailed', { tagName }))
    }
    setMovingTag(null)
  }

  function handleDragStart(event: DragStartEvent) {
    const type = event.active.data.current?.type === 'group' ? 'group' : 'tag'
    setActiveDrag({ type, id: String(event.active.id) })
  }

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    setActiveDrag(null)
    if (!over) return

    if (active.data.current?.type === 'group') {
      await handleGroupReorder(String(active.id), String(over.id))
    } else {
      await handleTagMove(String(active.id), String(over.id))
    }
  }

  const uncategorized = tags.filter((tag) => tag.groupId === null)
  const draggedTag = activeDrag?.type === 'tag' ? tags.find((tag) => tag.name === activeDrag.id) : undefined

  if (tags.length === 0 && groups.length === 0) {
    return <p className="text-sm text-gray-400">{t('tagOrganizer.noTags')}</p>
  }

  return (
    <div>
      {banner && (
        <p className="text-xs text-red-500 mb-3" role="status">{banner}</p>
      )}

      <DndContext
        sensors={sensors}
        measuring={MEASURING_CONFIG}
        collisionDetection={collisionDetection}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <SortableContext items={groups.map((g) => g.id)} strategy={verticalListSortingStrategy}>
          <div className="space-y-5">
            {groups.map((group) => {
              const groupTags = tags.filter((tag) => tag.groupId === group.id)
              return (
                <SortableGroup key={group.id} t={t} group={group} onEdit={() => setEditingGroup(group)}>
                  <DropZone id={zoneId(group.id)} empty={groupTags.length === 0} emptyLabel={t('tagOrganizer.emptyZone')}>
                    {groupTags.map((tag) => (
                      <TagPill
                        key={tag.name}
                        tag={tag}
                        moving={movingTag === tag.name}
                        onClick={() => setEditingTag(tag)}
                      />
                    ))}
                  </DropZone>
                </SortableGroup>
              )
            })}

            <div>
              <p className="text-xs font-semibold text-gray-300 uppercase tracking-wide mb-1.5">{t('tagOrganizer.uncategorized')}</p>
              <DropZone id={UNCATEGORIZED_ZONE} empty={uncategorized.length === 0} emptyLabel={t('tagOrganizer.emptyZone')}>
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
        </SortableContext>

        <DragOverlay>
          {draggedTag && (
            <span
              className="text-xs px-2.5 py-1 rounded-full font-medium shadow-lg"
              style={{
                backgroundColor: draggedTag.color ? draggedTag.color + '28' : '#f3f4f6',
                color: draggedTag.color ?? '#4b5563',
              }}
            >
              {draggedTag.name}
            </span>
          )}
        </DragOverlay>
      </DndContext>

      <button
        type="button"
        onClick={() => setEditingGroup('new')}
        className="mt-4 inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900 transition-colors"
      >
        <Plus size={14} />
        {t('tagOrganizer.newGroup')}
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
