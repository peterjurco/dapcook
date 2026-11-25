'use client'

import { useActionState } from 'react'
import { runSuiteAction, type RunSuiteState } from '../actions'

const MODELS = ['claude-haiku-5-5', 'claude-sonnet-5-5', 'claude-opus-5-5']

export function SuiteForm({
  prompt, sampleCount, defaultModel, judgeModel,
}: {
  prompt: string
  sampleCount: number
  defaultModel: string
  judgeModel: string
}) {
  const [state, formAction, pending] = useActionState<RunSuiteState, FormData>(runSuiteAction.bind(null, prompt), {})
  return (
    <form
      action={formAction}
      onSubmit={(e) => {
        if (!confirm(`Run the eval on ${sampleCount} samples? This makes paid API calls (extraction + judge).`)) e.preventDefault()
      }}
      className="rounded-lg border border-gray-200 bg-white p-4"
    >
      <div className="flex flex-wrap items-end gap-3">
        <label className="min-w-0 flex-1">
          <span className="mb-1 block text-sm font-medium">Model under test</span>
          <input
            name="model"
            list="suite-models"
            defaultValue={defaultModel}
            required
            className="w-full rounded-md border border-gray-300 px-3 py-2 font-mono text-sm focus:border-emerald-600 focus:outline-none focus:ring-1 focus:ring-emerald-600"
          />
          <datalist id="suite-models">
            {[defaultModel, ...MODELS.filter((m) => m !== defaultModel)].map((m) => <option key={m} value={m} />)}
          </datalist>
        </label>
        <label>
          <span className="mb-1 block text-sm font-medium">Runs per sample</span>
          <select name="runsPerSample" defaultValue="1" className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm">
            {[1, 2, 3, 5].map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </label>
        <button
          type="submit"
          disabled={pending || sampleCount === 0}
          className="rounded-md bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-800 disabled:opacity-60"
        >
          {pending ? 'Running…' : 'Run eval'}
        </button>
      </div>
      <p className="mt-2 text-xs text-gray-500">
        {sampleCount} {sampleCount === 1 ? 'sample' : 'samples'}: inputs with an expected output, bad inputs left out.
        Runs the production extraction request with this model, then judges step division with{' '}
        <span className="font-mono">{judgeModel}</span> where instruction completeness passed. Default:{' '}
        <span className="font-mono">{defaultModel}</span> (production).
      </p>
      {pending && <p className="mt-2 text-sm text-gray-600">Running… this can take a few minutes; keep the tab open.</p>}
      {state.error && <p role="alert" className="mt-2 text-sm text-red-700">{state.error}</p>}
    </form>
  )
}
