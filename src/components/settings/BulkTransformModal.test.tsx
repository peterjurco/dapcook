import { render, screen, waitFor, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { BulkTransformModal } from './BulkTransformModal'

global.fetch = vi.fn()

function mockFetchSuccess() {
  vi.mocked(fetch).mockResolvedValue({ ok: true } as Response)
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('BulkTransformModal', () => {
  it('renders with data-testid bulk-transform-modal', () => {
    mockFetchSuccess()
    render(
      <BulkTransformModal
        recipeIds={['r1']}
        targetLanguage="sk"
        onClose={vi.fn()}
      />
    )
    expect(screen.getByTestId('bulk-transform-modal')).toBeDefined()
  })

  it('shows progress while processing', async () => {
    let resolveFirst!: () => void
    vi.mocked(fetch)
      .mockImplementationOnce(
        () => new Promise<Response>((resolve) => { resolveFirst = () => resolve({ ok: true } as Response) })
      )
      // Second call hangs indefinitely so we can observe the intermediate state
      .mockImplementationOnce(() => new Promise<Response>(() => {}))

    render(
      <BulkTransformModal
        recipeIds={['r1', 'r2']}
        targetLanguage="sk"
        onClose={vi.fn()}
      />
    )

    expect(screen.getByText(/0 \/ 2/)).toBeDefined()
    await act(async () => { resolveFirst() })
    await waitFor(() => {
      expect(screen.getByText(/1 \/ 2/)).toBeDefined()
    })
  })

  it('shows done message when all recipes processed', async () => {
    mockFetchSuccess()
    render(
      <BulkTransformModal
        recipeIds={['r1', 'r2']}
        targetLanguage="sk"
        onClose={vi.fn()}
      />
    )

    await waitFor(() => {
      expect(screen.getByText(/Done/i)).toBeDefined()
      expect(screen.getByText(/2 updated/)).toBeDefined()
    })
  })

  it('counts failures in the done message', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce({ ok: true } as Response)
      .mockResolvedValueOnce({ ok: false } as Response)

    render(
      <BulkTransformModal
        recipeIds={['r1', 'r2']}
        targetLanguage="sk"
        onClose={vi.fn()}
      />
    )

    await waitFor(() => {
      expect(screen.getByText(/1 updated.*1 failed/)).toBeDefined()
    })
  })

  it('calls onClose when close button clicked', async () => {
    mockFetchSuccess()
    const onClose = vi.fn()
    render(
      <BulkTransformModal
        recipeIds={['r1']}
        targetLanguage="sk"
        onClose={onClose}
      />
    )
    await waitFor(() => screen.getByText(/Done/i))
    await userEvent.click(screen.getByRole('button'))
    expect(onClose).toHaveBeenCalled()
  })

  it('calls POST /api/recipes/[id]/transform for each recipe', async () => {
    mockFetchSuccess()
    render(
      <BulkTransformModal
        recipeIds={['r1', 'r2']}
        targetLanguage="sk"
        targetUnits="metric"
        onClose={vi.fn()}
      />
    )

    await waitFor(() => screen.getByText(/Done/i))

    expect(fetch).toHaveBeenCalledWith(
      '/api/recipes/r1/transform',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ targetLanguage: 'sk', targetUnits: 'metric' }),
      })
    )
    expect(fetch).toHaveBeenCalledWith(
      '/api/recipes/r2/transform',
      expect.objectContaining({ method: 'POST' })
    )
  })
})
