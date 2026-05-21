// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockCreate } = vi.hoisted(() => ({ mockCreate: vi.fn() }))

vi.mock('@anthropic-ai/sdk', () => ({
  default: vi.fn().mockImplementation(function () {
    return {
      messages: {
        create: mockCreate,
      },
    }
  }),
}))

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn(() => ({})) }))
vi.mock('./log-usage', () => ({ logAiUsage: vi.fn() }))

import Anthropic from '@anthropic-ai/sdk'
import { logAiUsage } from './log-usage'
import { transformRecipe } from './transform-recipe'
import type { RecipeContent } from './transform-recipe'

const mockContent: RecipeContent = {
  title: 'Pasta Carbonara',
  description: 'Classic Italian pasta',
  ingredients: [
    { id: 'i1', quantity: 200, unit: 'g', name: 'pasta', notes: '' },
    { id: 'i2', quantity: 100, unit: 'g', name: 'pancetta', notes: 'diced' },
  ],
  steps: [
    { id: 's1', order: 1, text: 'Boil pasta in salted water.' },
  ],
  notes: 'Serve immediately.',
}

function getCreateMock() {
  return mockCreate
}

function mockAnthropicResponse(content: RecipeContent) {
  mockCreate.mockResolvedValue({
    content: [{ type: 'text', text: JSON.stringify(content) }],
    usage: { input_tokens: 100, output_tokens: 200 },
  })
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('transformRecipe', () => {
  it('calls Anthropic when targetLanguage is en (back-translation to English)', async () => {
    mockAnthropicResponse(mockContent)
    const result = await transformRecipe(mockContent, { targetLanguage: 'en', targetUnits: 'metric' }, 'hh-1')
    expect(getCreateMock()).toHaveBeenCalledOnce()
    expect(result).toEqual(mockContent)
  })

  it('short-circuits when no options are provided', async () => {
    const result = await transformRecipe(mockContent, {}, 'hh-1')
    expect(result).toBe(mockContent)
  })

  it('calls Anthropic when targetLanguage differs from en', async () => {
    const translated: RecipeContent = { ...mockContent, title: 'Pasta Carbonara SK' }
    mockAnthropicResponse(translated)

    const result = await transformRecipe(mockContent, { targetLanguage: 'sk', targetUnits: 'metric' }, 'hh-1')

    expect(getCreateMock()).toHaveBeenCalledOnce()
    const callArgs = getCreateMock().mock.calls[0][0] as { messages: Array<{ content: string }> }
    const prompt = callArgs.messages[0].content
    expect(prompt).toContain('Slovak')
    expect(prompt).not.toContain('Convert all quantities')
    expect(result.title).toBe('Pasta Carbonara SK')
  })

  it('calls Anthropic when targetUnits is imperial', async () => {
    const converted: RecipeContent = {
      ...mockContent,
      ingredients: [
        { id: 'i1', quantity: 7, unit: 'oz', name: 'pasta', notes: '' },
        { id: 'i2', quantity: 3.5, unit: 'oz', name: 'pancetta', notes: 'diced' },
      ],
    }
    mockAnthropicResponse(converted)

    const result = await transformRecipe(mockContent, { targetUnits: 'imperial' }, 'hh-1')

    expect(getCreateMock()).toHaveBeenCalledOnce()
    const callArgs = getCreateMock().mock.calls[0][0] as { messages: Array<{ content: string }> }
    const prompt = callArgs.messages[0].content
    expect(prompt).toContain('imperial')
    expect(prompt).not.toContain('Translate')
    expect(result.ingredients[0].unit).toBe('oz')
  })

  it('includes both instructions when both lang and units differ', async () => {
    mockAnthropicResponse(mockContent)

    await transformRecipe(mockContent, { targetLanguage: 'fr', targetUnits: 'imperial' }, 'hh-1')

    const callArgs = getCreateMock().mock.calls[0][0] as { messages: Array<{ content: string }> }
    const prompt = callArgs.messages[0].content
    expect(prompt).toContain('French')
    expect(prompt).toContain('imperial')
  })

  it('preserves ingredient ids and step ids/order in response', async () => {
    // AI response without ids — function should re-inject them
    const aiResponse = {
      ...mockContent,
      title: 'Translated',
      ingredients: mockContent.ingredients.map((ing) => ({ quantity: ing.quantity, unit: ing.unit, name: ing.name, notes: ing.notes })),
      steps: mockContent.steps.map((step) => ({ text: step.text })),
    }
    mockAnthropicResponse(aiResponse as unknown as RecipeContent)

    const result = await transformRecipe(mockContent, { targetLanguage: 'sk' }, 'hh-1')

    expect(result.ingredients[0].id).toBe('i1')
    expect(result.ingredients[1].id).toBe('i2')
    expect(result.steps[0].id).toBe('s1')
    expect(result.steps[0].order).toBe(1)
  })

  it('logs AI usage when householdId is provided', async () => {
    mockAnthropicResponse(mockContent)

    await transformRecipe(mockContent, { targetLanguage: 'sk' }, 'hh-1')

    expect(vi.mocked(logAiUsage)).toHaveBeenCalledWith(
      expect.anything(),
      'hh-1',
      'recipe_transform',
      { input_tokens: 100, output_tokens: 200 }
    )
  })

  it('falls back to original content when AI returns invalid JSON', async () => {
    getCreateMock().mockResolvedValue({
      content: [{ type: 'text', text: 'Sorry, I cannot do that.' }],
      usage: { input_tokens: 10, output_tokens: 5 },
    })

    const result = await transformRecipe(mockContent, { targetLanguage: 'sk' }, 'hh-1')
    expect(result).toEqual(mockContent)
  })
})
