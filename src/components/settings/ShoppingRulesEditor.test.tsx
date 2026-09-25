import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { mockTranslate } from '@/test/mockMessages'
import { ShoppingRulesEditor } from './ShoppingRulesEditor'
import type { ShoppingRule } from '@/types/database'

vi.mock('next-intl', () => ({
  useTranslations: (namespace: string) => (key: string) => mockTranslate(namespace, key),
}))

global.fetch = vi.fn()

const existing = { id: 'r1', household_id: 'hh-1', rule: 'Merge onions', created_at: '' } as ShoppingRule

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(fetch).mockResolvedValue({
    ok: true,
    json: async () => ({ id: 'r2', household_id: 'hh-1', rule: 'Count eggs', created_at: '' }),
  } as Response)
})

describe('ShoppingRulesEditor suggestions', () => {
  it('adds a suggestion as a rule with one tap and stops offering it', async () => {
    render(<ShoppingRulesEditor initialRules={[]} suggestions={['Count eggs']} suggestionsLabel="Tap an example" />)
    fireEvent.click(screen.getByRole('button', { name: '+ Count eggs' }))
    await waitFor(() => expect(screen.queryByRole('button', { name: '+ Count eggs' })).not.toBeInTheDocument())
    expect(fetch).toHaveBeenCalledWith('/api/shopping/rules', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ rule: 'Count eggs' }),
    }))
    expect(screen.getByText('Count eggs')).toBeInTheDocument()
  })

  it('does not offer suggestions that are already rules', () => {
    render(<ShoppingRulesEditor initialRules={[existing]} suggestions={['Merge onions']} suggestionsLabel="Tap an example" />)
    expect(screen.queryByText('Tap an example')).not.toBeInTheDocument()
  })

  it('renders no suggestions by default (settings page)', () => {
    render(<ShoppingRulesEditor initialRules={[existing]} />)
    expect(screen.queryByRole('button', { name: /^\+ / })).not.toBeInTheDocument()
  })
})
