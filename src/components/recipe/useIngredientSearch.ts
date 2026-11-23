'use client'

import { useEffect, useState } from 'react'
import { MIN_INGREDIENT_TERM } from '@/lib/recipes/filters'
import { normalizeText } from '@/lib/utils/normalize-text'

export const INGREDIENT_SEARCH_DEBOUNCE_MS = 300

interface IngredientSearch {
  /** Matching recipe ids; `null` = no ingredient constraint. */
  ids: Set<string> | null
  loading: boolean
  error: boolean
}

interface SearchResult {
  term: string
  ids: Set<string> | null
  error: boolean
}

/**
 * Asks the server which recipes contain an ingredient matching `term`.
 *
 * While a new term is loading the previous ids are kept, so the list does not
 * flash back to unfiltered between keystrokes. A failed search drops the
 * constraint instead of showing zero results for a reason the user can't see.
 */
export function useIngredientSearch(term: string): IngredientSearch {
  const q = term.trim()
  const active = normalizeText(q).length >= MIN_INGREDIENT_TERM
  // The last answer from the server, for the term it answered. Everything
  // the hook returns is derived from it and the current term.
  const [result, setResult] = useState<SearchResult | null>(null)

  // Emptying the term forgets the last answer, so the next search starts unfiltered.
  if (!active && result !== null) setResult(null)

  useEffect(() => {
    if (!active) return

    const controller = new AbortController()
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/recipes/ingredient-search?q=${encodeURIComponent(q)}`, {
          signal: controller.signal,
        })
        if (!res.ok) throw new Error(`ingredient search failed: ${res.status}`)
        const body = (await res.json()) as { ids: string[] }
        setResult({ term: q, ids: new Set(body.ids), error: false })
      } catch {
        if (controller.signal.aborted) return
        setResult({ term: q, ids: null, error: true })
      }
    }, INGREDIENT_SEARCH_DEBOUNCE_MS)

    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [q, active])

  if (!active) return { ids: null, loading: false, error: false }
  const loading = result?.term !== q
  return { ids: result?.ids ?? null, loading, error: !loading && result?.error === true }
}
