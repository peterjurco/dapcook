import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import type { User } from '@supabase/supabase-js'
import type { Profile } from '@/types/database'
import { AppShell } from './AppShell'

// Mock Next.js navigation
vi.mock('next/navigation', () => ({
  usePathname: () => '/recipes',
  useRouter: () => ({ push: vi.fn() }),
}))

// Mock Next.js Link
vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}))

const mockUser = { id: 'user-1', email: 'peter@example.com' } as User
const mockProfile = {
  id: 'user-1',
  display_name: 'Peter',
  household_id: 'hh-1',
  avatar_url: null,
  created_at: '',
  updated_at: '',
} as Profile

describe('AppShell', () => {
  it('renders Recipes nav link', () => {
    render(
      <AppShell user={mockUser} profile={mockProfile}>
        <div>content</div>
      </AppShell>
    )
    expect(screen.getAllByRole('link', { name: /recipes/i }).length).toBeGreaterThan(0)
  })

  it('renders Planner nav link', () => {
    render(
      <AppShell user={mockUser} profile={mockProfile}>
        <div>content</div>
      </AppShell>
    )
    expect(screen.getAllByRole('link', { name: /planner/i }).length).toBeGreaterThan(0)
  })

  it('renders Shopping nav link', () => {
    render(
      <AppShell user={mockUser} profile={mockProfile}>
        <div>content</div>
      </AppShell>
    )
    expect(screen.getAllByRole('link', { name: /shopping/i }).length).toBeGreaterThan(0)
  })

  it('renders children', () => {
    render(
      <AppShell user={mockUser} profile={mockProfile}>
        <div data-testid="page-content">hello</div>
      </AppShell>
    )
    expect(screen.getByTestId('page-content')).toBeInTheDocument()
  })
})
