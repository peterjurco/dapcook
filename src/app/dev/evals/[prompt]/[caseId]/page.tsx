import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getPromptInfo } from '@/lib/evals/prompts'
import { getCase } from '@/lib/evals/store'
import { findDuplicateOutputs, numberRuns } from '@/lib/evals/filter'
import { humanizeKey } from '../../_components/JsonView'
import { RunCard } from '../../_components/RunCard'
import { DeleteCaseButton, RunControls } from '../../_components/CaseActions'
import { InputCheck } from '../../_components/InputCheck'

export const dynamic = 'force-dynamic'

function MetaValue({ value }: { value: unknown }) {
  if (typeof value === 'boolean') return <>{value ? 'yes' : 'no'}</>
  if (value === null || value === undefined || value === '') return <span className="text-gray-400">—</span>
  if (typeof value === 'string' && /^\d{4}-\d\d-\d\dT/.test(value)) {
    return <>{new Date(value).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })}</>
  }
  return <>{typeof value === 'object' ? JSON.stringify(value) : String(value)}</>
}

// The text the model is judged against gets the room; short fields (the URL) stay folded.
const PRIMARY_INPUT_MIN_CHARS = 200

export default async function CasePage({ params }: { params: Promise<{ prompt: string; caseId: string }> }) {
  const { prompt, caseId } = await params
  const info = getPromptInfo(prompt)
  if (!info?.ready) notFound()
  const evalCase = await getCase(info.id, caseId).catch(() => null)
  if (!evalCase) notFound()

  const duplicates = findDuplicateOutputs(evalCase)
  const runs = numberRuns(evalCase).reverse()
  const url = typeof evalCase.source.url === 'string' ? evalCase.source.url : null
  const inputs = Object.entries(evalCase.input)
  const primary = inputs.filter(([, v]) => typeof v === 'string' && v.length >= PRIMARY_INPUT_MIN_CHARS)
  const secondary = inputs.filter((entry) => !primary.includes(entry))

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

      <div className="grid items-start gap-4 lg:grid-cols-2">
        {/* Left: what the model saw. Sticky so it stays next to whichever run is being judged. */}
        <section className="rounded-lg border border-gray-200 bg-white lg:sticky lg:top-4 lg:flex lg:max-h-[calc(100vh-2rem)] lg:flex-col">
          <h2 className="border-b border-gray-100 px-4 py-2 text-sm font-semibold">Input: what the model sees</h2>
          <div className="space-y-3 p-4 lg:min-h-0 lg:flex-1 lg:overflow-auto">
            {info.id === 'extract-recipe' && <InputCheck evalCase={evalCase} />}

            {primary.map(([key, value]) => (
              <div key={key}>
                <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-500">
                  {humanizeKey(key)} <span className="font-normal normal-case text-gray-400">{String(value).length} chars</span>
                </h3>
                <pre className="whitespace-pre-wrap break-words rounded bg-gray-50 p-3 font-mono text-xs leading-relaxed">
                  {String(value)}
                </pre>
              </div>
            ))}

            <details className="text-sm">
              <summary className="cursor-pointer text-gray-600">Details</summary>
              <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1">
                {Object.entries(evalCase.meta).map(([key, value]) => (
                  <div key={key} className="min-w-0">
                    <dt className="text-xs text-gray-500">{humanizeKey(key)}</dt>
                    <dd className="truncate"><MetaValue value={value} /></dd>
                  </div>
                ))}
                {secondary.map(([key, value]) => (
                  <div key={key} className="col-span-2 min-w-0">
                    <dt className="text-xs text-gray-500">{humanizeKey(key)}</dt>
                    <dd className="break-all font-mono text-xs">
                      {typeof value === 'string' ? value : JSON.stringify(value)}
                    </dd>
                  </div>
                ))}
              </dl>
            </details>
          </div>
        </section>

        {/* Right: the runs, judged against the input on the left. */}
        <div className="min-w-0 space-y-4">
          {evalCase.inputProblem ? (
            <p className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
              This input is marked as bad, so it isn&apos;t run or judged. Runs from before it was marked stay
              below for reference, but they don&apos;t count.
            </p>
          ) : (
            <>
              <RunControls prompt={info.id} caseId={evalCase.id} hasRuns={evalCase.runs.length > 0} />
              <p className="text-xs text-gray-500">
                Judge each output against the input on the left, not the web page: ✓ Correct if it matches the input,
                ✗ Incorrect if the input had it and the model missed or mangled it.
              </p>
            </>
          )}
          {runs.length === 0 ? (
            <p className="rounded-lg border border-dashed border-gray-300 bg-white p-8 text-center text-sm text-gray-500">
              No runs yet.
            </p>
          ) : (
            runs.map(({ run, number }) => (
              <RunCard
                key={run.id}
                prompt={info.id}
                caseId={evalCase.id}
                run={run}
                number={number}
                duplicateOf={duplicates.get(run.id)}
              />
            ))
          )}
        </div>
      </div>
    </div>
  )
}
