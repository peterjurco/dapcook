'use client'

import { useState, useTransition } from 'react'
import type { ExpectedRecipe } from '@/lib/evals/types'
import { setExpectedAction } from '../actions'

export interface ExpectedSource {
  label: string
  value: ExpectedRecipe
}

const toText = (e: ExpectedRecipe | null | undefined) => ({
  ingredients: (e?.rawIngredients ?? []).join('\n'),
  // Steps can wrap or hold line breaks, so a blank line separates them.
  steps: (e?.rawSteps ?? []).join('\n\n'),
})

const fromText = (ingredients: string, steps: string): ExpectedRecipe => ({
  rawIngredients: ingredients.split('\n').map((l) => l.trim()).filter(Boolean),
  rawSteps: steps.split(/\n\s*\n/).map((s) => s.replace(/\s*\n\s*/g, ' ').trim()).filter(Boolean),
})

const area =
  'w-full rounded-md border border-gray-300 px-3 py-2 font-mono text-xs leading-relaxed focus:border-emerald-600 focus:outline-none focus:ring-1 focus:ring-emerald-600'

/**
 * The hand-written correct output of an input. Inputs that have one are the
 * samples of the eval suite; it can start from the page's JSON-LD or from a run
 * marked correct.
 */
export function ExpectedEditor({
  prompt, caseId, expected, sources,
}: {
  prompt: string
  caseId: string
  expected: ExpectedRecipe | null | undefined
  sources: ExpectedSource[]
}) {
  const saved = toText(expected)
  const [ingredients, setIngredients] = useState(saved.ingredients)
  const [steps, setSteps] = useState(saved.steps)
  const [pending, startTransition] = useTransition()
  const dirty = ingredients !== saved.ingredients || steps !== saved.steps
  const parsed = fromText(ingredients, steps)

  const save = (value: ExpectedRecipe | null) => startTransition(() => setExpectedAction(prompt, caseId, value))

  return (
    <section className="rounded-lg border border-gray-200 bg-white">
      <header className="flex flex-wrap items-baseline justify-between gap-2 border-b border-gray-100 px-4 py-2">
        <h2 className="text-sm font-semibold">Expected output</h2>
        <span className="text-xs text-gray-500">
          {expected ? '✓ In the eval suite' : 'Not set: this input isn’t in the eval suite'}
          {dirty && ' · unsaved changes'}
        </span>
      </header>
      <div className="space-y-3 p-4">
        {sources.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="text-gray-500">Start from:</span>
            {sources.map((source) => (
              <button
                key={source.label}
                type="button"
                onClick={() => {
                  const text = toText(source.value)
                  setIngredients(text.ingredients)
                  setSteps(text.steps)
                }}
                className="rounded-md border border-gray-300 px-2 py-1 hover:bg-gray-100"
              >
                {source.label}
              </button>
            ))}
          </div>
        )}
        <label className="block">
          <span className="mb-1 block text-xs text-gray-600">
            Ingredients, one per line <span className="text-gray-500">({parsed.rawIngredients.length})</span>
          </span>
          <textarea value={ingredients} onChange={(e) => setIngredients(e.target.value)} rows={8} className={area} />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs text-gray-600">
            Steps, separated by a blank line <span className="text-gray-500">({parsed.rawSteps.length})</span>
          </span>
          <textarea value={steps} onChange={(e) => setSteps(e.target.value)} rows={10} className={area} />
        </label>
        <p className="text-xs text-gray-500">
          Scored ignoring order, case, whitespace and punctuation. How the steps are split here doesn’t matter for
          completeness; the judge checks the division of the model’s steps.
        </p>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={pending || !dirty}
            onClick={() => save(parsed)}
            className="rounded-md bg-emerald-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-800 disabled:opacity-50"
          >
            {pending ? 'Saving…' : 'Save expected output'}
          </button>
          {expected && (
            <button
              type="button"
              disabled={pending}
              onClick={() => {
                if (confirm('Remove the expected output? The input leaves the eval suite.')) {
                  setIngredients('')
                  setSteps('')
                  save(null)
                }
              }}
              className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-100"
            >
              Remove
            </button>
          )}
        </div>
      </div>
    </section>
  )
}
