import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { useLocale } from 'next-intl'
import FlowLayout from './layout'
import { authMock } from '@/test/authMock'

const mocks = vi.hoisted(() => ({
  profile: { ui_language: 'en' } as Record<string, unknown>,
  TourProvider: vi.fn(({ children }: { children: unknown }) => children),
}))

vi.mock('@/components/tour/TourProvider', () => ({ TourProvider: mocks.TourProvider }))

vi.mock('@/lib/supabase/server', () => ({
  createClient: () => ({
    auth: authMock({ id: 'user-1' }),
    from: () => ({
      select: () => ({
        eq: () => ({
          single: async () => ({ data: mocks.profile, error: null }),
        }),
      }),
    }),
  }),
}))

vi.mock('next-intl/server', () => ({
  setRequestLocale: vi.fn(),
  getMessages: async () => ({ shopping: { generate: { heading: 'Generate shopping list' } } }),
}))

// Deliberately NOT mocking 'next-intl' itself: this test exists to catch a real
// regression where (flow)/layout.tsx rendered its children without a
// NextIntlClientProvider, so any real useLocale()/useTranslations() call
// under it threw as soon as the user navigated to /shopping/generate.
function LocaleProbe() {
  const locale = useLocale()
  return <span>locale:{locale}</span>
}

describe('FlowLayout', () => {
  beforeEach(() => {
    mocks.TourProvider.mockClear()
    mocks.profile = { ui_language: 'en' }
  })

  it('seeds TourProvider with the profile tours_seen', async () => {
    mocks.profile = { ui_language: 'en', tours_seen: ['plan-recipe'] }
    render(await FlowLayout({ children: <LocaleProbe /> }))
    expect(mocks.TourProvider.mock.calls[0][0]).toMatchObject({ initialSeen: ['plan-recipe'] })
  })

  it('falls back to an empty seen list when the profile has no tours_seen', async () => {
    render(await FlowLayout({ children: <LocaleProbe /> }))
    expect(mocks.TourProvider.mock.calls[0][0]).toMatchObject({ initialSeen: [] })
  })

  it('wraps children in a NextIntlClientProvider so next-intl hooks work', async () => {
    render(await FlowLayout({ children: <LocaleProbe /> }))
    expect(screen.getByText('locale:en')).toBeInTheDocument()
  })
})
