import Link from 'next/link'
import { notFound } from 'next/navigation'
import { cn } from '@/lib/utils/cn'
import { getPromptInfo } from '@/lib/evals/prompts'
import { listCases } from '@/lib/evals/store'
import { countRuns, filterCases, parseRunFilter, RUN_FILTERS, type RunFilter } from '@/lib/evals/filter'
import { NewCaseForm } from '../_components/NewCaseForm'
import { VerdictBadge } from '../_components/VerdictBadge'

export const dynamic = 'force-dynamic'

const FILTER_LABELS: Record<RunFilter, string> = {
  all: 'All',
  incorrect: 'Model wrong',
  'bad-input': 'Bad input',
  correct: 'Correct',
  unrated: 'Unrated',
  notes: 'With notes',
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })
}

export default async function PromptPage({
  params,
  searchParams,
}: {
  params: Promise<{ prompt: string }>
  searchParams: Promise<{ filter?: string | string[] }>
}) {
  const { prompt } = await params
  const info = getPromptInfo(prompt)
  if (!info) notFound()

  const header = (
    <header className="mb-5">
      <h1 className="text-2xl font-semibold">{info.title}</h1>
      <p className="mt-1 max-w-2xl text-sm text-gray-600">{info.description}</p>
      <p className="mt-1 font-mono text-xs text-gray-400">{info.file}</p>
    </header>
  )

  if (!info.ready) {
    return (
      <div>
        {header}
        <div className="rounded-lg border border-dashed border-gray-300 bg-white p-8 text-center text-sm text-gray-500">
          This prompt isn&apos;t wired into the eval tool yet. Add a runner for it in{' '}
          <code className="font-mono">src/lib/evals/runners.ts</code>.
        </div>
      </div>
    )
  }

  const filter = parseRunFilter((await searchParams).filter)
  const cases = await listCases(info.id)
  const counts = countRuns(cases)
  const rows = filterCases(cases, filter)

  return (
    <div>
      {header}
      <NewCaseForm prompt={info.id} />

      <div className="mb-3 mt-6 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-sm text-gray-600">
          <span className="font-semibold text-gray-900">{cases.length}</span> inputs ·{' '}
          <span className="font-semibold text-gray-900">{counts.all}</span> runs
        </h2>
        <nav aria-label="Filter runs" className="flex flex-wrap gap-1">
          {RUN_FILTERS.map((f) => (
            <Link
              key={f}
              href={f === 'all' ? `/dev/evals/${info.id}` : `/dev/evals/${info.id}?filter=${f}`}
              aria-current={f === filter ? 'page' : undefined}
              className={cn(
                'rounded-full border px-3 py-1 text-xs',
                f === filter
                  ? 'border-gray-900 bg-gray-900 text-white'
                  : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-100'
              )}
            >
              {FILTER_LABELS[f]} <span className="opacity-60">{counts[f]}</span>
            </Link>
          ))}
        </nav>
      </div>

      {rows.length === 0 ? (
        <p className="rounded-lg border border-dashed border-gray-300 bg-white p-8 text-center text-sm text-gray-500">
          {cases.length === 0 ? 'No inputs yet. Add a URL above.' : `No ${FILTER_LABELS[filter].toLowerCase()} runs.`}
        </p>
      ) : (
        <ul className="space-y-3">
          {rows.map(({ evalCase, runs }) => {
            const caseHref = `/dev/evals/${info.id}/${evalCase.id}`
            const incorrect = evalCase.runs.filter((r) => r.verdict === 'incorrect').length
            const correct = evalCase.runs.filter((r) => r.verdict === 'correct').length
            const badInput = evalCase.runs.filter((r) => r.verdict === 'bad-input').length
            return (
              <li key={evalCase.id} className="rounded-lg border border-gray-200 bg-white">
                <Link href={caseHref} className="block rounded-t-lg p-3 hover:bg-gray-50">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                    <span className="font-medium">{evalCase.label}</span>
                    <span className="text-xs text-gray-500">
                      {evalCase.runs.length} {evalCase.runs.length === 1 ? 'run' : 'runs'}
                      {correct > 0 && <span className="ml-2 text-emerald-700">✓ {correct}</span>}
                      {incorrect > 0 && <span className="ml-2 text-red-700">✗ {incorrect}</span>}
                      {badInput > 0 && <span className="ml-2 text-amber-700">⚠ {badInput}</span>}
                    </span>
                  </div>
                  {typeof evalCase.source.url === 'string' && (
                    <div className="truncate text-xs text-gray-500">{evalCase.source.url}</div>
                  )}
                </Link>
                {runs.length > 0 && (
                  <ul className="divide-y divide-gray-100 border-t border-gray-100">
                    {runs.map(({ run, number }) => (
                      <li key={run.id}>
                        <Link href={`${caseHref}#run-${run.id}`} className="flex gap-3 px-3 py-2 text-sm hover:bg-gray-50">
                          <span className="w-12 shrink-0 text-xs leading-5 text-gray-500">Run {number}</span>
                          <VerdictBadge verdict={run.verdict} className="h-fit w-28 shrink-0 justify-center" />
                          <span className="min-w-0 flex-1">
                            {run.error && <span className="text-red-700">API error: {run.error}</span>}
                            {run.notes ? (
                              <span className="whitespace-pre-wrap text-gray-800">{run.notes}</span>
                            ) : (
                              !run.error && <span className="text-gray-400">No notes</span>
                            )}
                          </span>
                          <span className="hidden shrink-0 text-xs leading-5 text-gray-400 sm:block">
                            {formatDate(run.createdAt)}
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
