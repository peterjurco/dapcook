import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import JoinInvalidPage from './page'
import { mockTranslate } from '@/test/mockMessages'

vi.mock('next-intl/server', () => ({
  getLocale: async () => 'en',
  getTranslations: async (arg: string | { namespace: string }) => {
    const namespace = typeof arg === 'string' ? arg : arg.namespace
    return (key: string) => mockTranslate(namespace, key)
  },
}))

vi.mock('next/link', () => ({
  default: ({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) => (
    <a href={href} className={className}>
      {children}
    </a>
  ),
}))

describe('JoinInvalidPage', () => {
  it('shows the invalid invite message and a link back to onboarding', async () => {
    render(await JoinInvalidPage())

    expect(screen.getByRole('heading', { name: /invalid invite link/i })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /back to onboarding/i })).toHaveAttribute('href', '/onboarding')
  })
})
