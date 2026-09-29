import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
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
  const props = { step, stepIndex: 0, total: 1, onNext: vi.fn(), onMissing: vi.fn(), onBack: vi.fn(), onClose: vi.fn(), ...overrides }
  render(<TourOverlay {...props} />)
  return props
}

beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn()
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
    expect(props.onMissing).toHaveBeenCalledTimes(1)
    expect(props.onNext).not.toHaveBeenCalled()
  })

  it('advances when the target itself is clicked', async () => {
    const el = addTarget()
    const props = renderOverlay()
    await screen.findByText('Plan this recipe')
    fireEvent.click(el)
    expect(props.onNext).toHaveBeenCalled()
  })

  it('closes on Escape', async () => {
    addTarget()
    const props = renderOverlay()
    await screen.findByText('Plan this recipe')
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(props.onClose).toHaveBeenCalledTimes(1)
  })

  it('ignores an Escape that was already handled', async () => {
    addTarget()
    const props = renderOverlay()
    await screen.findByText('Plan this recipe')
    const e = new KeyboardEvent('keydown', { key: 'Escape', cancelable: true })
    e.preventDefault()
    document.dispatchEvent(e)
    expect(props.onClose).not.toHaveBeenCalled()
  })

  it.each(['input', 'textarea', 'select'])('ignores Escape typed in a %s', async (tag) => {
    addTarget()
    const props = renderOverlay()
    await screen.findByText('Plan this recipe')
    const field = document.body.appendChild(document.createElement(tag))
    fireEvent.keyDown(field, { key: 'Escape' })
    expect(props.onClose).not.toHaveBeenCalled()
  })

  it('ignores Escape typed in a contenteditable', async () => {
    addTarget()
    const props = renderOverlay()
    await screen.findByText('Plan this recipe')
    const div = document.body.appendChild(document.createElement('div'))
    // jsdom does not implement isContentEditable, so define it.
    Object.defineProperty(div, 'isContentEditable', { value: true })
    fireEvent.keyDown(div, { key: 'Escape' })
    expect(props.onClose).not.toHaveBeenCalled()
  })

  it('re-measures via a ResizeObserver on the target and disconnects it on unmount', async () => {
    const observe = vi.fn()
    const disconnect = vi.fn()
    let trigger: () => void = () => {}
    vi.stubGlobal('ResizeObserver', class {
      constructor(cb: () => void) { trigger = cb }
      observe = observe
      unobserve() {}
      disconnect = disconnect
    })
    const el = addTarget()
    renderOverlay()
    await screen.findByText('Plan this recipe')
    expect(observe).toHaveBeenCalledWith(el)
    const rect = { top: 300, left: 100, width: 80, height: 32, right: 180, bottom: 332, x: 100, y: 300, toJSON: () => ({}) } as DOMRect
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue(rect)
    act(() => trigger())
    expect(screen.getByRole('dialog').style.top).not.toBe('')
    cleanup()
    expect(disconnect).toHaveBeenCalled()
    vi.unstubAllGlobals()
  })

  it('closes on Skip', async () => {
    addTarget()
    const props = renderOverlay({ total: 2 })
    await screen.findByText('Plan this recipe')
    await userEvent.click(screen.getByRole('button', { name: 'Skip tour' }))
    expect(props.onClose).toHaveBeenCalledTimes(1)
  })

  it('does not advance on target click when the step does not ask for it', async () => {
    const el = addTarget()
    const props = renderOverlay({ step: { ...step, advanceOnTargetClick: false } })
    await screen.findByText('Plan this recipe')
    fireEvent.click(el)
    expect(props.onNext).not.toHaveBeenCalled()
  })

  it('shows Done and no Back on the right steps of a multi-step tour', async () => {
    addTarget()
    renderOverlay({ stepIndex: 0, total: 2 })
    await screen.findByText('1 / 2')
    expect(screen.queryByRole('button', { name: 'Back' })).not.toBeInTheDocument()
    cleanup()
    renderOverlay({ stepIndex: 1, total: 2 })
    expect(await screen.findByRole('button', { name: 'Done' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Back' })).toBeInTheDocument()
  })

  it('removes its listeners on unmount', async () => {
    const el = addTarget()
    const props = renderOverlay()
    await screen.findByText('Plan this recipe')
    cleanup()
    fireEvent.click(el)
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(props.onNext).not.toHaveBeenCalled()
    expect(props.onClose).not.toHaveBeenCalled()
  })

  it('follows a target that is replaced in the DOM', async () => {
    const el = addTarget()
    const props = renderOverlay()
    await screen.findByText('Plan this recipe')
    el.remove()
    const replacement = addTarget()
    await waitFor(() => {
      fireEvent.click(replacement)
      expect(props.onNext).toHaveBeenCalled()
    })
  })

  it('focuses the primary button, or the card when the target click advances', async () => {
    addTarget()
    renderOverlay({ step: { ...step, advanceOnTargetClick: false } })
    const btn = await screen.findByRole('button', { name: 'Got it' })
    expect(btn).toHaveFocus()
    cleanup()
    renderOverlay()
    expect(await screen.findByRole('dialog')).toHaveFocus()
  })

  it('describes the dialog by its title and body', async () => {
    addTarget()
    renderOverlay()
    const dialog = await screen.findByRole('dialog')
    expect(dialog).toHaveAccessibleName('Plan this recipe')
    expect(dialog).toHaveAccessibleDescription('Add it to a day in your weekly plan.')
  })
})
