// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

type TagRow = { name: string; group_id: string | null }
type GroupRow = { id: string; name: string }

// A tiny in-memory model of the household's tags, so tests assert what is left
// afterwards rather than the exact queries.
const mocks = vi.hoisted(() => ({
  groupUpserts: [] as unknown[],
  tagUpserts: [] as unknown[],
  rpc: vi.fn(),
  household: { onboarding_step: 'tags', created_by: 'user-1' } as { onboarding_step: string | null; created_by: string | null },
  groups: [] as GroupRow[],
  tags: [] as TagRow[],
  user: { id: 'user-1', email: null } as { id: string; email: null } | null,
}))

vi.mock('@/lib/auth/current-user', () => ({ getCurrentUser: vi.fn(async () => mocks.user) }))
vi.mock('@/lib/auth/household', async () => ({
  getCurrentHouseholdId: (await import('@/test/householdMock')).householdIdMock,
}))
vi.mock('@/lib/supabase/server', () => ({
  createClient: () => ({
    rpc: async (name: string, args: { p_name: string }) => {
      const result = await mocks.rpc(name, args)
      if (name === 'delete_tag' && !result?.error) mocks.tags = mocks.tags.filter((t) => t.name !== args.p_name)
      return result
    },
    from: (table: string) => ({
      select: () => ({
        eq: () => {
          if (table === 'households') return { single: async () => ({ data: mocks.household, error: null }) }
          return {
            in: async (column: string, values: string[]) => {
              if (table === 'tag_groups') return { data: mocks.groups.filter((g) => values.includes(g.name)), error: null }
              return { data: mocks.tags.filter((t) => values.includes(t[column as 'group_id'] ?? '')), error: null }
            },
          }
        },
      }),
      delete: () => ({
        eq: () => ({
          in: async (_column: string, ids: string[]) => {
            mocks.groups = mocks.groups.filter((g) => !ids.includes(g.id))
            return { error: null }
          },
        }),
      }),
      upsert: (rows: GroupRow | TagRow[]) => {
        if (table === 'tag_groups') {
          const row = rows as GroupRow
          mocks.groupUpserts.push(rows)
          if (!mocks.groups.some((g) => g.name === row.name)) mocks.groups.push({ id: `g-${row.name}`, name: row.name })
          return { select: () => ({ single: async () => ({ data: { id: `g-${row.name}` }, error: null }) }) }
        }
        mocks.tagUpserts.push(rows)
        for (const row of rows as TagRow[]) {
          mocks.tags = [...mocks.tags.filter((t) => t.name !== row.name), { name: row.name, group_id: row.group_id }]
        }
        return Promise.resolve({ error: null })
      },
    }),
  }),
}))

import { POST } from './route'
import { householdIdMock } from '@/test/householdMock'

function post(body: unknown) {
  return POST(new NextRequest('http://localhost/api/onboarding/tags', { method: 'POST', body: JSON.stringify(body) }))
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.groupUpserts = []
  mocks.tagUpserts = []
  mocks.rpc.mockResolvedValue({ error: null })
  mocks.household = { onboarding_step: 'tags', created_by: 'user-1' }
  mocks.groups = []
  mocks.tags = []
  mocks.user = { id: 'user-1', email: null }
  householdIdMock.mockResolvedValue('hh-1')
})

