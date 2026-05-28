'use client'

import { useState, useRef } from 'react'
import { X, Info, GripVertical } from 'lucide-react'
import type { ShoppingItem } from '@/types/database'

interface Props {
  item: ShoppingItem
  recipeNames: Record<string, string>
  onCheck: (id: string, checked: boolean) => void
  /** May return a Promise — ShoppingItemRow awaits it for new (pending) items. */
  onUpdate: (id: string, changes: Partial<Pick<ShoppingItem, 'name' | 'quantity' | 'unit' | 'category'>>) => void | Promise<void>
  onDelete: (id: string) => void
  /** Spread onto the grip button to enable drag-to-reorder */
  dragHandleListeners?: Record<string, unknown>
  dragHandleAttributes?: Record<string, unknown>
  /**
   * True for freshly created items: starts in edit mode; cancel/empty-save
   * calls onDelete (discards) instead of just closing the editor.
   */
  isNewItem?: boolean
  /** Called after Enter-save — parent inserts a new blank item below. */
  onCreateBelow?: (id: string) => void
}

// Exit animation states for checking off an item:
// idle → crossed (strikethrough, 350ms pause) → collapsing (height→0, 250ms) → onCheck fires
type ExitState = 'idle' | 'crossed' | 'collapsing'

export function ShoppingItemRow({
  item, recipeNames,
  onCheck, onUpdate, onDelete,
  dragHandleListeners, dragHandleAttributes,
  isNewItem, onCreateBelow,
}: Props) {
  const [editing, setEditing] = useState(isNewItem ?? false)
  const [editText, setEditText] = useState(() => {
    if (isNewItem) return ''
    const prefix = item.quantity != null
      ? `${formatQty(item.quantity)}${item.unit ?? ''}`
      : (item.unit ?? '')
    return (prefix ? `${prefix} ${item.name}` : item.name).trim()
  })
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const saveRef = useRef(false)
  const [exitState, setExitState] = useState<ExitState>('idle')

  function handleCheckChange(e: React.ChangeEvent<HTMLInputElement>) {
    if (e.target.checked) {
      setEditing(false)
      setExitState('crossed')
      setTimeout(() => setExitState('collapsing'), 350)
      setTimeout(() => onCheck(item.id, true), 600)
    } else {
      setExitState('idle')
      onCheck(item.id, false)
    }
  }

  function startEdit() {
    if (saving) return  // Can't edit while a save is in progress
    if (saveError && isNewItem) {
      // Re-enter edit from error state — keep editText (the text that failed to save)
      setSaveError(null)
      setEditing(true)
      return
    }
    const prefix = item.quantity != null
      ? `${formatQty(item.quantity)}${item.unit ?? ''}`
      : (item.unit ?? '')
    setEditText((prefix ? `${prefix} ${item.name}` : item.name).trim())
    setSaveError(null)
    setEditing(true)
  }

  async function save(createBelow = false) {
    if (saveRef.current) return
    saveRef.current = true
    setSaveError(null)
    const trimmed = editText.trim()

    // Discard empty new items
    if (!trimmed && isNewItem) {
      onDelete(item.id)
      setTimeout(() => { saveRef.current = false }, 100)
      return
    }

    if (isNewItem) {
      // Close editor, show saving state in view mode.
      // Call onCreateBelow now so the cursor jumps to the next item immediately,
      // while this item persists visually during the async save.
      setEditing(false)
      setSaving(true)
      if (createBelow) onCreateBelow?.(item.id)
      try {
        await Promise.resolve(
          onUpdate(item.id, { name: trimmed, quantity: null, unit: null })
        )
        // Success: parent replaces this item — nothing more to do here
      } catch {
        setSaving(false)
        setSaveError('Failed to save')
      }
    } else {
      // Regular item: optimistic update
      onUpdate(item.id, { name: trimmed || item.name, quantity: null, unit: null })
      setEditing(false)
      if (createBelow) onCreateBelow?.(item.id)
    }

    setTimeout(() => { saveRef.current = false }, 100)
  }

  async function retry() {
    setSaveError(null)
    setSaving(true)
    try {
      await Promise.resolve(
        onUpdate(item.id, { name: editText.trim() || item.name, quantity: null, unit: null })
      )
    } catch {
      setSaving(false)
      setSaveError('Failed to save')
    }
  }

  function cancel() {
    if (isNewItem) {
      onDelete(item.id)   // Discard empty new-item
    } else {
      setEditing(false)
    }
  }

  const isVisuallyChecked = exitState !== 'idle' || item.is_checked
  const isCollapsing = exitState === 'collapsing'

  // While saving/errored on a new item, item.name is still '' — use editText instead
  const displayName = (saving || saveError) && isNewItem ? editText.trim() : item.name
  const displayQty = (saving || saveError) && isNewItem ? null : (
    item.quantity != null
      ? `${formatQty(item.quantity)}${item.unit ?? ''}`
      : item.unit ?? null
  )

  return (
    // Grid trick: animates from natural height (1fr) to 0 without knowing the pixel value.
    // overflow-hidden is on the INNER div so the tooltip (position:absolute, going upward)
    // isn't clipped by the outer wrapper.
    <div
      style={{
        display: 'grid',
        gridTemplateRows: isCollapsing ? '0fr' : '1fr',
        transition: isCollapsing ? 'grid-template-rows 0.25s ease-in-out' : undefined,
      }}
    >
      <div className="overflow-hidden min-h-0">
        {editing ? (
          <div className="flex items-center gap-2 py-2 px-1">
            {/* Drag handle */}
            <button
              type="button"
              className="self-stretch flex items-center text-gray-300 cursor-grab active:cursor-grabbing touch-none flex-shrink-0"
              aria-label="Drag to reorder"
              {...(dragHandleListeners ?? {})}
              {...(dragHandleAttributes ?? {})}
            >
              <GripVertical size={18} />
            </button>
            {/* Checkbox */}
            <input
              type="checkbox"
              checked={isVisuallyChecked}
              onChange={handleCheckChange}
              className="w-4 h-4 rounded border-gray-300 text-gray-900 cursor-pointer flex-shrink-0"
            />
            {/* Inline transparent input — blur saves, Enter saves+creates-below, Escape cancels.
                font-size: 16px prevents iOS Safari from zooming on focus. */}
            <input
              autoFocus
              value={editText}
              onChange={(e) => setEditText(e.target.value)}
              onBlur={() => save()}
              onKeyDown={(e) => {
                if (e.key === 'Enter') { e.preventDefault(); save(true) }
                if (e.key === 'Escape') cancel()
              }}
              style={{ fontSize: '16px' }}
              className="flex-1 min-w-0 bg-transparent border-0 focus:outline-none text-gray-900"
            />
            {/* Cancel — onMouseDown+preventDefault keeps focus on input so onBlur/save doesn't fire */}
            <button
              type="button"
              onMouseDown={(e) => { e.preventDefault(); cancel() }}
              className="text-gray-300 hover:text-gray-700 transition-colors flex-shrink-0"
              aria-label="Cancel edit"
            >
              <X size={18} />
            </button>
          </div>
        ) : (
          <div>
            <div className="flex items-center gap-2 py-2 px-1">
              {/* Drag handle */}
              <button
                type="button"
                className="self-stretch flex items-center text-gray-300 hover:text-gray-400 cursor-grab active:cursor-grabbing touch-none flex-shrink-0"
                aria-label="Drag to reorder"
                {...(dragHandleListeners ?? {})}
                {...(dragHandleAttributes ?? {})}
              >
                <GripVertical size={18} />
              </button>

              <input
                type="checkbox"
                checked={isVisuallyChecked}
                onChange={handleCheckChange}
                className="w-4 h-4 rounded border-gray-300 text-gray-900 cursor-pointer flex-shrink-0"
              />

              {/* Clicking the text enters inline edit mode */}
              <span
                onClick={startEdit}
                className={`flex-1 min-w-0 text-base transition-colors duration-150 select-none ${
                  saveError
                    ? 'text-gray-900 cursor-text'
                    : isVisuallyChecked
                      ? 'line-through text-gray-400 cursor-text'
                      : 'text-gray-900 cursor-text'
                }`}
              >
                {displayQty && (
                  <span className="text-gray-500 mr-1.5">{displayQty}</span>
                )}
                {displayName}
              </span>

              <div className="flex items-center gap-2 flex-shrink-0">
                {item.source_recipe_ids.length > 0 && !saveError && (
                  <div className="relative group/tooltip">
                    <Info size={15} className="text-gray-300 cursor-default" />
                    {/* Tooltip rendered above: z-50 ensures it floats over sibling rows */}
                    <div className="absolute z-50 bottom-full right-0 mb-2 hidden group-hover/tooltip:block">
                      <div className="bg-gray-900 text-white text-xs rounded-lg px-2.5 py-1.5 w-max max-w-[200px] break-words shadow-lg">
                        {item.source_recipe_ids.map((id) => recipeNames[id] ?? 'Unknown recipe').join(', ')}
                        <div className="absolute top-full right-2 border-4 border-transparent border-t-gray-900" />
                      </div>
                    </div>
                  </div>
                )}

                <button
                  type="button"
                  onClick={() => onDelete(item.id)}
                  className="text-gray-300 hover:text-red-500 transition-colors"
                  title="Delete"
                >
                  <X size={18} />
                </button>
              </div>
            </div>

            {/* Error row — shown below the item when a new-item save fails */}
            {saveError && (
              <div className="flex items-center gap-2 pb-1.5 pl-[52px] pr-1">
                <span className="text-xs text-red-500 flex-1">{saveError}</span>
                <button
                  type="button"
                  onMouseDown={(e) => { e.preventDefault(); retry() }}
                  className="text-xs text-red-500 underline hover:text-red-700 transition-colors flex-shrink-0"
                >
                  Retry
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function formatQty(qty: number): string {
  if (Number.isInteger(qty)) return String(qty)
  const rounded = parseFloat(qty.toPrecision(3))
  return String(rounded)
}
