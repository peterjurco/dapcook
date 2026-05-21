# Recipe Language & Units Transformation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add household-level language preference, auto-translate + unit-convert recipes on URL import, and offer bulk migration when preferences change.

**Architecture:** A new `transformRecipe` AI function handles all translation/unit-conversion in one Anthropic call. The import route calls it after scraping. A new per-recipe API endpoint powers the client-side bulk migration loop. Two settings components (LanguageSelector + BulkTransformModal) drive the bulk migration UX.

**Tech Stack:** Next.js 14 App Router, Supabase, Anthropic SDK (claude-haiku-4-5-20251001), Vitest + React Testing Library

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `supabase/migrations/013_preferred_language.sql` | Create | Add `preferred_language` column |
| `src/types/database.ts` | Modify | Add `preferred_language` to households types |
| `src/lib/ai/transform-recipe.ts` | Create | `transformRecipe` function (translate + unit-convert) |
| `src/lib/ai/transform-recipe.test.ts` | Create | Tests for transformRecipe |
| `src/lib/ai/make-shopping-list.ts` | Modify | Remove `preferredUnits` param + unitSystemInstruction |
| `src/app/api/shopping/make-smarter/route.ts` | Modify | Stop passing `preferredUnits` arg |
| `src/app/api/recipes/import/route.ts` | Modify | Call `transformRecipe` after parsing |
| `src/app/api/recipes/import/route.test.ts` | Modify | Add transformRecipe mock + assertions |
| `src/app/api/recipes/[id]/transform/route.ts` | Create | POST endpoint for per-recipe transform |
| `src/app/api/recipes/[id]/transform/route.test.ts` | Create | Tests for transform endpoint |
| `src/app/api/household/route.ts` | Modify | Accept `preferred_language` in PATCH body |
| `src/components/settings/LanguageSelector.tsx` | Create | Language dropdown with bulk-modal trigger |
| `src/components/settings/BulkTransformModal.tsx` | Create | Progress modal for sequential bulk transform |
| `src/components/settings/UnitPreferenceSelector.tsx` | Modify | Trigger bulk-modal on change |
| `src/app/(app)/settings/page.tsx` | Modify | Add LanguageSelector, pass recipeIds, update description |

---

## Task 1: DB Migration — add `preferred_language`

**Files:**
- Create: `supabase/migrations/013_preferred_language.sql`

- [ ] **Step 1: Write the migration file**

```sql
-- supabase/migrations/013_preferred_language.sql
ALTER TABLE households ADD COLUMN preferred_language TEXT NOT NULL DEFAULT 'en';
```

- [ ] **Step 2: Apply via Supabase dashboard**

Open the Supabase SQL editor for the project and run the migration. Verify the column appears in the `households` table schema.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/013_preferred_language.sql
git commit -m "feat: add preferred_language column to households"
```

---

## Task 2: Update TypeScript Types

**Files:**
- Modify: `src/types/database.ts`

The `households` table has three type blocks: `Row`, `Insert`, and `Update`. Add `preferred_language` to each.

- [ ] **Step 1: Add to Row type**

In `src/types/database.ts`, find the `households` table `Row` block (it contains `preferred_units: 'metric' | 'imperial'`). Add after `preferred_units`:

```typescript
preferred_language: string
```

- [ ] **Step 2: Add to Insert type**

In the `Insert` block (where `preferred_units?: 'metric' | 'imperial'`), add:

```typescript
preferred_language?: string
```

- [ ] **Step 3: Add to Update type**

In the `Update` block, add:

```typescript
preferred_language?: string
```

- [ ] **Step 4: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors related to `preferred_language`.

- [ ] **Step 5: Commit**

```bash
git add src/types/database.ts
git commit -m "feat: add preferred_language to households TypeScript types"
```

---

## Task 3: `transformRecipe` Function (TDD)

**Files:**
- Create: `src/lib/ai/transform-recipe.ts`
- Create: `src/lib/ai/transform-recipe.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/ai/transform-recipe.test.ts`:

```typescript
// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@anthropic-ai/sdk', () => ({
  default: vi.fn().mockImplementation(() => ({
    messages: {
      create: vi.fn(),
    },
  })),
}))

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn(() => ({})) }))
vi.mock('./log-usage', () => ({ logAiUsage: vi.fn() }))

import Anthropic from '@anthropic-ai/sdk'
import { logAiUsage } from './log-usage'
import { transformRecipe } from './transform-recipe'
import type { RecipeContent } from './transform-recipe'

const mockContent: RecipeContent = {
  title: 'Pasta Carbonara',
  description: 'Classic Italian pasta',
  ingredients: [
    { id: 'i1', quantity: 200, unit: 'g', name: 'pasta', notes: '' },
    { id: 'i2', quantity: 100, unit: 'g', name: 'pancetta', notes: 'diced' },
  ],
  steps: [
    { id: 's1', order: 1, text: 'Boil pasta in salted water.' },
  ],
  notes: 'Serve immediately.',
}

function getCreateMock() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (vi.mocked(Anthropic).mock.results[0].value as any).messages.create as ReturnType<typeof vi.fn>
}

