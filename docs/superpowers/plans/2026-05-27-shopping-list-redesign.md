# Shopping List Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the date-range shopping list flow with a persistent household list and a guided modal→review→append flow launched from the planner.

**Architecture:** The planner's generate button opens a modal (portions per recipe), which POSTs to a new `/api/shopping/preview` endpoint that runs AI categorisation without saving to the DB. The result is stored in `sessionStorage` and the user navigates to `/shopping/review` (a new `(flow)` route group, no nav) where they can trim the list before appending to the persistent shopping list. The shopping page itself is stripped down to just the list.

**Tech Stack:** Next.js 15 App Router, Supabase, TypeScript, Tailwind CSS, Vitest, Anthropic Claude (claude-haiku)

---

## File Map

| Action | Path |
|--------|------|
| Modify | `src/lib/auth/actions.ts` |
| Modify | `src/types/planner.ts` |
| Modify | `src/app/api/planner/week/route.ts` |
| Create | `src/lib/shopping/scale-ingredients.ts` |
| Create | `src/lib/shopping/scale-ingredients.test.ts` |
| Create | `src/app/api/shopping/preview/route.ts` |
| Create | `src/app/api/shopping/items/append/route.ts` |
| Create | `src/app/(flow)/layout.tsx` |
| Create | `src/app/(flow)/shopping/review/page.tsx` |
| Create | `src/components/shopping/ShoppingReviewClient.tsx` |
| Create | `src/components/planner/GenerateShoppingModal.tsx` |
| Modify | `src/components/planner/PlannerClient.tsx` |
| Modify | `src/components/shopping/ShoppingClient.tsx` |
| Modify | `src/app/(app)/shopping/page.tsx` |
| Create | `src/components/settings/ShoppingRulesEditor.tsx` |
| Modify | `src/app/(app)/settings/page.tsx` |

---

### Task 1: Extend SlotRecipe type and planner week API with `servings`

The generate modal needs `recipe.servings` to pre-fill portions. Currently the planner week API doesn't select it.

**Files:**
- Modify: `src/types/planner.ts`
- Modify: `src/app/api/planner/week/route.ts`

- [ ] **Step 1: Add `servings` to `SlotRecipe` in `src/types/planner.ts`**

Replace the existing `SlotRecipe` interface (currently lines 1-7):

```typescript
export interface SlotRecipe {
  id: string
  title: string
  image_url: string | null
  cook_time_min: number | null
  prep_time_min: number | null
  servings: number | null
}
```

- [ ] **Step 2: Add `servings` to the recipe select in `src/app/api/planner/week/route.ts`**

Line 60 currently reads:
```typescript
.select('*, recipe:recipes(id, title, image_url, cook_time_min, prep_time_min)')
```

Change to:
```typescript
.select('*, recipe:recipes(id, title, image_url, cook_time_min, prep_time_min, servings)')
```

- [ ] **Step 3: Commit**

```bash
git add src/types/planner.ts src/app/api/planner/week/route.ts
git commit -m "feat: add servings to planner slot recipe data"
```

---

### Task 2: Create shopping list when a household is created

When a new household is created, insert an empty shopping list so the shopping page always has a list to show.

**Files:**
- Modify: `src/lib/auth/actions.ts`

- [ ] **Step 1: Insert empty shopping list in `createHousehold`**

In `src/lib/auth/actions.ts`, after the profile update succeeds (after line 91 `if (profileError) { return... }`), add before `redirect('/recipes?ob=1')`:

```typescript
  await supabase
    .from('shopping_lists')
    .insert({ household_id: householdId, name: 'Shopping list' })
```

The full `createHousehold` function after the change:

```typescript
export async function createHousehold(name: string) {
  const supabase = createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const inviteToken = generateInviteToken()
  const householdId = crypto.randomUUID()

  const { error: householdError } = await supabase
    .from('households')
    .insert({ id: householdId, name, invite_token: inviteToken })

  if (householdError) {
    return { error: 'Failed to create household' }
  }

  const { error: profileError } = await supabase
    .from('profiles')
    .update({ household_id: householdId })
    .eq('id', user.id)

  if (profileError) {
    return { error: 'Failed to link household to profile' }
  }

  await supabase
    .from('shopping_lists')
    .insert({ household_id: householdId, name: 'Shopping list' })

  redirect('/recipes?ob=1')
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/auth/actions.ts
git commit -m "feat: create empty shopping list on household creation"
```

---

### Task 3: Extract and test ingredient scaling logic

The scaling formula (`quantity * portions / servings`) lives in the preview endpoint. Extract it as a pure, tested utility.

**Files:**
- Create: `src/lib/shopping/scale-ingredients.ts`
- Create: `src/lib/shopping/scale-ingredients.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/shopping/scale-ingredients.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { scaleIngredients } from './scale-ingredients'

describe('scaleIngredients', () => {
  it('doubles quantities when portions is 2x recipe servings', () => {
    const result = scaleIngredients(
      [{ id: '1', quantity: 100, unit: 'g', name: 'flour', notes: '' }],
      4,
      2
    )
    expect(result[0].quantity).toBe(200)
  })

  it('uses portions directly as scale when recipe has no servings', () => {
    const result = scaleIngredients(
      [{ id: '1', quantity: 100, unit: 'g', name: 'flour', notes: '' }],
      3,
      null
    )
    expect(result[0].quantity).toBe(300)
  })

  it('preserves null quantity', () => {
    const result = scaleIngredients(
      [{ id: '1', quantity: null, unit: '', name: 'salt', notes: '' }],
      2,
      1
    )
    expect(result[0].quantity).toBeNull()
  })

  it('rounds to 3 significant figures', () => {
    const result = scaleIngredients(
      [{ id: '1', quantity: 100, unit: 'g', name: 'flour', notes: '' }],
      1,
      3
    )
    expect(result[0].quantity).toBe(33.3)
  })

  it('maps unit to null when empty string', () => {
    const result = scaleIngredients(
      [{ id: '1', quantity: 2, unit: '', name: 'eggs', notes: '' }],
      1,
      1
    )
    expect(result[0].unit).toBeNull()
  })

  it('preserves unit when non-empty', () => {
    const result = scaleIngredients(
      [{ id: '1', quantity: 200, unit: 'ml', name: 'milk', notes: '' }],
      1,
      1
    )
    expect(result[0].unit).toBe('ml')
  })
})
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd /Users/vacuumlabs/Developer/dapcook && npx vitest run src/lib/shopping/scale-ingredients.test.ts
```

