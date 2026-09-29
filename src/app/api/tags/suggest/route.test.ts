// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('@/lib/auth/household', async () => ({
  getCurrentHouseholdId: (await import('@/test/householdMock')).householdIdMock,
}))
vi.mock('@/lib/tags/household-tags', () => ({ loadHouseholdTagNames: vi.fn() }))
vi.mock('@/lib/ai/suggest-tags', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/ai/suggest-tags')>()),
  suggestTags: vi.fn(),
}))

import { POST } from './route'
import { createClient } from '@/lib/supabase/server'
import { loadHouseholdTagNames } from '@/lib/tags/household-tags'
import { suggestTags } from '@/lib/ai/suggest-tags'
import { authMock } from '@/test/authMock'
import { householdIdMock } from '@/test/householdMock'

const EMPTY = { existing: [], new: null }

function makeSupabase(user: { id: string } | null = { id: 'user-1' }) {
  return {
    auth: authMock(user),
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: { preferred_language: 'sk' } }),
    })),
  }
}

function req(body: unknown) {
  return new NextRequest('http://localhost/api/tags/suggest', { method: 'POST', body: JSON.stringify(body) })
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubEnv('TAG_SUGGEST_USE_AI', 'true')
  vi.mocked(createClient).mockReturnValue(makeSupabase() as unknown as ReturnType<typeof createClient>)
  householdIdMock.mockResolvedValue('hh-1')
  vi.mocked(loadHouseholdTagNames).mockResolvedValue(['dinner', 'pasta'])
  vi.mocked(suggestTags).mockResolvedValue({ existing: ['dinner'], new: 'mexické' })
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('POST /api/tags/suggest', () => {
  it('returns 401 when unauthenticated', async () => {
    vi.mocked(createClient).mockReturnValue(makeSupabase(null) as unknown as ReturnType<typeof createClient>)
    const res = await POST(req({ title: 'Burrito' }))
    expect(res.status).toBe(401)
    expect(loadHouseholdTagNames).not.toHaveBeenCalled()
    expect(suggestTags).not.toHaveBeenCalled()
  })

  it('treats a null JSON body as empty instead of throwing', async () => {
    const res = await POST(req(null))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual(EMPTY)
    expect(suggestTags).not.toHaveBeenCalled()
  })

  it('caps ingredient names at 40 entries of 100 chars each', async () => {
    const names = Array.from({ length: 60 }, () => 'x'.repeat(300))
    await POST(req({ title: 'Burrito', ingredientNames: names }))
    const sent = vi.mocked(suggestTags).mock.calls[0][0].ingredientNames
    expect(sent.length).toBeLessThanOrEqual(40)
    expect(sent.length).toBeGreaterThan(0)
    for (const n of sent) expect(n.length).toBeLessThanOrEqual(100)
  })

  it('soft-fails with empty suggestions when loading household tags throws', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.mocked(loadHouseholdTagNames).mockRejectedValue(new Error('db down'))
    const res = await POST(req({ title: 'Burrito' }))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual(EMPTY)
    expect(spy).toHaveBeenCalledWith('[tags/suggest] failed', expect.any(Error))
    spy.mockRestore()
  })

  it('returns empty suggestions without calling AI when the flag is off', async () => {
    vi.stubEnv('TAG_SUGGEST_USE_AI', 'false')
    const res = await POST(req({ title: 'Burrito' }))
    expect(await res.json()).toEqual(EMPTY)
    expect(suggestTags).not.toHaveBeenCalled()
  })

  it('returns empty suggestions for an empty title', async () => {
    const res = await POST(req({ title: '   ', ingredientNames: ['beef'] }))
    expect(await res.json()).toEqual(EMPTY)
    expect(suggestTags).not.toHaveBeenCalled()
  })

  it('returns empty suggestions when the user has no household', async () => {
    householdIdMock.mockResolvedValue(null)
    const res = await POST(req({ title: 'Burrito' }))
    expect(await res.json()).toEqual(EMPTY)
    expect(suggestTags).not.toHaveBeenCalled()
  })

  it('suggests with server-side tags and language, ignoring non-string ingredients', async () => {
    const res = await POST(req({ title: ' Burrito ', ingredientNames: ['tortilla', 3, ' ', 'beef'] }))
    expect(await res.json()).toEqual({ existing: ['dinner'], new: 'mexické' })
    expect(suggestTags).toHaveBeenCalledWith({
      title: 'Burrito',
      ingredientNames: ['tortilla', 'beef'],
      householdTags: ['dinner', 'pasta'],
      language: 'sk',
      householdId: 'hh-1',
    })
  })
})
