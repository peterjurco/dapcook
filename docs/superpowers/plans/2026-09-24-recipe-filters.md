# Recipe Filters Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add total-time, portions and ingredient filters to the recipe list, show title search on mobile, and stop the bottom nav from covering the filter modal footer.

**Architecture:** Tag, time, portions and title filtering stay client-side in a new pure module `src/lib/recipes/filters.ts`. Ingredient search goes through a new `GET /api/recipes/ingredient-search` route that returns matching recipe ids, because the list payload deliberately omits `ingredients`. A debounced hook feeds those ids into the same client-side pipeline.

**Tech Stack:** Next.js 14 (app router), React, Tailwind, next-intl, Supabase (`@supabase/ssr`), Vitest + Testing Library.

**Spec:** `docs/superpowers/specs/2026-09-24-recipe-filters-design.md`

**Branch:** `feat/recipe-filters` (already created, spec committed).

**Commands:** `npm test -- <path>` runs one test file; `npm test` runs all; `npm run type-check`; `npm run lint`.

---

## File map

| File | Status | Responsibility |
| --- | --- | --- |
| `src/lib/utils/normalize-text.ts` | create | lowercase + strip diacritics |
| `src/lib/recipes/filters.ts` | create | ranges, presets, `applyFilters`, `activeFilterCount` |
| `src/app/api/recipes/ingredient-search/route.ts` | create | ids of recipes whose ingredient name contains `q` |
| `src/components/recipe/useIngredientSearch.ts` | create | debounced, abortable client for the route |
| `src/components/recipe/RangeFilter.tsx` | create | preset chips + custom from–to inputs |
| `src/components/recipe/RecipeFiltersModal.tsx` | modify | new sections, clear-all, z-index/safe-area fix |
| `src/components/recipe/RecipeList.tsx` | modify | new state, wiring, mobile search layout |
| `messages/{en,sk}/recipes.json`, `messages/{en,sk}/errors.json` | modify | copy |

---

### Task 1: `normalizeText`

**Files:**
- Create: `src/lib/utils/normalize-text.ts`
- Test: `src/lib/utils/normalize-text.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest'
import { normalizeText } from './normalize-text'

describe('normalizeText', () => {
  it('lowercases and strips Slovak diacritics', () => {
    expect(normalizeText('Česnak')).toBe('cesnak')
    expect(normalizeText('ĽADOVÝ šalát, ôsmy')).toBe('ladovy salat, osmy')
  })

  it('leaves plain ASCII untouched apart from case', () => {
    expect(normalizeText('Garlic Bread')).toBe('garlic bread')
  })
})
```

- [ ] **Step 2: Run it, expect FAIL** (`Cannot find module './normalize-text'`)

Run: `npm test -- src/lib/utils/normalize-text.test.ts`

- [ ] **Step 3: Implement**

```ts
/**
 * Folds a string for loose, accent-insensitive matching: "Česnak" and
 * "cesnak" compare equal. NFD splits each accented letter into its base
 * letter plus a combining mark, and the marks are then dropped.
 */
export function normalizeText(s: string): string {
  // eslint-disable-next-line no-misleading-character-class
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}
```

- [ ] **Step 4: Run it, expect PASS**

Run: `npm test -- src/lib/utils/normalize-text.test.ts`

- [ ] **Step 5: Commit**

```bash
git add src/lib/utils/normalize-text.ts src/lib/utils/normalize-text.test.ts
git commit -m "feat: add accent-insensitive normalizeText helper"
```

---

### Task 2: filter logic

