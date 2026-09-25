# Single-step Shopping List Generation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the two-step shopping list flow (portions → AI-merged review) with one page that shows a box per planned recipe (ingredients editable, portions adjustable) and runs the AI merge only when adding to the list.

**Architecture:** A pure module `src/lib/shopping/plan-entries.ts` owns grouping slots into entries, per-portion ingredient scaling, edit parsing, and building the submit payload. `GenerateShoppingPage` holds entry state and renders one `ShoppingPlanBox` per entry (ingredients via the existing `ShoppingItemRow`). A new route `POST /api/shopping/items/add-from-plan` runs `makeShoppingListSmart` and appends the result in one request. The preview route, append route, review page and review client are deleted.

**Tech Stack:** Next.js 14 (app router), React 18, next-intl, Supabase, Vitest + Testing Library, Tailwind.

**Spec:** `docs/superpowers/specs/2026-09-25-shopping-generate-single-step-design.md`

**Commands:** `npx vitest run <path>` (single file), `npm test` (all), `npm run type-check`, `npm run lint`.

---

## File map

| File | Action | Responsibility |
| --- | --- | --- |
| `src/lib/shopping/plan-entries.ts` | Create | Types + pure logic: build entries, scale, parse edits, payload |
| `src/lib/shopping/plan-entries.test.ts` | Create | Unit tests for the above |
| `src/app/api/shopping/items/add-from-plan/route.ts` | Create | AI merge + append to list |
| `src/app/api/shopping/items/add-from-plan/route.test.ts` | Create | Route tests (AI mocked) |
| `messages/en/shopping.json`, `messages/sk/shopping.json` | Modify | New `generate.*` keys (Task 4), drop unused ones (Task 6) |
| `src/components/shopping/ShoppingPlanBox.tsx` | Create | One recipe / custom meal box |
| `src/components/shopping/GenerateShoppingPage.tsx` | Rewrite | Page state, footer, submit |
| `src/components/shopping/GenerateShoppingPage.test.tsx` | Rewrite | Component tests |
| `src/app/(flow)/shopping/generate/page.tsx` | Modify | Select `ingredients`, `PlanSlot` type |
| `src/app/api/shopping/preview/route.ts` | Delete | |
| `src/app/api/shopping/items/append/route.ts` | Delete | |
| `src/app/(flow)/shopping/review/page.tsx` | Delete | |
| `src/components/shopping/ShoppingReviewClient.tsx` + `.test.tsx` | Delete | |
| `src/app/(flow)/layout.test.tsx` | Modify | Stale comment |

---

### Task 0: Branch

This is a big feature (CLAUDE.md → staging first).

- [ ] **Step 1: Create the feature branch from `main`**

```bash
git -C /Users/vacuumlabs/Developer/dapcook checkout -b feat/single-step-shopping
```

---

### Task 1: Scaling and edit parsing in `plan-entries`

**Files:**
- Create: `src/lib/shopping/plan-entries.ts`
- Test: `src/lib/shopping/plan-entries.test.ts`

- [ ] **Step 1: Write the failing tests**

`src/lib/shopping/plan-entries.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import {
  applyIngredientEdit,
  displayQuantity,
  parseItemText,
  toShoppingItem,
  type PlanIngredient,
} from './plan-entries'

function ingredient(p: Partial<PlanIngredient> = {}): PlanIngredient {
  return { id: 'r1:0', name: 'rice', unit: 'g', quantityPerPortion: 50, checked: false, ...p }
}

describe('displayQuantity', () => {
  it('multiplies the per-portion quantity by portions', () => {
    expect(displayQuantity(50, 4)).toBe(200)
  })

  it('rounds to 3 decimals like scaleIngredients', () => {
    expect(displayQuantity(100 / 3, 3)).toBe(100)
    expect(displayQuantity(1 / 3, 1)).toBe(0.333)
  })

  it('keeps a missing quantity missing', () => {
    expect(displayQuantity(null, 4)).toBeNull()
  })
})

describe('parseItemText', () => {
  it('splits quantity, known unit and name', () => {
    expect(parseItemText('150 g rice', 'g')).toEqual({ quantity: 150, unit: 'g', name: 'rice' })
  })

  it('accepts a unit glued to the number, as formatQtyUnit renders it', () => {
    expect(parseItemText('150g rice', 'g')).toEqual({ quantity: 150, unit: 'g', name: 'rice' })
  })

  it('matches the known unit case-insensitively and keeps its original spelling', () => {
    expect(parseItemText('2 čl salt', 'ČL')).toEqual({ quantity: 2, unit: 'ČL', name: 'salt' })
  })

  it('accepts decimal point and decimal comma', () => {
    expect(parseItemText('1.5 l milk', 'l').quantity).toBe(1.5)
    expect(parseItemText('1,5 l milk', 'l').quantity).toBe(1.5)
  })

  it('does not treat the start of a word as the unit', () => {
    expect(parseItemText('2 garlic cloves', 'g')).toEqual({ quantity: 2, unit: null, name: 'garlic cloves' })
  })

  it('leaves an unknown unit in the name', () => {
    expect(parseItemText('2 kg rice', 'g')).toEqual({ quantity: 2, unit: null, name: 'kg rice' })
  })

  it('returns no quantity when the text has no leading number', () => {
    expect(parseItemText('  some rice ', 'g')).toEqual({ quantity: null, unit: null, name: 'some rice' })
  })
})

describe('applyIngredientEdit', () => {
  it('stores the edited quantity per portion', () => {
    const edited = applyIngredientEdit(ingredient(), '150g rice', 4)
    expect(edited).toMatchObject({ name: 'rice', unit: 'g', quantityPerPortion: 37.5 })
    expect(displayQuantity(edited.quantityPerPortion, 6)).toBe(225)
  })

  it('does not drift when portions go 4 → 5 → 4 after an edit', () => {
    const edited = applyIngredientEdit(ingredient(), '150g rice', 4)
    expect(displayQuantity(edited.quantityPerPortion, 5)).toBe(187.5)
    expect(displayQuantity(edited.quantityPerPortion, 4)).toBe(150)
  })

  it('drops the quantity when the edit has no number', () => {
    expect(applyIngredientEdit(ingredient(), 'rice', 4)).toMatchObject({ name: 'rice', unit: null, quantityPerPortion: null })
  })

  it('keeps the previous name when only a quantity is typed', () => {
    expect(applyIngredientEdit(ingredient(), '100g', 2)).toMatchObject({ name: 'rice', unit: 'g', quantityPerPortion: 50 })
  })

  it('keeps the checked flag', () => {
    expect(applyIngredientEdit(ingredient({ checked: true }), '1 g rice', 1).checked).toBe(true)
  })
})

describe('toShoppingItem', () => {
  it('renders the ingredient at the given portions for ShoppingItemRow', () => {
    expect(toShoppingItem(ingredient({ checked: true }), 3, 2)).toEqual({
      id: 'r1:0',
      shopping_list_id: 'plan',
      name: 'rice',
      quantity: 150,
      unit: 'g',
      category: null,
      is_checked: true,
      sort_order: 2,
      source_recipe_ids: [],
    })
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/lib/shopping/plan-entries.test.ts`
Expected: FAIL — cannot resolve `./plan-entries`.

