import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getPromptInfo } from '@/lib/evals/prompts'
import { getSuiteResult } from '@/lib/evals/store'
import { summarize } from '@/lib/evals/suite'
import type { ListScore, SampleResult } from '@/lib/evals/types'
import { Check, Rate } from '../../../_components/Rate'

export const dynamic = 'force-dynamic'

const status = (s: ListScore) => (s.pass ? 'pass' : 'fail')

function Diff({ title, score }: { title: string; score: ListScore }) {
  if (score.pass || (!score.missing.length && !score.extra.length)) return null
  return (
    <div>
      <h4 className="text-xs font-semibold uppercase tracking-wide text-gray-500">{title}</h4>
      {score.missing.length > 0 && (
        <ul className="mt-1 space-y-0.5">
          {score.missing.map((m, i) => <li key={i} className="rounded bg-red-50 px-2 py-0.5 text-red-900">− {m}</li>)}
        </ul>
      )}
      {score.extra.length > 0 && (
        <ul className="mt-1 space-y-0.5">
          {score.extra.map((m, i) => <li key={i} className="rounded bg-sky-50 px-2 py-0.5 text-sky-900">+ {m}</li>)}
        </ul>
      )}
    </div>
  )
}

function SampleDetails({ sample, prompt }: { sample: SampleResult; prompt: string }) {
  const failed = !sample.ingredients.pass || !sample.completeness.pass || sample.division.status !== 'pass'
  return (
    <details className="group border-b border-gray-100 last:border-0" open={false}>
      <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-4 gap-y-1 px-3 py-2 text-sm hover:bg-gray-50">
        <span className="min-w-0 flex-1">
          <span className="font-medium">{sample.label}</span>
          {sample.attempt > 1 && <span className="text-xs text-gray-500"> · run {sample.attempt}</span>}
          {sample.error && <span className="ml-2 text-xs text-red-700">{sample.error}</span>}
          {sample.stopReason && sample.stopReason !== 'end_turn' && (
            <span className="ml-2 rounded bg-amber-100 px-1.5 text-xs text-amber-800">stop: {sample.stopReason}</span>
          )}
        </span>
        <span className="flex gap-5 text-center">
          <span className="w-16"><Check status={status(sample.ingredients)} /></span>
          <span className="w-16"><Check status={status(sample.completeness)} /></span>
          <span className="w-16"><Check status={sample.division.status} /></span>
        </span>
      </summary>
      <div className="space-y-3 bg-gray-50 px-3 py-3 text-sm">
        <div className="flex flex-wrap gap-x-4 text-xs text-gray-500">
          <Link href={`/dev/evals/${prompt}/${sample.caseId}`} className="text-emerald-700 hover:underline">Open input</Link>
          {sample.url && <a href={sample.url} target="_blank" rel="noreferrer" className="hover:underline">{sample.url}</a>}
          <span>{sample.usage.input_tokens} in / {sample.usage.output_tokens} out · {(sample.durationMs / 1000).toFixed(1)}s</span>
        </div>
        <Diff title="Ingredients" score={sample.ingredients} />
        <Diff title="Instructions" score={sample.completeness} />
        {sample.division.status !== 'skipped' && (
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wide text-gray-500">
              Step division {sample.division.servedBy && <span className="font-mono font-normal normal-case">({sample.division.servedBy})</span>}
            </h4>
            <p className="mt-1">{sample.division.reasoning ?? sample.division.error}</p>
          </div>
        )}
        {sample.output && (
          <details>
            <summary className="cursor-pointer text-xs text-gray-600">Model output</summary>
            <div className="mt-2 grid gap-3 md:grid-cols-2">
              <ol className="list-inside list-disc space-y-0.5">{sample.output.rawIngredients.map((l, i) => <li key={i}>{l}</li>)}</ol>
              <ol className="list-inside list-decimal space-y-1">{sample.output.rawSteps.map((l, i) => <li key={i}>{l}</li>)}</ol>
            </div>
          </details>
        )}
        {!sample.output && sample.rawText && (
          <pre className="whitespace-pre-wrap break-words font-mono text-xs">{sample.rawText}</pre>
        )}
        {!failed && <p className="text-xs text-emerald-700">All checks passed.</p>}
      </div>
    </details>
  )
}

export default async function SuiteResultPage({ params }: { params: Promise<{ prompt: string; resultId: string }> }) {
  const { prompt, resultId } = await params
  const info = getPromptInfo(prompt)
  if (info?.id !== 'extract-recipe') notFound()
  const result = await getSuiteResult(info.id, resultId).catch(() => null)
  if (!result) notFound()
  const s = summarize(result)
  const sorted = [...result.samples].sort(
    (a, b) => Number(a.ingredients.pass && a.completeness.pass && a.division.status === 'pass') -
      Number(b.ingredients.pass && b.completeness.pass && b.division.status === 'pass') || a.label.localeCompare(b.label)
  )

  return (
    <div>
      <Link href={`/dev/evals/${info.id}/suite`} className="text-sm text-gray-500 hover:text-gray-900">← Eval suite</Link>
      <header className="mb-4 mt-2">
        <h1 className="text-xl font-semibold">
          Eval run · {new Date(result.createdAt).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })}
        </h1>
        <p className="text-sm text-gray-600">
          Model <span className="font-mono">{result.model}</span> · judge <span className="font-mono">{result.judgeModel}</span>
          {result.runsPerSample > 1 && ` · ${result.runsPerSample} runs per sample`}
        </p>
      </header>

      <dl className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          ['All checks', s.allPassed],
          ['Ingredients', s.ingredients],
          ['Instruction completeness', s.completeness],
          ['Step division (judged)', s.division],
        ].map(([label, rate]) => (
          <div key={label as string} className="rounded-lg border border-gray-200 bg-white p-3">
            <dt className="text-xs text-gray-500">{label as string}</dt>
            <dd className="mt-1 text-lg"><Rate {...(rate as { passed: number; of: number })} /></dd>
          </div>
        ))}
      </dl>

      <div className="rounded-lg border border-gray-200 bg-white">
        <div className="flex gap-x-4 border-b border-gray-100 px-3 py-2 text-xs text-gray-500">
          <span className="flex-1">Sample (failures first; click for details)</span>
          <span className="flex gap-5 text-center">
            <span className="w-16">Ingredients</span><span className="w-16">Complete</span><span className="w-16">Division</span>
          </span>
        </div>
        {sorted.map((sample) => <SampleDetails key={`${sample.caseId}-${sample.attempt}`} sample={sample} prompt={info.id} />)}
      </div>
      <p className="mt-2 text-xs text-gray-500">Division “–”: not judged because instruction completeness failed.</p>
    </div>
  )
}
