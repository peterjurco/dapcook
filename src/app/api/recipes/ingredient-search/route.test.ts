// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { GET } from './route'
import { mockTranslate } from '@/test/mockMessages'

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('next-intl/server', () => ({
  getTranslations: async ({ namespace }: { namespace: string }) => (key: string) => mockTranslate(namespace, key),
}))
import { createClient } from '@/lib/supabase/server'
import { authMock } from '@/test/authMock'

const rows = [
  { id: 'r1', ingredients: [{ id: 'i1', quantity: 2, unit: 'strúčik', name: 'Česnak', notes: '' }] },
  { id: 'r2', ingredients: [{ id: 'i2', quantity: 1, unit: 'garlic press', name: 'Butter', notes: 'garlic butter' }] },
  { id: 'r3', ingredients: null },
]

function makeSupabase(user: { id: string } | null, result: { data: unknown; error: null | { message: string } } = { data: rows, error: null }) {
  const qb = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    then: (ok?: (v: unknown) => unknown, fail?: (r: unknown) => unknown) => Promise.resolve(result).then(ok, fail),
  }
  return { client: { auth: authMock(user), from: vi.fn(() => qb) }, qb }
}

function get(q: string) {
  return GET(new NextRequest(`http://localhost/api/recipes/ingredient-search?q=${encodeURIComponent(q)}`))
}

beforeEach(() => vi.clearAllMocks())

describe('GET /api/recipes/ingredient-search', () => {
  it('returns 401 when unauthenticated', async () => {
    vi.mocked(createClient).mockReturnValue(makeSupabase(null).client as unknown as ReturnType<typeof createClient>)
    expect((await get('garlic')).status).toBe(401)
  })

  it('returns 400 for a term shorter than two characters', async () => {
    vi.mocked(createClient).mockReturnValue(makeSupabase({ id: 'u1' }).client as unknown as ReturnType<typeof createClient>)
    expect((await get(' c ')).status).toBe(400)
  })

  it('matches ingredient names ignoring case and diacritics, and only non-archived recipes', async () => {
    const { client, qb } = makeSupabase({ id: 'u1' })
    vi.mocked(createClient).mockReturnValue(client as unknown as ReturnType<typeof createClient>)

    const res = await get('CESNAK')
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ids: ['r1'] })
    expect(client.from).toHaveBeenCalledWith('recipes')
    expect(qb.select).toHaveBeenCalledWith('id, ingredients')
    expect(qb.eq).toHaveBeenCalledWith('is_archived', false)
  })

  it('matches the name only, not the unit or notes', async () => {
    vi.mocked(createClient).mockReturnValue(makeSupabase({ id: 'u1' }).client as unknown as ReturnType<typeof createClient>)
    expect(await (await get('garlic')).json()).toEqual({ ids: [] })
  })

  it('matches a diacritics-free query against an accented ingredient name', async () => {
    vi.mocked(createClient).mockReturnValue(makeSupabase({ id: 'u1' }).client as unknown as ReturnType<typeof createClient>)
    expect(await (await get('česnak')).json()).toEqual({ ids: ['r1'] })
  })

  it('skips malformed rows instead of throwing', async () => {
    const malformedRows = [
      { id: 'bad1', ingredients: {} },
      { id: 'bad2', ingredients: [null, { name: 42 }] },
      { id: 'good', ingredients: [{ id: 'i1', quantity: 1, unit: 'ks', name: 'Garlic', notes: '' }] },
    ]
    vi.mocked(createClient).mockReturnValue(
      makeSupabase({ id: 'u1' }, { data: malformedRows, error: null }).client as unknown as ReturnType<typeof createClient>
    )
    const res = await get('garlic')
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ids: ['good'] })
  })

  it('returns 500 when the query fails', async () => {
    vi.mocked(createClient).mockReturnValue(
      makeSupabase({ id: 'u1' }, { data: null, error: { message: 'boom' } }).client as unknown as ReturnType<typeof createClient>
    )
    expect((await get('garlic')).status).toBe(500)
  })
})
