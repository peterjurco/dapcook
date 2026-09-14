import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockGetCurrentProfile } = vi.hoisted(() => ({ mockGetCurrentProfile: vi.fn() }))

vi.mock('next-intl/server', () => ({
  getRequestConfig: (fn: unknown) => fn,
}))
vi.mock('@/lib/auth/current-user', () => ({ getCurrentProfile: mockGetCurrentProfile }))

import getConfig, { resolveRequestLocale } from './request'

type RequestConfig = (args: {
  locale: string | undefined
  requestLocale: Promise<string | undefined>
}) => Promise<{ locale: string; messages: Record<string, Record<string, unknown>> }>

beforeEach(() => {
  vi.clearAllMocks()
  mockGetCurrentProfile.mockResolvedValue(null)
})

describe('resolveRequestLocale', () => {
  it('prefers an explicit locale argument', async () => {
    mockGetCurrentProfile.mockResolvedValue({ ui_language: 'sk' })

    expect(await resolveRequestLocale('en', 'sk')).toBe('en')
    expect(mockGetCurrentProfile).not.toHaveBeenCalled()
  })

  it('falls back to the ambient request locale', async () => {
    expect(await resolveRequestLocale(undefined, 'sk')).toBe('sk')
    expect(mockGetCurrentProfile).not.toHaveBeenCalled()
  })

  // Layouts and pages render in parallel, so setRequestLocale() in a layout is
  // often not set yet when a page asks for translations
  it("falls back to the user's profile language when no locale is set", async () => {
    mockGetCurrentProfile.mockResolvedValue({ ui_language: 'sk' })

    expect(await resolveRequestLocale(undefined, undefined)).toBe('sk')
  })

  it('falls back to the profile language when the requested locale is unsupported', async () => {
    mockGetCurrentProfile.mockResolvedValue({ ui_language: 'sk' })

    expect(await resolveRequestLocale('fr', undefined)).toBe('sk')
  })

  it('defaults to en when the profile has no usable language', async () => {
    mockGetCurrentProfile.mockResolvedValue({ ui_language: 'fr' })
    expect(await resolveRequestLocale(undefined, undefined)).toBe('en')

    mockGetCurrentProfile.mockResolvedValue({ ui_language: null })
    expect(await resolveRequestLocale(undefined, undefined)).toBe('en')
  })

  it('defaults to en when nobody is signed in', async () => {
    expect(await resolveRequestLocale(undefined, undefined)).toBe('en')
  })
})

describe('request config', () => {
  it('loads messages for the profile language', async () => {
    mockGetCurrentProfile.mockResolvedValue({ ui_language: 'sk' })

    const config = await (getConfig as unknown as RequestConfig)({
      locale: undefined,
      requestLocale: Promise.resolve(undefined),
    })

    expect(config.locale).toBe('sk')
    expect(config.messages.recipes.view).toMatchObject({ ingredients: 'Suroviny' })
  })

  it('loads English messages when no profile language is set', async () => {
    const config = await (getConfig as unknown as RequestConfig)({
      locale: undefined,
      requestLocale: Promise.resolve(undefined),
    })

    expect(config.locale).toBe('en')
    expect(config.messages.recipes.view).toMatchObject({ ingredients: 'Ingredients' })
  })
})
