'use client'

import { useState, useRef, useEffect } from 'react'
import { useTranslations } from 'next-intl'
import { X } from 'lucide-react'
import type { TagData } from '@/app/api/tags/route'

interface TagInputProps {
  tags: string[]
  onChange: (tags: string[]) => void
  allTags: TagData[]
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

export function TagInput({ tags, onChange, allTags }: TagInputProps) {
  const t = useTranslations('recipes')
  const [input, setInput] = useState('')
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

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

  // Most used: top 8 unused tags shown when input is empty
  const mostUsed = !input
    ? allTags.filter((tag) => tag.count > 0 && !tags.includes(tag.name)).slice(0, 8)
    : []

  const showDropdown = open && suggestions.length > 0

  return (
    <div ref={containerRef} className="space-y-2">
      {/* Selected tags */}
      {tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {tags.map((tag) => {
            const color = colorFor(tag, allTags)
            return (
              <span key={tag} className={`inline-flex items-center gap-1 ${tagClass(color)}`} style={tagStyle(color)}>
                {tag}
                <button type="button" onClick={() => removeTag(tag)} className="opacity-60 hover:opacity-100">
                  <X size={11} />
                </button>
              </span>
            )
          })}
        </div>
      )}

      {/* Input + autocomplete */}
      <div className="relative">
        <input
          type="text"
          value={input}
          onChange={(e) => { setInput(e.target.value); setOpen(true) }}
          onFocus={() => setOpen(true)}
          onKeyDown={handleKeyDown}
          onBlur={() => { if (input.trim()) addTag(input) }}
          placeholder={t('tagInput.placeholder')}
          className="w-full px-3 py-2 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-gray-300 bg-white text-gray-900 placeholder:text-gray-400"
        />
        <p className="text-xs text-gray-400 mt-1">{t('tagInput.helper')}</p>

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

      {/* Most used suggestions */}
      {mostUsed.length > 0 && (
        <div>
          <p className="text-xs text-gray-400 mb-1.5">{t('tagInput.mostUsed')}</p>
          <div className="flex flex-wrap gap-1.5">
            {mostUsed.map((tag) => (
              <button
                key={tag.name}
                type="button"
                onClick={() => addTag(tag.name)}
                className={`${tagClass(tag.color)} hover:opacity-75 transition-opacity cursor-pointer`}
                style={tagStyle(tag.color)}
              >
                {tag.name}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
