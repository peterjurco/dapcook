// @vitest-environment-options { "url": "https://dapcook.test" }

import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ShareRecipeButton } from './ShareRecipeButton'

const writeText = vi.fn()

function response({ ok = true, status = 200, body }: { ok?: boolean; status?: number; body?: unknown } = {}) {
  return {
    ok,
    status,
    json: vi.fn().mockResolvedValue(body),
  } as unknown as Response
}

async function openShare() {
  await userEvent.click(screen.getByRole('button', { name: 'Share' }))
  const dialog = screen.getByRole('dialog', { name: 'Share recipe' })
  expect(dialog).toHaveAttribute('aria-modal', 'true')
  return dialog
}

beforeEach(() => {
  vi.clearAllMocks()
  global.fetch = vi.fn()
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText },
  })
})

describe('ShareRecipeButton', () => {
  it('opens in the disabled state and creates a share link', async () => {
    vi.mocked(global.fetch).mockResolvedValue(
      response({ body: { share_token: 'new-token', share_url: 'https://shares.dapcook.test/s/new-token' } }),
    )
    render(<ShareRecipeButton recipeId="recipe-1" initialShareToken={null} />)

    await openShare()
    expect(screen.getByRole('button', { name: 'Create share link' })).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Create share link' }))

    await waitFor(() =>
      expect(global.fetch).toHaveBeenCalledWith('/api/recipes/recipe-1/share', { method: 'POST' }),
    )
    expect(await screen.findByDisplayValue('https://shares.dapcook.test/s/new-token')).toBeInTheDocument()
    expect(screen.getByText('Anyone with this link can view the recipe.')).toBeInTheDocument()
  })

  it('opens in the enabled state with a selectable absolute URL', async () => {
    render(<ShareRecipeButton recipeId="recipe-1" initialShareToken="active-token" />)

    await openShare()

    const url = await screen.findByDisplayValue('https://dapcook.test/s/active-token')
    expect(url).toHaveAttribute('readonly')
    await userEvent.click(url)
    expect((url as HTMLInputElement).selectionStart).toBe(0)
    expect((url as HTMLInputElement).selectionEnd).toBe('https://dapcook.test/s/active-token'.length)
  })

  it('copies the active URL and shows Copied', async () => {
    writeText.mockResolvedValue(undefined)
    render(<ShareRecipeButton recipeId="recipe-1" initialShareToken="active-token" />)
    await openShare()

    await userEvent.click(screen.getByRole('button', { name: 'Copy link' }))

    expect(writeText).toHaveBeenCalledWith('https://dapcook.test/s/active-token')
    expect(screen.getByRole('button', { name: 'Copied' })).toBeInTheDocument()
  })

  it('keeps the URL selectable and shows an error when clipboard access fails', async () => {
    writeText.mockRejectedValue(new Error('clipboard denied'))
    render(<ShareRecipeButton recipeId="recipe-1" initialShareToken="active-token" />)
    await openShare()

    await userEvent.click(screen.getByRole('button', { name: 'Copy link' }))

    expect(await screen.findByText('Could not copy the link. Select and copy it manually.')).toBeInTheDocument()
    expect(screen.getByDisplayValue('https://dapcook.test/s/active-token')).toBeInTheDocument()
  })

  it('disables sharing and returns to the create state', async () => {
    vi.mocked(global.fetch).mockResolvedValue(response({ status: 204 }))
    render(<ShareRecipeButton recipeId="recipe-1" initialShareToken="active-token" />)
    await openShare()

    await userEvent.click(screen.getByRole('button', { name: 'Disable sharing' }))

    await waitFor(() =>
      expect(global.fetch).toHaveBeenCalledWith('/api/recipes/recipe-1/share', { method: 'DELETE' }),
    )
    expect(screen.getByRole('button', { name: 'Create share link' })).toBeInTheDocument()
    expect(screen.queryByDisplayValue('https://dapcook.test/s/active-token')).not.toBeInTheDocument()
  })

  it.each([
    ['enable', null, 'Create share link', 'POST'],
    ['disable', 'active-token', 'Disable sharing', 'DELETE'],
  ] as const)('shows a generic inline error when %s fails', async (_, token, action, method) => {
    vi.mocked(global.fetch).mockResolvedValue(response({ ok: false, status: 500 }))
    render(<ShareRecipeButton recipeId="recipe-1" initialShareToken={token} />)
    await openShare()

    await userEvent.click(screen.getByRole('button', { name: action }))

    expect(await screen.findByText('Something went wrong. Try again.')).toBeInTheDocument()
    expect(global.fetch).toHaveBeenCalledWith('/api/recipes/recipe-1/share', { method })
  })

  it('closes on Escape and backdrop click', async () => {
    render(<ShareRecipeButton recipeId="recipe-1" initialShareToken={null} />)

    await openShare()
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

    await openShare()
    fireEvent.mouseDown(screen.getByTestId('share-modal-backdrop'))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('moves focus into the dialog and restores it to Share when closed', async () => {
    render(<ShareRecipeButton recipeId="recipe-1" initialShareToken={null} />)
    const trigger = screen.getByRole('button', { name: 'Share' })

    await openShare()
    expect(screen.getByRole('button', { name: 'Create share link' })).toHaveFocus()

    await userEvent.keyboard('{Escape}')
    expect(trigger).toHaveFocus()
  })

  it('contains forward and backward Tab navigation within the dialog', async () => {
    render(<ShareRecipeButton recipeId="recipe-1" initialShareToken={null} />)
    await openShare()

    const close = screen.getByRole('button', { name: 'Close' })
    const create = screen.getByRole('button', { name: 'Create share link' })
    expect(create).toHaveFocus()

    await userEvent.tab()
    expect(close).toHaveFocus()

    await userEvent.tab({ shift: true })
    expect(create).toHaveFocus()
  })

  it('does not close on Escape while a share request is in flight', async () => {
    let resolveRequest!: (value: Response) => void
    vi.mocked(global.fetch).mockReturnValue(
      new Promise<Response>((resolve) => {
        resolveRequest = resolve
      }),
    )
    render(<ShareRecipeButton recipeId="recipe-1" initialShareToken={null} />)
    await openShare()

    await userEvent.click(screen.getByRole('button', { name: 'Create share link' }))
    await waitFor(() => expect(global.fetch).toHaveBeenCalled())
    await userEvent.keyboard('{Escape}')
    expect(screen.getByRole('dialog')).toBeInTheDocument()

    resolveRequest(
      response({ body: { share_token: 'new-token', share_url: 'https://dapcook.test/s/new-token' } }),
    )
    expect(await screen.findByDisplayValue('https://dapcook.test/s/new-token')).toBeInTheDocument()
  })
})
