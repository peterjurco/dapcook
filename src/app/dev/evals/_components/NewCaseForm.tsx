'use client'

import { useActionState } from 'react'
import { createCaseAction, type CreateCaseState } from '../actions'

export function NewCaseForm({ prompt }: { prompt: string }) {
  const [state, formAction, pending] = useActionState<CreateCaseState, FormData>(
    createCaseAction.bind(null, prompt),
    {}
  )
  return (
    <form action={formAction} className="rounded-lg border border-gray-200 bg-white p-4">
      <label htmlFor="eval-url" className="mb-1.5 block text-sm font-medium">New input: recipe page URL</label>
      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          id="eval-url"
          name="url"
          type="url"
          required
          placeholder="https://…"
          className="min-w-0 flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-emerald-600 focus:outline-none focus:ring-1 focus:ring-emerald-600"
        />
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-800 disabled:opacity-60"
        >
          {pending ? 'Fetching page…' : 'Fetch input'}
        </button>
      </div>
      <p className="mt-1.5 text-xs text-gray-500">
        Fetches the page and runs Readability exactly like the importer, then saves the article text the model
        receives. No model call yet. A URL you already added opens its existing input.
      </p>
      {state.error && <p role="alert" className="mt-2 text-sm text-red-700">{state.error}</p>}
    </form>
  )
}
