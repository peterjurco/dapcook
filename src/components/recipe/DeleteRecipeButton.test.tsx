import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { DeleteRecipeButton } from './DeleteRecipeButton'
import { mockTranslate } from '@/test/mockMessages'
import type { TranslationValues } from 'use-intl'

const mockCapture = vi.fn()
const mockPush = vi.fn()
const mockRefresh = vi.fn()

vi.mock('posthog-js/react', () => ({
  usePostHog: () => ({ capture: mockCapture }),
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush, refresh: mockRefresh }),
}))

vi.mock('next-intl', () => ({
  useTranslations: (namespace: string) => (key: string, values?: TranslationValues) =>
    mockTranslate(namespace, key, values),
}))

beforeEach(() => {
  vi.clearAllMocks()
})

describe('DeleteRecipeButton', () => {
  it('captures recipe_deleted after confirmed delete', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true } as Response)
    render(<DeleteRecipeButton recipeId="r-1" />)
    await userEvent.click(screen.getByRole('button', { name: /delete/i }))
    await userEvent.click(screen.getByRole('button', { name: /yes, delete/i }))
    await waitFor(() => expect(mockCapture).toHaveBeenCalledWith('recipe_deleted'))
  })

  it('does not capture recipe_deleted when delete fails', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false } as Response)
    render(<DeleteRecipeButton recipeId="r-1" />)
    await userEvent.click(screen.getByRole('button', { name: /delete/i }))
    await userEvent.click(screen.getByRole('button', { name: /yes, delete/i }))
    await waitFor(() => expect(mockPush).not.toHaveBeenCalled())
    expect(mockCapture).not.toHaveBeenCalledWith('recipe_deleted')
  })
})
