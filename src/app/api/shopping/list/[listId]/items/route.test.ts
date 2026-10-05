// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('@/lib/auth/household', async () => ({
  getCurrentHouseholdId: (await import('@/test/householdMock')).householdIdMock,
}))

import { createClient } from '@/lib/supabase/server'
import { DELETE } from './route'
import { authMock } from '@/test/authMock'
import { householdIdMock } from '@/test/householdMock'

const listUpdateEq = vi.fn().mockResolvedValue({ error: null })
const listUpdate = vi.fn().mockReturnValue({ eq: listUpdateEq })

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
      update: listUpdate,
    },
    shopping_items: {
      delete: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
    },
  }
  return {
    auth: authMock(user),
    from: vi.fn((table: string) => fromMap[table]),
  }
}

function req() {
  return new NextRequest('http://localhost/api/shopping/list/list-1/items', { method: 'DELETE' })
}

beforeEach(() => {
  vi.clearAllMocks()
  householdIdMock.mockResolvedValue('hh-1')
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

  it('forgets which weeks were added, so the next add does not ask', async () => {
    await DELETE(req(), { params: { listId: 'list-1' } })
    expect(listUpdate).toHaveBeenCalledWith({ generated_weeks: [] })
    expect(listUpdateEq).toHaveBeenCalledWith('id', 'list-1')
  })

  it('still returns 204 when resetting the weeks fails', async () => {
    listUpdateEq.mockResolvedValueOnce({ error: { message: 'column does not exist' } })
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const res = await DELETE(req(), { params: { listId: 'list-1' } })
    expect(res.status).toBe(204)
  })
})
