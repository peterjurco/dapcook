import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import LoginPage from './page'
import { mockTranslate } from '@/test/mockMessages'
import type { TranslationValues } from 'use-intl'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => ({ get: () => null }),
}))

// signInWithGoogle is a server action — mock it
vi.mock('@/lib/auth/actions', () => ({
  signInWithGoogle: vi.fn(),
}))

vi.mock('next-intl', () => ({
  useTranslations: (namespace: string) => (key: string, values?: TranslationValues) =>
    mockTranslate(namespace, key, values),
}))

describe('LoginPage', () => {
  it('renders sign in with Google button', () => {
    render(<LoginPage />)
    expect(
      screen.getByRole('button', { name: /sign in with google/i })
    ).toBeInTheDocument()
  })

  it('renders the app name', () => {
    render(<LoginPage />)
    expect(screen.getByText(/dapcook/i)).toBeInTheDocument()
  })
})
