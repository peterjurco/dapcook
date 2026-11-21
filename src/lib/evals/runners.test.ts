// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const { mockCreate } = vi.hoisted(() => ({ mockCreate: vi.fn() }))

vi.mock('@anthropic-ai/sdk', () => ({
  default: vi.fn().mockImplementation(function () {
    return { messages: { create: mockCreate } }
  }),
}))
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))

import { executeRun, getRunner } from './runners'
import { buildExtractRecipeRequest, MAX_ARTICLE_CHARS } from '@/lib/ai/extract-recipe'
import type { EvalCase } from './types'

const URL = 'https://example.com/pie'
const STORY = 'This is my grandmother’s classic apple pie, passed down for generations and loved at every holiday. '

function page({ jsonLd = '', bodyText = STORY.repeat(3) } = {}) {
  return `<!DOCTYPE html><html lang="sk"><head><title>Apple Pie</title>${jsonLd}</head>
<body><article><h1>Apple Pie</h1><p>${bodyText}</p>
<ul><li>6 cups apples</li><li>3/4 cup sugar</li></ul><ol><li>Preheat oven.</li><li>Bake 45 minutes.</li></ol>
</article></body></html>`
}

function stubFetch(html: string) {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, text: () => Promise.resolve(html) }))
}

beforeEach(() => vi.clearAllMocks())
afterEach(() => vi.unstubAllGlobals())

describe('extract-recipe eval runner', () => {
  const runner = getRunner('extract-recipe')

  it('saves the article text the model would receive, plus pipeline diagnostics', async () => {
    stubFetch(page())
    const prepared = await runner.prepare({ url: URL })

    expect(prepared.source).toEqual({ url: URL })
    expect(prepared.input.sourceUrl).toBe(URL)
    expect(prepared.input.articleText).toContain('6 cups apples')
    expect(prepared.meta).toMatchObject({
      detectedLanguage: 'sk',
      jsonLd: 'none',
      productionCallsModel: true,
      truncated: false,
    })
    // The stored request is byte-for-byte the production one.
    expect(runner.buildRequest(prepared.input)).toEqual(buildExtractRecipeRequest(String(prepared.input.articleText)))
  })

  it('stores only the truncated text when the article is long', async () => {
    stubFetch(page({ bodyText: STORY.repeat(200) }))
    const prepared = await runner.prepare({ url: URL })
    expect(String(prepared.input.articleText)).toHaveLength(MAX_ARTICLE_CHARS)
    expect(prepared.meta.truncated).toBe(true)
  })

  it('flags pages whose complete JSON-LD means production never calls the model', async () => {
    const ld = JSON.stringify({
      '@type': 'Recipe', name: 'Apple Pie', recipeIngredient: ['6 cups apples'], recipeInstructions: ['Bake.'],
    })
    stubFetch(page({ jsonLd: `<script type="application/ld+json">${ld}</script>` }))
    const prepared = await runner.prepare({ url: URL })
    expect(prepared.meta).toMatchObject({ jsonLd: 'complete', productionCallsModel: false })
    expect(prepared.reference).toEqual({
      source: 'JSON-LD',
      data: { rawIngredients: ['6 cups apples'], rawSteps: ['Bake.'] },
    })
    expect(await runner.loadReference!({ url: URL })).toEqual(prepared.reference)
    // The article text has everything the JSON-LD has, so the input is usable.
    expect(prepared.inputProblem).toBeNull()
  })

  it('records that a page without JSON-LD has no reference', async () => {
    stubFetch(page())
    expect((await runner.prepare({ url: URL })).reference).toBeNull()
  })

  it('rejects invalid URLs without fetching', async () => {
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
    await expect(runner.prepare({ url: 'not a url' })).rejects.toThrow('not a valid URL')
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('errors when the page has no article content', async () => {
    stubFetch('<html><body><nav>Home</nav></body></html>')
    await expect(runner.prepare({ url: URL })).rejects.toThrow('no article content')
  })
})

describe('executeRun', () => {
  const evalCase: EvalCase = {
    id: 'c1', prompt: 'extract-recipe', createdAt: '', label: '', source: {}, meta: {}, runs: [],
    input: { articleText: 'Apple pie text', sourceUrl: URL },
  }

  it('records the request, the raw reply and the parsed output', async () => {
    const reply = 'Here you go:\n{"rawIngredients":["6 cups apples"],"rawSteps":["Bake."]}'
    mockCreate.mockResolvedValue({
      content: [{ type: 'text', text: reply }],
      stop_reason: 'end_turn',
      usage: { input_tokens: 10, output_tokens: 5 },
    })

    const run = await executeRun(evalCase)

    expect(mockCreate).toHaveBeenCalledWith(buildExtractRecipeRequest('Apple pie text'))
    expect(run).toMatchObject({
      request: buildExtractRecipeRequest('Apple pie text'),
      rawText: reply,
      output: { rawIngredients: ['6 cups apples'], rawSteps: ['Bake.'] },
      usage: { input_tokens: 10, output_tokens: 5 },
      verdict: null,
      notes: '',
    })
    expect(run.parseError).toBeUndefined()
  })

  it('keeps the raw reply when it is not JSON', async () => {
    mockCreate.mockResolvedValue({ content: [{ type: 'text', text: 'Sorry' }], usage: { input_tokens: 1, output_tokens: 1 } })
    const run = await executeRun(evalCase)
    expect(run).toMatchObject({ rawText: 'Sorry', output: null, parseError: 'No JSON found' })
  })

  it('records API failures on the run instead of throwing', async () => {
    mockCreate.mockRejectedValue(new Error('overloaded'))
    const run = await executeRun(evalCase)
    expect(run).toMatchObject({ error: 'overloaded', output: null, rawText: '' })
  })
})
