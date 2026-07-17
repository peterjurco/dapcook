import { act, render } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PostHogProvider } from './PostHogProvider'

const mocks = vi.hoisted(() => ({
  pathname: '/recipes',
  init: vi.fn(),
  capture: vi.fn(),
  setConfig: vi.fn(),
  stopSessionRecording: vi.fn(),
}))

vi.mock('next/navigation', () => ({
  usePathname: () => mocks.pathname,
  useSearchParams: () => new URLSearchParams(),
}))

vi.mock('posthog-js', () => ({
  default: {
    init: mocks.init,
    capture: mocks.capture,
    set_config: mocks.setConfig,
    stopSessionRecording: mocks.stopSessionRecording,
  },
}))

vi.mock('posthog-js/react', () => ({
  PostHogProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  usePostHog: () => ({ capture: mocks.capture }),
}))

describe('PostHogProvider analytics boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.pathname = '/recipes'
    vi.stubEnv('NEXT_PUBLIC_POSTHOG_KEY', 'test-key')
  })

  it.each(['/s', '/s/public-token'])('does not initialize or capture on %s', async (pathname) => {
    mocks.pathname = pathname

    render(<PostHogProvider>Shared recipe</PostHogProvider>)
    await act(async () => {})

    expect(mocks.init).not.toHaveBeenCalled()
    expect(mocks.capture).not.toHaveBeenCalled()
  })

  it('initializes and tracks an ordinary app path', async () => {
    render(<PostHogProvider>Recipes</PostHogProvider>)
    await act(async () => {})

    expect(mocks.init).toHaveBeenCalledOnce()
    expect(mocks.capture).toHaveBeenCalledWith('$pageview', {
      $current_url: 'http://localhost:3000/recipes',
    })
  })

  it('stops capture before rendering a shared path after client navigation', async () => {
    const view = render(<PostHogProvider>Recipes</PostHogProvider>)
    await act(async () => {})
    mocks.capture.mockClear()

    mocks.pathname = '/s/public-token'
    view.rerender(<PostHogProvider>Shared recipe</PostHogProvider>)
    await act(async () => {})

    expect(mocks.stopSessionRecording).toHaveBeenCalled()
    expect(mocks.setConfig).toHaveBeenCalledWith(expect.objectContaining({
      autocapture: false,
      capture_pageleave: false,
      disable_session_recording: true,
    }))
    expect(mocks.capture).not.toHaveBeenCalled()
  })
})
