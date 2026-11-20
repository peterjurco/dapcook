import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getPromptInfo } from '@/lib/evals/prompts'
import { getCase } from '@/lib/evals/store'
import { findDuplicateOutputs, numberRuns } from '@/lib/evals/filter'
import { humanizeKey } from '../../_components/JsonView'
import { RunCard } from '../../_components/RunCard'
import { DeleteCaseButton, RunControls } from '../../_components/CaseActions'

export const dynamic = 'force-dynamic'

function MetaValue({ value }: { value: unknown }) {
  if (typeof value === 'boolean') return <>{value ? 'yes' : 'no'}</>
  if (value === null || value === undefined || value === '') return <span className="text-gray-400">—</span>
  if (typeof value === 'string' && /^\d{4}-\d\d-\d\dT/.test(value)) {
    return <>{new Date(value).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })}</>
  }
  return <>{typeof value === 'object' ? JSON.stringify(value) : String(value)}</>
}

export default async function CasePage({ params }: { params: Promise<{ prompt: string; caseId: string }> }) {
  const { prompt, caseId } = await params
  const info = getPromptInfo(prompt)
  if (!info?.ready) notFound()
  const evalCase = await getCase(info.id, caseId).catch(() => null)
  if (!evalCase) notFound()

  const duplicates = findDuplicateOutputs(evalCase)
  const runs = numberRuns(evalCase).reverse()
  const url = typeof evalCase.source.url === 'string' ? evalCase.source.url : null

  return (
    <div>
      <Link href={`/dev/evals/${info.id}`} className="text-sm text-gray-500 hover:text-gray-900">
        ← {info.title}
      </Link>

      <header className="mb-4 mt-2 flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold">{evalCase.label}</h1>
          {url && (
            <a href={url} target="_blank" rel="noreferrer" className="break-all text-sm text-emerald-700 hover:underline">
              {url}
            </a>
          )}
        </div>
        <DeleteCaseButton prompt={info.id} caseId={evalCase.id} runCount={evalCase.runs.length} />
      </header>

      <section className="mb-6 rounded-lg border border-gray-200 bg-white">
        <h2 className="border-b border-gray-100 px-4 py-2 text-sm font-semibold">Input</h2>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-1 px-4 py-3 text-sm sm:grid-cols-4">
          {Object.entries(evalCase.meta).map(([key, value]) => (
            <div key={key} className="min-w-0">
              <dt className="text-xs text-gray-500">{humanizeKey(key)}</dt>
              <dd className="truncate"><MetaValue value={value} /></dd>
            </div>
          ))}
        </dl>
        {Object.entries(evalCase.input).map(([key, value]) => (
          <details key={key} className="border-t border-gray-100 px-4 py-2">
            <summary className="cursor-pointer text-sm text-gray-700">
              {humanizeKey(key)}
              {typeof value === 'string' && <span className="ml-2 text-xs text-gray-400">{value.length} chars</span>}
            </summary>
            <pre className="mt-2 max-h-96 overflow-auto whitespace-pre-wrap break-words rounded bg-gray-50 p-3 font-mono text-xs">
              {typeof value === 'string' ? value : JSON.stringify(value, null, 2)}
            </pre>
          </details>
        ))}
      </section>

      <div className="mb-4">
        <RunControls prompt={info.id} caseId={evalCase.id} hasRuns={evalCase.runs.length > 0} />
      </div>

      {runs.length === 0 ? (
        <p className="rounded-lg border border-dashed border-gray-300 bg-white p-8 text-center text-sm text-gray-500">
          No runs yet.
        </p>
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          {runs.map(({ run, number }) => (
            <RunCard
              key={run.id}
              prompt={info.id}
              caseId={evalCase.id}
              run={run}
              number={number}
              duplicateOf={duplicates.get(run.id)}
            />
          ))}
        </div>
      )}
    </div>
  )
}