Expected: fails with "Cannot find module"

- [ ] **Step 3: Implement `scaleIngredients`**

Create `src/lib/shopping/scale-ingredients.ts`:

```typescript
import type { Ingredient } from '@/types/recipe'

export interface ScaledItem {
  name: string
  quantity: number | null
  unit: string | null
  source_recipe_id: string
}

/**
 * Scale a recipe's ingredients to a target number of portions.
 * When recipeServings is null, portions is used directly as the multiplier.
 */
export function scaleIngredients(
  ingredients: Ingredient[],
  portions: number,
  recipeServings: number | null
): ScaledItem[] {
  const scale = portions / (recipeServings ?? 1)
  return ingredients.map((ing) => ({
    name: ing.name,
    quantity: ing.quantity != null ? Number((ing.quantity * scale).toFixed(3)) : null,
    unit: ing.unit || null,
    source_recipe_id: '',
  }))
}
```

- [ ] **Step 4: Run tests — all should pass**

```bash
cd /Users/vacuumlabs/Developer/dapcook && npx vitest run src/lib/shopping/scale-ingredients.test.ts
```

Expected: 6 tests pass

- [ ] **Step 5: Commit**

```bash
git add src/lib/shopping/scale-ingredients.ts src/lib/shopping/scale-ingredients.test.ts
git commit -m "feat: add scaleIngredients utility with tests"
```

---

### Task 4: `POST /api/shopping/preview` endpoint

Accepts a list of `{ recipe_id, portions }`, scales ingredients, runs AI smart-merging (same as make-smarter) without persisting items.

**Files:**
- Create: `src/app/api/shopping/preview/route.ts`

- [ ] **Step 1: Create the endpoint**

Create `src/app/api/shopping/preview/route.ts`:

```typescript
import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { makeShoppingListSmart } from '@/lib/ai/make-shopping-list'
import { scaleIngredients } from '@/lib/shopping/scale-ingredients'
import type { Ingredient } from '@/types/recipe'
import type { ShoppingItem } from '@/types/database'

interface RecipeInput {
  recipe_id: string
  portions: number
}

export async function POST(request: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles').select('household_id').eq('id', user.id).single()
  if (!profile?.household_id) return NextResponse.json({ error: 'No household' }, { status: 403 })
  const householdId = profile.household_id

  const body = await request.json() as { recipes: RecipeInput[] }
  const { recipes } = body

  if (!recipes?.length) {
    return NextResponse.json({ error: 'recipes array is required' }, { status: 400 })
  }

  const recipeIds = recipes.map((r) => r.recipe_id)

  const [{ data: recipeRows }, { data: categories }, { data: rulesRows }] = await Promise.all([
    supabase
      .from('recipes')
      .select('id, servings, ingredients')
      .in('id', recipeIds)
      .eq('household_id', householdId),
    supabase.from('shopping_categories').select('*').eq('household_id', householdId).order('sort_order'),
    supabase.from('shopping_rules').select('rule').eq('household_id', householdId).order('created_at'),
  ])

  const recipeMap = new Map(
    (recipeRows ?? []).map((r) => [r.id, r])
  )

  // Build raw items by scaling each recipe's ingredients
  const rawItems: ShoppingItem[] = []
  let order = 0

  for (const { recipe_id, portions } of recipes) {
    const recipe = recipeMap.get(recipe_id)
    if (!recipe) continue

    const ingredients = Array.isArray(recipe.ingredients)
      ? (recipe.ingredients as unknown as Ingredient[])
      : []

    const scaled = scaleIngredients(ingredients, portions, recipe.servings)

    for (const item of scaled) {
      rawItems.push({
        id: `preview-${order}`,
        shopping_list_id: 'preview',
        category: null,
        name: item.name,
        quantity: item.quantity,
        unit: item.unit,
        is_checked: false,
        sort_order: order,
        source_recipe_ids: [recipe_id],
      })
      order++
    }
  }

  if (!rawItems.length) {
    return NextResponse.json({ items: [], categories: [] })
  }

  const rules = (rulesRows ?? []).map((r) => r.rule)

  let result
  try {
    result = await makeShoppingListSmart(rawItems, categories ?? [], householdId, rules)
  } catch (err) {
    console.error('[shopping/preview] AI call failed:', err)
    return NextResponse.json({ error: 'AI processing failed' }, { status: 500 })
  }

  // Save AI-invented categories so they're ready for the main shopping list
  if (result.newCategories.length > 0) {
    await supabase.from('shopping_categories').insert(
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      result.newCategories.map(({ id: _id, created_at: _c, ...rest }) => rest)
    )
  }

  // Return items + category metadata for the review page
  const allCategories = result.newCategories.length > 0
    ? result.newCategories
    : (categories ?? [])

  return NextResponse.json({
    items: result.items.map((item) => ({
      name: item.name,
      quantity: item.quantity,
      unit: item.unit || null,
      category: item.category || null,
    })),
    categories: allCategories.map((c) => ({ name: c.name, color: c.color })),
  })
}
```

