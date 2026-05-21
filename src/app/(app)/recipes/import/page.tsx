'use client'

import { useState } from 'react'
import { Import, Loader2, AlertCircle } from 'lucide-react'
import { RecipeForm } from '@/components/recipe/RecipeForm'
import type { RecipeDraft } from '@/types/recipe'

export default function ImportRecipePage() {
  const [url, setUrl] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [draft, setDraft] = useState<RecipeDraft | null>(null)

  async function handleImport(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    try {
      const res = await fetch('/api/recipes/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      })

      const data = await res.json() as RecipeDraft & { error?: string }

      if (!res.ok) {
        setError(data.error ?? 'Could not import this URL')
        return
      }

      setDraft(data)
    } catch {
      setError('Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  if (draft) {
    return (
      <div className="p-6 lg:p-8">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900">Review imported recipe</h1>
          <p className="text-sm text-gray-500 mt-1">Check the details and make any edits before saving</p>
        </div>
        <RecipeForm draft={draft} />
      </div>
    )
  }

  return (
    <div className="p-6 lg:p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Import recipe</h1>
        <p className="text-sm text-gray-500 mt-1">Paste a link from any recipe website</p>
      </div>

      <div className="max-w-xl">
        <form onSubmit={handleImport} className="flex gap-3">
          <input
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://www.bbcgoodfood.com/recipes/..."
            required
            className="flex-1 px-4 py-2.5 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-gray-300"
          />
          <button
            type="submit"
            disabled={loading}
            className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-medium text-white bg-gray-900 rounded-lg hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? (
              <>
                <Loader2 size={15} className="animate-spin" />
                Importing...
              </>
            ) : (
              <>
                <Import size={15} />
                Import
              </>
            )}
          </button>
        </form>

        {error && (
          <div className="mt-4 flex gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
            <AlertCircle size={16} className="flex-shrink-0 mt-0.5" />
            {error}
          </div>
        )}

        <div className="mt-8 space-y-2">
          <p className="text-xs font-medium text-gray-400 uppercase tracking-wide">Works well with</p>
          <ul className="text-sm text-gray-500 space-y-1">
            <li>bbcgoodfood.com</li>
            <li>bbc.co.uk/food</li>
            <li>kuchynalidla.sk</li>
            <li>gymbeam.sk</li>
            <li>themediterraneandish.com</li>
            <li>and most recipe sites with structured data</li>
          </ul>
        </div>
      </div>
    </div>
  )
}
