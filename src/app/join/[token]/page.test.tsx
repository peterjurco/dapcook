import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import JoinPage from './page'
import { mockTranslate } from '@/test/mockMessages'

vi.mock('next-intl/server', () => ({
  getLocale: async () => 'en',
  getTranslations: async (arg: string | { namespace: string }) => {
    const namespace = typeof arg === 'string' ? arg : arg.namespace
    return (key: string) => mockTranslate(namespace, key)
  },
}))

vi.mock('@/lib/auth/actions', () => ({
  signInWithGoogleForJoin: vi.fn(),
}))

const rpcMock = vi.fn()

vi.mock('@/lib/supabase/server', () => ({
  createClient: () => ({
    rpc: (...args: unknown[]) => rpcMock(...args),
  }),
}))

describe('JoinPage', () => {
  it('shows the household name and a sign-in button when the invite is valid', async () => {
    rpcMock.mockResolvedValueOnce({
      data: [{ name: 'The Jurcos', members: [] }],
    })

    render(await JoinPage({ params: { token: 'token-1' } }))

    expect(screen.getByText('The Jurcos')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /sign in with google to accept/i })).toBeInTheDocument()
  })

  it('shows the expired error when the invite is invalid', async () => {
    rpcMock.mockResolvedValueOnce({ data: null })

    render(await JoinPage({ params: { token: 'bad-token' } }))

    expect(screen.getByText(/invite link is invalid or has expired/i)).toBeInTheDocument()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })
})
