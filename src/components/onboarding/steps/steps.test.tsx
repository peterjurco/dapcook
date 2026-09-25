import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import type { TranslationValues } from 'use-intl'
import { mockTranslate } from '@/test/mockMessages'
import { LanguageStep } from './LanguageStep'
import { HouseholdStep } from './HouseholdStep'
import { TranslationStep } from './TranslationStep'
import { UnitsStep } from './UnitsStep'
import { TagsStep } from './TagsStep'

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

describe('TranslationStep', () => {
  it('saves the toggle and target language, defaulting to the interface language', async () => {
    const onNext = vi.fn(async () => {})
    render(<TranslationStep onNext={onNext} onSkip={vi.fn()} initialEnabled={false} initialLanguage="en" defaultLanguage="sk" />)
    expect(screen.queryByRole('button', { name: 'Slovak' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('switch', { name: 'Translate imported recipes' }))
    expect(screen.getByRole('button', { name: 'Slovak' })).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    await waitFor(() => expect(onNext).toHaveBeenCalled())
    expect(fetch).toHaveBeenCalledWith('/api/household', expect.objectContaining({
      body: JSON.stringify({ translation_enabled: true, preferred_language: 'sk' }),
    }))
  })
})

describe('UnitsStep', () => {
  it('shows examples for both systems, including spoons, and saves the choice', async () => {
    const onNext = vi.fn(async () => {})
    render(<UnitsStep onNext={onNext} onSkip={vi.fn()} initialUnits="metric" />)
    expect(screen.getByText('500 g flour · 250 ml milk · 180 °C')).toBeInTheDocument()
    expect(screen.getByText(/1 tbsp \/ 1 PL oil/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Imperial/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    await waitFor(() => expect(onNext).toHaveBeenCalled())
    expect(fetch).toHaveBeenCalledWith('/api/household', expect.objectContaining({
      body: JSON.stringify({ preferred_units: 'imperial' }),
    }))
  })
})

describe('TagsStep', () => {
  it('sends only the picked groups, custom tags included', async () => {
    const onNext = vi.fn(async () => {})
    render(<TagsStep onNext={onNext} onSkip={vi.fn()} locale="en" />)
    fireEvent.click(screen.getByRole('button', { name: 'Soup' }))
    fireEvent.click(screen.getByRole('button', { name: 'Add a tag to Diet' }))
    fireEvent.change(screen.getByPlaceholderText('New tag'), { target: { value: 'Paleo' } })
    fireEvent.keyDown(screen.getByPlaceholderText('New tag'), { key: 'Enter' })
    expect(screen.getByRole('button', { name: 'Paleo' })).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    await waitFor(() => expect(onNext).toHaveBeenCalled())
    expect(fetch).toHaveBeenCalledWith('/api/onboarding/tags', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ groups: [
        { name: 'Course', tags: ['Soup'] },
        { name: 'Diet', tags: ['Paleo'] },
      ] }),
    }))
  })

  it('moves on without a request when nothing is picked', async () => {
    const onNext = vi.fn(async () => {})
    render(<TagsStep onNext={onNext} onSkip={vi.fn()} locale="en" />)
    fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    await waitFor(() => expect(onNext).toHaveBeenCalled())
    expect(fetch).not.toHaveBeenCalled()
  })

  it('stays on the step when saving fails', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: false } as Response)
    const onNext = vi.fn(async () => {})
    render(<TagsStep onNext={onNext} onSkip={vi.fn()} locale="en" />)
    fireEvent.click(screen.getByRole('button', { name: 'Soup' }))
    fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    expect(await screen.findByText("Couldn't save. Please try again.")).toBeInTheDocument()
    expect(onNext).not.toHaveBeenCalled()
  })
})