function mockAnthropicResponse(content: RecipeContent) {
  getCreateMock().mockResolvedValue({
    content: [{ type: 'text', text: JSON.stringify(content) }],
    usage: { input_tokens: 100, output_tokens: 200 },
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  // Re-instantiate mock after clear
  vi.mocked(Anthropic).mockImplementation(() => ({
    messages: { create: vi.fn() },
  }) as unknown as InstanceType<typeof Anthropic>)
})

describe('transformRecipe', () => {
  it('short-circuits and returns content unchanged when lang=en and units=metric', async () => {
    const result = await transformRecipe(mockContent, { targetLanguage: 'en', targetUnits: 'metric' }, 'hh-1')
    expect(result).toBe(mockContent) // reference equality — same object
    expect(vi.mocked(Anthropic)).not.toHaveBeenCalled()
  })

  it('short-circuits when no options are provided', async () => {
    const result = await transformRecipe(mockContent, {}, 'hh-1')
    expect(result).toBe(mockContent)
  })

  it('calls Anthropic when targetLanguage differs from en', async () => {
    const translated: RecipeContent = { ...mockContent, title: 'Pasta Carbonara SK' }
    mockAnthropicResponse(translated)

    const result = await transformRecipe(mockContent, { targetLanguage: 'sk', targetUnits: 'metric' }, 'hh-1')

    expect(getCreateMock()).toHaveBeenCalledOnce()
    const callArgs = getCreateMock().mock.calls[0][0] as { messages: Array<{ content: string }> }
    const prompt = callArgs.messages[0].content
    expect(prompt).toContain('Slovak')
    expect(prompt).not.toContain('Convert all quantities')
    expect(result.title).toBe('Pasta Carbonara SK')
  })

  it('calls Anthropic when targetUnits is imperial', async () => {
    const converted: RecipeContent = {
      ...mockContent,
      ingredients: [
        { id: 'i1', quantity: 7, unit: 'oz', name: 'pasta', notes: '' },
        { id: 'i2', quantity: 3.5, unit: 'oz', name: 'pancetta', notes: 'diced' },
      ],
    }
    mockAnthropicResponse(converted)

    const result = await transformRecipe(mockContent, { targetLanguage: 'en', targetUnits: 'imperial' }, 'hh-1')

    expect(getCreateMock()).toHaveBeenCalledOnce()
    const callArgs = getCreateMock().mock.calls[0][0] as { messages: Array<{ content: string }> }
    const prompt = callArgs.messages[0].content
    expect(prompt).toContain('imperial')
    expect(prompt).not.toContain('Translate')
    expect(result.ingredients[0].unit).toBe('oz')
  })

  it('includes both instructions when both lang and units differ', async () => {
    mockAnthropicResponse(mockContent)

    await transformRecipe(mockContent, { targetLanguage: 'fr', targetUnits: 'imperial' }, 'hh-1')

    const callArgs = getCreateMock().mock.calls[0][0] as { messages: Array<{ content: string }> }
    const prompt = callArgs.messages[0].content
    expect(prompt).toContain('French')
    expect(prompt).toContain('imperial')
  })

  it('preserves ingredient ids and step ids/order in response', async () => {
    // AI response without ids — function should re-inject them
    const aiResponse = {
      ...mockContent,
      title: 'Translated',
      ingredients: mockContent.ingredients.map(({ id: _id, ...rest }) => rest),
      steps: mockContent.steps.map(({ id: _id, order: _o, ...rest }) => rest),
    }
    mockAnthropicResponse(aiResponse as unknown as RecipeContent)

    const result = await transformRecipe(mockContent, { targetLanguage: 'sk' }, 'hh-1')

    expect(result.ingredients[0].id).toBe('i1')
    expect(result.ingredients[1].id).toBe('i2')
    expect(result.steps[0].id).toBe('s1')
    expect(result.steps[0].order).toBe(1)
  })

  it('logs AI usage when householdId is provided', async () => {
    mockAnthropicResponse(mockContent)

    await transformRecipe(mockContent, { targetLanguage: 'sk' }, 'hh-1')

    expect(vi.mocked(logAiUsage)).toHaveBeenCalledWith(
      expect.anything(),
      'hh-1',
      'recipe_transform',
      { input_tokens: 100, output_tokens: 200 }
    )
  })

  it('falls back to original content when AI returns invalid JSON', async () => {
    getCreateMock().mockResolvedValue({
      content: [{ type: 'text', text: 'Sorry, I cannot do that.' }],
      usage: { input_tokens: 10, output_tokens: 5 },
    })

    const result = await transformRecipe(mockContent, { targetLanguage: 'sk' }, 'hh-1')
    expect(result).toEqual(mockContent)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd /Users/vacuumlabs/Developer/dapcook && npx vitest run src/lib/ai/transform-recipe.test.ts
```

Expected: FAIL — `transform-recipe` module not found.

- [ ] **Step 3: Implement `transform-recipe.ts`**

Create `src/lib/ai/transform-recipe.ts`:

```typescript
import Anthropic from '@anthropic-ai/sdk'
import type { Ingredient, Step } from '@/types/recipe'
import { createClient } from '@/lib/supabase/server'
import { logAiUsage } from './log-usage'

export interface RecipeContent {
  title: string
  description: string | null
  ingredients: Ingredient[]
  steps: Step[]
  notes: string | null
}

interface TransformOptions {
  targetLanguage?: string
  targetUnits?: 'metric' | 'imperial'
}

const client = new Anthropic()

export async function transformRecipe(
  content: RecipeContent,
  options: TransformOptions,
  householdId: string
): Promise<RecipeContent> {
  const { targetLanguage, targetUnits } = options

  // Short-circuit: nothing to do
  const needsTranslation = targetLanguage && targetLanguage !== 'en'
  const needsUnitConversion = targetUnits && targetUnits !== 'metric'
  if (!needsTranslation && !needsUnitConversion) {
    return content
  }

  const instructions: string[] = []
  if (needsTranslation) {
    const langName = LANGUAGE_NAMES[targetLanguage] ?? targetLanguage
    instructions.push(`Translate all text fields to ${langName}.`)
  }
  if (needsUnitConversion) {
    instructions.push(
      `Convert all quantities to ${targetUnits} units (e.g. ${
        targetUnits === 'imperial'
          ? 'oz, lb, fl oz, cups, pints, tsp, tbsp'
          : 'g, kg, ml, l, tsp, tbsp'
      }).`
    )
  }

  const prompt = `You are a recipe transformation assistant.

${instructions.join(' ')} Return the same JSON structure with ONLY the specified fields changed. Do not add or remove any fields. Leave these fields EXACTLY as-is: id fields, order fields, source_url, image_url, prep_time_min, cook_time_min, servings, tags, partial.

Recipe JSON:
${JSON.stringify(content, null, 2)}

Return ONLY valid JSON matching the exact same structure. No other text.`

  const response = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 8192,
    messages: [{ role: 'user', content: prompt }],
  })

  void logAiUsage(createClient(), householdId, 'recipe_transform', response.usage)

  const text = response.content[0].type === 'text' ? response.content[0].text : ''
  const jsonMatch = text.match(/\{[\s\S]*\}/)
  if (!jsonMatch) {
    console.error('[transform-recipe] No JSON in AI response, returning original')
    return content
  }

  let parsed: RecipeContent
  try {
    parsed = JSON.parse(jsonMatch[0]) as RecipeContent
  } catch {
    console.error('[transform-recipe] Failed to parse AI JSON, returning original')
    return content
  }

  // Re-inject original ids/order that AI must not change (defensive)
  return {
    ...parsed,
    ingredients: (parsed.ingredients ?? content.ingredients).map((ing, i) => ({
      ...ing,
      id: content.ingredients[i]?.id ?? ing.id ?? crypto.randomUUID(),
    })),
    steps: (parsed.steps ?? content.steps).map((step, i) => ({
      ...step,
      id: content.steps[i]?.id ?? step.id ?? crypto.randomUUID(),
      order: content.steps[i]?.order ?? step.order ?? i + 1,
    })),
  }
}

// BCP-47 code → human-readable name for the prompt
const LANGUAGE_NAMES: Record<string, string> = {
  en: 'English',
  es: 'Spanish',
  fr: 'French',
  de: 'German',
  it: 'Italian',
  pt: 'Portuguese',
  nl: 'Dutch',
  pl: 'Polish',
  ru: 'Russian',
  cs: 'Czech',
  sk: 'Slovak',
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run src/lib/ai/transform-recipe.test.ts
```

Expected: all 8 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/ai/transform-recipe.ts src/lib/ai/transform-recipe.test.ts
git commit -m "feat: add transformRecipe AI function (translate + unit-convert)"
```

---

## Task 4: Remove `preferredUnits` from Shopping List

**Files:**
- Modify: `src/lib/ai/make-shopping-list.ts`
- Modify: `src/app/api/shopping/make-smarter/route.ts`

- [ ] **Step 1: Remove `preferredUnits` param and unitSystemInstruction from `make-shopping-list.ts`**

In `src/lib/ai/make-shopping-list.ts`:

Change the function signature from:
```typescript
export async function makeShoppingListSmart(
  rawItems: ShoppingItem[],
  existingCategories: ShoppingCategory[],
  householdId: string,
  preferredUnits: 'metric' | 'imperial' = 'metric',
  rules: string[] = []
): Promise<MakeSmartResult>
```

To:
```typescript
export async function makeShoppingListSmart(
  rawItems: ShoppingItem[],
  existingCategories: ShoppingCategory[],
  householdId: string,
  rules: string[] = []
): Promise<MakeSmartResult>
```

Remove these lines:
```typescript
const unitSystemInstruction = preferredUnits === 'imperial'
  ? `Use imperial units throughout: oz, lb, fl oz, cups, pints, quarts, gallons, tsp, tbsp. Convert metric quantities to imperial equivalents (e.g. 500g → 1.1 lb, 250ml → 1 cup).`
  : `Use metric units throughout: g, kg, ml, l, tsp, tbsp. Convert imperial quantities to metric equivalents (e.g. 1 lb → 450g, 1 cup → 240ml).`
```

Update the prompt to remove unit conversion references. Change:
```typescript
2. Normalize all units to the preferred unit system: ${unitSystemInstruction}
```
To:
```typescript
2. Keep all units as-is — recipes are already stored in the household's preferred units.
```

Also remove the `preferredUnits` reference from the inline comment in task 3 (`Normalize all units...`).

- [ ] **Step 2: Remove `preferredUnits` from the make-smarter route**

In `src/app/api/shopping/make-smarter/route.ts`:

Remove the `household` query from the `Promise.all`:
```typescript
// Remove this:
supabase.from('households').select('preferred_units').eq('id', householdId).single(),
```

Update the destructure from:
```typescript
const [{ data: items }, { data: categories }, { data: household }, { data: rulesRows }] = await Promise.all([
  supabase.from('shopping_items').select('*').eq('shopping_list_id', list.id).order('sort_order'),
  supabase.from('shopping_categories').select('*').eq('household_id', householdId).order('sort_order'),
  supabase.from('households').select('preferred_units').eq('id', householdId).single(),
  supabase.from('shopping_rules').select('rule').eq('household_id', householdId).order('created_at'),
])
```

To:
```typescript
const [{ data: items }, { data: categories }, { data: rulesRows }] = await Promise.all([
  supabase.from('shopping_items').select('*').eq('shopping_list_id', list.id).order('sort_order'),
  supabase.from('shopping_categories').select('*').eq('household_id', householdId).order('sort_order'),
  supabase.from('shopping_rules').select('rule').eq('household_id', householdId).order('created_at'),
])
```

Remove these lines:
```typescript
const preferredUnits = household?.preferred_units ?? 'metric'
```

Update the `makeShoppingListSmart` call from:
```typescript
result = await makeShoppingListSmart(items, categories ?? [], householdId, preferredUnits, rules)
```
To:
```typescript
result = await makeShoppingListSmart(items, categories ?? [], householdId, rules)
```

- [ ] **Step 3: Check TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/lib/ai/make-shopping-list.ts src/app/api/shopping/make-smarter/route.ts
git commit -m "refactor: remove preferredUnits from shopping list AI — recipes stored in preferred units"
```

---

## Task 5: Update Import Route to Call `transformRecipe`

**Files:**
- Modify: `src/app/api/recipes/import/route.ts`
- Modify: `src/app/api/recipes/import/route.test.ts`

- [ ] **Step 1: Update test to mock and assert `transformRecipe`**

In `src/app/api/recipes/import/route.test.ts`, add the mock and extend the test:

After the existing `vi.mock` calls, add:
```typescript
vi.mock('@/lib/ai/transform-recipe', () => ({ transformRecipe: vi.fn() }))
import { transformRecipe } from '@/lib/ai/transform-recipe'
```

Update `makeSupabase` to return a `households` chain:

```typescript
function makeSupabase(
  user: typeof mockUser | null = mockUser,
  household = { preferred_language: 'en', preferred_units: 'metric' } as { preferred_language: string; preferred_units: string } | null
) {
  const fromMap: Record<string, unknown> = {
    profiles: makeSingleChain({ household_id: 'hh-1' }),
    recipes: makeSelectChain([]),
    tags: makeSelectChain([]),
    households: makeSingleChain(household),
  }
  return {
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user } }) },
    from: vi.fn((table: string) => fromMap[table] ?? makeSingleChain(null)),
  }
}
```

In `beforeEach`, add:
```typescript
vi.mocked(transformRecipe).mockImplementation(async (content) => content)
```

Add these new tests inside the `describe` block:

```typescript
it('calls transformRecipe with household prefs', async () => {
  vi.mocked(createClient).mockReturnValue(
    makeSupabase(mockUser, { preferred_language: 'sk', preferred_units: 'metric' }) as unknown as ReturnType<typeof createClient>
  )
  await POST(req({ url: 'https://example.com/pasta' }))
  expect(vi.mocked(transformRecipe)).toHaveBeenCalledWith(
    expect.objectContaining({ title: 'Pasta' }),
    { targetLanguage: 'sk', targetUnits: 'metric' },
    'hh-1'
  )
})

