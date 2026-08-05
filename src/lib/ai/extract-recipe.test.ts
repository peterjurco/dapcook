// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const { mockCreate } = vi.hoisted(() => ({ mockCreate: vi.fn() }))

vi.mock('@anthropic-ai/sdk', () => ({
  default: vi.fn().mockImplementation(function () {
    return { messages: { create: mockCreate } }
  }),
}))

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn(() => ({})) }))
vi.mock('./log-usage', () => ({ logAiUsage: vi.fn() }))

import { logAiUsage } from './log-usage'
import { extractRecipeFromContent } from './extract-recipe'

const URL = 'https://example.com/grandmas-apple-pie'
const ARTICLE_TEXT = "Grandma's Apple Pie\n\n6 cups apples\n3/4 cup sugar\n\nPreheat oven to 425F.\nBake for 45 minutes."

function mockAnthropicResponse(text: string) {
  mockCreate.mockResolvedValue({
    content: [{ type: 'text', text }],
    usage: { input_tokens: 50, output_tokens: 30 },
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubEnv('RECIPE_IMPORT_USE_AI', 'true')
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('extractRecipeFromContent', () => {
  it('returns null without calling Anthropic when AI is disabled', async () => {
    vi.stubEnv('RECIPE_IMPORT_USE_AI', 'false')
    const result = await extractRecipeFromContent(ARTICLE_TEXT, URL)
    expect(result).toBeNull()
    expect(mockCreate).not.toHaveBeenCalled()
  })

  it('extracts ingredients and steps from a valid JSON response', async () => {
    mockAnthropicResponse(JSON.stringify({
      rawIngredients: ['6 cups apples', '3/4 cup sugar'],
      rawSteps: ['Preheat oven to 425F.', 'Bake for 45 minutes.'],
    }))

    const result = await extractRecipeFromContent(ARTICLE_TEXT, URL, 'hh-1')

    expect(result).toEqual({
      rawIngredients: ['6 cups apples', '3/4 cup sugar'],
      rawSteps: ['Preheat oven to 425F.', 'Bake for 45 minutes.'],
    })
  })

  it('returns null when the model reports the page is not a recipe', async () => {
    mockAnthropicResponse(JSON.stringify({ rawIngredients: [], rawSteps: [] }))
    const result = await extractRecipeFromContent(ARTICLE_TEXT, URL)
    expect(result).toBeNull()
  })

  it('returns null when the response has no JSON', async () => {
    mockAnthropicResponse('Sorry, I cannot help with that.')
    const result = await extractRecipeFromContent(ARTICLE_TEXT, URL)
    expect(result).toBeNull()
  })

  it('returns null when the response has malformed JSON', async () => {
    mockAnthropicResponse('{ "rawIngredients": [oops] }')
    const result = await extractRecipeFromContent(ARTICLE_TEXT, URL)
    expect(result).toBeNull()
  })

  it('logs AI usage when householdId is provided', async () => {
    mockAnthropicResponse(JSON.stringify({
      rawIngredients: ['6 cups apples'],
      rawSteps: ['Bake for 45 minutes.'],
    }))

    await extractRecipeFromContent(ARTICLE_TEXT, URL, 'hh-1')

    expect(vi.mocked(logAiUsage)).toHaveBeenCalledWith(
      expect.anything(),
      'hh-1',
      'recipe_extract',
      { input_tokens: 50, output_tokens: 30 }
    )
  })

  it('truncates a very long articleText before sending it to Claude', async () => {
    mockAnthropicResponse(JSON.stringify({ rawIngredients: [], rawSteps: [] }))

    const longArticleText = 'a'.repeat(50_000)
    await extractRecipeFromContent(longArticleText, URL)

    const promptSent = mockCreate.mock.calls[0][0].messages[0].content as string
    // The full 50,000-char blob must not have been forwarded verbatim.
    expect(promptSent.length).toBeLessThan(longArticleText.length)
    // Only a bounded prefix of the article text should appear in the prompt.
    expect(promptSent).not.toContain(longArticleText)
    expect(promptSent).toContain('a'.repeat(100))
  })
})
