// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const mocks = vi.hoisted(() => ({ insert: vi.fn(), single: vi.fn() }))

vi.mock('@/lib/supabase/server', () => ({
  createClient: () => ({
    from: () => ({
      insert: (row: unknown) => {
        mocks.insert(row)
        return { select: () => ({ single: mocks.single }) }
      },
    }),
  }),
}))
vi.mock('@/lib/auth/current-user', () => ({ getCurrentUser: vi.fn(async () => ({ id: 'user-1' })) }))
vi.mock('@/lib/auth/household', () => ({
  getCurrentHouseholdId: vi.fn(async () => 'hh-1'),
  getHouseholdWeekStartDay: vi.fn(async () => 'sunday'),
}))

import { POST } from './route'

const post = (body: unknown) =>
  POST(new NextRequest('http://localhost/api/planner/slots', { method: 'POST', body: JSON.stringify(body) }))

beforeEach(() => {
  vi.clearAllMocks()
  mocks.single.mockResolvedValue({ data: { id: 'slot-1' }, error: null })
})

describe('POST /api/planner/slots', () => {
  it('creates a dated slot for the household', async () => {
    const res = await post({ date: '2026-09-30', recipe_id: 'r-1', span_days: 2 })
    expect(res.status).toBe(201)
    expect(mocks.insert).toHaveBeenCalledWith(
      expect.objectContaining({ household_id: 'hh-1', date: '2026-09-30', span_days: 2, recipe_id: 'r-1' }),
    )
  })

  it('rejects a missing or malformed date', async () => {
    expect((await post({ recipe_id: 'r-1' })).status).toBe(400)
    expect((await post({ date: '2026-02-30', recipe_id: 'r-1' })).status).toBe(400)
  })

  it('rejects a meal that would run past the end of the week', async () => {
    // Saturday is the last day of a Sunday week.
    expect((await post({ date: '2026-10-03', recipe_id: 'r-1', span_days: 2 })).status).toBe(400)
    expect(mocks.insert).not.toHaveBeenCalled()
  })

  it('requires a recipe or a custom label', async () => {
    expect((await post({ date: '2026-09-30' })).status).toBe(400)
  })
})