it('uses transformed content in the returned draft', async () => {
  const transformed = { ...parsedParts, title: 'Translated Pasta' }
  vi.mocked(transformRecipe).mockResolvedValue(transformed as unknown as Awaited<ReturnType<typeof transformRecipe>>)
  const res = await POST(req({ url: 'https://example.com/pasta' }))
  const draft = await res.json() as Record<string, unknown>
  expect(draft.title).toBe('Translated Pasta')
})
```

- [ ] **Step 2: Run tests to verify the new tests fail**

```bash
npx vitest run src/app/api/recipes/import/route.test.ts
```

Expected: the two new tests FAIL (transformRecipe not called yet).

- [ ] **Step 3: Update the import route**

In `src/app/api/recipes/import/route.ts`, add the import at the top:
```typescript
import { transformRecipe } from '@/lib/ai/transform-recipe'
import type { RecipeContent } from '@/lib/ai/transform-recipe'
```

After the `parseRecipeData` + existing tags Promise.all, add a household fetch + transformRecipe call. Replace the current `draft` construction:

```typescript
// After the existing Promise.all for parseRecipeData + existingTags:

const { data: household } = await supabase
  .from('households')
  .select('preferred_language, preferred_units')
  .eq('id', profile?.household_id ?? '')
  .single()

