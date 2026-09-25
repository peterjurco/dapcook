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

describe('HouseholdStep back', () => {
  it('goes back without creating anything', () => {
    const onBack = vi.fn()
    render(<HouseholdStep onSubmit={vi.fn()} onBack={onBack} />)
    fireEvent.click(screen.getByRole('button', { name: 'Back' }))
    expect(onBack).toHaveBeenCalled()
    expect(actions.createHousehold).not.toHaveBeenCalled()
  })
})

describe('TranslationStep', () => {
  it('saves the toggle and target language and reports what was saved', async () => {
    const onNext = vi.fn(async () => {})
    const onSaved = vi.fn()
    render(
      <TranslationStep value={{ enabled: false, language: 'sk' }} onSaved={onSaved} onNext={onNext} onSkip={vi.fn()} />
    )
    expect(screen.queryByRole('button', { name: 'Slovak' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('switch', { name: 'Translate imported recipes' }))
    expect(screen.getByRole('button', { name: 'Slovak' })).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    await waitFor(() => expect(onNext).toHaveBeenCalled())
    expect(fetch).toHaveBeenCalledWith('/api/household', expect.objectContaining({
      body: JSON.stringify({ translation_enabled: true, preferred_language: 'sk' }),
    }))
    expect(onSaved).toHaveBeenCalledWith({ enabled: true, language: 'sk' })
  })

  it('shows the remembered answer', () => {
    render(<TranslationStep value={{ enabled: true, language: 'de' }} onSaved={vi.fn()} onNext={vi.fn()} onSkip={vi.fn()} />)
    expect(screen.getByRole('switch')).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByRole('button', { name: 'German' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('offers no way back — the household already exists', () => {
    render(<TranslationStep value={{ enabled: false, language: 'en' }} onSaved={vi.fn()} onNext={vi.fn()} onSkip={vi.fn()} />)
    expect(screen.queryByRole('button', { name: 'Back' })).not.toBeInTheDocument()
  })
})

describe('UnitsStep', () => {
  it('shows examples for both systems and saves the choice', async () => {
    const onNext = vi.fn(async () => {})
    const onSaved = vi.fn()
    render(<UnitsStep value="metric" onSaved={onSaved} onNext={onNext} onSkip={vi.fn()} onBack={vi.fn()} />)
    expect(screen.getByText('500 g flour · 250 ml milk · 180 °C')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Imperial/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    await waitFor(() => expect(onNext).toHaveBeenCalled())
    expect(fetch).toHaveBeenCalledWith('/api/household', expect.objectContaining({
      body: JSON.stringify({ preferred_units: 'imperial' }),
    }))
    expect(onSaved).toHaveBeenCalledWith('imperial')
  })

  it('shows the remembered answer and goes back without saving', () => {
    const onBack = vi.fn()
    render(<UnitsStep value="imperial" onSaved={vi.fn()} onNext={vi.fn()} onSkip={vi.fn()} onBack={onBack} />)
    expect(screen.getByRole('button', { name: /Imperial/ })).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(screen.getByRole('button', { name: 'Back' }))
    expect(onBack).toHaveBeenCalled()
    expect(fetch).not.toHaveBeenCalled()
  })
})

describe('TagsStep', () => {
  const empty = { selected: {}, custom: {} }

  function renderTags(value = empty, onSaved = vi.fn()) {
    const onNext = vi.fn(async () => {})
    render(<TagsStep value={value} onSaved={onSaved} onNext={onNext} onSkip={vi.fn()} onBack={vi.fn()} locale="en" />)
    return { onNext, onSaved }
  }

  it('sends only the picked groups, custom tags included', async () => {
    const { onNext, onSaved } = renderTags()
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
    expect(onSaved).toHaveBeenCalledWith({ selected: { course: ['Soup'], diet: ['Paleo'] }, custom: { diet: ['Paleo'] } })
  })

  it('shows saved tags as selected, custom ones as extra chips', () => {
    renderTags({ selected: { course: ['Soup'], diet: ['Paleo'] }, custom: { diet: ['Paleo'] } })
    expect(screen.getByRole('button', { name: 'Soup' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Paleo' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Salad' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('still syncs when every saved tag was deselected, so they are removed', async () => {
    const { onNext } = renderTags({ selected: { course: ['Soup'] }, custom: {} })
    fireEvent.click(screen.getByRole('button', { name: 'Soup' }))
    fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    await waitFor(() => expect(onNext).toHaveBeenCalled())
    expect(fetch).toHaveBeenCalledWith('/api/onboarding/tags', expect.objectContaining({
      body: JSON.stringify({ groups: [] }),
    }))
  })

  it('moves on without a request when nothing was ever picked', async () => {
    const { onNext } = renderTags()
    fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    await waitFor(() => expect(onNext).toHaveBeenCalled())
    expect(fetch).not.toHaveBeenCalled()
  })

  it('stays on the step when saving fails', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: false } as Response)
    const { onNext, onSaved } = renderTags()
    fireEvent.click(screen.getByRole('button', { name: 'Soup' }))
    fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    expect(await screen.findByText("Couldn't save. Please try again.")).toBeInTheDocument()
    expect(onNext).not.toHaveBeenCalled()
    expect(onSaved).not.toHaveBeenCalled()
  })
})
