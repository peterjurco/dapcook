import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useIsDesktop } from './useIsDesktop'

function stubMatchMedia(matches: boolean) {
  let listener: ((e: MediaQueryListEvent) => void) | null = null
  vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({
    matches,
    addEventListener: (_: string, l: (e: MediaQueryListEvent) => void) => { listener = l },
    removeEventListener: vi.fn(),
  }))
  return { fire: (m: boolean) => listener?.({ matches: m } as MediaQueryListEvent) }
}

afterEach(() => vi.unstubAllGlobals())

describe('useIsDesktop', () => {
  it('is true when the md media query matches', () => {
    stubMatchMedia(true)
    expect(renderHook(() => useIsDesktop()).result.current).toBe(true)
  })

  it('is false when it does not match', () => {
    stubMatchMedia(false)
    expect(renderHook(() => useIsDesktop()).result.current).toBe(false)
  })

  it('updates on a change event', () => {
    const mq = stubMatchMedia(false)
    const { result } = renderHook(() => useIsDesktop())
    act(() => mq.fire(true))
    expect(result.current).toBe(true)
  })

  it('stays null when matchMedia is unavailable', () => {
    vi.stubGlobal('matchMedia', undefined)
    expect(renderHook(() => useIsDesktop()).result.current).toBeNull()
  })
})
