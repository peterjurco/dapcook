// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const mocks = vi.hoisted(() => ({
  slotFilters: [] as Array<[string, string, unknown]>,
  slots: [] as unknown[],
}))

function chain(table: string) {
  const q: Record<string, unknown> = {}
  const record = (op: string) => (col: string, val: unknown) => {
    if (table === 'meal_slots') mocks.slotFilters.push([op, col, val])
    return q
  }
  Object.assign(q, {
    select: () => q,
    eq: record('eq'),
    gte: record('gte'),
    lte: record('lte'),
    order: () => q,
    insert: () => q,
    maybeSingle: async () => ({ data: { id: 'wp-1', week_start: '2026-09-27' } }),
    single: async () => ({ data: { id: 'wp-1' } }),
    then: (resolve: (v: unknown) => void) =>
      resolve({ data: table === 'meal_slots' ? mocks.slots : [] }),
  })
  return q
}

vi.mock('@/lib/supabase/server', () => ({ createClient: () => ({ from: chain }) }))
vi.mock('@/lib/auth/current-user', () => ({ getCurrentUser: vi.fn(async () => ({ id: 'user-1' })) }))
vi.mock('@/lib/auth/household', () => ({
  getCurrentHouseholdId: vi.fn(async () => 'hh-1'),
  getHouseholdWeekStartDay: vi.fn(async () => 'sunday'),
}))

import { GET } from './route'

const slot = (id: string, date: string, span_days: number) => ({ id, date, span_days, household_id: 'hh-1' })

beforeEach(() => {
  mocks.slotFilters.length = 0
  mocks.slots = []
})

describe('GET /api/planner/week', () => {
  it('queries a window that can contain meals straddling into the week', async () => {
    await GET(new NextRequest('http://localhost/api/planner/week?week=2026-09-30'))
    expect(mocks.slotFilters).toEqual(
      expect.arrayContaining([
        ['eq', 'household_id', 'hh-1'],
        ['gte', 'date', '2026-09-21'],
        ['lte', 'date', '2026-10-03'],
      ]),
    )
  })

  it('returns only slots that overlap the week', async () => {
    mocks.slots = [
      slot('before', '2026-09-21', 3), // ends 09-23
      slot('into', '2026-09-26', 2), // Sat–Sun, reaches 09-27
      slot('inside', '2026-09-30', 1),
    ]
    const res = await GET(new NextRequest('http://localhost/api/planner/week?week=2026-09-27'))
    const body = await res.json()
    expect(body.slots.map((s: { id: string }) => s.id)).toEqual(['into', 'inside'])
  })
})
