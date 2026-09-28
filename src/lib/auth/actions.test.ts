// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'

const mocks = vi.hoisted(() => ({
  inserts: {} as Record<string, unknown[]>,
  rpc: vi.fn(),
  uiLanguage: 'sk' as string,
}))

vi.mock('next/navigation', () => ({
  redirect: vi.fn((url: string) => { throw new Error(`REDIRECT:${url}`) }),
}))
vi.mock('next/headers', () => ({ cookies: vi.fn(), headers: vi.fn() }))
vi.mock('@/lib/auth/getOrigin', () => ({ getOrigin: () => 'http://localhost:3000' }))
vi.mock('@/lib/auth/current-user', () => ({ getCurrentUser: vi.fn(async () => ({ id: 'user-1', email: null })) }))
vi.mock('@/lib/auth/household', () => ({ forgetHouseholdId: vi.fn() }))
vi.mock('@/i18n/server-utils', () => ({ getUserTranslations: vi.fn(async () => (key: string) => key) }))
vi.mock('@/lib/supabase/server', () => ({
  createClient: () => ({
    from: (table: string) => ({
      select: () => ({ eq: () => ({ single: async () => ({ data: { ui_language: mocks.uiLanguage }, error: null }) }) }),
      insert: async (rows: unknown) => {
        (mocks.inserts[table] ??= []).push(rows)
        return { error: null }
      },
      update: () => ({ eq: async () => ({ error: null }) }),
    }),
    rpc: mocks.rpc,
  }),
}))

import { createHousehold, joinHousehold } from './actions'

const token = 'b'.repeat(32)

beforeEach(() => {
  vi.clearAllMocks()
  mocks.inserts = {}
  mocks.uiLanguage = 'sk'
  mocks.rpc.mockResolvedValue({ data: [{ id: 'hh-9', name: 'Home' }], error: null })
})

describe('createHousehold', () => {
  it('starts the wizard at the translation step and sends the user back to it', async () => {
    await expect(createHousehold('  Home  ')).rejects.toThrow('REDIRECT:/onboarding')
    expect(mocks.inserts.households[0]).toMatchObject({ name: 'Home', onboarding_step: 'translation', created_by: 'user-1' })
  })

  it('seeds the default shopping categories in the UI language, in order', async () => {
    await expect(createHousehold('Home')).rejects.toThrow()
    const categories = mocks.inserts.shopping_categories[0] as Array<{ name: string; sort_order: number }>
    expect(categories).toHaveLength(9)
    expect(categories[0]).toMatchObject({ name: 'Ovocie a zelenina', sort_order: 0 })
    expect(categories[8]).toMatchObject({ name: 'Nápoje', sort_order: 8 })
  })

  it('rejects a blank name', async () => {
    expect(await createHousehold('   ')).toEqual({ error: 'createHouseholdFailed' })
    expect(mocks.inserts.households).toBeUndefined()
  })
})

describe('joinHousehold', () => {
  it('accepts a pasted invite link and reports a join to analytics', async () => {
    await expect(joinHousehold(`https://dapcook.vercel.app/join/${token}`)).rejects.toThrow(
      'REDIRECT:/recipes?ob=1&obm=join'
    )
    expect(mocks.rpc).toHaveBeenCalledWith('get_household_by_invite_token', { token })
  })

  it('rejects input that is not an invite without looking anything up', async () => {
    expect(await joinHousehold('not a link')).toEqual({ error: 'invalidInviteCode' })
    expect(mocks.rpc).not.toHaveBeenCalled()
  })
})
