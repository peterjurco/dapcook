// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))

import { createClient } from '@/lib/supabase/server'
import { POST } from './route'

const itemId = '11111111-1111-4111-8111-111111111111'

function makeSupabase() {
  const createdItem = {
    id: itemId,
    shopping_list_id: 'list-1',
    name: 'Milk',
    quantity: null,
    unit: null,
    category: null,
    is_checked: false,
    sort_order: 0,
    source_recipe_ids: [],
  }
  const insert = vi.fn().mockReturnValue({
    select: vi.fn().mockReturnValue({
      single: vi.fn().mockResolvedValue({ data: createdItem, error: null }),
    }),
  })
  const fromMap = {
    profiles: {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: { household_id: 'hh-1' } }),
    },
    shopping_lists: {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: { id: 'list-1' } }),
    },
    shopping_items: {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: null }),
      insert,
    },
  }

  return {
    insert,
    client: {
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'user-1' } } }),
      },
      from: vi.fn((table: keyof typeof fromMap) => fromMap[table]),
    },
  }
}

function request(body: unknown) {
  return new NextRequest('http://localhost/api/shopping/items', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('POST /api/shopping/items', () => {
  it('persists and returns the client-generated item id', async () => {
    const { client, insert } = makeSupabase()
    vi.mocked(createClient).mockReturnValue(client as unknown as ReturnType<typeof createClient>)

    const response = await POST(request({
      id: itemId,
      list_id: 'list-1',
      name: 'Milk',
    }))

    expect(response.status).toBe(201)
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({ id: itemId }))
    await expect(response.json()).resolves.toMatchObject({ id: itemId })
  })

  it('rejects an invalid client-generated item id', async () => {
    const { client, insert } = makeSupabase()
    vi.mocked(createClient).mockReturnValue(client as unknown as ReturnType<typeof createClient>)

    const response = await POST(request({
      id: 'not-a-uuid',
      list_id: 'list-1',
      name: 'Milk',
    }))

    expect(response.status).toBe(400)
    expect(insert).not.toHaveBeenCalled()
  })
})
