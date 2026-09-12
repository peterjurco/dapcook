import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { useLocale } from 'next-intl'
import FlowLayout from './layout'

vi.mock('@/lib/supabase/server', () => ({
  createClient: () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'user-1' } } }) },
    from: () => ({
      select: () => ({
        eq: () => ({
          single: async () => ({ data: { ui_language: 'en' }, error: null }),
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
// under it threw as soon as the user navigated to /shopping/generate or
// /shopping/review.
function LocaleProbe() {
  const locale = useLocale()
  return <span>locale:{locale}</span>
}

describe('FlowLayout', () => {
  it('wraps children in a NextIntlClientProvider so next-intl hooks work', async () => {
    render(await FlowLayout({ children: <LocaleProbe /> }))
    expect(screen.getByText('locale:en')).toBeInTheDocument()
  })
})