**Files:**
- Create: `src/lib/recipes/filters.ts`
- Test: `src/lib/recipes/filters.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, expect, it } from 'vitest'
import {
  activeFilterCount,
  applyFilters,
  matchesRange,
  presetFor,
  SERVINGS_PRESETS,
  TIME_PRESETS,
  totalTime,
  type FilterCriteria,
} from './filters'
import { EMPTY_TAXONOMY } from '@/lib/tags/taxonomy'
import type { RecipeListItem } from './list-columns'

function recipe(id: string, over: Partial<RecipeListItem> = {}): RecipeListItem {
  return {
    id,
    title: id,
    image_url: null,
    tags: [],
    prep_time_min: null,
    cook_time_min: null,
    servings: null,
    ...over,
  }
}

const none: FilterCriteria = { tags: [], time: null, servings: null, search: '', ingredientIds: null }

describe('totalTime', () => {
  it('adds prep and cook', () => {
    expect(totalTime(recipe('a', { prep_time_min: 10, cook_time_min: 20 }))).toBe(30)
  })
  it('counts a missing half as 0', () => {
    expect(totalTime(recipe('a', { prep_time_min: 10 }))).toBe(10)
    expect(totalTime(recipe('a', { cook_time_min: 25 }))).toBe(25)
  })
  it('is null only when both are missing', () => {
    expect(totalTime(recipe('a'))).toBeNull()
  })
})

describe('matchesRange', () => {
  it('matches anything when there is no range', () => {
    expect(matchesRange(null, null)).toBe(true)
    expect(matchesRange(5, null)).toBe(true)
  })
  it('never matches a missing value against an active range', () => {
    expect(matchesRange(null, { min: null, max: 15 })).toBe(false)
  })
  it('treats both bounds as inclusive and null bounds as open', () => {
    expect(matchesRange(15, { min: null, max: 15 })).toBe(true)
    expect(matchesRange(16, { min: null, max: 15 })).toBe(false)
    expect(matchesRange(61, { min: 61, max: null })).toBe(true)
    expect(matchesRange(60, { min: 61, max: null })).toBe(false)
    expect(matchesRange(30, { min: 16, max: 30 })).toBe(true)
  })
})

describe('presets', () => {
  it('put every total time in exactly one time preset', () => {
    for (const minutes of [0, 15, 16, 30, 31, 60, 61, 240]) {
      const hits = TIME_PRESETS.filter((p) => matchesRange(minutes, p.range))
      expect(hits, `${minutes} min`).toHaveLength(1)
    }
  })
  it('put every serving count in exactly one servings preset', () => {
    for (const n of [1, 2, 3, 4, 5, 12]) {
      expect(SERVINGS_PRESETS.filter((p) => matchesRange(n, p.range)), `${n}`).toHaveLength(1)
    }
  })
})

describe('presetFor', () => {
  it('finds the preset with exactly the same bounds', () => {
    expect(presetFor({ min: 16, max: 30 }, TIME_PRESETS)?.label).toBe('15–30')
    expect(presetFor({ min: null, max: 15 }, TIME_PRESETS)?.label).toBe('≤ 15')
  })
  it('returns undefined for a custom range or no range', () => {
    expect(presetFor({ min: 16, max: 40 }, TIME_PRESETS)).toBeUndefined()
    expect(presetFor(null, TIME_PRESETS)).toBeUndefined()
  })
})

describe('applyFilters', () => {
  const quick = recipe('quick', { title: 'Čučoriedkový koláč', prep_time_min: 5, cook_time_min: 5, servings: 2, tags: ['sweet'] })
  const slow = recipe('slow', { title: 'Guláš', prep_time_min: 30, cook_time_min: 90, servings: 6 })
  const unknown = recipe('unknown', { title: 'Mystery' })
  const all = [quick, slow, unknown]

  it('returns everything with no criteria', () => {
    expect(applyFilters(all, none, EMPTY_TAXONOMY)).toEqual(all)
  })
  it('filters by total time and drops recipes with no time', () => {
    expect(applyFilters(all, { ...none, time: { min: null, max: 15 } }, EMPTY_TAXONOMY)).toEqual([quick])
  })
  it('filters by servings and drops recipes with no servings', () => {
    expect(applyFilters(all, { ...none, servings: { min: 5, max: null } }, EMPTY_TAXONOMY)).toEqual([slow])
  })
  it('keeps only recipes in the ingredient id set', () => {
    expect(applyFilters(all, { ...none, ingredientIds: new Set(['slow', 'unknown']) }, EMPTY_TAXONOMY)).toEqual([slow, unknown])
  })
  it('matches the title search ignoring case and diacritics', () => {
    expect(applyFilters(all, { ...none, search: 'gulas' }, EMPTY_TAXONOMY)).toEqual([slow])
    expect(applyFilters(all, { ...none, search: '  ČUČO ' }, EMPTY_TAXONOMY)).toEqual([quick])
  })
  it('ANDs every criterion together', () => {
    expect(
      applyFilters(all, { ...none, tags: ['sweet'], time: { min: null, max: 15 }, servings: { min: 5, max: null } }, EMPTY_TAXONOMY)
    ).toEqual([])
  })
})

describe('activeFilterCount', () => {
  it('counts tags plus one per active range and ingredient term', () => {
    expect(activeFilterCount({ tags: [], time: null, servings: null, ingredient: '' })).toBe(0)
    expect(
      activeFilterCount({ tags: ['a', 'b'], time: { min: null, max: 15 }, servings: { min: 5, max: null }, ingredient: 'garlic' })
    ).toBe(5)
  })
  it('ignores an ingredient term too short to search', () => {
    expect(activeFilterCount({ tags: [], time: null, servings: null, ingredient: ' g ' })).toBe(0)
  })
})
```

- [ ] **Step 2: Run, expect FAIL** (module not found)

Run: `npm test -- src/lib/recipes/filters.test.ts`

- [ ] **Step 3: Implement `src/lib/recipes/filters.ts`**

