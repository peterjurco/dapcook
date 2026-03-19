'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { X, ExternalLink, AlertTriangle } from 'lucide-react'
import { IngredientEditor } from './IngredientEditor'
import { StepEditor } from './StepEditor'
import { ImageUpload } from './ImageUpload'
import type { Recipe } from '@/types/database'
import type { RecipeDraft, IngredientFormItem, Step } from '@/types/recipe'

interface RecipeFormProps {
  recipe?: Recipe        // edit mode
  draft?: RecipeDraft    // import-review mode
}

function ingredientToFormItem(ing: { id: string; quantity: number | null; unit: string; name: string; notes: string }): IngredientFormItem {
  return {
    id: ing.id,
    quantity: ing.quantity !== null ? String(ing.quantity) : '',
    unit: ing.unit,
    name: ing.name,
    notes: ing.notes,
  }
}

function parseQuantity(value: string): number | null {
  if (!value.trim()) return null
  const n = parseFloat(value)
  return isNaN(n) ? null : n
}

export function RecipeForm({ recipe, draft }: RecipeFormProps) {
  const router = useRouter()
  const isEdit = !!recipe

  // Initialise from recipe (edit), draft (import), or empty (new)
  const source = recipe ?? draft

  const [title, setTitle] = useState(source?.title ?? '')
  const [description, setDescription] = useState(source?.description ?? '')
  const [sourceUrl, setSourceUrl] = useState(source?.source_url ?? '')
  const [imageUrl, setImageUrl] = useState(source?.image_url ?? '')
  const [prepTime, setPrepTime] = useState(String(source?.prep_time_min ?? ''))
  const [cookTime, setCookTime] = useState(String(source?.cook_time_min ?? ''))
  const [servings, setServings] = useState(String(source?.servings ?? ''))
  const [notes, setNotes] = useState(recipe?.notes ?? '')
  const [tagInput, setTagInput] = useState('')
  const [tags, setTags] = useState<string[]>(source?.tags ?? [])
  const [ingredients, setIngredients] = useState<IngredientFormItem[]>(
    (source?.ingredients as Array<{ id: string; quantity: number | null; unit: string; name: string; notes: string }> | undefined ?? []).map(ingredientToFormItem)
  )
  const [steps, setSteps] = useState<Step[]>(
    (source?.steps as Step[] | undefined) ?? []
  )

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function addTag(raw: string) {
    const tag = raw.trim().toLowerCase()
    if (tag && !tags.includes(tag)) {
      setTags([...tags, tag])
    }
    setTagInput('')
  }

  function handleTagKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault()
      addTag(tagInput)
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim()) {
      setError('Title is required')
      return
    }
    setSaving(true)
    setError(null)

    const payload = {
      title: title.trim(),
      description: description.trim() || undefined,
      source_url: sourceUrl.trim() || undefined,
      image_url: imageUrl.trim() || undefined,
      prep_time_min: parseQuantity(prepTime),
      cook_time_min: parseQuantity(cookTime),
      servings: parseQuantity(servings),
      tags,
      ingredients: ingredients.map((ing) => ({
        id: ing.id,
        quantity: parseQuantity(ing.quantity),
        unit: ing.unit.trim(),
        name: ing.name.trim(),
        notes: ing.notes.trim(),
      })),
      steps: steps.map((s, i) => ({ id: s.id, order: i + 1, text: s.text.trim() })),
      notes: notes.trim() || undefined,
    }

    const url = isEdit ? `/api/recipes/${recipe!.id}` : '/api/recipes'
    const method = isEdit ? 'PUT' : 'POST'

    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })

    if (!res.ok) {
      const body = await res.json().catch(() => ({})) as { error?: string }
      setError(body.error ?? 'Something went wrong')
      setSaving(false)
      return
    }

    const saved = await res.json() as { id: string }
    router.push(`/recipes/${saved.id}`)
    router.refresh()
  }

  const inputClass =
    'w-full px-3 py-2 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-gray-300 bg-white text-gray-900 placeholder:text-gray-400'
  const labelClass = 'block text-sm font-medium text-gray-700 mb-1'

  return (
    <form onSubmit={handleSubmit} className="max-w-3xl mx-auto">
      {/* Partial import warning */}
      {draft?.partial && (
        <div className="mb-6 flex gap-3 p-4 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
          <AlertTriangle size={16} className="flex-shrink-0 mt-0.5" />
          <p>{draft.partial_reason ?? 'Some recipe details could not be extracted — please fill them in manually.'}</p>
        </div>
      )}

      {/* Source link */}
      {sourceUrl && (
        <div className="mb-6">
          <a
            href={sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900 transition-colors"
          >
            <ExternalLink size={13} />
            {new URL(sourceUrl).hostname.replace('www.', '')}
          </a>
        </div>
      )}

      <div className="space-y-8">
        {/* Basic info */}
        <section className="space-y-4">
          <div>
            <label htmlFor="title" className={labelClass}>Title *</label>
            <input
              id="title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Segedínsky guláš"
              required
              className={inputClass}
            />
          </div>

          <div>
            <label htmlFor="description" className={labelClass}>Description</label>
            <textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="A short description of the recipe..."
              rows={2}
              className={inputClass + ' resize-none'}
            />
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <label htmlFor="prep-time" className={labelClass}>Prep time (min)</label>
              <input
                id="prep-time"
                type="number"
                min={0}
                value={prepTime}
                onChange={(e) => setPrepTime(e.target.value)}
                placeholder="15"
                className={inputClass}
              />
            </div>
            <div>
              <label htmlFor="cook-time" className={labelClass}>Cook time (min)</label>
              <input
                id="cook-time"
                type="number"
                min={0}
                value={cookTime}
                onChange={(e) => setCookTime(e.target.value)}
                placeholder="30"
                className={inputClass}
              />
            </div>
            <div>
              <label htmlFor="servings" className={labelClass}>Servings</label>
              <input
                id="servings"
                type="number"
                min={1}
                value={servings}
                onChange={(e) => setServings(e.target.value)}
                placeholder="4"
                className={inputClass}
              />
            </div>
          </div>

          {/* Tags */}
          <div>
            <label htmlFor="tags" className={labelClass}>Tags</label>
            <div className="flex flex-wrap gap-2 mb-2">
              {tags.map((tag) => (
                <span
                  key={tag}
                  className="inline-flex items-center gap-1 px-2.5 py-1 bg-gray-100 text-gray-700 text-sm rounded-full"
                >
                  {tag}
                  <button
                    type="button"
                    onClick={() => setTags(tags.filter((t) => t !== tag))}
                    className="text-gray-400 hover:text-gray-700"
                  >
                    <X size={12} />
                  </button>
                </span>
              ))}
            </div>
            <input
              id="tags"
              type="text"
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyDown={handleTagKeyDown}
              onBlur={() => tagInput.trim() && addTag(tagInput)}
              placeholder="Type a tag and press Enter"
              className={inputClass}
            />
            <p className="text-xs text-gray-400 mt-1">Press Enter or comma to add</p>
          </div>
        </section>

        {/* Ingredients */}
        <section>
          <h2 className="text-base font-semibold text-gray-900 mb-4">Ingredients</h2>
          <IngredientEditor ingredients={ingredients} onChange={setIngredients} />
        </section>

        {/* Steps */}
        <section>
          <h2 className="text-base font-semibold text-gray-900 mb-4">Method</h2>
          <StepEditor steps={steps} onChange={setSteps} />
        </section>

        {/* Optional fields */}
        <section className="space-y-4 pt-2 border-t border-gray-100">
          <h2 className="text-base font-semibold text-gray-900">Optional</h2>

          <div>
            <label htmlFor="notes" className={labelClass}>Notes</label>
            <textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Personal notes, variations, tips..."
              rows={3}
              className={inputClass + ' resize-none'}
            />
          </div>

          <div>
            <label className={labelClass}>Image</label>
            {draft ? (
              <input
                type="url"
                value={imageUrl}
                onChange={(e) => setImageUrl(e.target.value)}
                placeholder="https://..."
                className={inputClass}
              />
            ) : (
              <ImageUpload value={imageUrl} onChange={setImageUrl} />
            )}
          </div>

          <div>
            <label htmlFor="source-url" className={labelClass}>Source URL</label>
            <input
              id="source-url"
              type="url"
              value={sourceUrl}
              onChange={(e) => setSourceUrl(e.target.value)}
              placeholder="https://..."
              className={inputClass}
            />
          </div>
        </section>

        {/* Actions */}
        {error && (
          <p className="text-sm text-red-600">{error}</p>
        )}

        <div className="flex items-center gap-3 pb-8">
          <button
            type="submit"
            disabled={saving}
            className="px-5 py-2.5 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {saving ? 'Saving...' : isEdit ? 'Save changes' : 'Save recipe'}
          </button>
          <button
            type="button"
            onClick={() => router.back()}
            className="px-5 py-2.5 text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </form>
  )
}
