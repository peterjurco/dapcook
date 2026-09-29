'use client'

import { useState, useRef, useEffect } from 'react'
import { useTranslations } from 'next-intl'
import { X, Plus, Sparkles } from 'lucide-react'
import type { TagData } from '@/app/api/tags/route'
import type { TagSuggestions } from '@/types/recipe'

interface TagInputProps {
  tags: string[]
  onChange: (tags: string[]) => void
  allTags: TagData[]
  /** AI suggestions; when null/empty the "most used" row is shown instead. */
  suggestions?: TagSuggestions | null
  /** Fired when the input gains focus — the parent decides whether to fetch. */
  onRequestSuggestions?: () => void
}

function normalize(s: string) {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
}

function tagStyle(color: string | null): React.CSSProperties | undefined {
  if (!color) return undefined
  return { backgroundColor: color + '28', color, borderColor: color + '60' }
}

function tagClass(color: string | null) {
  return color
    ? 'border text-xs font-medium px-2.5 py-1 rounded-full'
    : 'bg-gray-100 text-gray-700 text-xs font-medium px-2.5 py-1 rounded-full'
}

function colorFor(name: string, allTags: TagData[]) {
  return allTags.find((tag) => tag.name === name)?.color ?? null
}

export function TagInput({ tags, onChange, allTags, suggestions: aiSuggestions, onRequestSuggestions }: TagInputProps) {
  const t = useTranslations('recipes')
  const [input, setInput] = useState('')
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Close dropdown on outside click
  useEffect(() => {
    function onMouseDown(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', onMouseDown)
    return () => document.removeEventListener('mousedown', onMouseDown)
  }, [])

  function addTag(raw: string) {
    const tag = raw.trim().toLowerCase()
    if (tag && !tags.includes(tag)) onChange([...tags, tag])
    setInput('')
    setOpen(false)
  }

  function removeTag(tag: string) {
    onChange(tags.filter((t) => t !== tag))
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault()
      if (input.trim()) addTag(input)
    } else if (e.key === 'Escape') {
      setOpen(false)
      setInput('')
    } else if (e.key === 'Backspace' && !input && tags.length > 0) {
      onChange(tags.slice(0, -1))
    }
  }

  const norm = normalize(input)

  // Autocomplete: tags that match input and aren't already selected
  const suggestions = input
    ? allTags.filter((tag) => !tags.includes(tag.name) && normalize(tag.name).includes(norm))
    : []

  // AI suggestions, minus tags already on the recipe
  const suggestedExisting = !input && aiSuggestions ? aiSuggestions.existing.filter((name) => !tags.includes(name)) : []
  const suggestedNew = !input && aiSuggestions?.new && !tags.includes(aiSuggestions.new) ? aiSuggestions.new : null
  const hasSuggestions = suggestedExisting.length > 0 || suggestedNew !== null

  // Most used: top 8 unused tags shown when input is empty and there are no suggestions
  const mostUsed = !input && !hasSuggestions
    ? allTags.filter((tag) => tag.count > 0 && !tags.includes(tag.name)).slice(0, 8)
    : []

  const showDropdown = open && suggestions.length > 0

  return (
    <div ref={containerRef} className="space-y-2">
      {/* Selected tags + input share one box */}
      <div className="relative">
        <div
          data-testid="tag-input-box"
          onClick={() => inputRef.current?.focus()}
          className="flex flex-wrap items-center gap-1.5 px-2 py-1.5 min-h-[2.375rem] border border-gray-200 rounded-md bg-white cursor-text focus-within:ring-2 focus-within:ring-gray-300"
        >
          {tags.map((tag) => {
            const color = colorFor(tag, allTags)
            return (
              <span key={tag} className={`inline-flex items-center gap-1 ${tagClass(color)}`} style={tagStyle(color)}>
                {tag}
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); removeTag(tag) }}
                  aria-label={t('tagInput.remove', { tag })}
                  className="opacity-60 hover:opacity-100"
                >
                  <X size={11} aria-hidden />
                </button>
              </span>
            )
          })}
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => { setInput(e.target.value); setOpen(true) }}
            onFocus={() => { setOpen(true); onRequestSuggestions?.() }}
            onKeyDown={handleKeyDown}
            onBlur={() => { if (input.trim()) addTag(input) }}
            placeholder={t('tagInput.placeholder')}
            className="flex-1 min-w-[10rem] px-1 py-0.5 text-sm bg-transparent text-gray-900 placeholder:text-gray-400 focus:outline-none"
          />
        </div>

        {showDropdown && (
          <div className="absolute z-10 top-full mt-1 left-0 right-0 bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden">
            {suggestions.map((tag) => (
              <button
                key={tag.name}
                type="button"
                onMouseDown={(e) => { e.preventDefault(); addTag(tag.name) }}
                className="w-full flex items-center justify-between px-3 py-2 hover:bg-gray-50 text-left"
              >
                <span className={`inline-flex items-center gap-1.5 ${tagClass(tag.color)}`} style={tagStyle(tag.color)}>
                  {tag.color && <span className="w-2 h-2 rounded-full inline-block" style={{ backgroundColor: tag.color }} />}
                  {tag.name}
                </span>
                <span className="text-xs text-gray-400">{tag.count}×</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* One row: label, then add-able chips (AI suggestions, or most used as fallback) */}
      {(hasSuggestions || mostUsed.length > 0) && (
        <div data-testid="tag-suggestions" className="flex flex-wrap items-center gap-1.5">
          <span className="inline-flex items-center gap-1 text-xs text-gray-400 mr-0.5">
            {hasSuggestions && <Sparkles size={12} aria-hidden />}
            {hasSuggestions ? t('tagInput.suggested') : t('tagInput.mostUsed')}
          </span>
          {hasSuggestions
            ? suggestedExisting.map((name) => (
                <AddChip key={name} name={name} color={colorFor(name, allTags)} onAdd={addTag} />
              ))
            : mostUsed.map((tag) => (
                <AddChip key={tag.name} name={tag.name} color={tag.color} onAdd={addTag} />
              ))}
          {suggestedNew && (
            <AddChip name={suggestedNew} color={null} onAdd={addTag} isNew newLabel={t('tagInput.new')} />
          )}
        </div>
      )}
    </div>
  )
}

interface AddChipProps {
  name: string
  color: string | null
  onAdd: (name: string) => void
  isNew?: boolean
  newLabel?: string
}

/** Outlined "+ tag" chip: visually distinct from the filled chips already on the recipe. */
function AddChip({ name, color, onAdd, isNew, newLabel }: AddChipProps) {
  return (
    <button
      type="button"
      onClick={() => onAdd(name)}
      className={`inline-flex items-center gap-1 border ${isNew ? 'border-dashed' : ''} border-gray-300 bg-white text-gray-600 text-xs font-medium px-2.5 py-1 rounded-full hover:border-gray-500 hover:text-gray-900 transition-colors cursor-pointer`}
      style={color ? { color, borderColor: color + '80' } : undefined}
    >
      <Plus size={11} aria-hidden />
      {name}
      {isNew && <span className="text-[10px] uppercase tracking-wide text-gray-500">{newLabel}</span>}
    </button>
  )
}
