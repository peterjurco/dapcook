# Recipe Language & Units Transformation Design

**Date:** 2026-05-21

## Overview

Add a household-level language preference so that recipes imported from external URLs are automatically translated and unit-converted via AI in a single step. When the user changes their language or unit preference, a progress modal offers to retroactively transform all existing recipes.

---

## 1. Data Layer

### New column: `households.preferred_language`

```sql
ALTER TABLE households ADD COLUMN preferred_language TEXT NOT NULL DEFAULT 'en';
```

Stores a language code (`'en'`, `'sk'`, `'fr'`, etc.). Defaults to English. Combined with the existing `preferred_units` column, these two preferences drive all recipe transformations.

### Supported languages (frontend constant)

```ts
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
```

### `database.ts` update

Add `preferred_language` to `households` Row (`string`), Insert (`string | undefined`), and Update (`string | undefined`).

---

## 2. AI Transformation Pipeline

### New file: `src/lib/ai/transform-recipe.ts`

Single function, single Anthropic call, handles both translation and unit conversion:

```ts
interface TransformOptions {
  targetLanguage?: string  // BCP-47 code, e.g. 'sk'. Omit to skip translation.
  targetUnits?: 'metric' | 'imperial'  // Omit to skip unit conversion.
}

interface RecipeContent {
  title: string
  description: string | null
  ingredients: Ingredient[]  // { id, quantity, unit, name, notes }
  steps: Step[]              // { id, order, text }
  notes: string | null
}

export async function transformRecipe(
  content: RecipeContent,
  options: TransformOptions,
  householdId: string
): Promise<RecipeContent>
```

**Fields translated** (when `targetLanguage` is set):
- `title`, `description`, `notes`
- Ingredient `name` and `notes`
- Step `text`

**Fields unit-converted** (when `targetUnits` is set):
- Ingredient `quantity` and `unit`
- Inline quantity/unit mentions in step `text` (Claude handles these contextually)

**Fields left untouched:** `tags`, `source_url`, `image_url`, `prep_time_min`, `cook_time_min`, `servings`, ingredient `id`, step `id`/`order`.

**Prompt structure:** Claude receives the recipe as JSON and a plain-English instruction combining both tasks. If only one option is set, only that instruction is included. Example: *"Translate all text fields to Slovak. Convert all quantities to metric units. Return the same JSON structure with only the specified fields changed."*

**Usage logging:** Calls `logAiUsage(supabase, householdId, 'recipe_transform', response.usage)` after the Anthropic call.

**Short-circuit:** If `targetLanguage` is `'en'` and `targetUnits` is `'metric'`, skip the Anthropic call and return `content` unchanged — this is the default state and most recipes scraped from European sites will already match.

---

## 3. Import Pipeline Changes

### `src/app/api/recipes/import/route.ts`

After `parseRecipeData` runs, fetch the household's `preferred_language` and `preferred_units`, then call `transformRecipe` if either differs from the source:

```ts
const { data: household } = await supabase
  .from('households').select('preferred_language, preferred_units').eq('id', householdId).single()

const transformed = await transformRecipe(
  { title, description, ingredients, steps, notes: meta.notes ?? null },
  {
    targetLanguage: household?.preferred_language ?? 'en',
    targetUnits: household?.preferred_units ?? 'metric',
  },
  householdId
)
// merge transformed fields into draft
```

The transformed result is returned as the `RecipeDraft` — the user sees it already translated/converted in the import preview form.

**Note:** `parse-text/route.ts` (manual recipe entry) is **not** affected — transformation only applies to URL imports.

### `src/lib/ai/make-shopping-list.ts`

Remove `preferredUnits` parameter and the `unitSystemInstruction` entirely. Recipes are now stored in the household's preferred units, so no conversion is needed at shopping list time.

Update the caller `src/app/api/shopping/make-smarter/route.ts` to stop passing `preferredUnits`.

---

## 4. Settings UI

### New component: `src/components/settings/LanguageSelector.tsx`

A `<select>` dropdown styled consistently with the rest of the settings page. Controlled component — on change:
1. PATCH `/api/household` with `{ preferred_language: newValue }`
2. If household has recipes, show the bulk migration modal

### Updated `src/components/settings/UnitPreferenceSelector.tsx`

Change from a standalone save to also trigger the bulk migration modal on change (same pattern as `LanguageSelector`). Update description text in `settings/page.tsx` from "Applied when 'Make smarter' merges your shopping list" to "Applied when importing new recipes."

### `src/app/(app)/settings/page.tsx`

Add `LanguageSelector` in the Household section. Fetch `preferred_language` from the household query (already fetches `*`).

---

## 5. Bulk Migration

### New API endpoint: `POST /api/recipes/[id]/transform`

```ts
// Body: { targetLanguage?: string; targetUnits?: 'metric' | 'imperial' }
// Auth: user must belong to the recipe's household (enforced by existing RLS)
// Returns: updated recipe row
```

Fetches the full recipe, calls `transformRecipe`, updates the DB with the transformed fields:
- `title`, `description`, `notes`, `ingredients` (JSON), `steps` (JSON)

### New component: `src/components/settings/BulkTransformModal.tsx`

Props:
```ts
interface BulkTransformModalProps {
  recipeIds: string[]
  targetLanguage?: string
  targetUnits?: 'metric' | 'imperial'
  onClose: () => void
}
```

Behaviour:
1. On mount, starts processing recipes sequentially (one at a time)
2. Shows: *"Translating recipes… 12 / 42"* (or "Converting units…" or "Translating and converting…" depending on which options are set)
3. Per-recipe errors are silently skipped — a failed recipe does not stop the loop
4. On completion: *"Done. 42 recipes updated."* or *"Done. 41 updated, 1 failed."*
5. Dismissible at any time via an ×/Close button — in-flight requests finish naturally but no new ones are started after dismiss

### Triggering the modal

Both `LanguageSelector` and `UnitPreferenceSelector` receive `recipeIds: string[]` as a prop (passed down from `settings/page.tsx`, which already fetches recipe IDs). On setting change:
1. Save the new setting via PATCH
2. If `recipeIds.length > 0`, show a confirm dialog: *"You have 42 recipes. Translate them to French now?"*
3. If confirmed, mount `BulkTransformModal`
4. If declined, nothing further — new imports will use the new setting from now on

---

## 6. Files Changed / Created

| File | Change |
|------|--------|
| `supabase/migrations/013_preferred_language.sql` | New — add `preferred_language` column |
| `src/types/database.ts` | Add `preferred_language` to households |
| `src/lib/ai/transform-recipe.ts` | New — `transformRecipe` function |
| `src/lib/ai/make-shopping-list.ts` | Remove `preferredUnits` param + unit instruction |
| `src/app/api/shopping/make-smarter/route.ts` | Remove `preferredUnits` arg |
| `src/app/api/recipes/import/route.ts` | Call `transformRecipe` after parsing |
| `src/app/api/recipes/[id]/transform/route.ts` | New — per-recipe transform endpoint |
| `src/components/settings/LanguageSelector.tsx` | New — language dropdown |
| `src/components/settings/UnitPreferenceSelector.tsx` | Trigger bulk modal on change |
| `src/components/settings/BulkTransformModal.tsx` | New — progress modal |
| `src/app/(app)/settings/page.tsx` | Add `LanguageSelector`, pass `recipeIds` to selectors |

---

## 7. Out of Scope

- Translating manually entered recipes (parse-text route)
- Translating tags
- Per-recipe language override
- Detecting source language explicitly (Claude infers it)
- A "retry failed" button in the bulk migration modal
- Background/server-side bulk processing (client-side loop is sufficient)
