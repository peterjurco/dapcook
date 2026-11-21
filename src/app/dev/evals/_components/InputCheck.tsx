import { coverage, type Coverage } from '@/lib/evals/coverage'
import type { EvalCase } from '@/lib/evals/types'
import { LoadReferenceButton } from './CaseActions'
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

/**
 * Answers "did the model get the whole recipe?" for extract-recipe inputs, by
 * checking the page's own recipe data (JSON-LD) against the article text, so
 * a missing ingredient can be blamed on the input or on the model.
 */
export function InputCheck({ evalCase }: { evalCase: EvalCase }) {
  const { reference } = evalCase
  const skipsModel = evalCase.meta.productionCallsModel === false

  const productionNote = skipsModel && (
    <p className="mt-2 text-xs">
      In production this page is imported from its recipe data, and this prompt is never called for it. That&apos;s why
      the app can show a correct recipe even when the runs here are wrong.
    </p>
  )

  if (reference === undefined) {
    return (
      <div className="rounded-md border border-gray-200 bg-gray-50 p-3 text-sm text-gray-700">
        <p>This input was added before the automatic input check existed. Load the page&apos;s recipe data to check it.</p>
        <div className="mt-2"><LoadReferenceButton prompt={evalCase.prompt} caseId={evalCase.id} /></div>
      </div>
    )
  }

  if (reference === null) {
    return (
      <div className="rounded-md border border-gray-200 bg-gray-50 p-3 text-sm text-gray-700">
        <p className="font-medium">No automatic check for this page</p>
        <p className="mt-1">
          The page has no recipe data (JSON-LD) to compare against. Open the page and check the article text has every
          ingredient and step. If something is missing from the article text, runs that miss it are ⚠ Bad input, not
          the model&apos;s fault.
        </p>
      </div>
    )
  }

  const text = String(evalCase.input.articleText ?? '')
  const ingredients = coverage(strings(reference.data.rawIngredients), text)
  const steps = coverage(strings(reference.data.rawSteps), text)
  const complete = ingredients.found === ingredients.total && steps.found === steps.total

  return (
    <div
      className={
        complete
          ? 'rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900'
          : 'rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900'
      }
    >
      <p className="font-medium">
        {complete ? 'Input looks complete' : 'Input is missing part of the recipe'}
      </p>
      <p className="mt-1">The article text the model receives contains, from the page&apos;s {reference.source}:</p>
      <ul className="mt-1 space-y-0.5">
        <CoverageLine label="ingredients" c={ingredients} />
        <CoverageLine label="steps" c={steps} />
      </ul>
      <p className="mt-2">
        {complete
          ? 'If a run is wrong, it is the model: mark it ✗ Model wrong.'
          : 'Readability dropped this content before the model saw it. Runs that miss it are ⚠ Bad input. The fix is in the pipeline, not the prompt.'}
      </p>
      {productionNote}
      <details className="mt-2">
        <summary className="cursor-pointer text-xs">Show the page&apos;s recipe data</summary>
        <div className="mt-2 rounded bg-white/70 p-2 text-gray-900"><JsonView value={reference.data} /></div>
      </details>
    </div>
  )
}