- [ ] **Step 2: Confirm TypeScript compiles**

```bash
cd /Users/vacuumlabs/Developer/dapcook && npx tsc --noEmit 2>&1 | grep "shopping/preview"
```

Expected: no output (no errors in this file)

- [ ] **Step 3: Commit**

```bash
git add src/app/api/shopping/preview/route.ts
git commit -m "feat: add POST /api/shopping/preview endpoint"
```

---

### Task 5: `POST /api/shopping/items/append` endpoint

Appends an array of items to the household's current shopping list without deduplication.

**Files:**
- Create: `src/app/api/shopping/items/append/route.ts`

- [ ] **Step 1: Create the endpoint**

Create `src/app/api/shopping/items/append/route.ts`:

```typescript
import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'

interface AppendItem {
  name: string
  quantity: number | null
  unit: string | null
  category: string | null
}

export async function POST(request: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles').select('household_id').eq('id', user.id).single()
  if (!profile?.household_id) return NextResponse.json({ error: 'No household' }, { status: 403 })
  const householdId = profile.household_id

  const body = await request.json() as { items: AppendItem[] }
  if (!Array.isArray(body.items) || body.items.length === 0) {
    return NextResponse.json({ error: 'items array is required' }, { status: 400 })
  }

  // Get the household's shopping list
  const { data: list } = await supabase
    .from('shopping_lists')
    .select('id')
    .eq('household_id', householdId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  // Safety: create a list if somehow missing (e.g. old accounts)
  let listId = list?.id
  if (!listId) {
    const { data: created } = await supabase
      .from('shopping_lists')
      .insert({ household_id: householdId, name: 'Shopping list' })
      .select('id')
      .single()
    if (!created) return NextResponse.json({ error: 'Failed to get or create list' }, { status: 500 })
    listId = created.id
  }

  // Find current max sort_order so new items go after existing ones
  const { data: maxItem } = await supabase
    .from('shopping_items')
    .select('sort_order')
    .eq('shopping_list_id', listId)
    .order('sort_order', { ascending: false })
    .limit(1)
    .maybeSingle()

  const startOrder = (maxItem?.sort_order ?? -1) + 1

  const toInsert = body.items.map((item, i) => ({
    shopping_list_id: listId as string,
    name: item.name,
    quantity: item.quantity ?? null,
    unit: item.unit ?? null,
    category: item.category ?? null,
    is_checked: false,
    sort_order: startOrder + i,
    source_recipe_ids: [] as string[],
  }))

  const { error } = await supabase.from('shopping_items').insert(toInsert)
  if (error) return NextResponse.json({ error: 'Failed to insert items' }, { status: 500 })

  return NextResponse.json({ count: toInsert.length })
}
```

- [ ] **Step 2: Confirm TypeScript compiles**

```bash
cd /Users/vacuumlabs/Developer/dapcook && npx tsc --noEmit 2>&1 | grep "items/append"
```

Expected: no output

- [ ] **Step 3: Commit**

```bash
git add src/app/api/shopping/items/append/route.ts
git commit -m "feat: add POST /api/shopping/items/append endpoint"
```

---

### Task 6: `(flow)` route group — minimal auth layout

A new route group for full-page flow steps (no app nav). The review page will live here.

**Files:**
- Create: `src/app/(flow)/layout.tsx`

- [ ] **Step 1: Create the layout**

Create `src/app/(flow)/layout.tsx`:

```typescript
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

export default async function FlowLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  return (
    <div className="min-h-screen bg-gray-50">
      {children}
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/(flow)/layout.tsx
git commit -m "feat: add (flow) route group with minimal auth layout"
```

---

### Task 7: `ShoppingReviewClient` and review page

The temporary review step: reads `sessionStorage`, shows categorised items, lets the user delete items and edit name/quantity/unit inline, then appends to the main list.

**Files:**
- Create: `src/components/shopping/ShoppingReviewClient.tsx`
- Create: `src/app/(flow)/shopping/review/page.tsx`

- [ ] **Step 1: Create `ShoppingReviewClient`**

Create `src/components/shopping/ShoppingReviewClient.tsx`:

