import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import OnboardingPage from './page'
import { mockTranslate } from '@/test/mockMessages'
import type { TranslationValues } from 'use-intl'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}))

vi.mock('@/lib/auth/actions', () => ({
  createHousehold: vi.fn(),
  joinHousehold: vi.fn(),
}))

vi.mock('next-intl', () => ({
  useTranslations: (namespace: string) => (key: string, values?: TranslationValues) =>
    mockTranslate(namespace, key, values),
}))

describe('OnboardingPage', () => {
  it('renders create household option', () => {
    render(<OnboardingPage />)
    expect(screen.getByRole('heading', { name: /create household/i })).toBeInTheDocument()
  })

  it('renders join household option', () => {
    render(<OnboardingPage />)
    expect(screen.getByRole('heading', { name: /join household/i })).toBeInTheDocument()
  })

  it('renders household name input for create flow', () => {
    render(<OnboardingPage />)
    expect(
      screen.getByLabelText(/household name/i)
    ).toBeInTheDocument()
  })

  it('renders invite token input for join flow', () => {
    render(<OnboardingPage />)
    expect(
      screen.getByLabelText(/invite.*code/i)
    ).toBeInTheDocument()
  })
})
