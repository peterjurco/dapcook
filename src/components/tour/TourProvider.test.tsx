import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { StrictMode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TourProvider, useTour, useTourControls, useTourStep, TOUR_START_DELAY_MS } from './TourProvider'
import type { TourId } from '@/lib/tours/ids'

let mockPathname = '/recipes/1'
vi.mock('next/navigation', () => ({ usePathname: () => mockPathname }))

// Stand-in overlay: exposes the active step and its controls.
vi.mock('./TourOverlay', () => ({
  TourOverlay: ({ step, stepIndex, onNext, onBack, onClose, onMissing }: {
    step: { target: string }; stepIndex: number; onNext: () => void; onBack: () => void; onClose: () => void
    onMissing: () => void
  }) => (
    <div data-testid="overlay">
      {step.target}:{stepIndex}
      <button type="button" onClick={onNext}>next</button>
      <button type="button" onClick={onBack}>back</button>
      <button type="button" onClick={onClose}>close</button>
      <button type="button" onClick={onMissing}>missing</button>
    </div>
  ),
}))

function Starter({ id, when = true }: { id: TourId; when?: boolean }) {
  useTour(id, when)
  return null
}

function StepProbe({ target }: { target: string }) {
  return <span data-testid="probe">{String(useTourStep(target))}</span>
}

function MarkSeen({ id }: { id: TourId }) {
  const tour = useTourControls()
  return <button type="button" onClick={() => tour?.markSeen(id)}>mark</button>
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true })
  mockPathname = '/recipes/1'
  global.fetch = vi.fn().mockResolvedValue({ ok: true } as Response)
})
afterEach(() => vi.useRealTimers())

const advance = () => act(() => { vi.advanceTimersByTime(TOUR_START_DELAY_MS) })

function patchedTours() {
  return (global.fetch as ReturnType<typeof vi.fn>).mock.calls.map((c) => JSON.parse((c[1] as RequestInit).body as string).tour_seen)
}

