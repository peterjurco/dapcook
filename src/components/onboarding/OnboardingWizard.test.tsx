import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import type { TranslationValues } from 'use-intl'
import { mockTranslate } from '@/test/mockMessages'
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
    expect(screen.getByText('Step 2 of 8')).toBeInTheDocument()
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

  it('offers rule examples, finishes onboarding and lands on recipes', async () => {
    render(<OnboardingWizard initialStep="shopping_rules" locale="en" household={household} rules={[]} />)
    expect(screen.getByRole('button', { name: '+ Count eggs in pieces, not grams' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Go to recipes' }))
    expect(bodies()).toEqual([['/api/household', JSON.stringify({ onboarding_step: null })]])
    expect(push).toHaveBeenCalledWith('/recipes?ob=1')
  })
})
