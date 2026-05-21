// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { POST } from './route'

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('@/lib/scraper', () => ({ scrapeRecipe: vi.fn() }))
vi.mock('@/lib/ai/parse-recipe', () => ({ parseRecipeData: vi.fn() }))
vi.mock('@/lib/ai/transform-recipe', () => ({ transformRecipe: vi.fn() }))

import { createClient } from '@/lib/supabase/server'
import { scrapeRecipe } from '@/lib/scraper'
import { parseRecipeData } from '@/lib/ai/parse-recipe'
import { transformRecipe } from '@/lib/ai/transform-recipe'

const mockUser = { id: 'user-1' }

function makeSingleChain(resolvedData: unknown) {
  const chain = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data: resolvedData }),
  }
  return chain
}

function makeSelectChain(resolvedData: unknown) {
  const chain = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    then: (resolve: (v: unknown) => unknown) =>
      Promise.resolve({ data: resolvedData }).then(resolve),
  }
  return chain
}

function makeSupabase(
  user: typeof mockUser | null = mockUser,
  household: { preferred_language: string; preferred_units: string } | null = { preferred_language: 'en', preferred_units: 'metric' }
) {
  const fromMap: Record<string, unknown> = {
    profiles: makeSingleChain({ household_id: 'hh-1' }),
    recipes: makeSelectChain([]),
    tags: makeSelectChain([]),
    households: makeSingleChain(household),
  }
  return {
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user } }) },
    from: vi.fn((table: string) => fromMap[table] ?? makeSingleChain(null)),
  }
}

const rawScraped = {
  title: 'Pasta',
  description: 'Yummy',
  source_url: 'https://example.com/pasta',
  image_url: 'https://example.com/img.jpg',
  prep_time_min: 10,
  cook_time_min: 20,
  servings: 2,
  tags: ['italian'],
  partial: false,
  rawIngredients: ['200g pasta', '100g sauce'],
  rawSteps: ['Boil pasta', 'Add sauce'],
}

const parsedParts = {
  ingredients: [{ id: 'i1', quantity: 200, unit: 'g', name: 'pasta', notes: '' }],
  steps: [{ id: 's1', order: 1, text: 'Boil pasta' }],
}

function req(body: unknown) {
  return new NextRequest('http://localhost/api/recipes/import', {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(createClient).mockReturnValue(makeSupabase() as unknown as ReturnType<typeof createClient>)
  vi.mocked(scrapeRecipe).mockResolvedValue({ raw: rawScraped } as Awaited<ReturnType<typeof scrapeRecipe>>)
  vi.mocked(parseRecipeData).mockResolvedValue(parsedParts)
  vi.mocked(transformRecipe).mockImplementation(async (content) => content)
})

describe('POST /api/recipes/import', () => {
  it('returns 401 when unauthenticated', async () => {
    vi.mocked(createClient).mockReturnValue(makeSupabase(null) as unknown as ReturnType<typeof createClient>)
    const res = await POST(req({ url: 'https://example.com' }))
    expect(res.status).toBe(401)
  })

  it('returns 400 when URL is missing', async () => {
    const res = await POST(req({}))
    expect(res.status).toBe(400)
    const body = await res.json() as { error: string }
    expect(body.error).toContain('URL')
  })

  it('returns 400 for invalid URL format', async () => {
    const res = await POST(req({ url: 'not-a-url' }))
    expect(res.status).toBe(400)
    const body = await res.json() as { error: string }
    expect(body.error).toContain('Invalid')
  })

  it('returns 422 when scrape throws', async () => {
    vi.mocked(scrapeRecipe).mockRejectedValue(new Error('Connection refused'))
    const res = await POST(req({ url: 'https://example.com/recipe' }))
    expect(res.status).toBe(422)
    const body = await res.json() as { error: string }
    expect(body.error).toBe('Connection refused')
  })

  it('returns draft on successful scrape', async () => {
    const res = await POST(req({ url: 'https://example.com/pasta' }))
    expect(res.status).toBe(200)

    const draft = await res.json() as Record<string, unknown>
    expect(draft.title).toBe('Pasta')
    expect(draft.ingredients).toEqual(parsedParts.ingredients)
    expect(draft.steps).toEqual(parsedParts.steps)
    // raw fields should not be in the draft
    expect(draft.rawIngredients).toBeUndefined()
    expect(draft.rawSteps).toBeUndefined()
  })

  it('passes raw ingredients and steps to parseRecipeData', async () => {
    await POST(req({ url: 'https://example.com/pasta' }))
    expect(vi.mocked(parseRecipeData)).toHaveBeenCalledWith(
      rawScraped.rawIngredients,
      rawScraped.rawSteps,
      'hh-1'
    )
  })

  it('calls scrapeRecipe with the provided URL', async () => {
    await POST(req({ url: 'https://example.com/pasta' }))
    expect(vi.mocked(scrapeRecipe)).toHaveBeenCalledWith('https://example.com/pasta')
  })

  it('calls transformRecipe with household prefs', async () => {
    vi.mocked(createClient).mockReturnValue(
      makeSupabase(mockUser, { preferred_language: 'sk', preferred_units: 'metric' }) as unknown as ReturnType<typeof createClient>
    )
    await POST(req({ url: 'https://example.com/pasta' }))
    expect(vi.mocked(transformRecipe)).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Pasta' }),
      { targetLanguage: 'sk', targetUnits: 'metric' },
      'hh-1'
    )
  })

  it('uses transformed content in the returned draft', async () => {
    const transformedIngredients = [{ id: 'i2', quantity: 7, unit: 'oz', name: 'pasta', notes: '' }]
    vi.mocked(transformRecipe).mockResolvedValue({
      title: 'Translated Pasta',
      description: null,
      ingredients: transformedIngredients,
      steps: [],
      notes: null,
    })
    const res = await POST(req({ url: 'https://example.com/pasta' }))
    const draft = await res.json() as Record<string, unknown>
    expect(draft.title).toBe('Translated Pasta')
    expect(draft.ingredients).toEqual(transformedIngredients)
  })
})