- [ ] **Step 3: Implement**

`src/lib/shopping/plan-entries.ts`:

```ts
import type { ShoppingItem } from '@/types/database'

export interface PlanIngredient {
  /** `${recipeId}:${index}` — stable across edits. */
  id: string
  name: string
  unit: string | null
  /** Quantity for one portion; null when the ingredient has no quantity. */
  quantityPerPortion: number | null
  /** Checked = "I already have it" — left out of the list. */
  checked: boolean
}

/** Same rounding as scaleIngredients. */
export function displayQuantity(quantityPerPortion: number | null, portions: number): number | null {
  if (quantityPerPortion == null) return null
  return Number((quantityPerPortion * portions).toFixed(3))
}

const LEADING_NUMBER = /^(\d+(?:[.,]\d+)?)\s*(.*)$/

/**
 * ShoppingItemRow saves an edit as free text ("150g rice"). Split it back so the
 * quantity keeps scaling with portions. Only the ingredient's current unit is
 * recognized — anything else after the number stays part of the name.
 */
export function parseItemText(
  text: string,
  knownUnit: string | null,
): { quantity: number | null; unit: string | null; name: string } {
  const trimmed = text.trim()
  const match = trimmed.match(LEADING_NUMBER)
  if (!match) return { quantity: null, unit: null, name: trimmed }

  const quantity = parseFloat(match[1].replace(',', '.'))
  const rest = match[2]
  if (knownUnit) {
    const unitLength = knownUnit.length
    const startsWithUnit = rest.slice(0, unitLength).toLowerCase() === knownUnit.toLowerCase()
    const unitEndsThere = rest.length === unitLength || /\s/.test(rest[unitLength])
    if (startsWithUnit && unitEndsThere) {
      return { quantity, unit: knownUnit, name: rest.slice(unitLength).trim() }
    }
  }
  return { quantity, unit: null, name: rest }
}

export function applyIngredientEdit(ingredient: PlanIngredient, text: string, portions: number): PlanIngredient {
  const parsed = parseItemText(text, ingredient.unit)
  return {
    ...ingredient,
    name: parsed.name || ingredient.name,
    unit: parsed.unit,
    quantityPerPortion: parsed.quantity == null ? null : parsed.quantity / portions,
  }
}

/** Shape ShoppingItemRow renders. */
export function toShoppingItem(ingredient: PlanIngredient, portions: number, index: number): ShoppingItem {
  return {
    id: ingredient.id,
    shopping_list_id: 'plan',
    name: ingredient.name,
    quantity: displayQuantity(ingredient.quantityPerPortion, portions),
    unit: ingredient.unit,
    category: null,
    is_checked: ingredient.checked,
    sort_order: index,
    source_recipe_ids: [],
  }
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/lib/shopping/plan-entries.test.ts`
Expected: PASS (all tests).

- [ ] **Step 5: Commit**

```bash
git -C /Users/vacuumlabs/Developer/dapcook add src/lib/shopping/plan-entries.ts src/lib/shopping/plan-entries.test.ts
git -C /Users/vacuumlabs/Developer/dapcook commit -m "feat: per-portion scaling and edit parsing for plan ingredients

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Building entries and the submit payload

**Files:**
- Modify: `src/lib/shopping/plan-entries.ts`
- Test: `src/lib/shopping/plan-entries.test.ts`

- [ ] **Step 1: Write the failing tests**

Extend the existing `./plan-entries` import in `plan-entries.test.ts` with `buildPlanEntries, buildSubmitPayload, type PlanEntry, type PlanSlot`, and add:

```ts
import type { Ingredient } from '@/types/recipe'
```

Append to the file:

```ts
function recipeSlot(p: {
  id: string
  day: number
  title: string
  servings: number | null
  ingredients?: unknown
}): PlanSlot {
  return {
    id: `slot-${p.id}-${p.day}`,
    week_plan_id: 'w',
    day_of_week: p.day,
    meal_type: 'lunch',
    recipe_id: p.id,
    custom_label: null,
    servings_scale: 1,
    span_days: 1,
    created_at: '2026-01-01T00:00:00.000Z',
    recipe: {
      id: p.id,
      title: p.title,
      image_url: null,
      cook_time_min: null,
      prep_time_min: null,
      servings: p.servings,
      ingredients: p.ingredients ?? [],
    },
  }
}

function customSlot(p: { id: string; day: number; label: string }): PlanSlot {
  return {
    id: `slot-${p.id}`,
    week_plan_id: 'w',
    day_of_week: p.day,
    meal_type: 'lunch',
    recipe_id: null,
    custom_label: p.label,
    servings_scale: 1,
    span_days: 1,
    created_at: '2026-01-01T00:00:00.000Z',
    recipe: null,
  }
}

const ing = (p: Partial<Ingredient>): Ingredient => ({ id: 'x', quantity: null, unit: '', name: '', notes: '', ...p })
const dayLabel = (slot: PlanSlot) => `D${slot.day_of_week}`

describe('buildPlanEntries', () => {
  it('makes one recipe entry per recipe and collects its days', () => {
    const entries = buildPlanEntries(
      [
        recipeSlot({ id: 'r1', day: 1, title: 'Pasta', servings: 2 }),
        recipeSlot({ id: 'r1', day: 3, title: 'Pasta', servings: 2 }),
      ],
      dayLabel,
    )
    expect(entries).toHaveLength(1)
    expect(entries[0]).toMatchObject({ kind: 'recipe', key: 'r1', title: 'Pasta', days: ['D1', 'D3'], portions: 2 })
  })

  it('defaults portions to 1 when the recipe has no servings', () => {
    const [entry] = buildPlanEntries([recipeSlot({ id: 'r1', day: 1, title: 'Pasta', servings: null })], dayLabel)
    expect(entry.portions).toBe(1)
  })

  it('stores ingredient quantities per portion', () => {
    const [entry] = buildPlanEntries(
      [
        recipeSlot({
          id: 'r1',
          day: 1,
          title: 'Pasta',
          servings: 4,
          ingredients: [ing({ quantity: 200, unit: 'g', name: 'pasta' }), ing({ name: 'salt' })],
        }),
      ],
      dayLabel,
    )
    expect(entry.kind === 'recipe' && entry.ingredients).toEqual([
      { id: 'r1:0', name: 'pasta', unit: 'g', quantityPerPortion: 50, checked: false },
      { id: 'r1:1', name: 'salt', unit: null, quantityPerPortion: null, checked: false },
    ])
  })

  it('uses the raw quantity as per-portion when servings is null', () => {
    const [entry] = buildPlanEntries(
      [recipeSlot({ id: 'r1', day: 1, title: 'Pasta', servings: null, ingredients: [ing({ quantity: 100, unit: 'g', name: 'flour' })] })],
      dayLabel,
    )
    expect(entry.kind === 'recipe' && entry.ingredients[0].quantityPerPortion).toBe(100)
  })

  it('treats non-array ingredients as none', () => {
    const [entry] = buildPlanEntries([recipeSlot({ id: 'r1', day: 1, title: 'Pasta', servings: 2, ingredients: null })], dayLabel)
    expect(entry.kind === 'recipe' && entry.ingredients).toEqual([])
  })

  it('adds typed custom meals once, skips preset labels, keeps recipes first', () => {
    const entries = buildPlanEntries(
      [
        customSlot({ id: 'c1', day: 1, label: 'rice' }),
        customSlot({ id: 'c2', day: 2, label: ' rice ' }),
        customSlot({ id: 'c3', day: 3, label: 'Eating out' }),
        recipeSlot({ id: 'r1', day: 4, title: 'Pasta', servings: 2 }),
      ],
      dayLabel,
    )
    expect(entries.map((e) => e.key)).toEqual(['r1', 'custom:rice'])
    expect(entries[1]).toMatchObject({ kind: 'custom', name: 'rice', days: ['D1', 'D2'], portions: 1 })
  })
})

