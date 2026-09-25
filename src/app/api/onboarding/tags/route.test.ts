// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const mocks = vi.hoisted(() => ({
  groupUpserts: [] as unknown[],
  tagUpserts: [] as unknown[],
  groupDeletes: [] as unknown[],
  calls: [] as string[],
  rpc: vi.fn(),
  onboardingStep: 'tags' as string | null,
  existingGroups: [] as Array<{ id: string; name: string }>,
  existingTags: [] as Array<{ name: string }>,
  user: { id: 'user-1', email: null } as { id: string; email: null } | null,
}))

vi.mock('@/lib/auth/current-user', () => ({ getCurrentUser: vi.fn(async () => mocks.user) }))
vi.mock('@/lib/auth/household', async () => ({
  getCurrentHouseholdId: (await import('@/test/householdMock')).householdIdMock,
}))
vi.mock('@/lib/supabase/server', () => ({
  createClient: () => ({
    rpc: async (name: string, args: unknown) => {
      mocks.calls.push(`rpc:${name}`)
      return mocks.rpc(name, args)
    },
    from: (table: string) => ({
      select: () => ({
        eq: () => {
          if (table === 'households') {
            return { single: async () => ({ data: { onboarding_step: mocks.onboardingStep }, error: null }) }
          }
          const data = table === 'tag_groups' ? mocks.existingGroups : mocks.existingTags
          return Promise.resolve({ data, error: null })
        },
      }),
      delete: () => ({
        eq: () => ({
          in: async (_column: string, ids: unknown[]) => {
            mocks.calls.push(`delete:${table}`)
            mocks.groupDeletes.push(ids)
            return { error: null }
          },
        }),
      }),
      upsert: (rows: { name?: string }) => {
        mocks.calls.push(`upsert:${table}`)
        if (table === 'tag_groups') {
          mocks.groupUpserts.push(rows)
          return { select: () => ({ single: async () => ({ data: { id: `g-${rows.name}` }, error: null }) }) }
        }
        mocks.tagUpserts.push(rows)
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
  mocks.groupDeletes = []
  mocks.calls = []
  mocks.rpc.mockResolvedValue({ error: null })
  mocks.onboardingStep = 'tags'
  mocks.existingGroups = []
  mocks.existingTags = []
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

  it('removes saved tags and groups left out of the payload, before upserting the rest', async () => {
    mocks.existingGroups = [{ id: 'g-old-course', name: 'Course' }, { id: 'g-old-diet', name: 'Diet' }]
    mocks.existingTags = [{ name: 'Soup' }, { name: 'Dessert' }, { name: 'Vegan' }]

    const res = await post({ groups: [{ name: 'Course', tags: ['Soup'] }] })

    expect(res.status).toBe(201)
    expect(mocks.rpc.mock.calls).toEqual([
      ['delete_tag', { p_household_id: 'hh-1', p_name: 'Dessert' }],
      ['delete_tag', { p_household_id: 'hh-1', p_name: 'Vegan' }],
    ])
    expect(mocks.groupDeletes).toEqual([['g-old-diet']])
    expect(mocks.calls).toEqual([
      'rpc:delete_tag', 'rpc:delete_tag', 'delete:tag_groups', 'upsert:tag_groups', 'upsert:tags',
    ])
  })

  it('clears every onboarding tag when the payload is empty', async () => {
    mocks.existingGroups = [{ id: 'g-old-course', name: 'Course' }]
    mocks.existingTags = [{ name: 'Soup' }]

    const res = await post({ groups: [] })

    expect(res.status).toBe(201)
    expect(mocks.rpc).toHaveBeenCalledWith('delete_tag', { p_household_id: 'hh-1', p_name: 'Soup' })
    expect(mocks.groupDeletes).toEqual([['g-old-course']])
    expect(mocks.groupUpserts).toHaveLength(0)
  })

  it('fails when a tag cannot be removed', async () => {
    mocks.existingTags = [{ name: 'Soup' }]
    mocks.rpc.mockResolvedValue({ error: { message: 'boom' } })

    expect((await post({ groups: [] })).status).toBe(500)
  })

  it('refuses once onboarding is finished', async () => {
    mocks.onboardingStep = null
    mocks.existingTags = [{ name: 'Soup' }]

    const res = await post({ groups: [] })

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
