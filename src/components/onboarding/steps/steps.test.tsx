import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import type { TranslationValues } from 'use-intl'
import { mockTranslate } from '@/test/mockMessages'
import { LanguageStep } from './LanguageStep'
import { HouseholdStep } from './HouseholdStep'

const refreshMock = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: refreshMock, push: vi.fn() }) }))
vi.mock('next-intl', () => ({
  useTranslations: (namespace: string) => (key: string, values?: TranslationValues) =>
    mockTranslate(namespace, key, values),
}))
const actions = vi.hoisted(() => ({ createHousehold: vi.fn(), joinHousehold: vi.fn() }))
vi.mock('@/lib/auth/actions', () => actions)

global.fetch = vi.fn()

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(fetch).mockResolvedValue({ ok: true } as Response)
})

describe('LanguageStep', () => {
  it('saves the chosen language, re-renders the app in it and moves on', async () => {
    const onNext = vi.fn(async () => {})
    render(<LanguageStep onNext={onNext} />)
    fireEvent.click(screen.getByRole('button', { name: 'Slovenčina' }))
    await waitFor(() => expect(onNext).toHaveBeenCalled())
    expect(fetch).toHaveBeenCalledWith('/api/profile', expect.objectContaining({
      method: 'PATCH',
      body: JSON.stringify({ ui_language: 'sk' }),
    }))
    expect(refreshMock).toHaveBeenCalled()
  })

  it('stays put and says so when saving fails', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: false } as Response)
    const onNext = vi.fn(async () => {})
    render(<LanguageStep onNext={onNext} />)
    fireEvent.click(screen.getByRole('button', { name: 'English' }))
    expect(await screen.findByText("Couldn't save. Please try again.")).toBeInTheDocument()
    expect(onNext).not.toHaveBeenCalled()
  })
})

describe('HouseholdStep', () => {
  it('creates a household with the typed name', async () => {
    const onSubmit = vi.fn()
    render(<HouseholdStep onSubmit={onSubmit} />)
    fireEvent.change(screen.getByLabelText('Household name'), { target: { value: 'Home' } })
    fireEvent.click(screen.getByRole('button', { name: 'Create household' }))
    await waitFor(() => expect(actions.createHousehold).toHaveBeenCalledWith('Home'))
    expect(onSubmit).toHaveBeenCalledWith('create')
  })

  it('offers joining by invite link only on request', async () => {
    render(<HouseholdStep onSubmit={vi.fn()} />)
    expect(screen.queryByLabelText('Invite link')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Got an invite link?' }))
    fireEvent.change(screen.getByLabelText('Invite link'), { target: { value: 'https://x/join/abc' } })
    fireEvent.click(screen.getByRole('button', { name: 'Join household' }))
    await waitFor(() => expect(actions.joinHousehold).toHaveBeenCalledWith('https://x/join/abc'))
  })

  it('shows the error returned by the action', async () => {
    actions.joinHousehold.mockResolvedValue({ error: 'Invalid invite link' })
    render(<HouseholdStep onSubmit={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Got an invite link?' }))
    fireEvent.change(screen.getByLabelText('Invite link'), { target: { value: 'nope' } })
    fireEvent.click(screen.getByRole('button', { name: 'Join household' }))
    expect(await screen.findByText('Invalid invite link')).toBeInTheDocument()
  })
})