```ts
import { filterRecipesByTags, type Taxonomy } from '@/lib/tags/taxonomy'
import { normalizeText } from '@/lib/utils/normalize-text'
import type { RecipeListItem } from './list-columns'

/** Inclusive bounds; a `null` side is open. */
export interface Range {
  min: number | null
  max: number | null
}

export interface RangePreset {
  label: string
  range: Range
}

/** Shortest ingredient term worth a server round trip. */
export const MIN_INGREDIENT_TERM = 2

// Lower bounds of the first presets are open rather than 0/1 so a custom
// "to 15" is recognised as the "≤ 15" preset. Adjacent presets never share
// a boundary, so every value falls into exactly one.
export const TIME_PRESETS: readonly RangePreset[] = [
  { label: '≤ 15', range: { min: null, max: 15 } },
  { label: '15–30', range: { min: 16, max: 30 } },
  { label: '30–60', range: { min: 31, max: 60 } },
  { label: '60+', range: { min: 61, max: null } },
]

export const SERVINGS_PRESETS: readonly RangePreset[] = [
  { label: '1–2', range: { min: null, max: 2 } },
  { label: '3–4', range: { min: 3, max: 4 } },
  { label: '5+', range: { min: 5, max: null } },
]

type Timed = Pick<RecipeListItem, 'prep_time_min' | 'cook_time_min'>

/** Prep + cook, a missing half counting as 0; `null` when neither is known. */
export function totalTime(recipe: Timed): number | null {
  if (recipe.prep_time_min == null && recipe.cook_time_min == null) return null
  return (recipe.prep_time_min ?? 0) + (recipe.cook_time_min ?? 0)
}

/**
 * A recipe with no value never satisfies an active range: asking for "under
 * 30 minutes" should not surface recipes whose time nobody entered.
 */
export function matchesRange(value: number | null, range: Range | null): boolean {
  if (!range || (range.min === null && range.max === null)) return true
  if (value === null) return false
  if (range.min !== null && value < range.min) return false
  if (range.max !== null && value > range.max) return false
  return true
}

export function presetFor(range: Range | null, presets: readonly RangePreset[]): RangePreset | undefined {
  if (!range) return undefined
  return presets.find((p) => p.range.min === range.min && p.range.max === range.max)
}

export interface FilterCriteria {
  tags: string[]
  time: Range | null
  servings: Range | null
  search: string
  /** Recipes matched by the ingredient search; `null` = no ingredient constraint. */
  ingredientIds: ReadonlySet<string> | null
}

export function applyFilters<T extends RecipeListItem>(
  recipes: readonly T[],
  criteria: FilterCriteria,
  taxonomy: Taxonomy
): T[] {
  const q = normalizeText(criteria.search.trim())
  return filterRecipesByTags(recipes, criteria.tags, taxonomy).filter(
    (r) =>
      matchesRange(totalTime(r), criteria.time) &&
      matchesRange(r.servings, criteria.servings) &&
      (criteria.ingredientIds === null || criteria.ingredientIds.has(r.id)) &&
      (q === '' || normalizeText(r.title).includes(q))
  )
}

/** What the user has chosen in the Filters modal, as counted on its badge. */
export interface RecipeFilters {
  tags: string[]
  time: Range | null
  servings: Range | null
  ingredient: string
}

export function activeFilterCount(filters: RecipeFilters): number {
  return (
    filters.tags.length +
    (filters.time ? 1 : 0) +
    (filters.servings ? 1 : 0) +
    (filters.ingredient.trim().length >= MIN_INGREDIENT_TERM ? 1 : 0)
  )
}
```

- [ ] **Step 4: Run, expect PASS**

Run: `npm test -- src/lib/recipes/filters.test.ts`

- [ ] **Step 5: Commit**

```bash
git add src/lib/recipes/filters.ts src/lib/recipes/filters.test.ts
git commit -m "feat: add recipe filter logic for time, servings and ingredient ids"
```

---

### Task 3: ingredient search route

**Files:**
- Create: `src/app/api/recipes/ingredient-search/route.ts`
- Test: `src/app/api/recipes/ingredient-search/route.test.ts`
- Modify: `messages/en/errors.json`, `messages/sk/errors.json`

- [ ] **Step 1: Add the error copy**

In `messages/en/errors.json` add after `"unauthorized"`:
```json
  "queryTooShort": "Search term is too short",
```
In `messages/sk/errors.json` add after `"unauthorized"`:
```json
  "queryTooShort": "Hľadaný výraz je príliš krátky",
```

- [ ] **Step 2: Write the failing test**

```ts
// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { GET } from './route'
import { mockTranslate } from '@/test/mockMessages'

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('next-intl/server', () => ({
  getTranslations: async ({ namespace }: { namespace: string }) => (key: string) => mockTranslate(namespace, key),
}))
import { createClient } from '@/lib/supabase/server'
import { authMock } from '@/test/authMock'

const rows = [
  { id: 'r1', ingredients: [{ id: 'i1', quantity: 2, unit: 'strúčik', name: 'Česnak', notes: '' }] },
  { id: 'r2', ingredients: [{ id: 'i2', quantity: 1, unit: 'garlic press', name: 'Butter', notes: 'garlic butter' }] },
  { id: 'r3', ingredients: null },
]

function makeSupabase(user: { id: string } | null, result: { data: unknown; error: null | { message: string } } = { data: rows, error: null }) {
  const qb = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    then: (ok?: (v: unknown) => unknown, fail?: (r: unknown) => unknown) => Promise.resolve(result).then(ok, fail),
  }
  return { client: { auth: authMock(user), from: vi.fn(() => qb) }, qb }
}

function get(q: string) {
  return GET(new NextRequest(`http://localhost/api/recipes/ingredient-search?q=${encodeURIComponent(q)}`))
}

beforeEach(() => vi.clearAllMocks())

