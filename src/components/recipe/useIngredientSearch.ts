'use client'

import { useEffect, useState } from 'react'
import { MIN_INGREDIENT_TERM } from '@/lib/recipes/filters'

export const INGREDIENT_SEARCH_DEBOUNCE_MS = 300

interface IngredientSearch {
  /** Matching recipe ids; `null` = no ingredient constraint. */
  ids: Set<string> | null
  loading: boolean
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
  const active = q.length >= MIN_INGREDIENT_TERM
  const [ids, setIds] = useState<Set<string> | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(false)

  useEffect(() => {
    if (!active) {
      setIds(null)
      setLoading(false)
      setError(false)
      return
    }

    const controller = new AbortController()
    setLoading(true)
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/recipes/ingredient-search?q=${encodeURIComponent(q)}`, {
          signal: controller.signal,
        })
        if (!res.ok) throw new Error(`ingredient search failed: ${res.status}`)
        const body = (await res.json()) as { ids: string[] }
        setIds(new Set(body.ids))
        setError(false)
      } catch {
        if (controller.signal.aborted) return
        setIds(null)
        setError(true)
      }
      setLoading(false)
    }, INGREDIENT_SEARCH_DEBOUNCE_MS)

    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [q, active])

  return active ? { ids, loading, error } : { ids: null, loading: false, error: false }
}
