'use client'

import { useState } from 'react'
import { Import, Loader2, AlertCircle, RefreshCw, CheckCircle2 } from 'lucide-react'
import { RecipeForm } from '@/components/recipe/RecipeForm'
import type { RecipeDraft } from '@/types/recipe'
import type { TranslationError } from '@/lib/ai/translation-error'
import type { ImportEvent } from '@/app/api/recipes/import/route'

type PageState = 'idle' | 'importing' | 'translation_error' | 'review'

interface Step {
  key: string
  message: string
}

const TRANSLATION_ERROR_TITLES: Record<TranslationError['type'], string> = {
  rate_limit: 'Translation rate limit reached',
  billing: 'Translation unavailable',
  timeout: 'Translation timed out',
  unknown: 'Translation failed',
}

export default function ImportRecipePage() {
  const [url, setUrl] = useState('')
  const [pageState, setPageState] = useState<PageState>('idle')
  const [steps, setSteps] = useState<Step[]>([])
  const [error, setError] = useState<string | null>(null)
  const [draft, setDraft] = useState<RecipeDraft | null>(null)
  const [translationError, setTranslationError] = useState<TranslationError | null>(null)
  const [retrying, setRetrying] = useState(false)

  async function handleImport(e: React.FormEvent) {
    e.preventDefault()
    setPageState('importing')
    setSteps([])
    setError(null)

    try {
      const res = await fetch('/api/recipes/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      })

      if (!res.ok) {
        const data = await res.json() as { error?: string }
        setError(data.error ?? 'Could not import this URL')
        setPageState('idle')
        return
      }

      const reader = res.body!.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const parts = buffer.split('\n\n')
        buffer = parts.pop() ?? ''

        for (const part of parts) {
          if (!part.startsWith('data: ')) continue
          const event = JSON.parse(part.slice(6)) as ImportEvent

          if (event.type === 'step') {
            setSteps(prev => [...prev, { key: event.key, message: event.message }])
          } else if (event.type === 'error') {
            setError(event.error)
            setPageState('idle')
            return
          } else if (event.type === 'done') {
            if (event.translationError) {
              setDraft(event.draft)
              setTranslationError(event.translationError as TranslationError)
              setPageState('translation_error')
            } else {
              setDraft(event.draft)
              setPageState('review')
            }
            return
          }
        }
      }
    } catch {
      setError('Something went wrong. Please try again.')
      setPageState('idle')
    }
  }

  async function handleRetryTranslation() {
    if (!draft) return
    setRetrying(true)
    try {
      const res = await fetch('/api/recipes/translate-draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: {
            title: draft.title,
            description: draft.description ?? null,
            ingredients: draft.ingredients,
            steps: draft.steps,
            notes: null,
          },
        }),
      })
      const data = await res.json() as { content?: RecipeDraft; translationError?: TranslationError }

      if (data.translationError) {
        setTranslationError(data.translationError)
        return
      }
      if (data.content) {
        setDraft({ ...draft, ...data.content })
        setTranslationError(null)
        setPageState('review')
      }
    } catch {
      setTranslationError({ type: 'unknown', message: 'Something went wrong. Please try again.' })
    } finally {
      setRetrying(false)
    }
  }

  function handleKeepUntranslated() {
    setPageState('review')
    setTranslationError(null)
  }

  function handleCancel() {
    setPageState('idle')
    setDraft(null)
    setTranslationError(null)
    setSteps([])
  }

  if (pageState === 'review' && draft) {
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

  if (pageState === 'translation_error' && translationError) {
    return (
      <div className="p-6 lg:p-8">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900">Import recipe</h1>
        </div>
        <div className="max-w-xl space-y-4">
          <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl space-y-3">
            <div className="flex gap-2">
              <AlertCircle size={16} className="flex-shrink-0 mt-0.5 text-amber-600" />
              <div>
                <p className="text-sm font-medium text-amber-900">{TRANSLATION_ERROR_TITLES[translationError.type]}</p>
                <p className="text-xs text-amber-700 mt-0.5">{translationError.message}</p>
              </div>
            </div>
            <p className="text-xs text-amber-700">
              The recipe was imported successfully but could not be translated. You can retry the translation, keep the recipe in its original language, or cancel.
            </p>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => void handleRetryTranslation()}
              disabled={retrying}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-gray-900 rounded-lg hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {retrying ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
              Retry translation
            </button>
            <button
              type="button"
              onClick={handleKeepUntranslated}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
            >
              Keep as-is
            </button>
            <button
              type="button"
              onClick={handleCancel}
              className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    )
  }

  if (pageState === 'importing') {
    return (
      <div className="p-6 lg:p-8">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900">Import recipe</h1>
        </div>
        <div className="max-w-xl space-y-3">
          {steps.length === 0 ? (
            <div className="flex items-center gap-3">
              <Loader2 size={15} className="animate-spin text-gray-500 flex-shrink-0" />
              <span className="text-sm text-gray-500">Starting...</span>
            </div>
          ) : (
            steps.map((step, i) => {
              const isActive = i === steps.length - 1
              return (
                <div key={step.key} className="flex items-center gap-3">
                  {isActive
                    ? <Loader2 size={15} className="animate-spin text-gray-700 flex-shrink-0" />
                    : <CheckCircle2 size={15} className="text-gray-400 flex-shrink-0" />
                  }
                  <span className={`text-sm ${isActive ? 'text-gray-900 font-medium' : 'text-gray-400'}`}>
                    {step.message}
                  </span>
                </div>
              )
            })
          )}
        </div>
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
        <form onSubmit={(e) => void handleImport(e)} className="flex gap-3">
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
            className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-medium text-white bg-gray-900 rounded-lg hover:bg-gray-700 transition-colors"
          >
            <Import size={15} />
            Import
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