describe('buildSubmitPayload', () => {
  const recipe: PlanEntry = {
    kind: 'recipe',
    key: 'r1',
    recipeId: 'r1',
    title: 'Pasta',
    servings: 2,
    days: [],
    portions: 3,
    removed: false,
    ingredients: [
      { id: 'r1:0', name: 'pasta', unit: 'g', quantityPerPortion: 100, checked: false },
      { id: 'r1:1', name: 'salt', unit: null, quantityPerPortion: null, checked: false },
      { id: 'r1:2', name: 'oil', unit: 'ml', quantityPerPortion: 10, checked: true },
    ],
  }
  const custom: PlanEntry = { kind: 'custom', key: 'custom:rice', name: 'rice', title: 'rice', days: [], portions: 2, removed: false }

  it('sends scaled unchecked ingredients and custom meals', () => {
    expect(buildSubmitPayload([recipe, custom])).toEqual({
      ingredients: [
        { name: 'pasta', quantity: 300, unit: 'g', recipe_id: 'r1' },
        { name: 'salt', quantity: null, unit: null, recipe_id: 'r1' },
      ],
      customItems: [{ name: 'rice', portions: 2 }],
    })
  })

  it('leaves out removed entries', () => {
    expect(buildSubmitPayload([{ ...recipe, removed: true }, { ...custom, removed: true }])).toEqual({
      ingredients: [],
      customItems: [],
    })
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/lib/shopping/plan-entries.test.ts`
Expected: FAIL — `buildPlanEntries` / `buildSubmitPayload` not exported.

- [ ] **Step 3: Implement**

In `src/lib/shopping/plan-entries.ts`, replace the import line with:

```ts
import type { ShoppingItem } from '@/types/database'
import type { Ingredient } from '@/types/recipe'
import type { MealSlotWithRecipe, SlotRecipe } from '@/types/planner'
import { CUSTOM_LABELS } from '@/types/planner'
```

Add after the `PlanIngredient` interface:

```ts
/** Meal slot as loaded by /shopping/generate — the recipe join also selects ingredients (raw JSON). */
export interface PlanSlot extends Omit<MealSlotWithRecipe, 'recipe'> {
  recipe: (SlotRecipe & { ingredients: unknown }) | null
}

interface BaseEntry {
  key: string
  title: string
  days: string[]
  portions: number
  removed: boolean
}
export interface RecipePlanEntry extends BaseEntry {
  kind: 'recipe'
  recipeId: string
  servings: number | null
  ingredients: PlanIngredient[]
}
export interface CustomPlanEntry extends BaseEntry {
  kind: 'custom'
  name: string
}
export type PlanEntry = RecipePlanEntry | CustomPlanEntry

/** Body of POST /api/shopping/items/add-from-plan. */
export interface PlanPayload {
  ingredients: { name: string; quantity: number | null; unit: string | null; recipe_id: string }[]
  customItems: { name: string; portions: number }[]
}

const PRESET_LABELS = new Set<string>(CUSTOM_LABELS)

function toPlanIngredients(recipeId: string, raw: unknown, servings: number | null): PlanIngredient[] {
  const ingredients = Array.isArray(raw) ? (raw as Ingredient[]) : []
  return ingredients.map((ing, i) => ({
    id: `${recipeId}:${i}`,
    name: ing.name,
    unit: ing.unit || null,
    quantityPerPortion: ing.quantity != null ? ing.quantity / (servings ?? 1) : null,
    checked: false,
  }))
}

/**
 * One entry per unique recipe, then one per unique typed custom meal — preset
 * status labels ("Eating out", …) are not shoppable.
 */
export function buildPlanEntries(slots: PlanSlot[], dayLabel: (slot: PlanSlot) => string): PlanEntry[] {
  const recipes = new Map<string, RecipePlanEntry>()
  const customs = new Map<string, CustomPlanEntry>()

  for (const slot of slots) {
    if (slot.recipe_id) {
      const recipe = slot.recipe
      if (!recipe) continue
      let entry = recipes.get(recipe.id)
      if (!entry) {
        entry = {
          kind: 'recipe',
          key: recipe.id,
          recipeId: recipe.id,
          title: recipe.title,
          servings: recipe.servings,
          days: [],
          portions: recipe.servings ?? 1,
          removed: false,
          ingredients: toPlanIngredients(recipe.id, recipe.ingredients, recipe.servings),
        }
        recipes.set(recipe.id, entry)
      }
      entry.days.push(dayLabel(slot))
      continue
    }

    const label = slot.custom_label?.trim()
    if (!label || PRESET_LABELS.has(label)) continue
    let entry = customs.get(label)
    if (!entry) {
      entry = { kind: 'custom', key: `custom:${label}`, name: label, title: label, days: [], portions: 1, removed: false }
      customs.set(label, entry)
    }
    entry.days.push(dayLabel(slot))
  }

  return [...Array.from(recipes.values()), ...Array.from(customs.values())]
}

export function buildSubmitPayload(entries: PlanEntry[]): PlanPayload {
  const payload: PlanPayload = { ingredients: [], customItems: [] }
  for (const entry of entries) {
    if (entry.removed) continue
    if (entry.kind === 'custom') {
      payload.customItems.push({ name: entry.name, portions: entry.portions })
      continue
    }
    for (const ingredient of entry.ingredients) {
      if (ingredient.checked) continue
      payload.ingredients.push({
        name: ingredient.name,
        quantity: displayQuantity(ingredient.quantityPerPortion, entry.portions),
        unit: ingredient.unit,
        recipe_id: entry.recipeId,
      })
    }
  }
  return payload
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/lib/shopping/plan-entries.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git -C /Users/vacuumlabs/Developer/dapcook add src/lib/shopping/plan-entries.ts src/lib/shopping/plan-entries.test.ts
git -C /Users/vacuumlabs/Developer/dapcook commit -m "feat: build shopping plan entries and submit payload

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: `POST /api/shopping/items/add-from-plan`

**Files:**
- Create: `src/app/api/shopping/items/add-from-plan/route.ts`
- Test: `src/app/api/shopping/items/add-from-plan/route.test.ts`

- [ ] **Step 1: Write the failing tests**

`src/app/api/shopping/items/add-from-plan/route.test.ts`:

```ts
// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('@/lib/ai/make-shopping-list', () => ({ makeShoppingListSmart: vi.fn() }))
vi.mock('@/lib/auth/household', async () => ({
  getCurrentHouseholdId: (await import('@/test/householdMock')).householdIdMock,
}))

import { createClient } from '@/lib/supabase/server'
import { makeShoppingListSmart } from '@/lib/ai/make-shopping-list'
import { POST } from './route'
import { authMock } from '@/test/authMock'
import { householdIdMock } from '@/test/householdMock'

function makeSupabase({ categories = [] as { name: string; color: string | null }[] } = {}) {
  const itemsInsert = vi.fn().mockResolvedValue({ error: null })
  const categoriesInsert = vi.fn().mockResolvedValue({ error: null })
  const fromMap = {
    shopping_categories: {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({ data: categories }),
      insert: categoriesInsert,
    },
    shopping_rules: {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({ data: [{ rule: 'no plastic bags' }] }),
    },
    shopping_lists: {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: { id: 'list-1' } }),
    },
    shopping_items: {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: { sort_order: 4 } }),
      insert: itemsInsert,
    },
  }
  const client = {
    auth: authMock({ id: 'user-1' }),
    from: vi.fn((table: keyof typeof fromMap) => fromMap[table]),
  }
  vi.mocked(createClient).mockReturnValue(client as unknown as ReturnType<typeof createClient>)
  return { itemsInsert, categoriesInsert }
}

function request(body: unknown) {
  return new NextRequest('http://localhost/api/shopping/items/add-from-plan', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function listItem(p: { name: string; quantity: number | null; unit: string | null; category: string | null; sort_order: number }) {
  return { shopping_list_id: 'list-1', is_checked: false, source_recipe_ids: [], ...p }
}

beforeEach(() => {
  vi.clearAllMocks()
  householdIdMock.mockResolvedValue('hh-1')
})

describe('POST /api/shopping/items/add-from-plan', () => {
  it('merges ingredients with AI and appends them grouped by category, custom items last', async () => {
    const { itemsInsert } = makeSupabase({ categories: [{ name: 'Produce', color: null }, { name: 'Dairy', color: null }] })
    vi.mocked(makeShoppingListSmart).mockResolvedValue({
      items: [
        { name: 'milk', quantity: 1, unit: 'l', category: 'Dairy', source_recipe_ids: ['r1'] },
        { name: 'onion', quantity: 3, unit: '', category: 'Produce', source_recipe_ids: ['r1', 'r2'] },
      ],
      newCategories: [],
    })

    const res = await POST(request({
      ingredients: [
        { name: 'milk', quantity: 1, unit: 'l', recipe_id: 'r1' },
        { name: 'onion', quantity: 1, unit: null, recipe_id: 'r1' },
        { name: 'onion', quantity: 2, unit: null, recipe_id: 'r2' },
      ],
      customItems: [{ name: 'rice', portions: 2 }],
    }))

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ count: 3 })

    const [rawItems, , householdId, rules] = vi.mocked(makeShoppingListSmart).mock.calls[0]
    expect(rawItems.map((i) => [i.name, i.quantity, i.unit, i.source_recipe_ids])).toEqual([
      ['milk', 1, 'l', ['r1']],
      ['onion', 1, null, ['r1']],
      ['onion', 2, null, ['r2']],
    ])
    expect(householdId).toBe('hh-1')
    expect(rules).toEqual(['no plastic bags'])

    expect(itemsInsert).toHaveBeenCalledWith([
      listItem({ name: 'onion', quantity: 3, unit: null, category: 'Produce', sort_order: 5 }),
      listItem({ name: 'milk', quantity: 1, unit: 'l', category: 'Dairy', sort_order: 6 }),
      listItem({ name: 'rice', quantity: 2, unit: null, category: null, sort_order: 7 }),
    ])
  })

  it('saves categories invented by the AI', async () => {
    const { categoriesInsert } = makeSupabase()
    vi.mocked(makeShoppingListSmart).mockResolvedValue({
      items: [{ name: 'onion', quantity: 1, unit: '', category: 'Produce', source_recipe_ids: [] }],
      newCategories: [
        { id: 'tmp', household_id: 'hh-1', name: 'Produce', color: '#0a0', sort_order: 0, created_at: '2026-01-01T00:00:00Z' },
      ],
    })

    await POST(request({ ingredients: [{ name: 'onion', quantity: 1, unit: null, recipe_id: 'r1' }], customItems: [] }))

    expect(categoriesInsert).toHaveBeenCalledWith([{ household_id: 'hh-1', name: 'Produce', color: '#0a0', sort_order: 0 }])
  })

  it('appends custom meals verbatim without calling the AI', async () => {
    const { itemsInsert } = makeSupabase()

    const res = await POST(request({ ingredients: [], customItems: [{ name: ' rice ', portions: 3 }] }))

    expect(res.status).toBe(200)
    expect(makeShoppingListSmart).not.toHaveBeenCalled()
    expect(itemsInsert).toHaveBeenCalledWith([listItem({ name: 'rice', quantity: 3, unit: null, category: null, sort_order: 5 })])
  })

  it('returns 400 when nothing has a name', async () => {
    makeSupabase()
    const res = await POST(request({ ingredients: [{ name: '  ', quantity: 1, unit: null, recipe_id: 'r1' }], customItems: [] }))
    expect(res.status).toBe(400)
  })

  it('returns 500 and inserts nothing when the AI fails', async () => {
    const { itemsInsert } = makeSupabase()
    vi.mocked(makeShoppingListSmart).mockRejectedValue(new Error('boom'))
    vi.spyOn(console, 'error').mockImplementation(() => {})

    const res = await POST(request({ ingredients: [{ name: 'onion', quantity: 1, unit: null, recipe_id: 'r1' }], customItems: [] }))

    expect(res.status).toBe(500)
    expect(itemsInsert).not.toHaveBeenCalled()
  })

  it('returns 403 without a household', async () => {
    makeSupabase()
    householdIdMock.mockResolvedValue(null)
    const res = await POST(request({ ingredients: [], customItems: [{ name: 'rice', portions: 1 }] }))
    expect(res.status).toBe(403)
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/app/api/shopping/items/add-from-plan/route.test.ts`
Expected: FAIL — cannot resolve `./route`.

- [ ] **Step 3: Implement**

`src/app/api/shopping/items/add-from-plan/route.ts` (logic merged from the old `preview` and `items/append` routes):

```ts
import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { makeShoppingListSmart } from '@/lib/ai/make-shopping-list'
import type { ShoppingItem } from '@/types/database'
import type { PlanPayload } from '@/lib/shopping/plan-entries'
import { getCurrentUser } from '@/lib/auth/current-user'
import { getCurrentHouseholdId } from '@/lib/auth/household'

interface ListItem {
  name: string
  quantity: number | null
  unit: string | null
  category: string | null
}

export async function POST(request: NextRequest) {
  const supabase = createClient()
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const householdId = await getCurrentHouseholdId()
  if (!householdId) return NextResponse.json({ error: 'No household' }, { status: 403 })

  const body = await request.json() as Partial<PlanPayload>
  const ingredients = (body.ingredients ?? []).filter((i) => typeof i?.name === 'string' && i.name.trim())
  // Typed custom meals (e.g. "rice") are added verbatim — name + portions, no AI.
  const customItems: ListItem[] = (body.customItems ?? [])
    .filter((c) => typeof c?.name === 'string' && c.name.trim())
    .map((c) => ({
      name: c.name.trim(),
      quantity: Number.isFinite(c.portions) && c.portions >= 1 ? c.portions : 1,
      unit: null,
      category: null,
    }))

  if (!ingredients.length && !customItems.length) {
    return NextResponse.json({ error: 'ingredients or customItems are required' }, { status: 400 })
  }

  const [{ data: categories }, { data: rulesRows }] = await Promise.all([
    supabase.from('shopping_categories').select('*').eq('household_id', householdId).order('sort_order'),
    supabase.from('shopping_rules').select('rule').eq('household_id', householdId).order('created_at'),
  ])

  let allCategories = categories ?? []
  let mergedItems: ListItem[] = []

  if (ingredients.length) {
    const rawItems: ShoppingItem[] = ingredients.map((item, i) => ({
      id: `plan-${i}`,
      shopping_list_id: 'plan',
      name: item.name.trim(),
      quantity: typeof item.quantity === 'number' && Number.isFinite(item.quantity) ? item.quantity : null,
      unit: item.unit || null,
      category: null,
      is_checked: false,
      sort_order: i,
      source_recipe_ids: item.recipe_id ? [item.recipe_id] : [],
    }))
    const rules = (rulesRows ?? []).map((r) => r.rule)

    let result
    try {
      result = await makeShoppingListSmart(rawItems, allCategories, householdId, rules)
    } catch (err) {
      console.error('[shopping/add-from-plan] AI call failed:', err)
      return NextResponse.json({ error: 'AI processing failed' }, { status: 500 })
    }

    // The AI only invents categories when the household has none yet
    if (result.newCategories.length > 0) {
      await supabase.from('shopping_categories').insert(
        result.newCategories.map((cat) => ({
          household_id: cat.household_id,
          name: cat.name,
          color: cat.color,
          sort_order: cat.sort_order,
        }))
      )
      allCategories = result.newCategories
    }

    mergedItems = result.items.map((item) => ({
      name: item.name,
      quantity: item.quantity,
      unit: item.unit || null,
      category: item.category || null,
    }))
  }

  // Sort by category order so items arrive grouped — prevents duplicate
  // category headers in the main shopping list. Custom items go last.
  const categoryOrder = new Map(allCategories.map((c, i) => [c.name, i]))
  const rank = (item: ListItem) => (item.category ? (categoryOrder.get(item.category) ?? 999) : 999)
  const toAppend = [...[...mergedItems].sort((a, b) => rank(a) - rank(b)), ...customItems]

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

  // New items go after existing ones
  const { data: maxItem } = await supabase
    .from('shopping_items')
    .select('sort_order')
    .eq('shopping_list_id', listId)
    .order('sort_order', { ascending: false })
    .limit(1)
    .maybeSingle()
  const startOrder = (maxItem?.sort_order ?? -1) + 1

  const { error } = await supabase.from('shopping_items').insert(
    toAppend.map((item, i) => ({
      shopping_list_id: listId as string,
      name: item.name,
      quantity: item.quantity,
      unit: item.unit,
      category: item.category,
      is_checked: false,
      sort_order: startOrder + i,
      source_recipe_ids: [] as string[],
    }))
  )
  if (error) return NextResponse.json({ error: 'Failed to insert items' }, { status: 500 })

  return NextResponse.json({ count: toAppend.length })
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/app/api/shopping/items/add-from-plan/route.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git -C /Users/vacuumlabs/Developer/dapcook add src/app/api/shopping/items/add-from-plan
git -C /Users/vacuumlabs/Developer/dapcook commit -m "feat: add-from-plan route merges ingredients with AI and appends them

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Translations

**Files:**
- Modify: `messages/en/shopping.json`, `messages/sk/shopping.json`

Only add keys here — the old keys are still used until Task 6 removes their callers.

- [ ] **Step 1: Add to the `generate` block in `messages/en/shopping.json`**


```json
"addToList": "{count, plural, one {Add # item to shopping list} other {Add # items to shopping list}}",
"adding": "Adding…",
"noIngredients": "This recipe has no ingredients.",
"removeAria": "Remove from shopping list"
```

- [ ] **Step 2: Add to the `generate` block in `messages/sk/shopping.json`**


```json
"addToList": "{count, plural, one {Pridať # položku do zoznamu} few {Pridať # položky do zoznamu} other {Pridať # položiek do zoznamu}}",
"adding": "Pridávam…",
"noIngredients": "Tento recept nemá žiadne ingrediencie.",
"removeAria": "Odstrániť z nákupného zoznamu"
```

- [ ] **Step 3: Check JSON validity and key parity**

Run:

```bash
cd /Users/vacuumlabs/Developer/dapcook && node -e "const en=require('./messages/en/shopping.json').generate, sk=require('./messages/sk/shopping.json').generate; const a=Object.keys(en).sort().join(), b=Object.keys(sk).sort().join(); console.log(a===b ? 'OK' : 'MISMATCH\n'+a+'\n'+b)"
```

Expected: `OK`.

- [ ] **Step 4: Commit**

```bash
git -C /Users/vacuumlabs/Developer/dapcook add messages/en/shopping.json messages/sk/shopping.json
git -C /Users/vacuumlabs/Developer/dapcook commit -m "feat: translations for single-step shopping generation

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: `ShoppingPlanBox` and the new `GenerateShoppingPage`

**Files:**
- Create: `src/components/shopping/ShoppingPlanBox.tsx`
- Rewrite: `src/components/shopping/GenerateShoppingPage.tsx`
- Rewrite: `src/components/shopping/GenerateShoppingPage.test.tsx`
- Modify: `src/app/(flow)/shopping/generate/page.tsx`

- [ ] **Step 1: Write the failing component tests**

Replace `src/components/shopping/GenerateShoppingPage.test.tsx` with:

```tsx
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createTranslator } from 'use-intl'
import { GenerateShoppingPage } from './GenerateShoppingPage'
import { mockTranslate } from '@/test/mockMessages'
import skMessages from '../../../messages/sk/shopping.json'
import type { TranslationValues } from 'use-intl'
import type { PlanSlot } from '@/lib/shopping/plan-entries'
import type { Ingredient } from '@/types/recipe'

const mockPush = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: mockPush }) }))
vi.mock('next-intl', () => ({
  useLocale: () => 'en',
  useTranslations: (namespace: string) => (key: string, values?: TranslationValues) =>
    mockTranslate(namespace, key, values),
}))

beforeEach(() => {
  vi.clearAllMocks()
  global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ count: 1 }) } as Response)
})

const ing = (p: Partial<Ingredient>): Ingredient => ({ id: 'x', quantity: null, unit: '', name: '', notes: '', ...p })

function recipeSlot(p: { id: string; day_of_week: number; title: string; servings: number | null; ingredients?: Ingredient[] }): PlanSlot {
  return {
    id: `slot-${p.id}`,
    week_plan_id: 'w',
    day_of_week: p.day_of_week,
    meal_type: 'lunch',
    recipe_id: p.id,
    custom_label: null,
    servings_scale: 1,
    span_days: 1,
    created_at: '2026-01-01T00:00:00.000Z',
    recipe: {
      id: p.id,
      title: p.title,
      image_url: null,
      cook_time_min: null,
      prep_time_min: null,
      servings: p.servings,
      ingredients: p.ingredients ?? [],
    },
  }
}

function customSlot(p: { id: string; day_of_week: number; label: string }): PlanSlot {
  return {
    id: `slot-${p.id}`,
    week_plan_id: 'w',
    day_of_week: p.day_of_week,
    meal_type: 'lunch',
    recipe_id: null,
    custom_label: p.label,
    servings_scale: 1,
    span_days: 1,
    created_at: '2026-01-01T00:00:00.000Z',
    recipe: null,
  }
}

const weekStart = new Date('2026-06-08T00:00:00.000Z')

const carbonara = recipeSlot({
  id: 'r1',
  day_of_week: 1,
  title: 'Carbonara',
  servings: 2,
  ingredients: [ing({ quantity: 200, unit: 'g', name: 'spaghetti' }), ing({ quantity: 1, name: 'onion' })],
})

function renderPage(slots: PlanSlot[] = [carbonara, customSlot({ id: 'c1', day_of_week: 2, label: 'rice' })]) {
  render(<GenerateShoppingPage weekStart={weekStart} slots={slots} />)
}

const box = (name: string) => within(screen.getByRole('region', { name }))

async function setPortions(boxName: string, value: string) {
  const input = box(boxName).getByRole('spinbutton', { name: 'Portions' })
  await userEvent.clear(input)
  await userEvent.type(input, value)
}

function lastFetchBody() {
  const calls = vi.mocked(global.fetch).mock.calls
  return JSON.parse(calls[calls.length - 1][1]!.body as string)
}

describe('GenerateShoppingPage', () => {
  it('shows a box per recipe with its scaled ingredients and a box per typed custom meal', () => {
    renderPage([carbonara, customSlot({ id: 'c1', day_of_week: 2, label: 'rice' }), customSlot({ id: 'c2', day_of_week: 3, label: 'Eating out' })])

    expect(box('Carbonara').getByText('spaghetti')).toBeInTheDocument()
    expect(box('Carbonara').getByText('200g')).toBeInTheDocument()
    expect(box('Carbonara').getByText('onion')).toBeInTheDocument()
    expect(box('rice').queryAllByRole('checkbox')).toHaveLength(0)
    expect(screen.queryByText('Eating out')).toBeNull()
  })

  it('notes a recipe without ingredients', () => {
    renderPage([recipeSlot({ id: 'r2', day_of_week: 1, title: 'Toast', servings: 1 })])
    expect(box('Toast').getByText('This recipe has no ingredients.')).toBeInTheDocument()
  })

  it('collapses the same custom meal across days into one box', () => {
    renderPage([customSlot({ id: 'c1', day_of_week: 1, label: 'rice' }), customSlot({ id: 'c2', day_of_week: 3, label: 'rice' })])
    expect(screen.getAllByText('rice')).toHaveLength(1)
  })

  it('rescales ingredients when portions change', async () => {
    renderPage()
    await setPortions('Carbonara', '3')
    expect(box('Carbonara').getByText('300g')).toBeInTheDocument()
  })

  it('rescales an edited ingredient when portions change', async () => {
    renderPage()
    await userEvent.click(box('Carbonara').getByText('spaghetti'))
    const editor = box('Carbonara').getByDisplayValue('200g spaghetti')
    await userEvent.clear(editor)
    await userEvent.type(editor, '150g spaghetti{Enter}')
    expect(box('Carbonara').getByText('150g')).toBeInTheDocument()

    await setPortions('Carbonara', '4')
    expect(box('Carbonara').getByText('300g')).toBeInTheDocument()
  })

  it('leaves checked ingredients out and adds the rest to the list', async () => {
    renderPage()
    expect(screen.getByRole('button', { name: 'Add 3 items to shopping list' })).toBeInTheDocument()

    await userEvent.click(box('Carbonara').getAllByRole('checkbox')[1])
    const addButton = await screen.findByRole('button', { name: 'Add 2 items to shopping list' })
    await userEvent.click(addButton)

    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/shopping'))
    expect(global.fetch).toHaveBeenCalledWith('/api/shopping/items/add-from-plan', expect.objectContaining({ method: 'POST' }))
    expect(lastFetchBody()).toEqual({
      ingredients: [{ name: 'spaghetti', quantity: 200, unit: 'g', recipe_id: 'r1' }],
      customItems: [{ name: 'rice', portions: 1 }],
    })
  })

  it('removes a whole recipe and can undo it', async () => {
    renderPage()
    await userEvent.click(box('Carbonara').getByRole('button', { name: 'Remove from shopping list' }))
    expect(screen.getByRole('button', { name: 'Add 1 item to shopping list' })).toBeInTheDocument()
    expect(box('Carbonara').queryByText('spaghetti')).toBeNull()

    await userEvent.click(box('Carbonara').getByRole('button', { name: 'Undo' }))
    expect(screen.getByRole('button', { name: 'Add 3 items to shopping list' })).toBeInTheDocument()
  })

  it('shows an error and stays on the page when adding fails', async () => {
    vi.mocked(global.fetch).mockResolvedValue({ ok: false, json: async () => ({}) } as Response)
    renderPage()
    await userEvent.click(screen.getByRole('button', { name: 'Add 3 items to shopping list' }))
    expect(await screen.findByText('Something went wrong. Please try again.')).toBeInTheDocument()
    expect(mockPush).not.toHaveBeenCalled()
    expect(box('Carbonara').getByText('spaghetti')).toBeInTheDocument()
  })

  // Slovak has a distinct "few" plural category (2-4) that English doesn't —
  // check it against the real catalog so the one/few/other forms aren't collapsed.
  it('uses the Slovak "few" plural category for counts 2-4', () => {
    const t = createTranslator({ locale: 'sk', namespace: 'shopping', messages: { shopping: skMessages } })
    expect(t('generate.addToList', { count: 1 })).toBe('Pridať 1 položku do zoznamu')
    expect(t('generate.addToList', { count: 3 })).toBe('Pridať 3 položky do zoznamu')
    expect(t('generate.addToList', { count: 5 })).toBe('Pridať 5 položiek do zoznamu')
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/components/shopping/GenerateShoppingPage.test.tsx`
Expected: FAIL — no `region` named "Carbonara", no "Add … to shopping list" button.

- [ ] **Step 3: Create `ShoppingPlanBox`**

`src/components/shopping/ShoppingPlanBox.tsx`:

```tsx
'use client'

import { useTranslations } from 'next-intl'
import { X, AlertTriangle } from 'lucide-react'
import { ShoppingItemRow } from './ShoppingItemRow'
import { toShoppingItem, type PlanEntry } from '@/lib/shopping/plan-entries'

interface Props {
  entry: PlanEntry
  /** Raw input text — may be temporarily empty while the user types. */
  portionsText: string
  onPortionsChange: (raw: string) => void
  onToggleRemove: () => void
  onCheckIngredient: (id: string, checked: boolean) => void
  /** Receives the row's free edit text, e.g. "150g rice". */
  onEditIngredient: (id: string, text: string) => void
  onDeleteIngredient: (id: string) => void
}

export function ShoppingPlanBox({
  entry, portionsText,
  onPortionsChange, onToggleRemove,
  onCheckIngredient, onEditIngredient, onDeleteIngredient,
}: Props) {
  const t = useTranslations('shopping')

  return (
    <section
      aria-label={entry.title}
      className={`rounded-xl border transition-colors ${
        entry.removed ? 'border-gray-100 bg-gray-50 opacity-50' : 'border-gray-200 bg-white'
      }`}
    >
      <div className="flex items-start gap-3 p-3">
        <div className="flex-1 min-w-0">
          <p className={`text-sm font-medium ${entry.removed ? 'text-gray-400 line-through' : 'text-gray-900'}`}>
            {entry.title}
          </p>
          <p className="text-xs text-gray-400 mt-0.5">{entry.days.join(', ')}</p>
        </div>
        <button
          type="button"
          onClick={onToggleRemove}
          aria-label={entry.removed ? undefined : t('generate.removeAria')}
          className="flex-shrink-0 text-xs text-gray-400 hover:text-gray-700 transition-colors mt-1"
        >
          {entry.removed ? t('generate.undo') : <X size={14} />}
        </button>
      </div>

      {!entry.removed && (
        <>
          {entry.kind === 'recipe' && (
            entry.ingredients.length > 0 ? (
              <div className="px-3 border-t border-gray-100">
                {entry.ingredients.map((ingredient, i) => (
                  <ShoppingItemRow
                    key={ingredient.id}
                    item={toShoppingItem(ingredient, entry.portions, i)}
                    recipeNames={{}}
                    onCheck={onCheckIngredient}
                    onUpdate={(id, changes) => {
                      if (changes.name !== undefined) onEditIngredient(id, changes.name)
                    }}
                    onDelete={onDeleteIngredient}
                  />
                ))}
              </div>
            ) : (
              <p className="px-3 pb-2 text-xs text-gray-400">{t('generate.noIngredients')}</p>
            )
          )}

          <div className="flex items-center justify-between gap-3 px-3 py-2 border-t border-gray-100">
            {entry.kind === 'recipe' && entry.servings == null ? (
              <p className="flex items-center gap-1 text-xs text-amber-600">
                <AlertTriangle size={11} />
                {t('generate.noServingsWarning')}
              </p>
            ) : (
              <span />
            )}
            <label className="flex items-center gap-2 text-xs text-gray-400">
              {t('generate.portions')}
              <input
                type="number"
                min={1}
                value={portionsText}
                onChange={(e) => onPortionsChange(e.target.value)}
                style={{ fontSize: '16px' }}
                className="w-16 text-sm text-center text-gray-900 px-2 py-1 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-300"
              />
            </label>
          </div>
        </>
      )}
    </section>
  )
}
```

- [ ] **Step 4: Rewrite `GenerateShoppingPage`**

Replace `src/components/shopping/GenerateShoppingPage.tsx` with:

```tsx
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useLocale, useTranslations } from 'next-intl'
import { ArrowLeft } from 'lucide-react'
import { getWeekDays, formatDayLabel } from '@/lib/utils/week'
import {
  applyIngredientEdit,
  buildPlanEntries,
  buildSubmitPayload,
  type PlanEntry,
  type PlanIngredient,
  type PlanSlot,
} from '@/lib/shopping/plan-entries'
import { ShoppingPlanBox } from './ShoppingPlanBox'

interface Props {
  slots: PlanSlot[]
  weekStart: Date
}

export function GenerateShoppingPage({ slots, weekStart }: Props) {
  const router = useRouter()
  const locale = useLocale()
  const t = useTranslations('shopping')

  const [entries, setEntries] = useState<PlanEntry[]>(() => {
    const weekDays = getWeekDays(weekStart)
    return buildPlanEntries(slots, (slot) => {
      const { weekday, day } = formatDayLabel(weekDays[slot.day_of_week - 1], locale)
      return `${weekday} ${day}`
    })
  })
  // Raw text state lets the input be temporarily empty while the user is typing
  const [portionsText, setPortionsText] = useState<Record<string, string>>(() =>
    Object.fromEntries(entries.map((e) => [e.key, String(e.portions)])),
  )
  const [isAdding, setIsAdding] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const payload = buildSubmitPayload(entries)
  const itemCount = payload.ingredients.length + payload.customItems.length

  function updateEntry(key: string, update: (entry: PlanEntry) => PlanEntry) {
    setEntries((prev) => prev.map((e) => (e.key === key ? update(e) : e)))
  }

  function updateIngredients(key: string, update: (ingredients: PlanIngredient[], portions: number) => PlanIngredient[]) {
    updateEntry(key, (e) => (e.kind === 'recipe' ? { ...e, ingredients: update(e.ingredients, e.portions) } : e))
  }

  function updatePortions(key: string, raw: string) {
    setPortionsText((prev) => ({ ...prev, [key]: raw }))
    const num = parseInt(raw, 10)
    if (!isNaN(num) && num >= 1) updateEntry(key, (e) => ({ ...e, portions: num }))
  }

  function toggleRemove(key: string) {
    updateEntry(key, (e) => ({ ...e, removed: !e.removed }))
  }

  function checkIngredient(key: string, id: string, checked: boolean) {
    updateIngredients(key, (list) => list.map((i) => (i.id === id ? { ...i, checked } : i)))
  }

  function editIngredient(key: string, id: string, text: string) {
    updateIngredients(key, (list, portions) => list.map((i) => (i.id === id ? applyIngredientEdit(i, text, portions) : i)))
  }

  function deleteIngredient(key: string, id: string) {
    updateIngredients(key, (list) => list.filter((i) => i.id !== id))
  }

  async function handleAdd() {
    setIsAdding(true)
    setError(null)

    try {
      const res = await fetch('/api/shopping/items/add-from-plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      if (!res.ok) {
        setError(t('generate.genericError'))
        setIsAdding(false)
        return
      }

      // Persist recipe portions so the planner can show them next to meal names
      try {
        const saved = JSON.parse(localStorage.getItem('recipe_portions') ?? '{}') as Record<string, number>
        for (const e of entries) {
          if (e.kind === 'recipe' && !e.removed) saved[e.recipeId] = e.portions
        }
        localStorage.setItem('recipe_portions', JSON.stringify(saved))
      } catch {
        // ignore storage errors
      }

      router.push('/shopping')
    } catch {
      setError(t('generate.networkError'))
      setIsAdding(false)
    }
  }

  return (
    <div className="max-w-xl mx-auto px-4 py-10 pb-28">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <button
          type="button"
          onClick={() => router.push('/planner')}
          className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900 transition-colors"
        >
          <ArrowLeft size={16} />
          {t('generate.plannerLink')}
        </button>
        <h1 className="text-xl font-semibold text-gray-900">{t('generate.heading')}</h1>
      </div>

      {entries.length === 0 ? (
        <p className="text-sm text-gray-500 text-center mt-20">
          {t('generate.emptyPlan')}{' '}
          <button type="button" onClick={() => router.push('/planner')} className="underline hover:text-gray-900">
            {t('generate.backToPlanner')}
          </button>
        </p>
      ) : (
        <div className="space-y-3">
          {entries.map((entry) => (
            <ShoppingPlanBox
              key={entry.key}
              entry={entry}
              portionsText={portionsText[entry.key] ?? String(entry.portions)}
              onPortionsChange={(raw) => updatePortions(entry.key, raw)}
              onToggleRemove={() => toggleRemove(entry.key)}
              onCheckIngredient={(id, checked) => checkIngredient(entry.key, id, checked)}
              onEditIngredient={(id, text) => editIngredient(entry.key, id, text)}
              onDeleteIngredient={(id) => deleteIngredient(entry.key, id)}
            />
          ))}
        </div>
      )}

      {/* Sticky footer */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 px-4 py-4">
        <div className="max-w-xl mx-auto space-y-2">
          {error && <p className="text-sm text-red-500">{error}</p>}
          <button
            type="button"
            onClick={handleAdd}
            disabled={isAdding || itemCount === 0}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-gray-900 text-white text-sm font-medium rounded-xl hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isAdding ? (
              <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : null}
            {isAdding ? t('generate.adding') : t('generate.addToList', { count: itemCount })}
          </button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 5: Load ingredients on the server page**

In `src/app/(flow)/shopping/generate/page.tsx`:

Replace `import type { MealSlotWithRecipe } from '@/types/planner'` with:

```ts
import type { PlanSlot } from '@/lib/shopping/plan-entries'
```

Replace `let slots: MealSlotWithRecipe[] = []` with `let slots: PlanSlot[] = []`.

Replace the select and cast:

```ts
      .select('*, recipe:recipes(id, title, image_url, cook_time_min, prep_time_min, servings, ingredients)')
```

```ts
    slots = (data ?? []) as unknown as PlanSlot[]
```

- [ ] **Step 6: Run the component tests**

Run: `npx vitest run src/components/shopping/GenerateShoppingPage.test.tsx`
Expected: PASS (9 tests). If the checkbox test times out, the row's check animation needs 600 ms before `onCheck` fires — `findByRole` waits 1000 ms by default, which is enough; do not add fake timers.

- [ ] **Step 7: Commit**

```bash
git -C /Users/vacuumlabs/Developer/dapcook add src/components/shopping/ShoppingPlanBox.tsx src/components/shopping/GenerateShoppingPage.tsx src/components/shopping/GenerateShoppingPage.test.tsx "src/app/(flow)/shopping/generate/page.tsx"
git -C /Users/vacuumlabs/Developer/dapcook commit -m "feat: one-step shopping list generation with per-recipe boxes

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Remove the old review flow

**Files:**
- Delete: `src/app/api/shopping/preview/route.ts`, `src/app/api/shopping/items/append/route.ts`, `src/app/(flow)/shopping/review/page.tsx`, `src/components/shopping/ShoppingReviewClient.tsx`, `src/components/shopping/ShoppingReviewClient.test.tsx`, `src/lib/shopping/scale-ingredients.ts` + test (only caller was `preview`)
- Modify: `src/app/(flow)/layout.test.tsx:25-29` (comment)
- Modify: `messages/en/shopping.json`, `messages/sk/shopping.json` (drop unused keys)

- [ ] **Step 1: Delete files**

```bash
cd /Users/vacuumlabs/Developer/dapcook && git rm -q src/app/api/shopping/preview/route.ts src/app/api/shopping/items/append/route.ts "src/app/(flow)/shopping/review/page.tsx" src/components/shopping/ShoppingReviewClient.tsx src/components/shopping/ShoppingReviewClient.test.tsx src/lib/shopping/scale-ingredients.ts src/lib/shopping/scale-ingredients.test.ts
```

- [ ] **Step 2: Fix the stale comment in `src/app/(flow)/layout.test.tsx`**

Change the end of the comment block from:

```ts
// under it threw as soon as the user navigated to /shopping/generate or
// /shopping/review.
```

to:

```ts
// under it threw as soon as the user navigated to /shopping/generate.
```

- [ ] **Step 3: Drop unused translation keys**

In both `messages/en/shopping.json` and `messages/sk/shopping.json`: remove `generating` and `generate` from the `generate` block, and delete the whole `review` block. Keep `generate.heading`.

- [ ] **Step 4: Verify nothing references the removed code**

Run:

```bash
cd /Users/vacuumlabs/Developer/dapcook && grep -rn "scaleIngredients\|shopping/preview\|items/append\|shopping/review\|shopping_preview\|ShoppingReviewClient\|'review\.\|generate\.generat" src messages
```

Expected: no output.

- [ ] **Step 5: Full verification**

Run: `npm run type-check && npm run lint && npm test`
Expected: all pass, no type errors.

- [ ] **Step 6: Commit**

```bash
git -C /Users/vacuumlabs/Developer/dapcook add -A src messages
git -C /Users/vacuumlabs/Developer/dapcook commit -m "refactor: remove shopping review step and preview/append routes

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Browser check and staging deploy

- [ ] **Step 1: Check in the browser**

Start the dev server (`preview_start`, add a `.claude/launch.json` entry for `npm run dev` on port 3000 if missing). Log in, open the planner for a week with at least two recipes and one typed custom meal, click "Generate shopping list" and check:
- one box per recipe with ingredients, one box for the custom meal;
- changing portions rescales quantities;
- editing "200g x" to "150g x", then changing portions, rescales the edited row;
- checking an ingredient lowers the button count;
- "Add N items" lands on `/shopping` with merged, categorized items.

Take a screenshot of the generate page as proof. Check the browser console and server logs for errors.

- [ ] **Step 2: Push the branch and merge into staging**

```bash
git -C /Users/vacuumlabs/Developer/dapcook push -u origin feat/single-step-shopping
git -C /Users/vacuumlabs/Developer/dapcook checkout staging
git -C /Users/vacuumlabs/Developer/dapcook pull
git -C /Users/vacuumlabs/Developer/dapcook merge --no-ff feat/single-step-shopping
git -C /Users/vacuumlabs/Developer/dapcook push
git -C /Users/vacuumlabs/Developer/dapcook checkout feat/single-step-shopping
```

Test on https://dapcook-staging.vercel.app. After approval, merge **`feat/single-step-shopping`** (not `staging`) into `main`. No database migration is needed.
