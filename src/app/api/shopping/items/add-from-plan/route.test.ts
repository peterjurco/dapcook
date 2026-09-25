// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('@/lib/ai/make-shopping-list', () => ({ makeShoppingListSmart: vi.fn() }))
vi.mock('@/lib/auth/household', async () => ({
  getCurrentHouseholdId: (await import('@/test/householdMock')).householdIdMock,
}))

import { createClient } from '@/lib/supabase/server'
import { makeShoppingListSmart } from '@/lib/ai/make-shopping-list'
import { POST } from './route'
import { authMock } from '@/test/authMock'
import { householdIdMock } from '@/test/householdMock'

function makeSupabase({ categories = [] as { name: string; color: string | null }[] } = {}) {
  const itemsInsert = vi.fn().mockResolvedValue({ error: null })
  const categoriesInsert = vi.fn().mockResolvedValue({ error: null })
  const fromMap = {
    shopping_categories: {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({ data: categories }),
      insert: categoriesInsert,
    },
    shopping_rules: {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({ data: [{ rule: 'no plastic bags' }] }),
    },
    shopping_lists: {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: { id: 'list-1' } }),
    },
    shopping_items: {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: { sort_order: 4 } }),
      insert: itemsInsert,
    },
  }
  const client = {
    auth: authMock({ id: 'user-1' }),
    from: vi.fn((table: keyof typeof fromMap) => fromMap[table]),
  }
  vi.mocked(createClient).mockReturnValue(client as unknown as ReturnType<typeof createClient>)
  return { itemsInsert, categoriesInsert }
}

function request(body: unknown) {
  return new NextRequest('http://localhost/api/shopping/items/add-from-plan', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function listItem(p: { name: string; quantity: number | null; unit: string | null; category: string | null; sort_order: number }) {
  return { shopping_list_id: 'list-1', is_checked: false, source_recipe_ids: [], ...p }
}

beforeEach(() => {
  vi.clearAllMocks()
  householdIdMock.mockResolvedValue('hh-1')
})

describe('POST /api/shopping/items/add-from-plan', () => {
  it('merges ingredients with AI and appends them grouped by category, custom items last', async () => {
    const { itemsInsert } = makeSupabase({ categories: [{ name: 'Produce', color: null }, { name: 'Dairy', color: null }] })
    vi.mocked(makeShoppingListSmart).mockResolvedValue({
      items: [
        { name: 'milk', quantity: 1, unit: 'l', category: 'Dairy', source_recipe_ids: ['r1'] },
        { name: 'onion', quantity: 3, unit: '', category: 'Produce', source_recipe_ids: ['r1', 'r2'] },
      ],
      newCategories: [],
    })

    const res = await POST(request({
      ingredients: [
        { name: 'milk', quantity: 1, unit: 'l', recipe_id: 'r1' },
        { name: 'onion', quantity: 1, unit: null, recipe_id: 'r1' },
        { name: 'onion', quantity: 2, unit: null, recipe_id: 'r2' },
      ],
      customItems: [{ name: 'rice', portions: 2 }],
    }))

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ count: 3 })

    const [rawItems, , householdId, rules] = vi.mocked(makeShoppingListSmart).mock.calls[0]
    expect(rawItems.map((i) => [i.name, i.quantity, i.unit, i.source_recipe_ids])).toEqual([
      ['milk', 1, 'l', ['r1']],
      ['onion', 1, null, ['r1']],
      ['onion', 2, null, ['r2']],
    ])
    expect(householdId).toBe('hh-1')
    expect(rules).toEqual(['no plastic bags'])

    expect(itemsInsert).toHaveBeenCalledWith([
      listItem({ name: 'onion', quantity: 3, unit: null, category: 'Produce', sort_order: 5 }),
      listItem({ name: 'milk', quantity: 1, unit: 'l', category: 'Dairy', sort_order: 6 }),
      listItem({ name: 'rice', quantity: 2, unit: null, category: null, sort_order: 7 }),
    ])
  })

  it('saves categories invented by the AI', async () => {
    const { categoriesInsert } = makeSupabase()
    vi.mocked(makeShoppingListSmart).mockResolvedValue({
      items: [{ name: 'onion', quantity: 1, unit: '', category: 'Produce', source_recipe_ids: [] }],
      newCategories: [
        { id: 'tmp', household_id: 'hh-1', name: 'Produce', color: '#0a0', sort_order: 0, created_at: '2026-01-01T00:00:00Z' },
      ],
    })

    await POST(request({ ingredients: [{ name: 'onion', quantity: 1, unit: null, recipe_id: 'r1' }], customItems: [] }))

    expect(categoriesInsert).toHaveBeenCalledWith([{ household_id: 'hh-1', name: 'Produce', color: '#0a0', sort_order: 0 }])
  })

  it('appends custom meals verbatim without calling the AI', async () => {
    const { itemsInsert } = makeSupabase()

    const res = await POST(request({ ingredients: [], customItems: [{ name: ' rice ', portions: 3 }] }))

    expect(res.status).toBe(200)
    expect(makeShoppingListSmart).not.toHaveBeenCalled()
    expect(itemsInsert).toHaveBeenCalledWith([listItem({ name: 'rice', quantity: 3, unit: null, category: null, sort_order: 5 })])
  })

  it('returns 400 when nothing has a name', async () => {
    makeSupabase()
    const res = await POST(request({ ingredients: [{ name: '  ', quantity: 1, unit: null, recipe_id: 'r1' }], customItems: [] }))
    expect(res.status).toBe(400)
  })

  it('returns 500 and inserts nothing when the AI fails', async () => {
    const { itemsInsert } = makeSupabase()
    vi.mocked(makeShoppingListSmart).mockRejectedValue(new Error('boom'))
    vi.spyOn(console, 'error').mockImplementation(() => {})

    const res = await POST(request({ ingredients: [{ name: 'onion', quantity: 1, unit: null, recipe_id: 'r1' }], customItems: [] }))

    expect(res.status).toBe(500)
    expect(itemsInsert).not.toHaveBeenCalled()
  })

  it('returns 403 without a household', async () => {
    makeSupabase()
    householdIdMock.mockResolvedValue(null)
    const res = await POST(request({ ingredients: [], customItems: [{ name: 'rice', portions: 1 }] }))
    expect(res.status).toBe(403)
  })
})
