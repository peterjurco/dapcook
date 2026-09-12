import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ConfirmModal } from './ConfirmModal'
import { mockTranslate } from '@/test/mockMessages'

vi.mock('next-intl', () => ({
  useTranslations: (namespace: string) => (key: string) => mockTranslate(namespace, key),
}))

describe('ConfirmModal', () => {
  it('falls back to the translated "Remove" label when confirmLabel is not passed', () => {
    render(<ConfirmModal message="Are you sure?" onConfirm={vi.fn()} onCancel={vi.fn()} />)

    expect(screen.getByRole('button', { name: 'Remove' })).toBeInTheDocument()
  })

  it('uses a caller-supplied confirmLabel over the translated default', () => {
    render(<ConfirmModal message="Are you sure?" confirmLabel="Delete forever" onConfirm={vi.fn()} onCancel={vi.fn()} />)

    expect(screen.getByRole('button', { name: 'Delete forever' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Remove' })).not.toBeInTheDocument()
  })

  it('renders a translated Cancel button that triggers onCancel', async () => {
    const onCancel = vi.fn()
    const user = userEvent.setup()
    render(<ConfirmModal message="Are you sure?" onConfirm={vi.fn()} onCancel={onCancel} />)

    await user.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(onCancel).toHaveBeenCalledTimes(1)
  })
})