const recipeForTransform: RecipeContent = {
  title: meta.title,
  description: meta.description ?? null,
  ingredients,
  steps,
  notes: (meta as { notes?: string | null }).notes ?? null,
}

const transformed = await transformRecipe(
  recipeForTransform,
  {
    targetLanguage: household?.preferred_language ?? 'en',
    targetUnits: household?.preferred_units ?? 'metric',
  },
  profile?.household_id ?? ''
)

const draft: RecipeDraft = {
  ...meta,
  tags: (meta.tags ?? []).filter(t => existingTags.has(t.toLowerCase())),
  ingredients: transformed.ingredients,
  steps: transformed.steps,
  title: transformed.title,
  description: transformed.description ?? '',
}
```

**Note:** The `meta` object from `scrapeResult.raw` (after destructuring `rawIngredients` and `rawSteps`) contains `title`, `description`, `source_url`, `image_url`, `prep_time_min`, `cook_time_min`, `servings`, `tags`, `partial`. The `notes` field may not be on `RecipeDraft` — only translate the fields that exist.

Check what `meta` contains by looking at the `RecipeDraft` type. `RecipeDraft` has no `notes` field, so pass `notes: null` to `RecipeContent` and discard it after transform. The full updated route function:

```typescript
import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { scrapeRecipe } from '@/lib/scraper'
import { parseRecipeData } from '@/lib/ai/parse-recipe'
import { transformRecipe } from '@/lib/ai/transform-recipe'
import type { RecipeDraft } from '@/types/recipe'

export async function POST(request: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json() as { url?: string }
  const url = body.url?.trim()

  if (!url) {
    return NextResponse.json({ error: 'URL is required' }, { status: 400 })
  }

  try {
    new URL(url)
  } catch {
    return NextResponse.json({ error: 'Invalid URL' }, { status: 400 })
  }

  let scrapeResult: Awaited<ReturnType<typeof scrapeRecipe>>
  try {
    scrapeResult = await scrapeRecipe(url)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to fetch the URL'
    return NextResponse.json({ error: message }, { status: 422 })
  }

  const { data: profile } = await supabase
    .from('profiles').select('household_id').eq('id', user.id).single()

  const { raw } = scrapeResult
  const { rawIngredients, rawSteps, ...meta } = raw

  const [{ ingredients, steps }, existingTags, { data: household }] = await Promise.all([
    parseRecipeData(rawIngredients, rawSteps, profile?.household_id ?? undefined),
    profile?.household_id
      ? Promise.all([
          supabase.from('recipes').select('tags').eq('household_id', profile.household_id).eq('is_archived', false),
          supabase.from('tags').select('name').eq('household_id', profile.household_id),
        ]).then(([{ data: recipes }, { data: tagsMeta }]) => {
          const names = new Set<string>()
          for (const r of recipes ?? []) for (const t of r.tags ?? []) names.add(t.toLowerCase())
          for (const t of tagsMeta ?? []) names.add(t.name.toLowerCase())
          return names
        })
      : Promise.resolve(new Set<string>()),
    profile?.household_id
      ? supabase.from('households').select('preferred_language, preferred_units').eq('id', profile.household_id).single()
      : Promise.resolve({ data: null }),
  ])

  const transformed = await transformRecipe(
    { title: meta.title, description: meta.description ?? null, ingredients, steps, notes: null },
    {
      targetLanguage: household?.preferred_language ?? 'en',
      targetUnits: household?.preferred_units ?? 'metric',
    },
    profile?.household_id ?? ''
  )

  const draft: RecipeDraft = {
    ...meta,
    title: transformed.title,
    description: transformed.description ?? meta.description ?? '',
    tags: (meta.tags ?? []).filter(t => existingTags.has(t.toLowerCase())),
    ingredients: transformed.ingredients,
    steps: transformed.steps,
  }

  return NextResponse.json(draft)
}
```

- [ ] **Step 4: Run all import route tests**

```bash
npx vitest run src/app/api/recipes/import/route.test.ts
```

Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/recipes/import/route.ts src/app/api/recipes/import/route.test.ts
git commit -m "feat: translate and convert units on recipe import"
```

---

## Task 6: Per-Recipe Transform API Endpoint

**Files:**
- Create: `src/app/api/recipes/[id]/transform/route.ts`
- Create: `src/app/api/recipes/[id]/transform/route.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/app/api/recipes/[id]/transform/route.test.ts`:

