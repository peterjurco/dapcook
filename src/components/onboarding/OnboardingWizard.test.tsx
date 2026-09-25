import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import type { TranslationValues } from 'use-intl'
import { mockTranslate } from '@/test/mockMessages'
import type { ShoppingCategory } from '@/types/database'
import { OnboardingWizard } from './OnboardingWizard'

const capture = vi.fn()
const push = vi.fn()
vi.mock('posthog-js/react', () => ({ usePostHog: () => ({ capture }) }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn(), push }) }))
vi.mock('next-intl', () => ({
  useTranslations: (namespace: string) => (key: string, values?: TranslationValues) =>
    mockTranslate(namespace, key, values),
}))
vi.mock('@/lib/auth/actions', () => ({ createHousehold: vi.fn(), joinHousehold: vi.fn() }))

global.fetch = vi.fn()

const invite = 'http://localhost:3000/join/abc'
const household = { translationEnabled: false, preferredLanguage: 'en', preferredUnits: 'metric' as const }

function bodies() {
  return vi.mocked(fetch).mock.calls.map(([url, init]) => [url, (init as RequestInit).body])
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(fetch).mockResolvedValue({ ok: true } as Response)
})

describe('OnboardingWizard', () => {
  it('uses the page heading style with a green first letter', () => {
    render(<OnboardingWizard initialStep="language" locale="en" />)
    const heading = screen.getByRole('heading', { level: 1 })
    expect(heading).toHaveTextContent('Welcome to dapcook')
    expect(heading.querySelector('span')).toHaveClass('text-emerald-700')
  })

  it('goes from language to intro to household, tracking each step', async () => {
    render(<OnboardingWizard initialStep="language" locale="en" />)
    fireEvent.click(screen.getByRole('button', { name: 'English' }))
    fireEvent.click(await screen.findByRole('button', { name: "Let's start" }))
    expect(await screen.findByLabelText('Household name')).toBeInTheDocument()
    expect(screen.getByText('Step 2 of 7')).toBeInTheDocument()
    expect(capture).toHaveBeenCalledWith('onboarding_step_completed', { step: 'language', skipped: false })
    expect(capture).toHaveBeenCalledWith('onboarding_step_completed', { step: 'intro', skipped: false })
  })

  it('skipping a step stores the next one without saving anything else', async () => {
    render(<OnboardingWizard initialStep="translation" locale="en" household={household} />)
    fireEvent.click(screen.getByRole('button', { name: 'Skip' }))
    expect(await screen.findByText('Which units do you use?')).toBeInTheDocument()
    expect(bodies()).toEqual([['/api/household', JSON.stringify({ onboarding_step: 'units' })]])
    expect(capture).toHaveBeenCalledWith('onboarding_step_completed', { step: 'translation', skipped: true })
  })

  it('saves the step, then stores the next one', async () => {
    render(<OnboardingWizard initialStep="units" locale="en" household={household} />)
    fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    expect(await screen.findByText('What kind of recipes will you add?')).toBeInTheDocument()
    expect(bodies()).toEqual([
      ['/api/household', JSON.stringify({ preferred_units: 'metric' })],
      ['/api/household', JSON.stringify({ onboarding_step: 'tags' })],
    ])
  })

  it('stays on the step when the progress cannot be stored', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: false } as Response)
    render(<OnboardingWizard initialStep="translation" locale="en" household={household} />)
    fireEvent.click(screen.getByRole('button', { name: 'Skip' }))
    expect(await screen.findByText("Couldn't save. Please try again.")).toBeInTheDocument()
    expect(screen.getByText('Translate recipes?')).toBeInTheDocument()
  })

  it('leaving shopping categories stores the invite step', async () => {
    render(<OnboardingWizard initialStep="shopping_categories" locale="en" household={household} inviteUrl={invite} />)
    fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    expect(await screen.findByText('Cook together')).toBeInTheDocument()
    expect(bodies()).toEqual([['/api/household', JSON.stringify({ onboarding_step: 'invite' })]])
  })

  it('shows the household invite link on the invite step', () => {
    render(<OnboardingWizard initialStep="invite" locale="en" household={household} inviteUrl={invite} />)
    expect(screen.getByDisplayValue(invite)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Copy' })).toBeInTheDocument()
    expect(screen.getByText('You can change this anytime in Settings.')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Back' }))
    expect(screen.getByText('Shopping categories')).toBeInTheDocument()
  })

  it('finishing the invite step does not save progress, only tracks it', async () => {
    render(<OnboardingWizard initialStep="invite" locale="en" household={household} inviteUrl={invite} />)
    fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    expect(await screen.findByRole('button', { name: 'Go to recipes' })).toBeInTheDocument()
    expect(fetch).not.toHaveBeenCalled()
    expect(capture).toHaveBeenCalledWith('onboarding_step_completed', { step: 'invite', skipped: false })
  })

  it('offers Back from intro but not on the language or translation steps', async () => {
    render(<OnboardingWizard initialStep="language" locale="en" />)
    expect(screen.queryByRole('button', { name: 'Back' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'English' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Back' }))
    expect(await screen.findByRole('button', { name: 'English' })).toBeInTheDocument()
  })

  it('has no Back on the translation step', () => {
    render(<OnboardingWizard initialStep="translation" locale="en" household={household} />)
    expect(screen.queryByRole('button', { name: 'Back' })).not.toBeInTheDocument()
  })

  it('goes back without saving or tracking anything', () => {
    render(<OnboardingWizard initialStep="units" locale="en" household={household} />)
    fireEvent.click(screen.getByRole('button', { name: 'Back' }))
    expect(screen.getByText('Translate recipes?')).toBeInTheDocument()
    expect(fetch).not.toHaveBeenCalled()
    expect(capture).not.toHaveBeenCalled()
  })

  it('suggests the interface language as translation target when translation is off', () => {
    render(<OnboardingWizard initialStep="translation" locale="sk" household={household} />)
    fireEvent.click(screen.getByRole('switch'))
    expect(screen.getByRole('button', { name: 'Slovak' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('remembers saved answers when coming back to a step', async () => {
    render(<OnboardingWizard initialStep="units" locale="en" household={household} />)
    fireEvent.click(screen.getByRole('button', { name: /Imperial/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Soup' }))
    fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    expect(await screen.findByText('Shopping categories')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Back' }))
    expect(screen.getByRole('button', { name: 'Soup' })).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(screen.getByRole('button', { name: 'Back' }))
    expect(screen.getByRole('button', { name: /Imperial/ })).toHaveAttribute('aria-pressed', 'true')
  })

  it('shows tags that were saved in an earlier session', () => {
    render(
      <OnboardingWizard
        initialStep="tags"
        locale="en"
        household={household}
        tags={{ selected: { diet: ['Vegan'] }, custom: {} }}
      />
    )
    expect(screen.getByRole('button', { name: 'Vegan' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('deletes shopping categories without asking', async () => {
    const categories = [{ id: 'c1', household_id: 'hh-1', name: 'Bakery', color: null, sort_order: 0 }] as ShoppingCategory[]
    render(<OnboardingWizard initialStep="shopping_categories" locale="en" household={household} categories={categories} />)
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))
    await waitFor(() => expect(screen.queryByText('Bakery')).not.toBeInTheDocument())
    expect(fetch).toHaveBeenCalledWith('/api/shopping/categories/c1', { method: 'DELETE' })
  })

  it('finishes onboarding from the done screen and lands on recipes', async () => {
    render(<OnboardingWizard initialStep="done" locale="en" household={household} />)
    fireEvent.click(screen.getByRole('button', { name: 'Go to recipes' }))
    await waitFor(() => expect(push).toHaveBeenCalledWith('/recipes?ob=1'))
    expect(bodies()).toEqual([['/api/household', JSON.stringify({ onboarding_step: null })]])
  })

  it('stays on the done screen and shows an error when finishing fails', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: false } as Response)
    render(<OnboardingWizard initialStep="done" locale="en" household={household} />)
    fireEvent.click(screen.getByRole('button', { name: 'Go to recipes' }))
    expect(await screen.findByText("Couldn't save. Please try again.")).toBeInTheDocument()
    expect(push).not.toHaveBeenCalled()
  })
})
