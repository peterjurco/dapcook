// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { POST } from './route'

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('@/lib/scraper', () => ({ scrapeRecipe: vi.fn() }))
vi.mock('@/lib/ai/parse-recipe', () => ({ parseRecipeData: vi.fn() }))

import { createClient } from '@/lib/supabase/server'
import { scrapeRecipe } from '@/lib/scraper'
import { parseRecipeData } from '@/lib/ai/parse-recipe'

const mockUser = { id: 'user-1' }

function makeSupabase(user: typeof mockUser | null = mockUser) {
  return {
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user } }) },
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
      rawScraped.rawSteps
    )
  })

  it('calls scrapeRecipe with the provided URL', async () => {
    await POST(req({ url: 'https://example.com/pasta' }))
    expect(vi.mocked(scrapeRecipe)).toHaveBeenCalledWith('https://example.com/pasta')
  })
})
