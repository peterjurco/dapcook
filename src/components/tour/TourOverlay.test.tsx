import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TourOverlay, TARGET_TIMEOUT_MS } from './TourOverlay'
import { mockTranslate } from '@/test/mockMessages'
import type { TranslationValues } from 'use-intl'
import type { TourStep } from './tours'

vi.mock('next-intl', () => ({
  useTranslations: (namespace: string) => (key: string, values?: TranslationValues) =>
    mockTranslate(namespace, key, values),
}))

const step: TourStep = { target: 'plan-button', key: 'planRecipe.planButton', placement: 'bottom', advanceOnTargetClick: true }

function renderOverlay(overrides: Partial<Parameters<typeof TourOverlay>[0]> = {}) {
  const props = { step, stepIndex: 0, total: 1, onNext: vi.fn(), onBack: vi.fn(), onClose: vi.fn(), ...overrides }
  render(<TourOverlay {...props} />)
  return props
}

beforeEach(() => {
  // jsdom has no layout: make every element "visible" with a fixed rect.
  vi.spyOn(Element.prototype, 'getClientRects').mockReturnValue([{}] as unknown as DOMRectList)
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue(
    { top: 100, left: 100, width: 80, height: 32, right: 180, bottom: 132, x: 100, y: 100, toJSON: () => ({}) } as DOMRect,
  )
})
afterEach(() => {
  cleanup() // unmount before wiping the body, or React can't remove its portal/container
  vi.restoreAllMocks()
  vi.useRealTimers()
  document.body.innerHTML = ''
})

function addTarget(name = 'plan-button') {
  const el = document.createElement('button')
  el.dataset.tour = name
  document.body.appendChild(el)
  return el
}

describe('TourOverlay', () => {
  it('shows the step copy next to a present target', async () => {
    addTarget()
    renderOverlay()
    expect(await screen.findByText('Plan this recipe')).toBeInTheDocument()
    expect(screen.getByText('Add it to a day in your weekly plan.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Got it' })).toBeInTheDocument()
  })

  it('shows the step counter, Back and Next in a multi-step tour', async () => {
    addTarget()
    const props = renderOverlay({ stepIndex: 1, total: 3 })
    expect(await screen.findByText('2 / 3')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Back' }))
    expect(props.onBack).toHaveBeenCalled()
    await userEvent.click(screen.getByRole('button', { name: 'Next' }))
    expect(props.onNext).toHaveBeenCalled()
  })

  it('waits for a target that mounts later', async () => {
    renderOverlay()
    expect(screen.queryByText('Plan this recipe')).not.toBeInTheDocument()
    act(() => { addTarget() })
    expect(await screen.findByText('Plan this recipe')).toBeInTheDocument()
  })

  it('advances past a target that never appears', () => {
    vi.useFakeTimers()
    const props = renderOverlay()
    act(() => { vi.advanceTimersByTime(TARGET_TIMEOUT_MS) })
    expect(props.onNext).toHaveBeenCalled()
  })

  it('advances when the target itself is clicked', async () => {
    const el = addTarget()
    const props = renderOverlay()
    await screen.findByText('Plan this recipe')
    fireEvent.click(el)
    expect(props.onNext).toHaveBeenCalled()
  })

  it('closes on Escape and on Skip', async () => {
    addTarget()
    const props = renderOverlay({ total: 2 })
    await screen.findByText('Plan this recipe')
    fireEvent.keyDown(document, { key: 'Escape' })
    await userEvent.click(screen.getByRole('button', { name: 'Skip tour' }))
    expect(props.onClose).toHaveBeenCalledTimes(2)
  })
})