```typescript
// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { POST } from './route'

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('@/lib/ai/transform-recipe', () => ({ transformRecipe: vi.fn() }))

import { createClient } from '@/lib/supabase/server'
import { transformRecipe } from '@/lib/ai/transform-recipe'
import type { RecipeContent } from '@/lib/ai/transform-recipe'

const mockUser = { id: 'user-1' }
const mockRecipe = {
  id: 'r-1',
  household_id: 'hh-1',
  title: 'Pasta',
  description: 'Yummy',
  notes: null,
  ingredients: [{ id: 'i1', quantity: 200, unit: 'g', name: 'pasta', notes: '' }],
  steps: [{ id: 's1', order: 1, text: 'Boil pasta.' }],
}

function makeQB(result: { data: unknown; error: null | { message: string } }) {
  return {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue(result),
  }
}

function makeSupabase({
  user = mockUser as typeof mockUser | null,
  recipe = mockRecipe as unknown,
  updateResult = { data: mockRecipe, error: null },
} = {}) {
  return {
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user } }) },
    from: vi.fn((table: string) => {
      if (table === 'recipes') return makeQB({ data: recipe, error: null })
      throw new Error(`Unexpected table: ${table}`)
    }),
  }
}

function req(id: string, body: unknown) {
  return new NextRequest(`http://localhost/api/recipes/${id}/transform`, {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

const params = { params: { id: 'r-1' } }

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(transformRecipe).mockImplementation(async (content) => content)
})

