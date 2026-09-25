import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render } from '@testing-library/react'
import { PostHogIdentifier } from './PostHogIdentifier'

const mockCapture = vi.fn()
const mockIdentify = vi.fn()
const mockReplace = vi.fn()
const mockOptOut = vi.fn()
const mockOptIn = vi.fn()

vi.mock('posthog-js/react', () => ({
  usePostHog: () => ({
    capture: mockCapture,
    identify: mockIdentify,
    opt_out_capturing: mockOptOut,
    opt_in_capturing: mockOptIn,
  }),
  PostHogProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))

let mockSearchParams = new URLSearchParams()
let mockPathname = '/recipes'

vi.mock('next/navigation', () => ({
  useSearchParams: () => mockSearchParams,
  usePathname: () => mockPathname,
  useRouter: () => ({ replace: mockReplace }),
}))

beforeEach(() => {
  vi.clearAllMocks()
  mockSearchParams = new URLSearchParams()
  mockPathname = '/recipes'
})

describe('PostHogIdentifier', () => {
  it('identifies the user on mount', () => {
    render(<PostHogIdentifier userId="user-123" email="test@example.com" />)
    expect(mockIdentify).toHaveBeenCalledWith('user-123', { email: 'test@example.com' })
  })

  it('does not fire onboarding_completed without ?ob=1', () => {
    render(<PostHogIdentifier userId="user-123" email="test@example.com" />)
    expect(mockCapture).not.toHaveBeenCalled()
    expect(mockReplace).not.toHaveBeenCalled()
  })

  it('fires onboarding_completed when ?ob=1 is present', () => {
    mockSearchParams.set('ob', '1')
    render(<PostHogIdentifier userId="user-123" email="test@example.com" />)
    expect(mockCapture).toHaveBeenCalledWith('onboarding_completed', { method: 'create' })
  })

  it('cleans up ?ob=1 from the URL after firing onboarding_completed', () => {
    mockSearchParams.set('ob', '1')
    render(<PostHogIdentifier userId="user-123" email="test@example.com" />)
    expect(mockReplace).toHaveBeenCalledWith('/recipes')
  })

  it('reports a join when ?obm=join accompanies ?ob=1, and strips both params', () => {
    mockSearchParams.set('ob', '1')
    mockSearchParams.set('obm', 'join')
    render(<PostHogIdentifier userId="user-123" email="test@example.com" />)
    expect(mockCapture).toHaveBeenCalledWith('onboarding_completed', { method: 'join' })
    expect(mockReplace).toHaveBeenCalledWith('/recipes')
  })

  it('opts out of capturing when optOut is true', () => {
    render(<PostHogIdentifier userId="user-123" email="admin@example.com" optOut />)
    expect(mockOptOut).toHaveBeenCalled()
    expect(mockIdentify).not.toHaveBeenCalled()
  })

  it('opts in and identifies when optOut is false', () => {
    render(<PostHogIdentifier userId="user-123" email="test@example.com" optOut={false} />)
    expect(mockOptIn).toHaveBeenCalled()
    expect(mockIdentify).toHaveBeenCalledWith('user-123', { email: 'test@example.com' })
  })
})