describe('GET /api/recipes/ingredient-search', () => {
  it('returns 401 when unauthenticated', async () => {
    vi.mocked(createClient).mockReturnValue(makeSupabase(null).client as unknown as ReturnType<typeof createClient>)
    expect((await get('garlic')).status).toBe(401)
  })

  it('returns 400 for a term shorter than two characters', async () => {
    vi.mocked(createClient).mockReturnValue(makeSupabase({ id: 'u1' }).client as unknown as ReturnType<typeof createClient>)
    expect((await get(' c ')).status).toBe(400)
  })

  it('matches ingredient names ignoring case and diacritics, and only non-archived recipes', async () => {
    const { client, qb } = makeSupabase({ id: 'u1' })
    vi.mocked(createClient).mockReturnValue(client as unknown as ReturnType<typeof createClient>)

    const res = await get('CESNAK')
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ids: ['r1'] })
    expect(client.from).toHaveBeenCalledWith('recipes')
    expect(qb.select).toHaveBeenCalledWith('id, ingredients')
    expect(qb.eq).toHaveBeenCalledWith('is_archived', false)
  })

  it('matches the name only, not the unit or notes', async () => {
    vi.mocked(createClient).mockReturnValue(makeSupabase({ id: 'u1' }).client as unknown as ReturnType<typeof createClient>)
    expect(await (await get('garlic')).json()).toEqual({ ids: [] })
  })

  it('returns 500 when the query fails', async () => {
    vi.mocked(createClient).mockReturnValue(
      makeSupabase({ id: 'u1' }, { data: null, error: { message: 'boom' } }).client as unknown as ReturnType<typeof createClient>
    )
    expect((await get('garlic')).status).toBe(500)
  })
})
```

- [ ] **Step 3: Run, expect FAIL** (module not found)

Run: `npm test -- src/app/api/recipes/ingredient-search/route.test.ts`

- [ ] **Step 4: Implement the route**

```ts
import { NextResponse, type NextRequest } from 'next/server'
import { getTranslations } from 'next-intl/server'
import { createClient } from '@/lib/supabase/server'
import { defaultLocale } from '@/i18n/config'
import { getCurrentUser } from '@/lib/auth/current-user'
import { MIN_INGREDIENT_TERM } from '@/lib/recipes/filters'
import { normalizeText } from '@/lib/utils/normalize-text'
import type { Ingredient } from '@/types/recipe'

/**
 * Ids of the household's recipes with an ingredient whose name contains `q`.
 *
 * This runs on the server because the recipe list ships without
 * `ingredients` (see RECIPE_LIST_FIELDS): the list loads on every visit, an
 * ingredient search is rare, so the rare path pays the round trip.
 */
export async function GET(request: NextRequest) {
  const user = await getCurrentUser()
  if (!user) {
    const t = await getTranslations({ locale: defaultLocale, namespace: 'errors' })
    return NextResponse.json({ error: t('unauthorized') }, { status: 401 })
  }

  const q = normalizeText((request.nextUrl.searchParams.get('q') ?? '').trim())
  if (q.length < MIN_INGREDIENT_TERM) {
    const t = await getTranslations({ locale: defaultLocale, namespace: 'errors' })
    return NextResponse.json({ error: t('queryTooShort') }, { status: 400 })
  }

  const supabase = createClient()
  const { data, error } = await supabase.from('recipes').select('id, ingredients').eq('is_archived', false)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const ids = (data ?? [])
    .filter((r) =>
      ((r.ingredients as unknown as Ingredient[] | null) ?? []).some((i) => normalizeText(i.name ?? '').includes(q))
    )
    .map((r) => r.id)

  return NextResponse.json({ ids })
}
```

- [ ] **Step 5: Run, expect PASS**

Run: `npm test -- src/app/api/recipes/ingredient-search/route.test.ts`

- [ ] **Step 6: Commit**

```bash
git add src/app/api/recipes/ingredient-search messages/en/errors.json messages/sk/errors.json
git commit -m "feat: add ingredient search endpoint returning matching recipe ids"
```

---

### Task 4: `useIngredientSearch` hook

**Files:**
- Create: `src/components/recipe/useIngredientSearch.ts`
- Test: `src/components/recipe/useIngredientSearch.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
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
})
```

- [ ] **Step 2: Run, expect FAIL** (module not found)

Run: `npm test -- src/components/recipe/useIngredientSearch.test.ts`

- [ ] **Step 3: Implement**

```ts
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
```

- [ ] **Step 4: Run, expect PASS**

Run: `npm test -- src/components/recipe/useIngredientSearch.test.ts`

- [ ] **Step 5: Commit**

```bash
git add src/components/recipe/useIngredientSearch.ts src/components/recipe/useIngredientSearch.test.ts
git commit -m "feat: add debounced useIngredientSearch hook"
```

---

### Task 5: `RangeFilter` component + copy

**Files:**
- Create: `src/components/recipe/RangeFilter.tsx`
- Test: `src/components/recipe/RangeFilter.test.tsx`
- Modify: `messages/en/recipes.json`, `messages/sk/recipes.json` (`filtersModal` block)

- [ ] **Step 1: Add copy to `filtersModal`**

`messages/en/recipes.json`, inside `"filtersModal"` after `"showResults"` (add a comma to the preceding line):
```json
    "ingredient": "Ingredient",
    "ingredientPlaceholder": "e.g. garlic",
    "ingredientError": "Ingredient search failed. Try again.",
    "totalTime": "Total time (min)",
    "servings": "Portions",
    "custom": "Custom",
    "from": "From",
    "to": "To"
