// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))

import { createClient } from '@/lib/supabase/server'
import { DELETE } from './route'

function makeSupabase(
  user: { id: string } | null = { id: 'user-1' },
  list: { id: string } | null = { id: 'list-1' }
) {
  const fromMap: Record<string, unknown> = {
    profiles: {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: user ? { household_id: 'hh-1' } : null }),
    },
    shopping_lists: {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: list }),
    },
    shopping_items: {
      delete: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
    },
  }
  return {
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user } }) },
    from: vi.fn((table: string) => fromMap[table]),
  }
}

function req() {
  return new NextRequest('http://localhost/api/shopping/list/list-1/items', { method: 'DELETE' })
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(createClient).mockReturnValue(makeSupabase() as unknown as ReturnType<typeof createClient>)
})

describe('DELETE /api/shopping/list/[listId]/items', () => {
  it('returns 401 when unauthenticated', async () => {
    vi.mocked(createClient).mockReturnValue(makeSupabase(null) as unknown as ReturnType<typeof createClient>)
    const res = await DELETE(req(), { params: { listId: 'list-1' } })
    expect(res.status).toBe(401)
  })

  it('returns 404 when list does not belong to household', async () => {
    vi.mocked(createClient).mockReturnValue(makeSupabase({ id: 'user-1' }, null) as unknown as ReturnType<typeof createClient>)
    const res = await DELETE(req(), { params: { listId: 'list-1' } })
    expect(res.status).toBe(404)
  })

  it('deletes all items for the list and returns 204', async () => {
    const res = await DELETE(req(), { params: { listId: 'list-1' } })
    expect(res.status).toBe(204)
  })
})
