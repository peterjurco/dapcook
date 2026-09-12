import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import type { User } from '@supabase/supabase-js'
import type { Profile } from '@/types/database'
import { AppShell } from './AppShell'
import { mockTranslate } from '@/test/mockMessages'

vi.mock('next-intl', () => ({
  useTranslations: (namespace: string) => (key: string) => mockTranslate(namespace, key),
}))

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

  it('renders Settings nav link', () => {
    render(
      <AppShell user={mockUser} profile={mockProfile}>
        <div>content</div>
      </AppShell>
    )
    expect(screen.getAllByRole('link', { name: /settings/i }).length).toBeGreaterThan(0)
  })

  it('renders Sign out button', () => {
    render(
      <AppShell user={mockUser} profile={mockProfile}>
        <div>content</div>
      </AppShell>
    )
    expect(screen.getByRole('button', { name: /sign out/i })).toBeInTheDocument()
  })

  it('falls back to translated alt text on the avatar image when display_name is missing', () => {
    const profileWithAvatarNoName = {
      ...mockProfile,
      display_name: null,
      avatar_url: 'https://example.com/avatar.png',
    } as Profile

    render(
      <AppShell user={mockUser} profile={profileWithAvatarNoName}>
        <div>content</div>
      </AppShell>
    )
    expect(screen.getByRole('img', { name: /user/i })).toBeInTheDocument()
  })

  it('renders children', () => {
    render(
      <AppShell user={mockUser} profile={mockProfile}>
        <div data-testid="page-content">hello</div>
      </AppShell>
    )
    expect(screen.getByTestId('page-content')).toBeInTheDocument()
  })

  it('shows Admin nav link when isAdmin is true', () => {
    render(
      <AppShell user={mockUser} profile={mockProfile} isAdmin={true}>
        <div>content</div>
      </AppShell>
    )
    expect(screen.getAllByRole('link', { name: /admin/i })).toHaveLength(2)
  })

  it('hides Admin nav link when isAdmin is false', () => {
    render(
      <AppShell user={mockUser} profile={mockProfile} isAdmin={false}>
        <div>content</div>
      </AppShell>
    )
    expect(screen.queryByRole('link', { name: /admin/i })).toBeNull()
  })

  it('hides Admin nav link when isAdmin is omitted', () => {
    render(
      <AppShell user={mockUser} profile={mockProfile}>
        <div>content</div>
      </AppShell>
    )
    expect(screen.queryByRole('link', { name: /admin/i })).toBeNull()
  })
})