```
`messages/sk/recipes.json`, same place:
```json
    "ingredient": "Ingrediencia",
    "ingredientPlaceholder": "napr. cesnak",
    "ingredientError": "Vyhľadávanie podľa ingrediencie zlyhalo. Skúste znova.",
    "totalTime": "Celkový čas (min)",
    "servings": "Porcie",
    "custom": "Vlastné",
    "from": "Od",
    "to": "Do"
```

- [ ] **Step 2: Write the failing test**

```tsx
import { describe, expect, it, vi } from 'vitest'
import { useState } from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { TranslationValues } from 'use-intl'
import { RangeFilter } from './RangeFilter'
import { TIME_PRESETS, type Range } from '@/lib/recipes/filters'
import { mockTranslate } from '@/test/mockMessages'

vi.mock('next-intl', () => ({
  useTranslations: (namespace: string) => (key: string, values?: TranslationValues) =>
    mockTranslate(namespace, key, values),
}))

function Harness({ initial = null, onChange = () => {} }: { initial?: Range | null; onChange?: (r: Range | null) => void }) {
  const [value, setValue] = useState<Range | null>(initial)
  return (
    <RangeFilter
      label="Total time (min)"
      presets={TIME_PRESETS}
      value={value}
      onChange={(next) => {
        setValue(next)
        onChange(next)
      }}
    />
  )
}

const chip = (name: string) => screen.getByRole('button', { name })
const from = () => screen.getByRole('textbox', { name: 'Total time (min): From' })
const to = () => screen.getByRole('textbox', { name: 'Total time (min): To' })

describe('RangeFilter', () => {
  it('selects a preset and clears it on a second tap', async () => {
    const onChange = vi.fn()
    const user = userEvent.setup()
    render(<Harness onChange={onChange} />)

    await user.click(chip('15–30'))
    expect(onChange).toHaveBeenLastCalledWith({ min: 16, max: 30 })
    expect(chip('15–30')).toHaveAttribute('aria-pressed', 'true')

    await user.click(chip('15–30'))
    expect(onChange).toHaveBeenLastCalledWith(null)
    expect(chip('15–30')).toHaveAttribute('aria-pressed', 'false')
  })

  it('hides the inputs until Custom is tapped, then pre-fills them from the current range', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()

    await user.click(chip('15–30'))
    await user.click(chip('Custom'))
    expect(from()).toHaveValue('16')
    expect(to()).toHaveValue('30')
  })

  it('emits an open-ended range when only one input is filled', async () => {
    const onChange = vi.fn()
    const user = userEvent.setup()
    render(<Harness onChange={onChange} />)

    await user.click(chip('Custom'))
    await user.type(from(), '20')
    expect(onChange).toHaveBeenLastCalledWith({ min: 20, max: null })
    expect(chip('Custom')).toHaveAttribute('aria-pressed', 'true')
  })

  it('lights up the preset a typed range equals, keeping the inputs open', async () => {
    const user = userEvent.setup()
    render(<Harness />)

    await user.click(chip('Custom'))
    await user.type(to(), '15')
    expect(chip('≤ 15')).toHaveAttribute('aria-pressed', 'true')
    expect(chip('Custom')).toHaveAttribute('aria-pressed', 'false')
    expect(to()).toBeInTheDocument()
  })

  it('ignores non-digits and clears the range when both inputs are emptied', async () => {
    const onChange = vi.fn()
    const user = userEvent.setup()
    render(<Harness onChange={onChange} />)

    await user.click(chip('Custom'))
    await user.type(from(), '2a')
    expect(from()).toHaveValue('2')
    await user.clear(from())
    expect(onChange).toHaveBeenLastCalledWith(null)
  })

  it('shows the inputs straight away for a custom range, and clears it when Custom is closed', async () => {
    const onChange = vi.fn()
    const user = userEvent.setup()
    render(<Harness initial={{ min: 20, max: 40 }} onChange={onChange} />)

    expect(from()).toHaveValue('20')
    await user.click(chip('Custom'))
    expect(onChange).toHaveBeenLastCalledWith(null)
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
  })
})
```

- [ ] **Step 3: Run, expect FAIL** (module not found)

Run: `npm test -- src/components/recipe/RangeFilter.test.tsx`

- [ ] **Step 4: Implement**

```tsx
'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { presetFor, type Range, type RangePreset } from '@/lib/recipes/filters'

interface RangeFilterProps {
  label: string
  presets: readonly RangePreset[]
  value: Range | null
  onChange: (next: Range | null) => void
}

function parseBound(raw: string): number | null {
  const digits = raw.replace(/\D/g, '')
  return digits === '' ? null : Number(digits)
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={
        active
          ? 'px-3 py-1.5 text-sm rounded-full border border-gray-900 bg-gray-900 text-white transition-colors'
          : 'px-3 py-1.5 text-sm rounded-full border border-gray-200 text-gray-700 hover:bg-gray-50 transition-colors'
      }
    >
      {children}
    </button>
  )
}