```typescript
'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Trash2, Check, X } from 'lucide-react'

interface PreviewItem {
  name: string
  quantity: number | null
  unit: string | null
  category: string | null
}

interface PreviewCategory {
  name: string
  color: string | null
}

interface PreviewData {
  items: PreviewItem[]
  categories: PreviewCategory[]
}

interface GroupedItems {
  category: string
  color: string | null
  items: { item: PreviewItem; index: number }[]
}

function groupItems(items: PreviewItem[], categories: PreviewCategory[]): GroupedItems[] {
  const categoryOrder = new Map(categories.map((c, i) => [c.name, i]))
  const colorMap = new Map(categories.map((c) => [c.name, c.color]))

  const indexed = items.map((item, index) => ({ item, index }))
  indexed.sort((a, b) => {
    const ai = a.item.category ? (categoryOrder.get(a.item.category) ?? 999) : 999
    const bi = b.item.category ? (categoryOrder.get(b.item.category) ?? 999) : 999
    if (ai !== bi) return ai - bi
    return a.item.name.localeCompare(b.item.name)
  })

  const groups = new Map<string, { item: PreviewItem; index: number }[]>()
  for (const entry of indexed) {
    const cat =
      entry.item.category && categoryOrder.has(entry.item.category)
        ? entry.item.category
        : 'Other'
    if (!groups.has(cat)) groups.set(cat, [])
    groups.get(cat)!.push(entry)
  }

  return Array.from(groups.entries()).map(([category, groupItems]) => ({
    category,
    color: colorMap.get(category) ?? null,
    items: groupItems,
  }))
}

function formatQty(qty: number): string {
  if (Number.isInteger(qty)) return String(qty)
  return String(parseFloat(qty.toPrecision(3)))
}

export function ShoppingReviewClient() {
  const router = useRouter()
  const [items, setItems] = useState<PreviewItem[]>([])
  const [categories, setCategories] = useState<PreviewCategory[]>([])
  const [loaded, setLoaded] = useState(false)
  const [isAdding, setIsAdding] = useState(false)
  const [editingIndex, setEditingIndex] = useState<number | null>(null)
  const [editName, setEditName] = useState('')
  const [editQty, setEditQty] = useState('')
  const [editUnit, setEditUnit] = useState('')

  useEffect(() => {
    const raw = sessionStorage.getItem('shopping_preview')
    if (raw) {
      try {
        const data = JSON.parse(raw) as PreviewData
        setItems(data.items)
        setCategories(data.categories)
      } catch {
        // malformed — treat as empty
      }
    }
    setLoaded(true)
  }, [])

  function handleDelete(index: number) {
    setItems((prev) => prev.filter((_, i) => i !== index))
  }

  function startEdit(index: number) {
    const item = items[index]
    setEditingIndex(index)
    setEditName(item.name)
    setEditQty(item.quantity != null ? formatQty(item.quantity) : '')
    setEditUnit(item.unit ?? '')
  }

  function commitEdit() {
    if (editingIndex === null) return
    const qty = editQty !== '' ? parseFloat(editQty) : null
    setItems((prev) =>
      prev.map((item, i) =>
        i === editingIndex
          ? {
              ...item,
              name: editName.trim() || item.name,
              quantity: qty != null && !isNaN(qty) ? qty : null,
              unit: editUnit.trim() || null,
            }
          : item
      )
    )
    setEditingIndex(null)
  }

  async function handleAddToList() {
    setIsAdding(true)
    const res = await fetch('/api/shopping/items/append', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items }),
    })
    if (res.ok) {
      sessionStorage.removeItem('shopping_preview')
      router.push('/shopping')
    }
    setIsAdding(false)
  }

  if (!loaded) return null

  if (items.length === 0) {
    return (
      <div className="max-w-xl mx-auto px-4 py-10">
        <div className="flex items-center gap-3 mb-8">
          <button
            type="button"
            onClick={() => router.push('/planner')}
            className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900 transition-colors"
          >
            <ArrowLeft size={16} />
            Planner
          </button>
        </div>
        <p className="text-sm text-gray-500 text-center mt-20">
          Nothing to review.{' '}
          <button
            type="button"
            onClick={() => router.push('/planner')}
            className="underline hover:text-gray-900"
          >
            Go back to the planner
          </button>{' '}
          and generate a list.
        </p>
      </div>
    )
  }

  const grouped = groupItems(items, categories)

  return (
    <div className="max-w-xl mx-auto px-4 py-10 pb-28">
      {/* Header */}
      <div className="flex items-center gap-3 mb-8">
        <button
          type="button"
          onClick={() => router.push('/planner')}
          className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900 transition-colors"
        >
          <ArrowLeft size={16} />
          Planner
        </button>
        <h1 className="text-xl font-semibold text-gray-900">Review shopping list</h1>
      </div>

      <p className="text-sm text-gray-500 mb-6">
        {items.length} item{items.length !== 1 ? 's' : ''} — remove anything you don&apos;t need, then add to your shopping list.
      </p>

      {/* Grouped items */}
      <div className="bg-white border border-gray-200 rounded-xl divide-y divide-gray-50 mb-6">
        {grouped.map((group) => (
          <div key={group.category}>
            {(group.category !== 'Other' || grouped.length > 1) && (
              <div className="px-4 pt-3 pb-1 flex items-center gap-1.5">
                {group.color && (
                  <span
                    className="w-2 h-2 rounded-full flex-shrink-0"
                    style={{ backgroundColor: group.color }}
                  />
                )}
                <span className="text-xs font-medium text-gray-400 uppercase tracking-wide">
                  {group.category}
                </span>
              </div>
            )}
            <div className="px-3 pb-1">
              {group.items.map(({ item, index }) => (
                <div key={index} className="flex items-center gap-2 py-2">
                  {editingIndex === index ? (
                    <>
                      <input
                        autoFocus
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') commitEdit(); if (e.key === 'Escape') setEditingIndex(null) }}
                        className="flex-1 min-w-0 text-sm px-2 py-0.5 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-gray-300"
                      />
                      <input
                        value={editQty}
                        onChange={(e) => setEditQty(e.target.value)}
                        placeholder="Qty"
                        type="number"
                        step="any"
                        className="w-14 text-sm px-2 py-0.5 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-gray-300"
                      />
                      <input
                        value={editUnit}
                        onChange={(e) => setEditUnit(e.target.value)}
                        placeholder="Unit"
                        onKeyDown={(e) => { if (e.key === 'Enter') commitEdit() }}
                        className="w-14 text-sm px-2 py-0.5 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-gray-300"
                      />
                      <button type="button" onClick={commitEdit} className="text-gray-500 hover:text-gray-900">
                        <Check size={14} />
                      </button>
                      <button type="button" onClick={() => setEditingIndex(null)} className="text-gray-400 hover:text-gray-700">
                        <X size={14} />
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={() => startEdit(index)}
                        className="flex-1 min-w-0 text-left text-sm text-gray-900 hover:text-gray-600 transition-colors truncate"
                      >
                        {item.quantity != null && (
                          <span className="text-gray-500 mr-1">
                            {formatQty(item.quantity)}{item.unit ?? ''}
                          </span>
                        )}
                        {item.name}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(index)}
                        className="text-gray-300 hover:text-red-400 transition-colors flex-shrink-0"
                        aria-label="Remove item"
                      >
                        <Trash2 size={14} />
                      </button>
                    </>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Sticky footer */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 px-4 py-4">
        <div className="max-w-xl mx-auto">
          <button
            type="button"
            onClick={handleAddToList}
            disabled={isAdding || items.length === 0}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-gray-900 text-white text-sm font-medium rounded-xl hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isAdding ? (
              <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : null}
            Add {items.length} item{items.length !== 1 ? 's' : ''} to shopping list
          </button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Create the review page server component**

Create `src/app/(flow)/shopping/review/page.tsx`:

```typescript
import { ShoppingReviewClient } from '@/components/shopping/ShoppingReviewClient'

