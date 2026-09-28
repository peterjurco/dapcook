// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const mocks = vi.hoisted(() => ({ update: vi.fn(), current: vi.fn(), updated: vi.fn() }))

vi.mock('@/lib/supabase/server', () => ({
  createClient: () => ({
    from: () => ({
      select: () => ({ eq: () => ({ single: mocks.current }) }),
      update: (values: unknown) => {
        mocks.update(values)
        return { eq: () => ({ select: () => ({ single: mocks.updated }) }) }
      },
    }),
  }),
}))
vi.mock('@/lib/auth/current-user', () => ({ getCurrentUser: vi.fn(async () => ({ id: 'user-1' })) }))
vi.mock('@/lib/auth/household', () => ({ getHouseholdWeekStartDay: vi.fn(async () => 'sunday') }))

import { PUT } from './route'

const put = (body: unknown) =>
  PUT(new NextRequest('http://localhost/api/planner/slots/s-1', { method: 'PUT', body: JSON.stringify(body) }), {
    params: { id: 's-1' },
  })

beforeEach(() => {
  vi.clearAllMocks()
  mocks.updated.mockResolvedValue({ data: { id: 's-1' }, error: null })
})

describe('PUT /api/planner/slots/[id]', () => {
  it('moves a meal to another date inside the week', async () => {
    mocks.current.mockResolvedValue({ data: { date: '2026-09-28', span_days: 2 } })
    expect((await put({ date: '2026-09-30' })).status).toBe(200)
    expect(mocks.update).toHaveBeenCalledWith({ date: '2026-09-30' })
  })

  it('rejects a move that would straddle the week edge', async () => {
    mocks.current.mockResolvedValue({ data: { date: '2026-09-28', span_days: 2 } })
    expect((await put({ date: '2026-10-03' })).status).toBe(400)
    expect(mocks.update).not.toHaveBeenCalled()
  })

  it('lets a legacy straddling meal be shortened to fit', async () => {
    mocks.current.mockResolvedValue({ data: { date: '2026-10-03', span_days: 3 } })
    expect((await put({ span_days: 1 })).status).toBe(200)
  })

  it('does not validate updates that leave date and span alone', async () => {
    expect((await put({ custom_label: 'Takeaway' })).status).toBe(200)
    expect(mocks.current).not.toHaveBeenCalled()
  })
})
