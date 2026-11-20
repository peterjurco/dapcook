'use client'

import { useState, useTransition } from 'react'
import { deleteCaseAction, runCaseAction } from '../actions'

export function RunControls({ prompt, caseId, hasRuns }: { prompt: string; caseId: string; hasRuns: boolean }) {
  const [times, setTimes] = useState(1)
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const run = () => {
    setError(null)
    startTransition(async () => {
      try {
        await runCaseAction(prompt, caseId, times)
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err))
      }
    })
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={run}
        disabled={pending}
        className="rounded-md bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-800 disabled:opacity-60"
      >
        {pending ? `Running ${times}×…` : hasRuns ? 'Run again' : 'Run prompt'}
      </button>
      <label className="flex items-center gap-1 text-sm text-gray-600">
        ×
        <select
          aria-label="Number of runs"
          value={times}
          onChange={(e) => setTimes(Number(e.target.value))}
          disabled={pending}
          className="rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm"
        >
          {[1, 2, 3, 5].map((n) => <option key={n} value={n}>{n}</option>)}
        </select>
      </label>
      <span className="text-xs text-gray-500">Calls the Anthropic API (paid).</span>
      {error && <p role="alert" className="w-full text-sm text-red-700">{error}</p>}
    </div>
  )
}

export function DeleteCaseButton({ prompt, caseId, runCount }: { prompt: string; caseId: string; runCount: number }) {
  const [pending, startTransition] = useTransition()
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => {
        if (confirm(`Delete this input and its ${runCount} runs?`)) {
          startTransition(() => deleteCaseAction(prompt, caseId))
        }
      }}
      className="text-xs text-gray-400 hover:text-red-700"
    >
      Delete input
    </button>
  )
}
