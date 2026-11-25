import Anthropic from '@anthropic-ai/sdk'
import { buildExtractRecipeRequest, toExtractedRecipe } from '@/lib/ai/extract-recipe'
import { parseJsonFromText } from '@/lib/ai/json-response'
import { JUDGE_MODEL, judgeStepDivision } from './judge'
import { scoreIngredients, scoreStepCompleteness } from './scoring'
import { newId } from './store'
import type { EvalCase, ExpectedRecipe, ListScore, SampleResult, SuiteResult } from './types'

/** The model production uses for extraction today; the suite's default. */
export const PRODUCTION_EXTRACT_MODEL = String(buildExtractRecipeRequest('').model)

/** Samples the suite scores: a usable input with a hand-written expected output. */
export function suiteSamples(cases: EvalCase[]): EvalCase[] {
  return cases.filter((c) => !c.inputProblem && c.expected)
}

const CONCURRENCY = 4

async function inPool<T>(tasks: (() => Promise<T>)[], limit: number): Promise<T[]> {
  const results = new Array<T>(tasks.length)
  let next = 0
  await Promise.all(
    Array.from({ length: Math.min(limit, tasks.length) }, async () => {
      while (next < tasks.length) {
        const index = next++
        results[index] = await tasks[index]()
      }
    })
  )
  return results
}

const FAILED: ListScore = { pass: false, missing: [], extra: [] }

async function runSample(
  client: Anthropic,
  evalCase: EvalCase,
  expected: ExpectedRecipe,
  model: string,
  attempt: number
): Promise<SampleResult> {
  const source = String(evalCase.input.articleText ?? '')
  const base = {
    caseId: evalCase.id,
    label: evalCase.label,
    url: typeof evalCase.source.url === 'string' ? evalCase.source.url : null,
    attempt,
  }
  const started = Date.now()
  let rawText = ''
  let stopReason: string | null | undefined
  const usage = { input_tokens: 0, output_tokens: 0 }

  try {
    // Exactly the production request, with only the model swapped.
    const response = await client.messages.create({ ...buildExtractRecipeRequest(source), model })
    rawText = response.content.map((block) => (block.type === 'text' ? block.text : '')).join('')
    stopReason = response.stop_reason
    usage.input_tokens += response.usage.input_tokens
    usage.output_tokens += response.usage.output_tokens
  } catch (err) {
    return {
      ...base, output: null, rawText, error: err instanceof Error ? err.message : String(err),
      ingredients: FAILED, completeness: FAILED, division: { status: 'skipped' }, usage, durationMs: Date.now() - started,
    }
  }

  const parsed = parseJsonFromText(rawText)
  if (!parsed.ok) {
    return {
      ...base, output: null, rawText, stopReason, error: parsed.error,
      ingredients: FAILED, completeness: FAILED, division: { status: 'skipped' }, usage, durationMs: Date.now() - started,
    }
  }
  // The same clean-up production applies; "nothing found" scores as empty lists.
  const output = toExtractedRecipe(parsed.value) ?? { rawIngredients: [], rawSteps: [] }
  const ingredients = scoreIngredients(expected.rawIngredients, output.rawIngredients)
  const completeness = scoreStepCompleteness(expected.rawSteps, output.rawSteps)

  // Division is only meaningful when the steps hold the right content.
  let division: SampleResult['division'] = { status: 'skipped' }
  if (completeness.pass) {
    const { usage: judgeUsage, ...verdict } = await judgeStepDivision(client, source, output.rawSteps)
    division = verdict
    usage.input_tokens += judgeUsage?.input_tokens ?? 0
    usage.output_tokens += judgeUsage?.output_tokens ?? 0
  }

  return { ...base, output, rawText, stopReason, ingredients, completeness, division, usage, durationMs: Date.now() - started }
}

let defaultClient: Anthropic | null = null

/** Runs every sample `runsPerSample` times against `model` and scores the outputs. Makes paid API calls. */
export async function runExtractRecipeSuite(
  cases: EvalCase[],
  options: { model: string; runsPerSample: number; client?: Anthropic }
): Promise<SuiteResult> {
  const client = options.client ?? (defaultClient ??= new Anthropic())
  const tasks = suiteSamples(cases).flatMap((evalCase) =>
    Array.from({ length: options.runsPerSample }, (_, i) => () =>
      runSample(client, evalCase, evalCase.expected!, options.model, i + 1)
    )
  )
  return {
    id: newId(),
    prompt: 'extract-recipe',
    createdAt: new Date().toISOString(),
    model: options.model,
    judgeModel: JUDGE_MODEL,
    runsPerSample: options.runsPerSample,
    samples: await inPool(tasks, CONCURRENCY),
  }
}

/** Pass rates for a suite result; division counts only judged samples. */
export function summarize(result: SuiteResult) {
  const s = result.samples
  const rate = (n: number, of: number) => ({ passed: n, of })
  const judged = s.filter((x) => x.division.status === 'pass' || x.division.status === 'fail')
  return {
    ingredients: rate(s.filter((x) => x.ingredients.pass).length, s.length),
    completeness: rate(s.filter((x) => x.completeness.pass).length, s.length),
    division: rate(judged.filter((x) => x.division.status === 'pass').length, judged.length),
    allPassed: rate(s.filter((x) => x.ingredients.pass && x.completeness.pass && x.division.status === 'pass').length, s.length),
    errors: s.filter((x) => x.error || x.division.status === 'error').length,
  }
}