export default function ShoppingReviewPage() {
  return <ShoppingReviewClient />
}
```

- [ ] **Step 3: Confirm TypeScript compiles**

```bash
cd /Users/vacuumlabs/Developer/dapcook && npx tsc --noEmit 2>&1 | grep -E "ShoppingReview|review/page"
```

Expected: no output

- [ ] **Step 4: Commit**

```bash
git add src/components/shopping/ShoppingReviewClient.tsx src/app/(flow)/shopping/review/page.tsx
git commit -m "feat: add shopping review page and client component"
```

---

### Task 8: `GenerateShoppingModal` component

Modal that lists the week's recipes with editable portions, then triggers preview generation and navigates to the review page.

**Files:**
- Create: `src/components/planner/GenerateShoppingModal.tsx`

- [ ] **Step 1: Create the modal component**

Create `src/components/planner/GenerateShoppingModal.tsx`:

```typescript
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { X, AlertTriangle } from 'lucide-react'
import type { MealSlotWithRecipe } from '@/types/planner'
import { getWeekDays, formatDayLabel, toDateString } from '@/lib/utils/week'

interface RecipeEntry {
  recipeId: string
  title: string
  servings: number | null
  days: string[]
  portions: number
  removed: boolean
}

interface Props {
  slots: MealSlotWithRecipe[]
  weekStart: Date
  onClose: () => void
}