describe('TourProvider', () => {
  it('starts a tour after the delay when its condition holds', () => {
    render(<TourProvider initialSeen={[]}><Starter id="plan-recipe" /></TourProvider>)
    expect(screen.queryByTestId('overlay')).not.toBeInTheDocument()
    advance()
    expect(screen.getByTestId('overlay')).toHaveTextContent('plan-button:0')
  })

  it('does not start a seen tour or one whose condition is false', () => {
    render(
      <TourProvider initialSeen={['plan-recipe']}>
        <Starter id="plan-recipe" />
        <Starter id="shopping-list" when={false} />
      </TourProvider>,
    )
    advance()
    expect(screen.queryByTestId('overlay')).not.toBeInTheDocument()
  })

  it('runs one tour at a time and starts the next once the first closes', async () => {
    render(
      <TourProvider initialSeen={[]}>
        <Starter id="plan-recipe" />
        <Starter id="shopping-list" />
      </TourProvider>,
    )
    advance()
    expect(screen.getAllByTestId('overlay')).toHaveLength(1)
    expect(screen.getByTestId('overlay')).toHaveTextContent('plan-button:0')
    await userEvent.click(screen.getByRole('button', { name: 'close' }))
    advance()
    expect(screen.getAllByTestId('overlay')).toHaveLength(1)
    expect(screen.getByTestId('overlay')).not.toHaveTextContent('plan-button')
    expect(patchedTours()).toEqual(['plan-recipe'])
  })

  it('steps forward and back, finishes after the last step and persists it', async () => {
    render(<TourProvider initialSeen={[]}><Starter id="planner-desktop" /><StepProbe target="grid-resize" /></TourProvider>)
    advance()
    await userEvent.click(screen.getByRole('button', { name: 'next' }))
    expect(screen.getByTestId('overlay')).toHaveTextContent('grid-resize:1')
    expect(screen.getByTestId('probe')).toHaveTextContent('true')
    await userEvent.click(screen.getByRole('button', { name: 'back' }))
    expect(screen.getByTestId('overlay')).toHaveTextContent('grid-slot:0')
    await userEvent.click(screen.getByRole('button', { name: 'next' }))
    await userEvent.click(screen.getByRole('button', { name: 'next' }))
    await userEvent.click(screen.getByRole('button', { name: 'next' }))
    expect(screen.queryByTestId('overlay')).not.toBeInTheDocument()
    expect(patchedTours()).toEqual(['planner-desktop'])
  })

  it('a missing target on a single-step tour ends it without persisting', async () => {
    render(<TourProvider initialSeen={[]}><Starter id="plan-recipe" /></TourProvider>)
    advance()
    await userEvent.click(screen.getByRole('button', { name: 'missing' }))
    expect(screen.queryByTestId('overlay')).not.toBeInTheDocument()
    expect(patchedTours()).toEqual([])
  })

  it('a missing middle step advances; a missing last step dismisses without persisting', async () => {
    render(<TourProvider initialSeen={[]}><Starter id="planner-desktop" /></TourProvider>)
    advance()
    await userEvent.click(screen.getByRole('button', { name: 'missing' }))
    expect(screen.getByTestId('overlay')).toHaveTextContent('grid-resize:1')
    await userEvent.click(screen.getByRole('button', { name: 'missing' }))
    expect(screen.getByTestId('overlay')).toHaveTextContent(':2')
    await userEvent.click(screen.getByRole('button', { name: 'missing' }))
    expect(screen.queryByTestId('overlay')).not.toBeInTheDocument()
    expect(patchedTours()).toEqual([])
  })

  it('skipping marks the tour seen so it does not come back', async () => {
    render(<TourProvider initialSeen={[]}><Starter id="plan-recipe" /></TourProvider>)
    advance()
    await userEvent.click(screen.getByRole('button', { name: 'close' }))
    expect(patchedTours()).toEqual(['plan-recipe'])
    // The condition still holds; only the seen flag stops a restart.
    advance()
    expect(screen.queryByTestId('overlay')).not.toBeInTheDocument()
  })

  it('markSeen suppresses a tour without showing it, and persists once', async () => {
    render(<TourProvider initialSeen={[]}><MarkSeen id="plan-recipe" /></TourProvider>)
    await userEvent.click(screen.getByRole('button', { name: 'mark' }))
    await userEvent.click(screen.getByRole('button', { name: 'mark' }))
    expect(patchedTours()).toEqual(['plan-recipe'])
  })

  it('dismisses (without marking seen) when the condition turns false, and restarts when it returns', () => {
    const { rerender } = render(<TourProvider initialSeen={[]}><Starter id="plan-recipe" /></TourProvider>)
    advance()
    rerender(<TourProvider initialSeen={[]}><Starter id="plan-recipe" when={false} /></TourProvider>)
    expect(screen.queryByTestId('overlay')).not.toBeInTheDocument()
    expect(patchedTours()).toEqual([])
    rerender(<TourProvider initialSeen={[]}><Starter id="plan-recipe" /></TourProvider>)
    advance()
    expect(screen.getByTestId('overlay')).toHaveTextContent('plan-button:0')
  })

  it('dismisses on navigation without marking seen', () => {
    const { rerender } = render(<TourProvider initialSeen={[]}><Starter id="plan-recipe" /></TourProvider>)
    advance()
    mockPathname = '/planner'
    rerender(<TourProvider initialSeen={[]}><Starter id="plan-recipe" /></TourProvider>)
    expect(screen.queryByTestId('overlay')).not.toBeInTheDocument()
    expect(patchedTours()).toEqual([])
    advance()
    expect(screen.getByTestId('overlay')).toBeInTheDocument()
  })

  it('dismisses without PATCH when the starter unmounts while active', () => {
    const { rerender } = render(<TourProvider initialSeen={[]}><Starter id="plan-recipe" /></TourProvider>)
    advance()
    rerender(<TourProvider initialSeen={[]}>{null}</TourProvider>)
    expect(screen.queryByTestId('overlay')).not.toBeInTheDocument()
    expect(patchedTours()).toEqual([])
  })

  it('clears a pending start when the condition goes false before the delay', () => {
    const { rerender } = render(<TourProvider initialSeen={[]}><Starter id="plan-recipe" /></TourProvider>)
    act(() => { vi.advanceTimersByTime(TOUR_START_DELAY_MS - 100) })
    rerender(<TourProvider initialSeen={[]}><Starter id="plan-recipe" when={false} /></TourProvider>)
    advance()
    expect(screen.queryByTestId('overlay')).not.toBeInTheDocument()
  })

  it('does not throw when persisting fails', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('offline'))
    render(<TourProvider initialSeen={[]}><Starter id="plan-recipe" /></TourProvider>)
    advance()
    await userEvent.click(screen.getByRole('button', { name: 'close' }))
    expect(screen.queryByTestId('overlay')).not.toBeInTheDocument()
  })

  it('shows one overlay and sends one PATCH under StrictMode', async () => {
    render(<StrictMode><TourProvider initialSeen={[]}><Starter id="planner-desktop" /></TourProvider></StrictMode>)
    advance()
    expect(screen.getAllByTestId('overlay')).toHaveLength(1)
    for (let i = 0; i < 3; i++) await userEvent.click(screen.getByRole('button', { name: 'next' }))
    expect(screen.queryByTestId('overlay')).not.toBeInTheDocument()
    expect(patchedTours()).toEqual(['planner-desktop'])
  })

  it('hooks are no-ops without a provider', () => {
    render(<><Starter id="plan-recipe" /><StepProbe target="grid-resize" /><MarkSeen id="plan-recipe" /></>)
    advance()
    expect(screen.getByTestId('probe')).toHaveTextContent('false')
  })
})
