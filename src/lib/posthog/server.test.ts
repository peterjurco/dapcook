// @vitest-environment node
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'

const mocks = vi.hoisted(() => ({
  captureException: vi.fn(),
  PostHog: vi.fn(),
}))

vi.mock('posthog-node', () => ({
  PostHog: mocks.PostHog.mockImplementation(function (this: { captureException: typeof mocks.captureException }) {
    this.captureException = mocks.captureException
  }),
}))

describe('captureServerException', () => {
  const originalKey = process.env.NEXT_PUBLIC_POSTHOG_KEY

  beforeEach(() => {
    vi.resetModules()
    mocks.PostHog.mockClear()
    mocks.captureException.mockClear()
  })

  afterEach(() => {
    process.env.NEXT_PUBLIC_POSTHOG_KEY = originalKey
  })

  it('does nothing when no PostHog key is configured', async () => {
    delete process.env.NEXT_PUBLIC_POSTHOG_KEY
    const { captureServerException } = await import('./server')

    await captureServerException(new Error('boom'))

    expect(mocks.PostHog).not.toHaveBeenCalled()
    expect(mocks.captureException).not.toHaveBeenCalled()
  })

  it('forwards the error and properties to the PostHog client', async () => {
    process.env.NEXT_PUBLIC_POSTHOG_KEY = 'test-key'
    const { captureServerException } = await import('./server')
    const error = new Error('boom')

    await captureServerException(error, { routePath: '/api/recipes' })

    expect(mocks.captureException).toHaveBeenCalledWith(error, undefined, { routePath: '/api/recipes' })
  })

  it('reuses the same client instance across calls', async () => {
    process.env.NEXT_PUBLIC_POSTHOG_KEY = 'test-key'
    const { captureServerException } = await import('./server')

    await captureServerException(new Error('first'))
    await captureServerException(new Error('second'))

    expect(mocks.PostHog).toHaveBeenCalledTimes(1)
  })
})
