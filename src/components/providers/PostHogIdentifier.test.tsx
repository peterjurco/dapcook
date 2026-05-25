import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render } from '@testing-library/react'
import { PostHogIdentifier } from './PostHogIdentifier'

const mockCapture = vi.fn()
const mockIdentify = vi.fn()
const mockReplace = vi.fn()

vi.mock('posthog-js/react', () => ({
  usePostHog: () => ({ capture: mockCapture, identify: mockIdentify }),
  PostHogProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))

const mockSearchParams = new URLSearchParams()
let mockPathname = '/recipes'

vi.mock('next/navigation', () => ({
  useSearchParams: () => mockSearchParams,
  usePathname: () => mockPathname,
  useRouter: () => ({ replace: mockReplace }),
}))

beforeEach(() => {
  vi.clearAllMocks()
  mockSearchParams.delete('ob')
  mockPathname = '/recipes'
})

describe('PostHogIdentifier', () => {
  it('identifies the user on mount', () => {
    render(<PostHogIdentifier userId="user-123" email="test@example.com" />)
    expect(mockIdentify).toHaveBeenCalledWith('user-123', { email: 'test@example.com' })
  })

  it('does not fire onboarding_completed without ?ob=1', () => {
    render(<PostHogIdentifier userId="user-123" email="test@example.com" />)
    expect(mockCapture).not.toHaveBeenCalledWith('onboarding_completed')
  })

  it('fires onboarding_completed when ?ob=1 is present', () => {
    mockSearchParams.set('ob', '1')
    render(<PostHogIdentifier userId="user-123" email="test@example.com" />)
    expect(mockCapture).toHaveBeenCalledWith('onboarding_completed')
  })

  it('cleans up ?ob=1 from the URL after firing onboarding_completed', () => {
    mockSearchParams.set('ob', '1')
    render(<PostHogIdentifier userId="user-123" email="test@example.com" />)
    expect(mockReplace).toHaveBeenCalledWith('/recipes')
  })
})
