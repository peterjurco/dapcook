import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { INGREDIENT_SEARCH_DEBOUNCE_MS, useIngredientSearch } from './useIngredientSearch'

function ok(ids: string[]) {
  return { ok: true, json: async () => ({ ids }) }
}

let fetchMock: ReturnType<typeof vi.fn>

beforeEach(() => {
  vi.useFakeTimers()
  fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('useIngredientSearch', () => {
  it('does nothing for a term shorter than two characters', async () => {
    const { result } = renderHook(() => useIngredientSearch(' g '))
    await act(() => vi.advanceTimersByTimeAsync(INGREDIENT_SEARCH_DEBOUNCE_MS))
    expect(fetchMock).not.toHaveBeenCalled()
    expect(result.current).toEqual({ ids: null, loading: false, error: false })
  })

  it('debounces, then returns the matching ids', async () => {
    fetchMock.mockResolvedValue(ok(['r1']))
    const { result } = renderHook(() => useIngredientSearch('garlic'))

    expect(result.current.loading).toBe(true)
    await act(() => vi.advanceTimersByTimeAsync(INGREDIENT_SEARCH_DEBOUNCE_MS - 1))
    expect(fetchMock).not.toHaveBeenCalled()

    await act(() => vi.advanceTimersByTimeAsync(1))
    expect(fetchMock).toHaveBeenCalledWith('/api/recipes/ingredient-search?q=garlic', expect.anything())
    expect(result.current).toEqual({ ids: new Set(['r1']), loading: false, error: false })
  })

  it('only requests the latest term while the user is typing', async () => {
    fetchMock.mockResolvedValue(ok([]))
    const { rerender } = renderHook(({ term }) => useIngredientSearch(term), { initialProps: { term: 'ga' } })
    rerender({ term: 'gar' })
    rerender({ term: 'garlic' })
    await act(() => vi.advanceTimersByTimeAsync(INGREDIENT_SEARCH_DEBOUNCE_MS))
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0][0]).toBe('/api/recipes/ingredient-search?q=garlic')
  })

  it('aborts an in-flight request when the term changes', async () => {
    fetchMock.mockImplementation(() => new Promise(() => {}))
    const { rerender } = renderHook(({ term }) => useIngredientSearch(term), { initialProps: { term: 'garlic' } })
    await act(() => vi.advanceTimersByTimeAsync(INGREDIENT_SEARCH_DEBOUNCE_MS))
    const signal = fetchMock.mock.calls[0][1].signal as AbortSignal

    rerender({ term: 'onion' })
    expect(signal.aborted).toBe(true)
  })

  it('reports an error and drops the constraint when the request fails', async () => {
    fetchMock.mockResolvedValue({ ok: false, json: async () => ({}) })
    const { result } = renderHook(() => useIngredientSearch('garlic'))
    await act(() => vi.advanceTimersByTimeAsync(INGREDIENT_SEARCH_DEBOUNCE_MS))
    expect(result.current).toEqual({ ids: null, loading: false, error: true })
  })

  it('clears the result when the term is emptied', async () => {
    fetchMock.mockResolvedValue(ok(['r1']))
    const { result, rerender } = renderHook(({ term }) => useIngredientSearch(term), { initialProps: { term: 'garlic' } })
    await act(() => vi.advanceTimersByTimeAsync(INGREDIENT_SEARCH_DEBOUNCE_MS))
    rerender({ term: '' })
    expect(result.current).toEqual({ ids: null, loading: false, error: false })
  })

  it('clears a stale error once a new search starts', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, json: async () => ({}) })
    const { result, rerender } = renderHook(({ term }) => useIngredientSearch(term), { initialProps: { term: 'garlic' } })
    await act(() => vi.advanceTimersByTimeAsync(INGREDIENT_SEARCH_DEBOUNCE_MS))
    expect(result.current.error).toBe(true)

    fetchMock.mockImplementation(() => new Promise(() => {}))
    rerender({ term: 'onion' })
    expect(result.current).toEqual({ ids: null, loading: true, error: false })
  })

  it('only searches once diacritics are stripped down to two characters', async () => {
    // Two bare combining marks: two raw characters, but normalizeText strips
    // them to an empty string, so this must not be treated as active.
    const term = '́́'
    renderHook(() => useIngredientSearch(term))
    await act(() => vi.advanceTimersByTimeAsync(INGREDIENT_SEARCH_DEBOUNCE_MS))
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