/**
 * Preset chips for the common ranges, plus "Custom" for anything else. The
 * chips are only shortcuts: `value` is always a plain range, and whichever
 * preset equals it lights up — however it was entered.
 */
export function RangeFilter({ label, presets, value, onChange }: RangeFilterProps) {
  const t = useTranslations('recipes')
  const [customOpen, setCustomOpen] = useState(false)
  const activePreset = presetFor(value, presets)
  // A range no preset describes can only have come from the inputs, so they
  // stay visible for it — including after the modal is closed and reopened.
  const showCustom = customOpen || (value !== null && !activePreset)

  function selectPreset(preset: RangePreset) {
    setCustomOpen(false)
    onChange(activePreset === preset ? null : preset.range)
  }

  function toggleCustom() {
    if (!showCustom) {
      setCustomOpen(true)
      return
    }
    setCustomOpen(false)
    if (!activePreset) onChange(null)
  }

  function setBound(side: 'min' | 'max', raw: string) {
    const next: Range = { min: value?.min ?? null, max: value?.max ?? null, [side]: parseBound(raw) }
    onChange(next.min === null && next.max === null ? null : next)
  }

  const inputClass =
    'w-20 px-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-300'

  return (
    <div role="group" aria-label={label}>
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">{label}</p>
      <div className="flex flex-wrap gap-2">
        {presets.map((preset) => (
          <Chip key={preset.label} active={activePreset === preset} onClick={() => selectPreset(preset)}>
            {preset.label}
          </Chip>
        ))}
        <Chip active={showCustom && !activePreset} onClick={toggleCustom}>
          {t('filtersModal.custom')}
        </Chip>
      </div>
      {showCustom && (
        <div className="flex items-center gap-2 mt-3">
          <input
            type="text"
            inputMode="numeric"
            aria-label={`${label}: ${t('filtersModal.from')}`}
            placeholder={t('filtersModal.from')}
            value={value?.min ?? ''}
            onChange={(e) => setBound('min', e.target.value)}
            className={inputClass}
          />
          <span className="text-gray-400">–</span>
          <input
            type="text"
            inputMode="numeric"
            aria-label={`${label}: ${t('filtersModal.to')}`}
            placeholder={t('filtersModal.to')}
            value={value?.max ?? ''}
            onChange={(e) => setBound('max', e.target.value)}
            className={inputClass}
          />
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 5: Run, expect PASS**

Run: `npm test -- src/components/recipe/RangeFilter.test.tsx`

- [ ] **Step 6: Commit**

```bash
git add src/components/recipe/RangeFilter.tsx src/components/recipe/RangeFilter.test.tsx messages/en/recipes.json messages/sk/recipes.json
git commit -m "feat: add RangeFilter with presets and custom bounds"
```

---

### Task 6: wire filters into the modal and list

**Files:**
- Modify: `src/components/recipe/RecipeFiltersModal.tsx`
- Modify: `src/components/recipe/RecipeList.tsx`
- Test: `src/components/recipe/RecipeList.test.tsx`

- [ ] **Step 1: Write the failing tests** — append to `src/components/recipe/RecipeList.test.tsx`

```tsx
describe('RecipeList time, portions and ingredient filters', () => {
  const timed = [
    { ...makeRecipe('r1', 'Lasagne', ['main']), prep_time_min: 30, cook_time_min: 60, servings: 6 },
    { ...makeRecipe('r2', 'Garlic Bread', ['side']), prep_time_min: 5, cook_time_min: 10, servings: 2 },
    makeRecipe('r3', 'Ramen', ['main']),
  ]

  afterEach(() => vi.unstubAllGlobals())

  it('filters by a total time preset, hiding recipes without a time', async () => {
    const user = userEvent.setup()
    render(<RecipeList recipes={timed} taxonomy={EMPTY_TAXONOMY} defaultFilter={[]} />)

    await user.click(screen.getByTestId('filters-button-desktop'))
    const time = within(screen.getByRole('group', { name: 'Total time (min)' }))
    await user.click(time.getByRole('button', { name: '≤ 15' }))

    expect(screen.getByRole('button', { name: /show 1 recipe$/i })).toBeInTheDocument()
    expect(screen.getByTestId('filters-button-desktop')).toHaveTextContent('1')
  })

  it('filters by a portions preset', async () => {
    const user = userEvent.setup()
    render(<RecipeList recipes={timed} taxonomy={EMPTY_TAXONOMY} defaultFilter={[]} />)

    await user.click(screen.getByTestId('filters-button-desktop'))
    const portions = within(screen.getByRole('group', { name: 'Portions' }))
    await user.click(portions.getByRole('button', { name: '5+' }))

    expect(screen.getByRole('button', { name: /show 1 recipe$/i })).toBeInTheDocument()
  })

  it('filters by ingredient using the ids the server returns', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ids: ['r2'] }) })
    vi.stubGlobal('fetch', fetchMock)
    const user = userEvent.setup()
    render(<RecipeList recipes={timed} taxonomy={EMPTY_TAXONOMY} defaultFilter={[]} />)

    await user.click(screen.getByTestId('filters-button-desktop'))
    await user.type(screen.getByRole('textbox', { name: 'Ingredient' }), 'garlic')

    expect(await screen.findByRole('button', { name: /show 1 recipe$/i })).toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledWith('/api/recipes/ingredient-search?q=garlic', expect.anything())
    expect(screen.getByTestId('filters-button-desktop')).toHaveTextContent('1')
  })

  it('shows an error and keeps every recipe when the ingredient search fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, json: async () => ({}) }))
    const user = userEvent.setup()
    render(<RecipeList recipes={timed} taxonomy={EMPTY_TAXONOMY} defaultFilter={[]} />)

    await user.click(screen.getByTestId('filters-button-desktop'))
    await user.type(screen.getByRole('textbox', { name: 'Ingredient' }), 'garlic')

    expect(await screen.findByText('Ingredient search failed. Try again.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /show 3 recipes/i })).toBeInTheDocument()
  })

  it('resets tags, ranges and ingredient on Clear all', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ids: ['r2'] }) }))
    const user = userEvent.setup()
    render(<RecipeList recipes={timed} taxonomy={EMPTY_TAXONOMY} defaultFilter={[]} />)

    await user.click(screen.getByTestId('filters-button-desktop'))
    const dialog = within(screen.getByRole('dialog'))
    await user.click(dialog.getByRole('button', { name: 'side' }))
    await user.click(within(screen.getByRole('group', { name: 'Portions' })).getByRole('button', { name: '1–2' }))
    await user.type(dialog.getByRole('textbox', { name: 'Ingredient' }), 'garlic')
    expect(await screen.findByTestId('filters-button-desktop')).toHaveTextContent('3')

    await user.click(dialog.getByRole('button', { name: /clear all/i }))

    expect(dialog.getByRole('textbox', { name: 'Ingredient' })).toHaveValue('')
    expect(screen.getByRole('button', { name: /show 3 recipes/i })).toBeInTheDocument()
    expect(screen.getByTestId('filters-button-desktop')).not.toHaveTextContent(/\d/)
  })
})
```

- [ ] **Step 2: Run, expect FAIL** (no "Total time (min)" group, no Ingredient textbox)

Run: `npm test -- src/components/recipe/RecipeList.test.tsx`

- [ ] **Step 3: Update `RecipeFiltersModal.tsx`**

Replace the props interface and the destructuring:

```tsx
import { RangeFilter } from './RangeFilter'
import { SERVINGS_PRESETS, TIME_PRESETS, type Range } from '@/lib/recipes/filters'

interface RecipeFiltersModalProps {
  sections: FilterSections
  taxonomy: Taxonomy
  selection: string[]
  onToggleTag: (tag: string) => void
  time: Range | null
  onTimeChange: (next: Range | null) => void
  servings: Range | null
  onServingsChange: (next: Range | null) => void
  ingredient: string
  onIngredientChange: (next: string) => void
  ingredientError: boolean
  onClearAll: () => void
  activeCount: number
  resultCount: number
  /** The ingredient search is still running, so `resultCount` may be stale. */
  resultPending: boolean
  selectionIsDefault: boolean
  showDefaultAction: boolean
  savingDefault: boolean
  onToggleDefault: () => void
  onClose: () => void
}
```

Add the new names to the destructured parameter list to match.

Overlay: change `className="fixed inset-0 z-50 bg-black/30 ...` to

```tsx
    // z-[60]: above the mobile bottom nav in AppShell (z-50), which otherwise
    // paints over this full-screen sheet's footer.
    <div className="fixed inset-0 z-[60] bg-black/30 sm:flex sm:items-center sm:justify-center">
```

Body: insert at the top of `<div className="flex-1 overflow-y-auto px-5 py-5 space-y-6">`, before `{sections.groups.map(...)}`:

```tsx
          <div>
            <label
              htmlFor="filter-ingredient"
              className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2"
            >
              {t('filtersModal.ingredient')}
            </label>
            <input
              id="filter-ingredient"
              type="text"
              value={ingredient}
              onChange={(e) => onIngredientChange(e.target.value)}
              placeholder={t('filtersModal.ingredientPlaceholder')}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-gray-300"
            />
            {ingredientError && <p className="mt-1 text-xs text-red-600">{t('filtersModal.ingredientError')}</p>}
          </div>

          <RangeFilter label={t('filtersModal.totalTime')} presets={TIME_PRESETS} value={time} onChange={onTimeChange} />
          <RangeFilter label={t('filtersModal.servings')} presets={SERVINGS_PRESETS} value={servings} onChange={onServingsChange} />
```

Footer: change the container class `px-5 py-4` to `px-5 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))]`; change the Clear all button's `disabled={selection.length === 0}` to `disabled={activeCount === 0}`; and give the results button a pending state:

```tsx
          <button
            type="button"
            onClick={onClose}
            aria-busy={resultPending}
            className={`px-4 py-2 text-sm font-medium bg-gray-900 text-white rounded-lg hover:bg-gray-700 transition-opacity ${resultPending ? 'opacity-60' : ''}`}
          >
            {t('filtersModal.showResults', { count: resultCount })}
          </button>
```

- [ ] **Step 4: Update `RecipeList.tsx`**

Imports — replace `filterRecipesByTags,` in the taxonomy import (remove it) and add:

```tsx
import { useIngredientSearch } from './useIngredientSearch'
import { activeFilterCount, applyFilters, type Range } from '@/lib/recipes/filters'
```

State — after `const [filtersOpen, setFiltersOpen] = useState(false)`:

```tsx
  const [time, setTime] = useState<Range | null>(null)
  const [servings, setServings] = useState<Range | null>(null)
  const [ingredient, setIngredient] = useState('')
  const ingredientSearch = useIngredientSearch(ingredient)
```

Rename `clearAllTags` to `clearAllFilters` and reset the new state too:

```tsx
  function clearAllFilters() {
    setSelectionTouched(true)
    setSelection([])
    setRowTags(knownTags)
    setTime(null)
    setServings(null)
    setIngredient('')
  }
```

Replace the block

```tsx
  let filtered = filterRecipesByTags(recipes, effectiveSelection, taxonomy)
  if (searching) {
    const q = search.toLowerCase()
    filtered = filtered.filter((r) => r.title.toLowerCase().includes(q))
  }
```

with

```tsx
  const filtered = applyFilters(
    recipes,
    { tags: effectiveSelection, time, servings, search, ingredientIds: ingredientSearch.ids },
    taxonomy
  )
  const activeCount = activeFilterCount({ tags: selection, time, servings, ingredient })
```

In both `<FiltersButton ... count={selection.length} />` usages, change to `count={activeCount}`.

Replace the `<RecipeFiltersModal ... />` element with:

```tsx
        <RecipeFiltersModal
          sections={sections}
          taxonomy={taxonomy}
          selection={selection}
          onToggleTag={toggleTag}
          time={time}
          onTimeChange={setTime}
          servings={servings}
          onServingsChange={setServings}
          ingredient={ingredient}
          onIngredientChange={setIngredient}
          ingredientError={ingredientSearch.error}
          onClearAll={clearAllFilters}
          activeCount={activeCount}
          resultCount={filtered.length}
          resultPending={ingredientSearch.loading}
          selectionIsDefault={selectionIsDefault}
          showDefaultAction={showDefaultAction}
          savingDefault={savingDefault}
          onToggleDefault={() => saveDefault(selectionIsDefault ? [] : selection)}
          onClose={() => setFiltersOpen(false)}
        />
```

- [ ] **Step 5: Run, expect PASS** (new and existing RecipeList tests)

Run: `npm test -- src/components/recipe/RecipeList.test.tsx`

- [ ] **Step 6: Commit**

```bash
git add src/components/recipe/RecipeFiltersModal.tsx src/components/recipe/RecipeList.tsx src/components/recipe/RecipeList.test.tsx
git commit -m "feat: filter recipes by total time, portions and ingredient

Also lifts the filter modal above the mobile bottom nav, which covered its footer."
```

---

### Task 7: mobile search

**Files:**
- Modify: `src/components/recipe/RecipeList.tsx` (header)

No unit test: the input already exists and is covered by the "bypasses the untouched default while searching" tests; the change is layout-only and verified in the browser (Task 8).

- [ ] **Step 1: Let the header wrap and move search to its own row under `sm`**

Header container: change

```tsx
      <div className="flex items-center justify-between gap-2 sm:gap-3 mb-4">
```
to
```tsx
      <div className="flex flex-wrap sm:flex-nowrap items-center justify-between gap-2 sm:gap-3 mb-4">
```

Search wrapper: replace

```tsx
        {/* Search — desktop only */}
        <div className="relative flex-1 max-w-md hidden sm:block">
```
with
```tsx
        {/* Search — between title and actions on desktop; its own full-width
            row under them on mobile */}
        <div className="relative order-last w-full sm:order-none sm:w-auto sm:flex-1 sm:max-w-md">
```

- [ ] **Step 2: Run the RecipeList tests, expect PASS**

Run: `npm test -- src/components/recipe/RecipeList.test.tsx`

- [ ] **Step 3: Commit**

```bash
git add src/components/recipe/RecipeList.tsx
git commit -m "feat: show recipe search on mobile"
```

---

### Task 8: verification and staging deploy

- [ ] **Step 1: Full checks**

Run: `npm test && npm run type-check && npm run lint`
Expected: all pass, no type or lint errors.

- [ ] **Step 2: Browser check at mobile width**

Start the dev server with `preview_start` (create `.claude/launch.json` with `npm run dev` on port 3000 if missing), sign-in session permitting, open `/recipes`, `resize_window` preset `mobile`:
- search input visible under the header, typing narrows the list;
- open Filters: the footer (Clear all / Set as default / Show N recipes) sits fully above the bottom nav — nav is hidden behind the sheet;
- pick `≤ 15`, `Custom` shows inputs, ingredient `cesnak` narrows results.
Screenshot as proof. Reset with `resize_window` preset `desktop`.

If local sign-in is not possible, do this check on staging after Step 3 instead.

- [ ] **Step 3: Push the branch and merge it into staging**

```bash
git push -u origin feat/recipe-filters
git switch staging && git pull --ff-only
git merge --no-ff feat/recipe-filters
git push origin staging
git switch feat/recipe-filters
```

Then test on https://dapcook-staging.vercel.app. When approved, merge **`feat/recipe-filters`** (not `staging`) into `main`.