describe('POST /api/recipes/[id]/transform', () => {
  it('returns 401 when unauthenticated', async () => {
    vi.mocked(createClient).mockReturnValue(makeSupabase({ user: null }) as unknown as ReturnType<typeof createClient>)
    const res = await POST(req('r-1', { targetLanguage: 'sk' }), params)
    expect(res.status).toBe(401)
  })

  it('returns 404 when recipe not found', async () => {
    vi.mocked(createClient).mockReturnValue(makeSupabase({ recipe: null }) as unknown as ReturnType<typeof createClient>)
    const res = await POST(req('r-1', { targetLanguage: 'sk' }), params)
    expect(res.status).toBe(404)
  })

  it('calls transformRecipe with recipe content and options', async () => {
    vi.mocked(createClient).mockReturnValue(makeSupabase() as unknown as ReturnType<typeof createClient>)
    await POST(req('r-1', { targetLanguage: 'sk', targetUnits: 'metric' }), params)

    expect(vi.mocked(transformRecipe)).toHaveBeenCalledWith(
      {
        title: 'Pasta',
        description: 'Yummy',
        ingredients: mockRecipe.ingredients,
        steps: mockRecipe.steps,
        notes: null,
      },
      { targetLanguage: 'sk', targetUnits: 'metric' },
      'hh-1'
    )
  })

  it('returns 200 with updated recipe on success', async () => {
    vi.mocked(createClient).mockReturnValue(makeSupabase() as unknown as ReturnType<typeof createClient>)
    const transformed: RecipeContent = {
      title: 'Cestoviny',
      description: 'Chutné',
      ingredients: [{ id: 'i1', quantity: 200, unit: 'g', name: 'cestoviny', notes: '' }],
      steps: [{ id: 's1', order: 1, text: 'Varte cestoviny.' }],
      notes: null,
    }
    vi.mocked(transformRecipe).mockResolvedValue(transformed)
    const res = await POST(req('r-1', { targetLanguage: 'sk' }), params)
    expect(res.status).toBe(200)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run "src/app/api/recipes/\[id\]/transform/route.test.ts"
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement the transform endpoint**

Create `src/app/api/recipes/[id]/transform/route.ts`:

```typescript
import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { transformRecipe } from '@/lib/ai/transform-recipe'
import type { Ingredient, Step } from '@/types/recipe'

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json() as { targetLanguage?: string; targetUnits?: 'metric' | 'imperial' }

  const { data: recipe, error } = await supabase
    .from('recipes')
    .select('*')
    .eq('id', params.id)
    .single()

  if (error || !recipe) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const transformed = await transformRecipe(
    {
      title: recipe.title,
      description: recipe.description ?? null,
      ingredients: (recipe.ingredients as unknown as Ingredient[]) ?? [],
      steps: (recipe.steps as unknown as Step[]) ?? [],
      notes: recipe.notes ?? null,
    },
    {
      targetLanguage: body.targetLanguage,
      targetUnits: body.targetUnits,
    },
    recipe.household_id
  )

  const { data: updated, error: updateError } = await supabase
    .from('recipes')
    .update({
      title: transformed.title,
      description: transformed.description,
      ingredients: transformed.ingredients as unknown as import('@/types/database').Json,
      steps: transformed.steps as unknown as import('@/types/database').Json,
      notes: transformed.notes,
      updated_at: new Date().toISOString(),
    })
    .eq('id', params.id)
    .select()
    .single()

  if (updateError || !updated) {
    return NextResponse.json({ error: updateError?.message ?? 'Update failed' }, { status: 500 })
  }

  return NextResponse.json(updated)
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run "src/app/api/recipes/\[id\]/transform/route.test.ts"
```

Expected: all 4 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add "src/app/api/recipes/[id]/transform/route.ts" "src/app/api/recipes/[id]/transform/route.test.ts"
git commit -m "feat: add per-recipe transform API endpoint"
```

---

## Task 7: Update Household PATCH API for `preferred_language`

**Files:**
- Modify: `src/app/api/household/route.ts`

- [ ] **Step 1: Update the PATCH handler**

In `src/app/api/household/route.ts`, change the body type and add `preferred_language` handling:

```typescript
const body = await request.json() as { preferred_units?: 'metric' | 'imperial'; preferred_language?: string }

const updates: Record<string, unknown> = {}
if (body.preferred_units !== undefined) {
  if (!['metric', 'imperial'].includes(body.preferred_units)) {
    return NextResponse.json({ error: 'Invalid preferred_units' }, { status: 400 })
  }
  updates.preferred_units = body.preferred_units
}
if (body.preferred_language !== undefined) {
  const VALID_LANGUAGES = ['en', 'es', 'fr', 'de', 'it', 'pt', 'nl', 'pl', 'ru', 'cs', 'sk']
  if (!VALID_LANGUAGES.includes(body.preferred_language)) {
    return NextResponse.json({ error: 'Invalid preferred_language' }, { status: 400 })
  }
  updates.preferred_language = body.preferred_language
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add src/app/api/household/route.ts
git commit -m "feat: accept preferred_language in household PATCH API"
```

---

## Task 8: `BulkTransformModal` Component (TDD)

**Files:**
- Create: `src/components/settings/BulkTransformModal.tsx`
- Create: `src/components/settings/BulkTransformModal.test.tsx`

- [ ] **Step 1: Write the failing tests**

Create `src/components/settings/BulkTransformModal.test.tsx`:

```typescript
import { render, screen, waitFor, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { BulkTransformModal } from './BulkTransformModal'

global.fetch = vi.fn()

function mockFetchSuccess() {
  vi.mocked(fetch).mockResolvedValue({ ok: true } as Response)
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('BulkTransformModal', () => {
  it('renders with data-testid bulk-transform-modal', () => {
    mockFetchSuccess()
    render(
      <BulkTransformModal
        recipeIds={['r1']}
        targetLanguage="sk"
        onClose={vi.fn()}
      />
    )
    expect(screen.getByTestId('bulk-transform-modal')).toBeDefined()
  })

  it('shows progress while processing', async () => {
    let resolveFirst!: () => void
    vi.mocked(fetch).mockImplementationOnce(
      () => new Promise<Response>((resolve) => { resolveFirst = () => resolve({ ok: true } as Response) })
    )

    render(
      <BulkTransformModal
        recipeIds={['r1', 'r2']}
        targetLanguage="sk"
        onClose={vi.fn()}
      />
    )

    expect(screen.getByText(/0 \/ 2/)).toBeDefined()
    act(() => resolveFirst())
    await waitFor(() => {
      expect(screen.getByText(/1 \/ 2/)).toBeDefined()
    })
  })

  it('shows done message when all recipes processed', async () => {
    mockFetchSuccess()
    render(
      <BulkTransformModal
        recipeIds={['r1', 'r2']}
        targetLanguage="sk"
        onClose={vi.fn()}
      />
    )

    await waitFor(() => {
      expect(screen.getByText(/Done/i)).toBeDefined()
      expect(screen.getByText(/2 updated/)).toBeDefined()
    })
  })

  it('counts failures in the done message', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce({ ok: true } as Response)
      .mockResolvedValueOnce({ ok: false } as Response)

    render(
      <BulkTransformModal
        recipeIds={['r1', 'r2']}
        targetLanguage="sk"
        onClose={vi.fn()}
      />
    )

    await waitFor(() => {
      expect(screen.getByText(/1 updated.*1 failed/)).toBeDefined()
    })
  })

  it('calls onClose when close button clicked', async () => {
    mockFetchSuccess()
    const onClose = vi.fn()
    render(
      <BulkTransformModal
        recipeIds={['r1']}
        targetLanguage="sk"
        onClose={onClose}
      />
    )
    await waitFor(() => screen.getByText(/Done/i))
    await userEvent.click(screen.getByRole('button'))
    expect(onClose).toHaveBeenCalled()
  })

  it('calls POST /api/recipes/[id]/transform for each recipe', async () => {
    mockFetchSuccess()
    render(
      <BulkTransformModal
        recipeIds={['r1', 'r2']}
        targetLanguage="sk"
        targetUnits="metric"
        onClose={vi.fn()}
      />
    )

    await waitFor(() => screen.getByText(/Done/i))

    expect(fetch).toHaveBeenCalledWith(
      '/api/recipes/r1/transform',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ targetLanguage: 'sk', targetUnits: 'metric' }),
      })
    )
    expect(fetch).toHaveBeenCalledWith(
      '/api/recipes/r2/transform',
      expect.objectContaining({ method: 'POST' })
    )
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run src/components/settings/BulkTransformModal.test.tsx
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement `BulkTransformModal.tsx`**

Create `src/components/settings/BulkTransformModal.tsx`:

```typescript
'use client'

import { useEffect, useRef, useState } from 'react'
import { X } from 'lucide-react'

interface Props {
  recipeIds: string[]
  targetLanguage?: string
  targetUnits?: 'metric' | 'imperial'
  onClose: () => void
}

type ModalState =
  | { phase: 'processing'; done: number; total: number }
  | { phase: 'complete'; updated: number; failed: number }

export function BulkTransformModal({ recipeIds, targetLanguage, targetUnits, onClose }: Props) {
  const [state, setState] = useState<ModalState>({ phase: 'processing', done: 0, total: recipeIds.length })
  const dismissedRef = useRef(false)

  useEffect(() => {
    let updated = 0
    let failed = 0

    async function run() {
      for (const id of recipeIds) {
        if (dismissedRef.current) break

        try {
          const res = await fetch(`/api/recipes/${id}/transform`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ targetLanguage, targetUnits }),
          })
          if (res.ok) updated++ else failed++
        } catch {
          failed++
        }

        if (!dismissedRef.current) {
          setState({ phase: 'processing', done: updated + failed, total: recipeIds.length })
        }
      }

      if (!dismissedRef.current) {
        setState({ phase: 'complete', updated, failed })
      }
    }

    void run()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function handleClose() {
    dismissedRef.current = true
    onClose()
  }

  const label =
    targetLanguage && targetUnits
      ? 'Translating and converting'
      : targetLanguage
        ? 'Translating'
        : 'Converting units'

  return (
    <div
      data-testid="bulk-transform-modal"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
    >
      <div className="bg-white rounded-xl shadow-lg p-6 max-w-sm w-full mx-4 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-900">
            {state.phase === 'complete' ? 'Done' : `${label} recipes…`}
          </h2>
          <button
            type="button"
            onClick={handleClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </div>

        {state.phase === 'processing' && (
          <div className="space-y-2">
            <p className="text-sm text-gray-500">
              {state.done} / {state.total}
            </p>
            <div className="w-full bg-gray-100 rounded-full h-1.5">
              <div
                className="bg-gray-900 h-1.5 rounded-full transition-all"
                style={{ width: state.total > 0 ? `${(state.done / state.total) * 100}%` : '0%' }}
              />
            </div>
          </div>
        )}

        {state.phase === 'complete' && (
          <p className="text-sm text-gray-500">
            {state.failed === 0
              ? `${state.updated} updated.`
              : `${state.updated} updated, ${state.failed} failed.`}
          </p>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run src/components/settings/BulkTransformModal.test.tsx
```

Expected: all 6 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/settings/BulkTransformModal.tsx src/components/settings/BulkTransformModal.test.tsx
git commit -m "feat: add BulkTransformModal for sequential recipe transformation"
```

---

## Task 9: `LanguageSelector` Component (TDD)

**Files:**
- Create: `src/components/settings/LanguageSelector.tsx`
- Create: `src/components/settings/LanguageSelector.test.tsx`

- [ ] **Step 1: Write the failing tests**

Create `src/components/settings/LanguageSelector.test.tsx`:

```typescript
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { LanguageSelector } from './LanguageSelector'

global.fetch = vi.fn()
global.confirm = vi.fn()

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(fetch).mockResolvedValue({ ok: true } as Response)
  vi.mocked(confirm).mockReturnValue(false)
})

describe('LanguageSelector', () => {
  it('renders a select with supported languages', () => {
    render(<LanguageSelector initialValue="en" currentPreferredUnits="metric" recipeIds={[]} />)
    const select = screen.getByRole('combobox')
    expect(select).toBeDefined()
    expect(screen.getByRole('option', { name: 'English' })).toBeDefined()
    expect(screen.getByRole('option', { name: 'Slovak' })).toBeDefined()
    expect(screen.getByRole('option', { name: 'French' })).toBeDefined()
  })

  it('shows the initial value as selected', () => {
    render(<LanguageSelector initialValue="sk" currentPreferredUnits="metric" recipeIds={[]} />)
    const select = screen.getByRole('combobox') as HTMLSelectElement
    expect(select.value).toBe('sk')
  })

  it('PATCHes /api/household when value changes', async () => {
    render(<LanguageSelector initialValue="en" currentPreferredUnits="metric" recipeIds={[]} />)
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'fr' } })
    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith('/api/household', expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify({ preferred_language: 'fr' }),
      }))
    })
  })

  it('does not show confirm dialog when recipeIds is empty', async () => {
    render(<LanguageSelector initialValue="en" currentPreferredUnits="metric" recipeIds={[]} />)
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'sk' } })
    await waitFor(() => expect(fetch).toHaveBeenCalled())
    expect(confirm).not.toHaveBeenCalled()
  })

  it('shows confirm dialog when recipeIds is non-empty', async () => {
    render(<LanguageSelector initialValue="en" currentPreferredUnits="metric" recipeIds={['r1', 'r2']} />)
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'sk' } })
    await waitFor(() => expect(confirm).toHaveBeenCalled())
    const confirmMsg = vi.mocked(confirm).mock.calls[0][0] as string
    expect(confirmMsg).toContain('2')
  })

  it('shows BulkTransformModal when user confirms', async () => {
    vi.mocked(confirm).mockReturnValue(true)
    render(<LanguageSelector initialValue="en" currentPreferredUnits="metric" recipeIds={['r1']} />)
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'sk' } })
    await waitFor(() => {
      expect(screen.getByTestId('bulk-transform-modal')).toBeDefined()
    })
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run src/components/settings/LanguageSelector.test.tsx
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement `LanguageSelector.tsx`**

