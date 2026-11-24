import { coverage, type Coverage } from '@/lib/evals/coverage'
import type { EvalCase } from '@/lib/evals/types'
import { InputProblemButton, LoadReferenceButton } from './CaseActions'
import { JsonView } from './JsonView'

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : []
}

function CoverageLine({ label, c }: { label: string; c: Coverage }) {
  return (
    <li>
      <span className="font-semibold">{c.found} of {c.total}</span> {label}
      {c.missing.length > 0 && (
        <ul className="ml-4 mt-0.5 list-disc text-xs opacity-80">
          {c.missing.slice(0, 8).map((m, i) => <li key={i}>{m}</li>)}
          {c.missing.length > 8 && <li>…and {c.missing.length - 8} more</li>}
        </ul>
      )}
    </li>
  )
}

/** The page's JSON-LD checked against the article text, line by line. */
function ReferenceCoverage({ evalCase }: { evalCase: EvalCase }) {
  const { reference } = evalCase
  if (!reference) return null
  const text = String(evalCase.input.articleText ?? '')
  return (
    <>
      <p className="mt-2">From the page&apos;s {reference.source}, the article text contains:</p>
      <ul className="mt-1 space-y-0.5">
        <CoverageLine label="ingredients" c={coverage(strings(reference.data.rawIngredients), text)} />
        <CoverageLine label="steps" c={coverage(strings(reference.data.rawSteps), text)} />
      </ul>
      <details className="mt-2">
        <summary className="cursor-pointer text-xs">Show the page&apos;s recipe data</summary>
        <div className="mt-2 rounded bg-white/70 p-2 text-gray-900"><JsonView value={reference.data} /></div>
      </details>
    </>
  )
}

/**
 * Is this input a fair test of the prompt? Answered before anything is run, so
 * a broken input (e.g. Readability dropped the ingredients) costs no runs and
 * no judging: it's set aside as a pipeline bug instead.
 */
export function InputCheck({ evalCase }: { evalCase: EvalCase }) {
  const { reference, inputProblem } = evalCase

  if (inputProblem) {
    return (
      <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
        <p className="font-medium">⚠ Bad input: not used for prompt evals</p>
        <p className="mt-1">{inputProblem}</p>
        <p className="mt-1">
          The model can&apos;t extract what it never receives, so runs on this input say nothing about the prompt.
          It&apos;s listed under Bad inputs as a pipeline bug.
        </p>
        <ReferenceCoverage evalCase={evalCase} />
        <div className="mt-3"><InputProblemButton prompt={evalCase.prompt} caseId={evalCase.id} flagged /></div>
      </div>
    )
  }

  if (reference === undefined) {
    return (
      <div className="rounded-md border border-gray-200 bg-gray-50 p-3 text-sm text-gray-700">
        <p>This input was added before the automatic check existed. Load the page&apos;s recipe data to check it.</p>
        <div className="mt-2 flex flex-wrap gap-2">
          <LoadReferenceButton prompt={evalCase.prompt} caseId={evalCase.id} />
          <InputProblemButton prompt={evalCase.prompt} caseId={evalCase.id} flagged={false} />
        </div>
      </div>
    )
  }

  if (reference === null) {
    return (
      <div className="rounded-md border border-gray-200 bg-gray-50 p-3 text-sm text-gray-700">
        <p className="font-medium">Check the input yourself</p>
        <p className="mt-1">
          The page has no recipe data to check against. Skim the article text: if ingredients or steps from the page
          are missing, mark the input as bad. Don&apos;t run it.
        </p>
        <div className="mt-2"><InputProblemButton prompt={evalCase.prompt} caseId={evalCase.id} flagged={false} /></div>
      </div>
    )
  }

  const text = String(evalCase.input.articleText ?? '')
  const notFound =
    coverage(strings(reference.data.rawIngredients), text).missing.length +
    coverage(strings(reference.data.rawSteps), text).missing.length

  return (
    <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
      <p className="font-medium">{notFound ? '✓ Input looks complete' : '✓ Input is complete'}</p>
      <p className="mt-1">
        {notFound
          ? `${notFound} ${notFound === 1 ? 'line' : 'lines'} of the page's recipe data weren't found in the article text, usually because they're worded differently. Check them below before blaming the model for missing them.`
          : "Everything in the page's recipe data reaches the model. A wrong output is the model's fault."}
      </p>
      <ReferenceCoverage evalCase={evalCase} />
    </div>
  )
}