describe('POST /api/onboarding/tags', () => {
  it('creates each group with its tags, positioned in the order given', async () => {
    const res = await post({ groups: [
      { name: 'Course', tags: ['Soup', 'Dessert'] },
      { name: 'Diet', tags: ['Vegan'] },
    ] })
    expect(res.status).toBe(201)
    expect(mocks.groupUpserts).toEqual([
      { household_id: 'hh-1', name: 'Course', position: 0 },
      { household_id: 'hh-1', name: 'Diet', position: 1 },
    ])
    expect(mocks.tagUpserts).toEqual([
      [
        { household_id: 'hh-1', name: 'Soup', group_id: 'g-Course' },
        { household_id: 'hh-1', name: 'Dessert', group_id: 'g-Course' },
      ],
      [{ household_id: 'hh-1', name: 'Vegan', group_id: 'g-Diet' }],
    ])
  })

  it('skips groups left empty and keeps a tag in the first group that claims it', async () => {
    await post({ groups: [
      { name: 'Course', tags: ['Soup'] },
      { name: 'Diet', tags: [] },
      { name: 'Custom', tags: ['Soup', ' '] },
    ] })
    expect(mocks.groupUpserts).toHaveLength(1)
  })

  it('rejects a malformed body', async () => {
    expect((await post({ groups: 'nope' })).status).toBe(400)
    expect((await post({ groups: [{ name: '', tags: ['x'] }] })).status).toBe(400)
  })

  it('rejects a group name longer than 50 characters', async () => {
    const res = await post({ groups: [{ name: 'x'.repeat(51), tags: ['Soup'] }] })
    expect(res.status).toBe(400)
    expect(mocks.groupUpserts).toHaveLength(0)
  })

  it('rejects a tag name longer than 50 characters', async () => {
    const res = await post({ groups: [{ name: 'Course', tags: ['x'.repeat(51)] }] })
    expect(res.status).toBe(400)
    expect(mocks.groupUpserts).toHaveLength(0)
  })

  it('accepts names at exactly 50 characters', async () => {
    const res = await post({ groups: [{ name: 'x'.repeat(50), tags: ['y'.repeat(50)] }] })
    expect(res.status).toBe(201)
  })

  it('rejects more than 10 groups', async () => {
    const groups = Array.from({ length: 11 }, (_, i) => ({ name: `Group ${i}`, tags: ['Soup'] }))
    const res = await post({ groups })
    expect(res.status).toBe(400)
    expect(mocks.groupUpserts).toHaveLength(0)
  })

  it('accepts exactly 10 groups', async () => {
    const groups = Array.from({ length: 10 }, (_, i) => ({ name: `Group ${i}`, tags: ['Soup'] }))
    const res = await post({ groups })
    expect(res.status).toBe(201)
  })

  it('rejects more than 100 tags in total', async () => {
    const groups = [
      { name: 'A', tags: Array.from({ length: 60 }, (_, i) => `a${i}`) },
      { name: 'B', tags: Array.from({ length: 41 }, (_, i) => `b${i}`) },
    ]
    const res = await post({ groups })
    expect(res.status).toBe(400)
    expect(mocks.groupUpserts).toHaveLength(0)
  })

  it('accepts exactly 100 tags in total', async () => {
    const groups = [
      { name: 'A', tags: Array.from({ length: 60 }, (_, i) => `a${i}`) },
      { name: 'B', tags: Array.from({ length: 40 }, (_, i) => `b${i}`) },
    ]
    const res = await post({ groups })
    expect(res.status).toBe(201)
  })

  it('removes only previously saved tags and groups that were deselected', async () => {
    mocks.groups = [{ id: 'g-Course', name: 'Course' }, { id: 'g-Diet', name: 'Diet' }]
    mocks.tags = [
      { name: 'Soup', group_id: 'g-Course' },
      { name: 'Dessert', group_id: 'g-Course' },
      { name: 'Vegan', group_id: 'g-Diet' },
    ]

    const res = await post({
      groups: [{ name: 'Course', tags: ['Soup'] }],
      previous: [{ name: 'Course', tags: ['Soup', 'Dessert'] }, { name: 'Diet', tags: ['Vegan'] }],
    })

    expect(res.status).toBe(201)
    expect(mocks.rpc.mock.calls).toEqual([
      ['delete_tag', { p_household_id: 'hh-1', p_name: 'Dessert' }],
      ['delete_tag', { p_household_id: 'hh-1', p_name: 'Vegan' }],
    ])
    expect(mocks.tags.map((t) => t.name)).toEqual(['Soup'])
    expect(mocks.groups.map((g) => g.name)).toEqual(['Course'])
  })

  it('keeps tags not created by the wizard', async () => {
    mocks.groups = [{ id: 'g-Course', name: 'Course' }, { id: 'g-Mine', name: 'Mine' }]
    mocks.tags = [
      { name: 'Soup', group_id: 'g-Course' },
      { name: 'grandma', group_id: 'g-Mine' },
      { name: 'loose', group_id: null },
    ]

    const res = await post({ groups: [], previous: [{ name: 'Course', tags: ['Soup'] }] })

    expect(res.status).toBe(201)
    expect(mocks.rpc).toHaveBeenCalledTimes(1)
    expect(mocks.tags.map((t) => t.name)).toEqual(['grandma', 'loose'])
    expect(mocks.groups.map((g) => g.name)).toEqual(['Mine'])
  })

  it('keeps a deselected group that still holds someone else\'s tags', async () => {
    mocks.groups = [{ id: 'g-Diet', name: 'Diet' }]
    mocks.tags = [{ name: 'Vegan', group_id: 'g-Diet' }, { name: 'Paleo', group_id: 'g-Diet' }]

    await post({ groups: [], previous: [{ name: 'Diet', tags: ['Vegan'] }] })

    expect(mocks.tags.map((t) => t.name)).toEqual(['Paleo'])
    expect(mocks.groups.map((g) => g.name)).toEqual(['Diet'])
  })

  it('removes a deselected group once a tag moved out of it', async () => {
    mocks.groups = [{ id: 'g-Diet', name: 'Diet' }]
    mocks.tags = [{ name: 'Paleo', group_id: 'g-Diet' }]

    await post({ groups: [{ name: 'Course', tags: ['Paleo'] }], previous: [{ name: 'Diet', tags: ['Paleo'] }] })

    expect(mocks.rpc).not.toHaveBeenCalled()
    expect(mocks.tags).toEqual([{ name: 'Paleo', group_id: 'g-Course' }])
    expect(mocks.groups.map((g) => g.name)).toEqual(['Course'])
  })

  it('deletes nothing without a previous selection', async () => {
    mocks.groups = [{ id: 'g-Course', name: 'Course' }]
    mocks.tags = [{ name: 'Dessert', group_id: 'g-Course' }]

    await post({ groups: [{ name: 'Course', tags: ['Soup'] }] })

    expect(mocks.rpc).not.toHaveBeenCalled()
    expect(mocks.tags.map((t) => t.name)).toEqual(['Dessert', 'Soup'])
  })

  it('validates the previous selection like the new one', async () => {
    expect((await post({ groups: [], previous: 'nope' })).status).toBe(400)
    expect((await post({ groups: [], previous: [{ name: 'x'.repeat(51), tags: ['Soup'] }] })).status).toBe(400)
    expect(mocks.rpc).not.toHaveBeenCalled()
  })

  it('fails when a tag cannot be removed', async () => {
    mocks.tags = [{ name: 'Soup', group_id: null }]
    mocks.rpc.mockResolvedValue({ error: { message: 'boom' } })

    expect((await post({ groups: [], previous: [{ name: 'Course', tags: ['Soup'] }] })).status).toBe(500)
  })

  it('refuses once onboarding is finished', async () => {
    mocks.household = { onboarding_step: null, created_by: 'user-1' }
    mocks.tags = [{ name: 'Soup', group_id: null }]

    const res = await post({ groups: [], previous: [{ name: 'Course', tags: ['Soup'] }] })

    expect(res.status).toBe(409)
    expect(mocks.rpc).not.toHaveBeenCalled()
    expect(mocks.groupUpserts).toHaveLength(0)
  })

  it('requires a signed-in user with a household', async () => {
    mocks.user = null
    expect((await post({ groups: [] })).status).toBe(401)
    mocks.user = { id: 'user-1', email: null }
    householdIdMock.mockResolvedValue(null)
    expect((await post({ groups: [] })).status).toBe(403)
  })
})