export function GenerateShoppingModal({ slots, weekStart, onClose }: Props) {
  const router = useRouter()
  const weekDays = getWeekDays(weekStart)

  // Build one entry per unique recipe — collect which days it appears on
  const recipeMap = new Map<string, RecipeEntry>()
  for (const slot of slots) {
    if (!slot.recipe_id || !slot.recipe) continue
    const recipe = slot.recipe
    if (!recipeMap.has(recipe.id)) {
      recipeMap.set(recipe.id, {
        recipeId: recipe.id,
        title: recipe.title,
        servings: recipe.servings,
        days: [],
        portions: recipe.servings ?? 1,
        removed: false,
      })
    }
    const dayDate = weekDays[slot.day_of_week - 1]
    const { weekday, day } = formatDayLabel(dayDate)
    recipeMap.get(recipe.id)!.days.push(`${weekday} ${day}`)
  }

  const [entries, setEntries] = useState<RecipeEntry[]>(Array.from(recipeMap.values()))
  const [isGenerating, setIsGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const activeEntries = entries.filter((e) => !e.removed)

  function updatePortions(recipeId: string, value: string) {
    const num = parseInt(value, 10)
    if (isNaN(num) || num < 1) return
    setEntries((prev) =>
      prev.map((e) => (e.recipeId === recipeId ? { ...e, portions: num } : e))
    )
  }

  function toggleRemove(recipeId: string) {
    setEntries((prev) =>
      prev.map((e) => (e.recipeId === recipeId ? { ...e, removed: !e.removed } : e))
    )
  }

  async function handleGenerate() {
    setIsGenerating(true)
    setError(null)

    const payload = activeEntries.map((e) => ({
      recipe_id: e.recipeId,
      portions: e.portions,
    }))

    try {
      const res = await fetch('/api/shopping/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recipes: payload }),
      })

      if (!res.ok) {
        setError('Something went wrong. Please try again.')
        setIsGenerating(false)
        return
      }

      const data = await res.json() as { items: unknown[]; categories: unknown[] }
      sessionStorage.setItem('shopping_preview', JSON.stringify(data))
      router.push('/shopping/review')
    } catch {
      setError('Network error. Please try again.')
      setIsGenerating(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Modal */}
      <div className="relative bg-white rounded-t-2xl sm:rounded-2xl w-full sm:max-w-md max-h-[85vh] flex flex-col shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-900">Generate shopping list</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-gray-700 transition-colors"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        {/* Recipe list */}
        <div className="overflow-y-auto flex-1 px-5 py-4 space-y-3">
          {entries.length === 0 && (
            <p className="text-sm text-gray-500 text-center py-4">
              No recipes in this week&apos;s plan.
            </p>
          )}
          {entries.map((entry) => (
            <div
              key={entry.recipeId}
              className={`flex items-start gap-3 p-3 rounded-xl border transition-colors ${
                entry.removed
                  ? 'border-gray-100 bg-gray-50 opacity-50'
                  : 'border-gray-200 bg-white'
              }`}
            >
              <div className="flex-1 min-w-0">
                <p className={`text-sm font-medium ${entry.removed ? 'text-gray-400 line-through' : 'text-gray-900'}`}>
                  {entry.title}
                </p>
                <p className="text-xs text-gray-400 mt-0.5">{entry.days.join(', ')}</p>
                {entry.servings == null && !entry.removed && (
                  <p className="flex items-center gap-1 text-xs text-amber-600 mt-1">
                    <AlertTriangle size={11} />
                    No servings defined — using 1
                  </p>
                )}
              </div>

              {/* Portions input */}
              {!entry.removed && (
                <div className="flex flex-col items-end gap-1 flex-shrink-0">
                  <label className="text-xs text-gray-400">Portions</label>
                  <input
                    type="number"
                    min={1}
                    value={entry.portions}
                    onChange={(e) => updatePortions(entry.recipeId, e.target.value)}
                    className="w-16 text-sm text-center px-2 py-1 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-300"
                  />
                </div>
              )}

              {/* Remove / undo */}
              <button
                type="button"
                onClick={() => toggleRemove(entry.recipeId)}
                className="flex-shrink-0 text-xs text-gray-400 hover:text-gray-700 transition-colors mt-1"
              >
                {entry.removed ? 'Undo' : <X size={14} />}
              </button>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="px-5 pb-5 pt-3 border-t border-gray-100 space-y-2">
          {error && <p className="text-sm text-red-500">{error}</p>}
          <button
            type="button"
            onClick={handleGenerate}
            disabled={isGenerating || activeEntries.length === 0}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-gray-900 text-white text-sm font-medium rounded-xl hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isGenerating ? (
              <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : null}
            {isGenerating ? 'Generating…' : 'Generate'}
          </button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Confirm TypeScript compiles**

```bash
cd /Users/vacuumlabs/Developer/dapcook && npx tsc --noEmit 2>&1 | grep "GenerateShoppingModal"
```

Expected: no output

- [ ] **Step 3: Commit**

```bash
git add src/components/planner/GenerateShoppingModal.tsx
git commit -m "feat: add GenerateShoppingModal component"
```

---

### Task 9: Wire modal into `PlannerClient`

Replace the direct `handleGenerateShoppingList` call with opening the modal. The modal receives the current week's slots.

**Files:**
- Modify: `src/components/planner/PlannerClient.tsx`

- [ ] **Step 1: Add modal state and import to `PlannerClient`**

At the top of the file, add the import alongside existing imports:

```typescript
import { GenerateShoppingModal } from './GenerateShoppingModal'
```

- [ ] **Step 2: Add modal state**

In the component body, alongside the existing `useState` declarations, add:

```typescript
const [showGenerateModal, setShowGenerateModal] = useState(false)
```

- [ ] **Step 3: Remove `handleGenerateShoppingList` and `isGeneratingList` state**

Remove the `isGeneratingList` state declaration:
```typescript
// DELETE this line:
const [isGeneratingList, setIsGeneratingList] = useState(false)
```

Remove the entire `handleGenerateShoppingList` function (lines 270-293).

- [ ] **Step 4: Update the generate button and add modal rendering**

Find the generate button block at the bottom of the return (currently lines 485-501):

```typescript
{slots.some((s) => s.recipe_id) && (
  <div className="mt-6 pt-6 border-t border-gray-100 flex justify-end">
    <button
      type="button"
      onClick={handleGenerateShoppingList}
      disabled={isGeneratingList}
      className="flex items-center gap-1.5 px-4 py-2 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
    >
      {isGeneratingList ? (
        <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
      ) : (
        <ShoppingCart size={14} />
      )}
      Generate shopping list
    </button>
  </div>
)}
```

Replace with:

```typescript
{slots.some((s) => s.recipe_id) && (
  <div className="mt-6 pt-6 border-t border-gray-100 flex justify-end">
    <button
      type="button"
      onClick={() => setShowGenerateModal(true)}
      className="flex items-center gap-1.5 px-4 py-2 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-700 transition-colors"
    >
      <ShoppingCart size={14} />
      Generate shopping list
    </button>
  </div>
)}

{showGenerateModal && (
  <GenerateShoppingModal
    slots={slots}
    weekStart={weekStart}
    onClose={() => setShowGenerateModal(false)}
  />
)}
```

- [ ] **Step 5: Confirm TypeScript compiles cleanly**

```bash
cd /Users/vacuumlabs/Developer/dapcook && npx tsc --noEmit 2>&1 | grep "PlannerClient"
```

Expected: no output

- [ ] **Step 6: Commit**

```bash
git add src/components/planner/PlannerClient.tsx
git commit -m "feat: replace generate button with GenerateShoppingModal in PlannerClient"
```

---

### Task 10: Simplify `ShoppingClient` — remove generate controls and rules

Strip out everything related to list generation and AI rules. The shopping page is now just a persistent list.

**Files:**
- Modify: `src/components/shopping/ShoppingClient.tsx`

- [ ] **Step 1: Update the Props interface**

Replace the current `Props` interface:

```typescript
interface Props {
  initialList: ShoppingList | null
  initialItems: ShoppingItem[]
  initialCategories: ShoppingCategory[]
  initialRecipeNames: Record<string, string>
}
```

- [ ] **Step 2: Remove all generate/rules state and functions**

Remove these `useState` declarations from the component body:
- `const [rules, setRules] = useState<ShoppingRule[]>(initialRules)`
- `const [dateFrom, setDateFrom] = useState(defaultDateFrom)`
- `const [dateTo, setDateTo] = useState(defaultDateTo)`
- `const [isGenerating, setIsGenerating] = useState(false)`
- `const [showOverwriteConfirm, setShowOverwriteConfirm] = useState(false)`
- `const [newRule, setNewRule] = useState('')`
- `const [addingRule, setAddingRule] = useState(false)`

Remove these functions entirely:
- `async function generateList(confirmOverwrite = false) { ... }`
- `async function makeSmarter(listId?: string) { ... }`
- `async function handleAddRule() { ... }`
- `async function handleDeleteRule(id: string) { ... }`

- [ ] **Step 3: Remove unused imports**

Remove `ShoppingCart` and `Sparkles` from the lucide-react import (keep `Copy`, `Plus`, `X`, `Check`).
Remove `ShoppingRule` from the database types import.

- [ ] **Step 4: Remove JSX blocks**

Remove the entire `{/* Generate controls */}` section (the white card with date pickers, generate button, and AI rules).

Remove the `{showOverwriteConfirm && <ConfirmModal ... />}` block at the bottom.

Remove `ConfirmModal` import since it's no longer used.

- [ ] **Step 5: Update the function signature**

```typescript
export function ShoppingClient({ initialList, initialItems, initialCategories, initialRecipeNames }: Props) {
```

- [ ] **Step 6: Add empty state**

The list section currently only renders when `list` exists. Update it to always render, showing an empty state when there are no items:

Replace the outer conditional:
```typescript
{list && (
  <div className="space-y-4">
    ...
  </div>
)}
```

With:
```typescript
<div className="space-y-4">
  {/* Items grouped by category */}
  <div className="bg-white border border-gray-200 rounded-xl divide-y divide-gray-50">
    {items.length === 0 && !addingItem ? (
      <p className="text-sm text-gray-400 px-4 py-8 text-center">
        Your shopping list is empty. Add items manually or generate from the planner.
      </p>
    ) : (
      grouped.map((group) => (
        // ... same as before
      ))
    )}
    {/* Add item row stays the same */}
  </div>
</div>
```

The list header (`list.name` + item count + copy button) should also be updated — since `list` may now be the persistent unnamed list, simplify to just the item count and copy button:

```typescript
<div className="flex items-center justify-between mb-4">
  <p className="text-xs text-gray-400">{items.length} item{items.length !== 1 ? 's' : ''}</p>
  {items.length > 0 && (
    <button
      type="button"
      onClick={copyToClipboard}
      className="flex items-center gap-2 px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-medium rounded-lg transition-colors"
    >
      {copied ? <Check size={15} className="text-green-600" /> : <Copy size={15} />}
      {copied ? 'Copied!' : 'Copy list'}
    </button>
  )}
</div>
```

- [ ] **Step 7: Confirm TypeScript compiles cleanly**

```bash
cd /Users/vacuumlabs/Developer/dapcook && npx tsc --noEmit 2>&1 | grep "ShoppingClient"
```

Expected: no output

- [ ] **Step 8: Commit**

```bash
git add src/components/shopping/ShoppingClient.tsx
git commit -m "feat: simplify ShoppingClient to persistent list (remove generate + rules UI)"
```

---

### Task 11: Simplify shopping `page.tsx`

Update the server component to remove date params and rules fetching now that `ShoppingClient` no longer needs them.

**Files:**
- Modify: `src/app/(app)/shopping/page.tsx`

- [ ] **Step 1: Rewrite the page**

Replace the entire file with:

```typescript
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { ShoppingClient } from '@/components/shopping/ShoppingClient'
import type { ShoppingList, ShoppingItem, ShoppingCategory } from '@/types/database'

export default async function ShoppingPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles').select('household_id').eq('id', user.id).single()
  if (!profile?.household_id) redirect('/onboarding')
  const householdId = profile.household_id

  const [{ data: list }, { data: categories }] = await Promise.all([
    supabase
      .from('shopping_lists')
      .select('*')
      .eq('household_id', householdId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from('shopping_categories')
      .select('*')
      .eq('household_id', householdId)
      .order('sort_order'),
  ])

  let items: ShoppingItem[] = []
  let recipeNames: Record<string, string> = {}

  if (list) {
    const { data } = await supabase
      .from('shopping_items')
      .select('*')
      .eq('shopping_list_id', list.id)
      .order('sort_order')
    items = data ?? []

    const recipeIds = Array.from(new Set(items.flatMap((i) => i.source_recipe_ids)))
    if (recipeIds.length > 0) {
      const { data: recipes } = await supabase
        .from('recipes')
        .select('id, title')
        .in('id', recipeIds)
      recipeNames = Object.fromEntries((recipes ?? []).map((r) => [r.id, r.title]))
    }
  }

  return (
    <ShoppingClient
      initialList={(list as ShoppingList | null) ?? null}
      initialItems={items}
      initialCategories={(categories as ShoppingCategory[]) ?? []}
      initialRecipeNames={recipeNames}
    />
  )
}
```

- [ ] **Step 2: Confirm TypeScript compiles cleanly**

```bash
cd /Users/vacuumlabs/Developer/dapcook && npx tsc --noEmit 2>&1 | grep "shopping/page"
```

Expected: no output

- [ ] **Step 3: Commit**

```bash
git add src/app/(app)/shopping/page.tsx
git commit -m "feat: simplify shopping page — remove date range and rules props"
```

---

### Task 12: `ShoppingRulesEditor` component + settings page update

Move the AI shopping rules UI from the shopping page to Settings.

**Files:**
- Create: `src/components/settings/ShoppingRulesEditor.tsx`
- Modify: `src/app/(app)/settings/page.tsx`

- [ ] **Step 1: Create `ShoppingRulesEditor`**

Create `src/components/settings/ShoppingRulesEditor.tsx`:

```typescript
'use client'

import { useState } from 'react'
import { Plus, X, Check } from 'lucide-react'
import type { ShoppingRule } from '@/types/database'

interface Props {
  initialRules: ShoppingRule[]
}

export function ShoppingRulesEditor({ initialRules }: Props) {
  const [rules, setRules] = useState<ShoppingRule[]>(initialRules)
  const [addingRule, setAddingRule] = useState(false)
  const [newRule, setNewRule] = useState('')

  async function handleAddRule() {
    if (!newRule.trim()) return
    const res = await fetch('/api/shopping/rules', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rule: newRule.trim() }),
    })
    if (res.ok) {
      const created = await res.json() as ShoppingRule
      setRules((prev) => [...prev, created])
    }
    setNewRule('')
    setAddingRule(false)
  }

  async function handleDeleteRule(id: string) {
    setRules((prev) => prev.filter((r) => r.id !== id))
    await fetch(`/api/shopping/rules/${id}`, { method: 'DELETE' })
  }

  return (
    <div>
      <div className="flex flex-wrap gap-1.5 mb-3">
        {rules.map((r) => (
          <span
            key={r.id}
            className="inline-flex items-center gap-1 px-2.5 py-1 bg-gray-100 text-gray-700 text-xs rounded-full"
          >
            {r.rule}
            <button
              type="button"
              onClick={() => handleDeleteRule(r.id)}
              className="text-gray-400 hover:text-gray-700 transition-colors ml-0.5"
              aria-label="Remove rule"
            >
              <X size={11} />
            </button>
          </span>
        ))}
      </div>

      {addingRule ? (
        <div className="flex items-center gap-2">
          <input
            autoFocus
            value={newRule}
            onChange={(e) => setNewRule(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleAddRule()
              if (e.key === 'Escape') { setAddingRule(false); setNewRule('') }
            }}
            placeholder="e.g. Do not include water"
            className="flex-1 text-sm px-2.5 py-1 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-300"
          />
          <button type="button" onClick={handleAddRule} className="text-gray-500 hover:text-gray-900">
            <Check size={14} />
          </button>
          <button
            type="button"
            onClick={() => { setAddingRule(false); setNewRule('') }}
            className="text-gray-400 hover:text-gray-700"
          >
            <X size={14} />
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setAddingRule(true)}
          className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-700 transition-colors"
        >
          <Plus size={12} />
          Add rule
        </button>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Add shopping rules to settings page**

In `src/app/(app)/settings/page.tsx`:

Add import at the top:
```typescript
import { ShoppingRulesEditor } from '@/components/settings/ShoppingRulesEditor'
```

Add `shopping_rules` to the parallel fetch (inside the `Promise.all`):
```typescript
supabase.from('shopping_rules').select('*').eq('household_id', profile.household_id).order('created_at'),
```

Update the destructured result to include `shoppingRules`:
```typescript
const [{ data: household }, { data: members }, { data: plannerRules }, { data: recipes }, { data: tagsMeta }, { data: shoppingCategories }, { data: shoppingRules }] = await Promise.all([
  // ... existing fetches ...
  supabase.from('shopping_rules').select('*').eq('household_id', profile.household_id).order('created_at'),
])
```

Add the Shopping rules section to the JSX, between Shopping categories and Planner rules:

```typescript
{/* Shopping rules */}
<section className="space-y-4">
  <h2 className="text-sm font-medium text-gray-500 uppercase tracking-wide">Shopping rules</h2>
  <div className="bg-white border border-gray-200 rounded-xl p-5">
    <p className="text-xs text-gray-400 mb-4">
      These rules are passed to the AI when generating a shopping list. Use them to exclude ingredients or adjust how items are merged.
    </p>
    <ShoppingRulesEditor initialRules={shoppingRules ?? []} />
  </div>
</section>
```

- [ ] **Step 3: Confirm TypeScript compiles cleanly**

```bash
cd /Users/vacuumlabs/Developer/dapcook && npx tsc --noEmit 2>&1 | grep -E "ShoppingRules|settings/page"
```

Expected: no output

- [ ] **Step 4: Commit**

```bash
git add src/components/settings/ShoppingRulesEditor.tsx src/app/(app)/settings/page.tsx
git commit -m "feat: move shopping rules to settings page"
```

---

### Task 13: Push and verify

- [ ] **Step 1: Run all tests**

```bash
cd /Users/vacuumlabs/Developer/dapcook && npx vitest run
```

Expected: all tests pass (including the new scale-ingredients tests)

- [ ] **Step 2: Full TypeScript check**

```bash
cd /Users/vacuumlabs/Developer/dapcook && npx tsc --noEmit 2>&1 | grep -v "RecipeForm.test.tsx"
```

Expected: no output (the RecipeForm.test.tsx error is pre-existing and unrelated)

- [ ] **Step 3: Push to Vercel**

```bash
git push
```

---

## Self-Review Notes

- **Spec coverage:** All 5 spec areas covered — persistent shopping page (Task 10–11), generate modal (Task 8–9), review page (Task 6–7), append endpoint (Task 5), settings rules (Task 12). Shopping list on household creation (Task 2).
- **Type consistency:** `SlotRecipe.servings` added in Task 1 is used in `GenerateShoppingModal` (Task 8). `PreviewItem` shape from endpoint (Task 4) matches what `ShoppingReviewClient` reads from sessionStorage (Task 7). `AppendItem` shape matches what `ShoppingReviewClient` sends (Task 7 → Task 5).
- **`scaleIngredients`** returns `source_recipe_id: ''` — this field isn't used by the caller (Task 4 overrides it with `[recipe_id]`). No issue.
- **Old `handleGenerateShoppingList`** imported `getWeekDays` which is still used elsewhere in PlannerClient — no removal needed.
- **`/api/shopping/generate` and `/api/shopping/make-smarter`** routes are left in place (not deleted) per the spec — they're just no longer called from the UI.
