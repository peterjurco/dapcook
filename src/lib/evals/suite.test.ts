// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))

import type Anthropic from '@anthropic-ai/sdk'
import { buildStepDivisionRequest, JUDGE_MODEL, judgeStepDivision, stepDivisionPrompt } from './judge'
import { runExtractRecipeSuite, suiteSamples, summarize } from './suite'
import type { EvalCase } from './types'

const extract = vi.fn()
const judge = vi.fn()
const client = { messages: { create: extract }, beta: { messages: { create: judge } } } as unknown as Anthropic

const text = (t: string, extra: object = {}) => ({
  content: [{ type: 'text', text: t }], stop_reason: 'end_turn', model: JUDGE_MODEL,
  usage: { input_tokens: 10, output_tokens: 5 }, ...extra,
})
const reply = (rawIngredients: string[], rawSteps: string[]) => text(JSON.stringify({ rawIngredients, rawSteps }))

function sample(id: string, overrides: Partial<EvalCase> = {}): EvalCase {
  return {
    id, prompt: 'extract-recipe', createdAt: '', label: id, source: { url: `https://example.com/${id}` }, meta: {}, runs: [],
    input: { articleText: 'Pancakes. 2 eggs, 1 cup milk. Whisk everything. Fry in a pan.' },
    expected: { rawIngredients: ['2 eggs', '1 cup milk'], rawSteps: ['Whisk everything.', 'Fry in a pan.'] },
    ...overrides,
  }
}

beforeEach(() => vi.clearAllMocks())

describe('step division judge', () => {
  it('sends the prompt with source and numbered steps to Sonnet, with a JSON-schema answer and fallbacks', () => {
    const request = buildStepDivisionRequest('SOURCE TEXT', ['Whisk.', 'Fry.'])
    expect(request.model).toBe('claude-sonnet-5-5')
    expect(request.output_config?.format?.type).toBe('json_schema')
    expect(request.fallbacks).toBe('default')
    expect(stepDivisionPrompt('SOURCE TEXT', ['Whisk.', 'Fry.'])).toContain('<source>\nSOURCE TEXT\n</source>')
    expect(stepDivisionPrompt('SOURCE TEXT', ['Whisk.', 'Fry.'])).toContain('<steps>\n1. Whisk.\n2. Fry.\n</steps>')
  })

  it('reads the verdict, and reports refusals and API errors instead of throwing', async () => {
    judge.mockResolvedValueOnce(text('{"reasoning":"Two clear stages.","pass":true}'))
    expect(await judgeStepDivision(client, 's', ['a'])).toMatchObject({ status: 'pass', reasoning: 'Two clear stages.', servedBy: JUDGE_MODEL })

    judge.mockResolvedValueOnce(text('', { stop_reason: 'refusal' }))
    expect((await judgeStepDivision(client, 's', ['a'])).status).toBe('error')

    judge.mockRejectedValueOnce(new Error('overloaded'))
    expect(await judgeStepDivision(client, 's', ['a'])).toEqual({ status: 'error', error: 'overloaded' })
  })
})

describe('runExtractRecipeSuite', () => {
  it('scores only usable inputs that have an expected output', () => {
    const cases = [sample('a'), sample('b', { expected: null }), sample('c', { inputProblem: 'no ingredients' })]
    expect(suiteSamples(cases).map((c) => c.id)).toEqual(['a'])
  })

  it('runs the production request with the chosen model and judges division when the steps are complete', async () => {
    extract.mockResolvedValue(reply(['2 Eggs', '1 cup milk'], ['Whisk everything. Fry in a pan.']))
    judge.mockResolvedValue(text('{"reasoning":"Whisking and frying are separate stages.","pass":false}'))

    const result = await runExtractRecipeSuite([sample('a')], { model: 'claude-haiku-5-5', runsPerSample: 2, client })

    expect(extract).toHaveBeenCalledTimes(2)
    expect(extract.mock.calls[0][0].model).toBe('claude-haiku-5-5')
    expect(extract.mock.calls[0][0].messages[0].content).toContain('Pancakes. 2 eggs')
    expect(result.samples.map((s) => s.attempt)).toEqual([1, 2])
    expect(result.samples[0]).toMatchObject({
      ingredients: { pass: true }, completeness: { pass: true },
      division: { status: 'fail', reasoning: 'Whisking and frying are separate stages.' },
    })
    expect(summarize(result)).toMatchObject({
      ingredients: { passed: 2, of: 2 }, division: { passed: 0, of: 2 }, allPassed: { passed: 0, of: 2 },
    })
  })

  it('skips the judge when instruction completeness fails', async () => {
    extract.mockResolvedValue(reply(['2 eggs', '1 cup milk'], ['Whisk everything.']))
    const result = await runExtractRecipeSuite([sample('a')], { model: 'm', runsPerSample: 1, client })
    expect(judge).not.toHaveBeenCalled()
    expect(result.samples[0].completeness).toEqual({ pass: false, missing: ['fry in a pan'], extra: [] })
    expect(result.samples[0].division.status).toBe('skipped')
  })

  it('records an extraction failure or unusable reply on the sample', async () => {
    extract.mockRejectedValueOnce(new Error('rate limited')).mockResolvedValueOnce(text('Sorry, no recipe here'))
    const result = await runExtractRecipeSuite([sample('a'), sample('b')], { model: 'm', runsPerSample: 1, client })
    expect(result.samples.map((s) => s.error)).toEqual(['rate limited', 'No JSON found'])
    expect(result.samples.every((s) => !s.ingredients.pass && s.division.status === 'skipped')).toBe(true)
    expect(summarize(result).errors).toBe(2)
  })
})
