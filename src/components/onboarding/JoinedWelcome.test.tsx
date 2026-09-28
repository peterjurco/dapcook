import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import type { TranslationValues } from 'use-intl'
import { mockTranslate } from '@/test/mockMessages'
import { JoinedWelcome } from './JoinedWelcome'

const capture = vi.fn()
const push = vi.fn()
vi.mock('posthog-js/react', () => ({ usePostHog: () => ({ capture }) }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn(), push }) }))
vi.mock('next-intl', () => ({
  useTranslations: (namespace: string) => (key: string, values?: TranslationValues) =>
    mockTranslate(namespace, key, values),
}))

global.fetch = vi.fn()

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(fetch).mockResolvedValue({ ok: true } as Response)
})

describe('JoinedWelcome', () => {
  it('asks only for the interface language, then welcomes the member to the household', async () => {
    render(<JoinedWelcome householdName="The Jurcos" />)
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Welcome to dapcook')
    expect(screen.queryByText(/Step \d of/)).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Slovenčina' }))

    expect(await screen.findByText("You're in The Jurcos!")).toBeInTheDocument()
    expect(fetch).toHaveBeenCalledWith('/api/profile', expect.objectContaining({
      body: JSON.stringify({ ui_language: 'sk' }),
    }))
    expect(capture).toHaveBeenCalledWith('onboarding_step_completed', { step: 'language', skipped: false })
  })

  it('scrolls back to the top when the welcome screen replaces the language step', async () => {
    const scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
    render(<JoinedWelcome householdName="The Jurcos" />)
    scrollTo.mockClear()
    fireEvent.click(screen.getByRole('button', { name: 'English' }))
    expect(await screen.findByText("You're in The Jurcos!")).toBeInTheDocument()
    expect(scrollTo).toHaveBeenCalledWith({ top: 0 })
    scrollTo.mockRestore()
  })

  it('lands on recipes reporting a completed join', async () => {
    render(<JoinedWelcome householdName="The Jurcos" />)
    fireEvent.click(screen.getByRole('button', { name: 'English' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Go to recipes' }))
    expect(push).toHaveBeenCalledWith('/recipes?ob=1&obm=join')
  })
})
