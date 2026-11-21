'use client'

import { useState, useTransition } from 'react'
import { cn } from '@/lib/utils/cn'
import type { EvalRun, Verdict } from '@/lib/evals/types'
import { deleteRunAction, setNotesAction, setVerdictAction } from '../actions'
import { JsonView } from './JsonView'
import { VERDICTS } from './VerdictBadge'

const VERDICT_ON: Record<Verdict, string> = {
  correct: 'border-emerald-700 bg-emerald-700 text-white',
  incorrect: 'border-red-700 bg-red-700 text-white',
  'bad-input': 'border-amber-600 bg-amber-600 text-white',
}

type Tab = 'pretty' | 'raw' | 'request'

function requestText(request: unknown): string {
  const messages = (request as { messages?: { role: string; content: unknown }[] })?.messages ?? []
  return messages
    .map((m) => `── ${m.role} ──\n${typeof m.content === 'string' ? m.content : JSON.stringify(m.content, null, 2)}`)
    .join('\n\n')
}

export function RunCard({
  prompt, caseId, run, number, duplicateOf,
}: {
  prompt: string
  caseId: string
  run: EvalRun
  number: number
  /** Number of an earlier run whose output is identical. */
  duplicateOf?: number
}) {
  const [tab, setTab] = useState<Tab>(run.output !== null ? 'pretty' : 'raw')
  const [notes, setNotes] = useState(run.notes)
  const [savedNotes, setSavedNotes] = useState(run.notes)
  const [pending, startTransition] = useTransition()

  const setVerdict = (verdict: Verdict) =>
    startTransition(() => setVerdictAction(prompt, caseId, run.id, run.verdict === verdict ? null : verdict))

  const saveNotes = () => {
    if (notes === savedNotes) return
    startTransition(async () => {
      await setNotesAction(prompt, caseId, run.id, notes)
      setSavedNotes(notes)
    })
  }

  const model = (run.request as { model?: string })?.model

  return (
    <article
      id={`run-${run.id}`}
      className={cn(
        'scroll-mt-4 rounded-lg border bg-white target:ring-2 target:ring-emerald-500',
        run.verdict === 'correct' && 'border-emerald-300',
        run.verdict === 'incorrect' && 'border-red-300',
        run.verdict === 'bad-input' && 'border-amber-300',
        run.verdict === null && 'border-gray-200'
      )}
    >
      <header className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-gray-100 px-4 py-2 text-xs text-gray-500">
        <span className="text-sm font-semibold text-gray-900">Run {number}</span>
        <span>{new Date(run.createdAt).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'medium' })}</span>
        {model && <span className="font-mono">{model}</span>}
        {run.usage && <span>{run.usage.input_tokens} in / {run.usage.output_tokens} out</span>}
        <span>{(run.durationMs / 1000).toFixed(1)}s</span>
        {run.stopReason && run.stopReason !== 'end_turn' && (
          <span className="rounded bg-amber-100 px-1.5 text-amber-800">stop: {run.stopReason}</span>
        )}
        {duplicateOf && <span className="rounded bg-sky-50 px-1.5 text-sky-700">same output as run {duplicateOf}</span>}
        <button
          type="button"
          onClick={() => {
            if (confirm(`Delete run ${number}?`)) startTransition(() => deleteRunAction(prompt, caseId, run.id))
          }}
          className="ml-auto text-gray-400 hover:text-red-700"
        >
          Delete
        </button>
      </header>

      <div className="px-4 pt-3">
        <div role="tablist" className="mb-3 flex gap-1 text-xs">
          {(['pretty', 'raw', 'request'] as const).map((t) => (
            <button
              key={t}
              type="button"
              role="tab"
              aria-selected={tab === t}
              onClick={() => setTab(t)}
              className={cn(
                'rounded px-2 py-1',
                tab === t ? 'bg-gray-900 text-white' : 'text-gray-600 hover:bg-gray-100'
              )}
            >
              {t === 'pretty' ? 'Output' : t === 'raw' ? 'Raw reply' : 'Prompt sent'}
            </button>
          ))}
        </div>

        {run.error && <p className="mb-3 rounded bg-red-50 p-2 text-sm text-red-800">API error: {run.error}</p>}
        {run.parseError && tab === 'pretty' && (
          <p className="mb-3 rounded bg-amber-50 p-2 text-sm text-amber-800">{run.parseError} — see the raw reply.</p>
        )}

        <div className="max-h-[32rem] overflow-auto pb-3 text-sm">
          {tab === 'pretty' && run.output !== null && <JsonView value={run.output} />}
          {tab === 'raw' && (
            <pre className="whitespace-pre-wrap break-words font-mono text-xs text-gray-800">{run.rawText || '(empty)'}</pre>
          )}
          {tab === 'request' && (
            <pre className="whitespace-pre-wrap break-words font-mono text-xs text-gray-800">{requestText(run.request)}</pre>
          )}
        </div>
      </div>

      <footer className="flex flex-col gap-2 border-t border-gray-100 px-4 py-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-gray-500">Verdict</span>
          {VERDICTS.map(({ value, label, hint }) => (
            <button
              key={value}
              type="button"
              title={hint}
              aria-pressed={run.verdict === value}
              disabled={pending}
              onClick={() => setVerdict(value)}
              className={cn(
                'rounded-md border px-3 py-1 text-sm',
                run.verdict === value ? VERDICT_ON[value] : 'border-gray-300 text-gray-700 hover:border-gray-500'
              )}
            >
              {label}
            </button>
          ))}
          <span className="ml-auto text-xs text-gray-400">
            {pending ? 'Saving…' : notes !== savedNotes ? 'Unsaved notes' : ''}
          </span>
        </div>
        <textarea
          aria-label={`Notes for run ${number}`}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          onBlur={saveNotes}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) saveNotes()
          }}
          rows={2}
          placeholder="Notes: what's wrong or worth remembering (saves when you click away, or ⌘/Ctrl+Enter)"
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-emerald-600 focus:outline-none focus:ring-1 focus:ring-emerald-600"
        />
      </footer>
    </article>
  )
}