Create `src/components/settings/LanguageSelector.tsx`:

```typescript
'use client'

import { useState } from 'react'
import { BulkTransformModal } from './BulkTransformModal'

export const SUPPORTED_LANGUAGES = [
  { code: 'en', label: 'English' },
  { code: 'es', label: 'Spanish' },
  { code: 'fr', label: 'French' },
  { code: 'de', label: 'German' },
  { code: 'it', label: 'Italian' },
  { code: 'pt', label: 'Portuguese' },
  { code: 'nl', label: 'Dutch' },
  { code: 'pl', label: 'Polish' },
  { code: 'ru', label: 'Russian' },
  { code: 'cs', label: 'Czech' },
  { code: 'sk', label: 'Slovak' },
] as const

interface Props {
  initialValue: string
  currentPreferredUnits: 'metric' | 'imperial'
  recipeIds: string[]
}

export function LanguageSelector({ initialValue, currentPreferredUnits, recipeIds }: Props) {
  const [value, setValue] = useState(initialValue)
  const [showModal, setShowModal] = useState(false)
  const [pendingLanguage, setPendingLanguage] = useState<string | null>(null)

  async function handleChange(newLang: string) {
    if (newLang === value) return
    setValue(newLang)

    await fetch('/api/household', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ preferred_language: newLang }),
    })

    if (recipeIds.length > 0) {
      const confirmed = confirm(
        `You have ${recipeIds.length} recipe${recipeIds.length === 1 ? '' : 's'}. Translate them now?`
      )
      if (confirmed) {
        setPendingLanguage(newLang)
        setShowModal(true)
      }
    }
  }

  return (
    <>
      <select
        value={value}
        onChange={(e) => void handleChange(e.target.value)}
        className="text-sm border border-gray-200 rounded-md px-2 py-1.5 bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-400"
      >
        {SUPPORTED_LANGUAGES.map((lang) => (
          <option key={lang.code} value={lang.code}>
            {lang.label}
          </option>
        ))}
      </select>

      {showModal && pendingLanguage && (
        <BulkTransformModal
          recipeIds={recipeIds}
          targetLanguage={pendingLanguage}
          targetUnits={currentPreferredUnits}
          onClose={() => { setShowModal(false); setPendingLanguage(null) }}
        />
      )}
    </>
  )
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run src/components/settings/LanguageSelector.test.tsx
```

Expected: all 6 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/settings/LanguageSelector.tsx src/components/settings/LanguageSelector.test.tsx
git commit -m "feat: add LanguageSelector settings component"
```

---

## Task 10: Update `UnitPreferenceSelector` to Trigger Bulk Modal

**Files:**
- Modify: `src/components/settings/UnitPreferenceSelector.tsx`

The component currently saves the new value immediately with no further action. It needs to optionally show the bulk-transform modal after saving.

- [ ] **Step 1: Update `UnitPreferenceSelector.tsx`**

Replace the entire file content with:

```typescript
'use client'

import { useState } from 'react'
import { BulkTransformModal } from './BulkTransformModal'

interface Props {
  initialValue: 'metric' | 'imperial'
  currentPreferredLanguage: string
  recipeIds: string[]
}

