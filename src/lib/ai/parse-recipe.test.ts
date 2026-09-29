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

import { parseRecipeData } from './parse-recipe'

const RAW_INGREDIENTS = ['200 g spaghetti', '100 g guanciale']
const RAW_STEPS = ['Boil the pasta.']
const TAG_CONTEXT = { title: 'Carbonara', householdTags: ['dinner', 'pasta'], language: 'en' }

const PARSED = {
  ingredients: [
    { quantity: 200, unit: 'g', name: 'spaghetti', notes: '' },
    { quantity: 100, unit: 'g', name: 'guanciale', notes: '' },
  ],
  steps: [{ order: 1, text: 'Boil the pasta.' }],
}

function mockAnthropicJson(body: unknown) {
  mockCreate.mockResolvedValue({
    content: [{ type: 'text', text: JSON.stringify(body) }],
    usage: { input_tokens: 100, output_tokens: 50 },
  })
}

function sentPrompt(): string {
  return mockCreate.mock.calls[0][0].messages[0].content as string
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubEnv('RECIPE_IMPORT_USE_AI', 'true')
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('parseRecipeData', () => {
  it('parses ingredients and steps without tag suggestions when no tagContext is given', async () => {
    mockAnthropicJson(PARSED)
    const result = await parseRecipeData(RAW_INGREDIENTS, RAW_STEPS, 'hh-1')
    expect(result.ingredients.map((i) => i.name)).toEqual(['spaghetti', 'guanciale'])
    expect(result.suggestedTags).toBeUndefined()
    expect(sentPrompt()).not.toContain('suggestedTags')
  })

  it('asks for and returns sanitized tag suggestions when tagContext is given', async () => {
    mockAnthropicJson({ ...PARSED, suggestedTags: { existing: ['pasta', 'brunch'], new: 'Italian' } })
    const result = await parseRecipeData(RAW_INGREDIENTS, RAW_STEPS, 'hh-1', TAG_CONTEXT)
    expect(result.suggestedTags).toEqual({ existing: ['pasta'], new: 'italian' })
    expect(sentPrompt()).toContain('suggestedTags')
    expect(sentPrompt()).toContain('Carbonara')
    expect(sentPrompt()).toContain('"dinner", "pasta"')
  })

  it('keeps parsed ingredients and returns empty suggestions when the tag field is malformed', async () => {
    mockAnthropicJson({ ...PARSED, suggestedTags: 'pasta, italian' })
    const result = await parseRecipeData(RAW_INGREDIENTS, RAW_STEPS, 'hh-1', TAG_CONTEXT)
    expect(result.ingredients.map((i) => i.name)).toEqual(['spaghetti', 'guanciale'])
    expect(result.suggestedTags).toEqual({ existing: [], new: null })
  })

  it('returns no suggestions and makes no call when AI is disabled', async () => {
    vi.stubEnv('RECIPE_IMPORT_USE_AI', 'false')
    const result = await parseRecipeData(RAW_INGREDIENTS, RAW_STEPS, 'hh-1', TAG_CONTEXT)
    expect(mockCreate).not.toHaveBeenCalled()
    expect(result.suggestedTags).toBeUndefined()
  })
})
