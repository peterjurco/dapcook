import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { mockTranslate } from '@/test/mockMessages'
import { InviteLink } from './InviteLink'

vi.mock('next-intl', () => ({
  useTranslations: (namespace: string) => (key: string) => mockTranslate(namespace, key),
}))

const url = 'https://dapcook.vercel.app/join/abc'

function stubShare(share: ((data: ShareData) => Promise<void>) | undefined) {
  Object.defineProperty(navigator, 'share', { value: share, configurable: true, writable: true })
}

beforeEach(() => {
  Object.defineProperty(navigator, 'clipboard', { value: { writeText: vi.fn(async () => {}) }, configurable: true })
})

afterEach(() => {
  stubShare(undefined)
})

describe('InviteLink', () => {
  it('copies the link', async () => {
    render(<InviteLink url={url} shareText="Join us" />)
    fireEvent.click(screen.getByRole('button', { name: 'Copy' }))
    await waitFor(() => expect(navigator.clipboard.writeText).toHaveBeenCalledWith(url))
    expect(await screen.findByRole('button', { name: 'Copied' })).toBeInTheDocument()
  })

  it('offers no Share button where the browser cannot share', () => {
    render(<InviteLink url={url} shareText="Join us" />)
    expect(screen.queryByRole('button', { name: 'Share' })).not.toBeInTheDocument()
  })

  it('shares the link with the given text', async () => {
    const share = vi.fn(async () => {})
    stubShare(share)
    render(<InviteLink url={url} shareText="Join us" />)
    fireEvent.click(await screen.findByRole('button', { name: 'Share' }))
    expect(share).toHaveBeenCalledWith({ title: 'dapcook', text: 'Join us', url })
  })

  it('does nothing more when sharing is cancelled', async () => {
    stubShare(vi.fn(async () => { throw new DOMException('cancelled', 'AbortError') }))
    render(<InviteLink url={url} shareText="Join us" />)
    fireEvent.click(await screen.findByRole('button', { name: 'Share' }))
    await waitFor(() => expect(navigator.share).toHaveBeenCalled())
    expect(navigator.clipboard.writeText).not.toHaveBeenCalled()
  })

  it('copies the link instead when sharing fails', async () => {
    stubShare(vi.fn(async () => { throw new DOMException('denied', 'NotAllowedError') }))
    render(<InviteLink url={url} shareText="Join us" />)
    fireEvent.click(await screen.findByRole('button', { name: 'Share' }))
    await waitFor(() => expect(navigator.clipboard.writeText).toHaveBeenCalledWith(url))
  })
})