export function UnitPreferenceSelector({ initialValue, currentPreferredLanguage, recipeIds }: Props) {
  const [value, setValue] = useState<'metric' | 'imperial'>(initialValue)
  const [saving, setSaving] = useState(false)
  const [showModal, setShowModal] = useState(false)
  const [pendingUnits, setPendingUnits] = useState<'metric' | 'imperial' | null>(null)

  async function handleChange(next: 'metric' | 'imperial') {
    if (next === value) return
    setValue(next)
    setSaving(true)

    await fetch('/api/household', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ preferred_units: next }),
    })

    setSaving(false)

    if (recipeIds.length > 0) {
      const confirmed = confirm(
        `You have ${recipeIds.length} recipe${recipeIds.length === 1 ? '' : 's'}. Convert their units now?`
      )
      if (confirmed) {
        setPendingUnits(next)
        setShowModal(true)
      }
    }
  }

  return (
    <>
      <div className="flex items-center gap-1">
        {(['metric', 'imperial'] as const).map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => void handleChange(option)}
            disabled={saving}
            className={`px-3 py-1 text-sm rounded-lg border transition-colors capitalize ${
              value === option
                ? 'bg-gray-900 text-white border-gray-900'
                : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
            }`}
          >
            {option}
          </button>
        ))}
      </div>

      {showModal && pendingUnits && (
        <BulkTransformModal
          recipeIds={recipeIds}
          targetLanguage={currentPreferredLanguage}
          targetUnits={pendingUnits}
          onClose={() => { setShowModal(false); setPendingUnits(null) }}
        />
      )}
    </>
  )
}
```

- [ ] **Step 2: Run existing tests (if any)**

```bash
npx vitest run src/components/settings/UnitPreferenceSelector
```

If no test file exists, skip. The component API changed (new required props), so the settings page update in the next task will be needed for TypeScript to compile.

- [ ] **Step 3: Verify TypeScript compiles (will fail until settings page is updated)**

This is expected — the settings page still passes the old props. Move on to Task 11.

---

## Task 11: Update Settings Page

**Files:**
- Modify: `src/app/(app)/settings/page.tsx`

- [ ] **Step 1: Add recipe IDs query and update the settings page**

In `src/app/(app)/settings/page.tsx`:

1. Add `LanguageSelector` import at the top:
```typescript
import { LanguageSelector } from '@/components/settings/LanguageSelector'
```

2. In the `Promise.all`, the `recipes` query currently only selects `tags`. Change it to also select `id` so we can get recipe IDs:
```typescript
supabase.from('recipes').select('id, tags').eq('household_id', profile.household_id).eq('is_archived', false),
```

3. After computing `allTags`, derive recipe IDs:
```typescript
const recipeIds = (recipes ?? []).map((r) => r.id)
```

4. Update the `UnitPreferenceSelector` usage — it now requires `currentPreferredLanguage` and `recipeIds` props. Also update the description text:
```tsx
<div>
  <p className="text-xs text-gray-500 mb-2">Preferred units</p>
  <p className="text-xs text-gray-400 mb-2">
    Applied when importing new recipes.
  </p>
  <UnitPreferenceSelector
    initialValue={household?.preferred_units ?? 'metric'}
    currentPreferredLanguage={household?.preferred_language ?? 'en'}
    recipeIds={recipeIds}
  />
</div>
```

5. Add `LanguageSelector` section just above the units section:
```tsx
<div>
  <p className="text-xs text-gray-500 mb-2">Preferred language</p>
  <p className="text-xs text-gray-400 mb-2">
    Applied when importing new recipes. Existing recipes can be translated via bulk update.
  </p>
  <LanguageSelector
    initialValue={household?.preferred_language ?? 'en'}
    currentPreferredUnits={household?.preferred_units ?? 'metric'}
    recipeIds={recipeIds}
  />
</div>
```

The full updated Household section of `settings/page.tsx`:

```tsx
{/* Household */}
<section className="space-y-4">
  <h2 className="text-sm font-medium text-gray-500 uppercase tracking-wide">Household</h2>
  <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-5">
    <div>
      <p className="text-xs text-gray-500 mb-1">Name</p>
      <p className="text-sm font-medium text-gray-900">{household?.name}</p>
    </div>

    <div>
      <p className="text-xs text-gray-500 mb-2">Preferred language</p>
      <p className="text-xs text-gray-400 mb-2">
        Applied when importing new recipes. Existing recipes can be translated via bulk update.
      </p>
      <LanguageSelector
        initialValue={household?.preferred_language ?? 'en'}
        currentPreferredUnits={household?.preferred_units ?? 'metric'}
        recipeIds={recipeIds}
      />
    </div>

    <div>
      <p className="text-xs text-gray-500 mb-2">Preferred units</p>
      <p className="text-xs text-gray-400 mb-2">
        Applied when importing new recipes.
      </p>
      <UnitPreferenceSelector
        initialValue={household?.preferred_units ?? 'metric'}
        currentPreferredLanguage={household?.preferred_language ?? 'en'}
        recipeIds={recipeIds}
      />
    </div>

    <div>
      <p className="text-xs text-gray-500 mb-2">Invite link</p>
      <p className="text-xs text-gray-400 mb-2">
        Share this link with anyone you want to join this household.
      </p>
      <InviteLink url={inviteUrl} />
    </div>
  </div>
</section>
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Run all tests**

```bash
npx vitest run
```

Expected: all tests PASS.

- [ ] **Step 4: Commit**

```bash
git add 'src/app/(app)/settings/page.tsx' src/components/settings/UnitPreferenceSelector.tsx
git commit -m "feat: add language selector and bulk transform trigger to settings page"
```

---

## Task 12: Push to Vercel

- [ ] **Step 1: Push to git**

```bash
git push
```

Expected: Vercel build triggers automatically. Monitor the Vercel dashboard for build success.

- [ ] **Step 2: Smoke-test on Vercel**

1. Open Settings — confirm "Preferred language" dropdown appears above "Preferred units"
2. Change language to Slovak — confirm PATCH fires (network tab), confirm dialog appears if recipes exist
3. Import a recipe from an English URL with language set to Slovak — confirm the draft arrives translated
4. Import a recipe from an English URL with language set to English (default) — confirm no extra AI call (short-circuit)
