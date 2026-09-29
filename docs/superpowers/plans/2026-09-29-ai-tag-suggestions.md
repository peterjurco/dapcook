# AI Tag Suggestions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the "most used" tag chips in the recipe form with AI suggestions that fit the recipe (up to 8 existing household tags + at most one new cuisine/dish-type tag), offered but never auto-applied.

**Architecture:** One module (`src/lib/ai/suggest-tags.ts`) owns the prompt rules and a code-level sanitizer. URL import piggybacks on the existing `parseRecipeData` Haiku call; manual/edit/paste-text recipes lazily call a new `POST /api/tags/suggest` on first focus of the tag field. `TagInput` renders suggestions when present and falls back to "most used" otherwise.

**Tech Stack:** Next.js 14 App Router, TypeScript, Supabase, `@anthropic-ai/sdk` (Haiku 4.5), next-intl, Vitest + Testing Library.

**Spec:** `docs/superpowers/specs/2026-09-29-ai-tag-suggestions-design.md`

**Ground rules for the executor:**
- Never call the real Anthropic API. All tests mock `@anthropic-ai/sdk`. Do not set `TAG_SUGGEST_USE_AI=true` locally.
- Run a single test file with `npx vitest run <path>`.
- This is a big feature: work on branch `feat/ai-tag-suggestions` (Task 0), not `main`.

---

## File map

| File | Change | Responsibility |
| --- | --- | --- |
| `src/types/recipe.ts` | modify | `TagSuggestions` type; `RecipeDraft.suggestedTags?` |
| `src/lib/ai/suggest-tags.ts` | create | prompt rules, `sanitizeTagSuggestions`, standalone `suggestTags` |
| `src/lib/ai/suggest-tags.test.ts` | create | sanitizer + standalone call tests |
| `src/lib/tags/household-tags.ts` | create | `loadHouseholdTagNames` (shared by import + suggest routes) |
| `src/lib/tags/household-tags.test.ts` | create | loader tests |
| `src/lib/ai/parse-recipe.ts` | modify | optional `tagContext` → `suggestedTags` in result |
| `src/lib/ai/parse-recipe.test.ts` | create | parse + tag piggyback tests |
| `src/app/api/recipes/import/route.ts` | modify | load tags first, pass `tagContext`, forward `suggestedTags` |
| `src/app/api/recipes/import/route.test.ts` | modify | new test for forwarding |
| `src/app/api/tags/suggest/route.ts` | create | lazy endpoint, env-gated |
| `src/app/api/tags/suggest/route.test.ts` | create | endpoint tests |
| `messages/en/recipes.json`, `messages/sk/recipes.json` | modify | `tagInput.suggested`, `tagInput.new` |
| `src/components/recipe/TagInput.tsx` | modify | `suggestions` + `onRequestSuggestions` props |
| `src/components/recipe/TagInput.test.tsx` | create | rendering tests |
| `src/components/recipe/RecipeForm.tsx` | modify | owns fetching/caching of suggestions |
| `src/components/recipe/RecipeForm.test.tsx` | modify | fetch behaviour tests |
| `.env.local.example` | modify | document `TAG_SUGGEST_USE_AI` |

---

### Task 0: Branch

- [ ] **Step 1: Create the feature branch**

```bash
git -C /Users/vacuumlabs/Developer/dapcook checkout -b feat/ai-tag-suggestions
```

---

### Task 1: `TagSuggestions` type + sanitizer + prompt rules

**Files:**
- Modify: `src/types/recipe.ts` (the `RecipeDraft` interface, lines 16-29)
- Create: `src/lib/ai/suggest-tags.ts`
- Test: `src/lib/ai/suggest-tags.test.ts`

- [ ] **Step 1: Add the type**

In `src/types/recipe.ts`, above `export interface RecipeDraft`, add:

```ts
/** AI tag suggestions for one recipe. `existing` are household tags; `new` is at most one tag the household doesn't have yet. */
export interface TagSuggestions {
  existing: string[]
  new: string | null
}
```

and inside `RecipeDraft`, after `partial_reason?: string`, add:

```ts
  suggestedTags?: TagSuggestions
```

- [ ] **Step 2: Write the failing tests**

Create `src/lib/ai/suggest-tags.test.ts`:

```ts
// @vitest-environment node
import { describe, it, expect, vi } from 'vitest'

vi.mock('@anthropic-ai/sdk', () => ({
  default: vi.fn().mockImplementation(function () {
    return { messages: { create: vi.fn() } }
  }),
}))
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn(() => ({})) }))
vi.mock('./log-usage', () => ({ logAiUsage: vi.fn() }))

import { sanitizeTagSuggestions, tagSuggestionRules, EMPTY_TAG_SUGGESTIONS } from './suggest-tags'

const HOUSEHOLD = ['dinner', 'pasta', 'quick', 'vegetarian']

describe('sanitizeTagSuggestions', () => {
  it('keeps existing tags that are in the household list, in model order', () => {
    expect(sanitizeTagSuggestions({ existing: ['quick', 'pasta'], new: null }, HOUSEHOLD))
      .toEqual({ existing: ['quick', 'pasta'], new: null })
  })

  it('drops "existing" tags the household does not have', () => {
    expect(sanitizeTagSuggestions({ existing: ['pasta', 'brunch'], new: null }, HOUSEHOLD).existing)
      .toEqual(['pasta'])
  })

  it('lowercases, trims and deduplicates existing tags', () => {
    expect(sanitizeTagSuggestions({ existing: [' Pasta', 'pasta', 'QUICK'], new: null }, HOUSEHOLD).existing)
      .toEqual(['pasta', 'quick'])
  })

  it('caps existing tags at 8', () => {
    const many = Array.from({ length: 12 }, (_, i) => `t${i}`)
    expect(sanitizeTagSuggestions({ existing: many, new: null }, many).existing).toHaveLength(8)
  })

  it('ignores non-string entries in existing', () => {
    expect(sanitizeTagSuggestions({ existing: ['pasta', 42, null], new: null }, HOUSEHOLD).existing)
      .toEqual(['pasta'])
  })

  it('keeps a new tag that the household does not have, lowercased', () => {
    expect(sanitizeTagSuggestions({ existing: [], new: ' Italian ' }, HOUSEHOLD).new).toBe('italian')
  })

  it('drops a new tag that duplicates a household tag', () => {
    expect(sanitizeTagSuggestions({ existing: [], new: 'Vegetarian' }, HOUSEHOLD).new).toBeNull()
  })

  it('keeps only the first element when new is an array', () => {
    expect(sanitizeTagSuggestions({ existing: [], new: ['italian', 'comfort food'] }, HOUSEHOLD).new).toBe('italian')
  })

  it('drops an empty or non-string new tag', () => {
    expect(sanitizeTagSuggestions({ existing: [], new: '  ' }, HOUSEHOLD).new).toBeNull()
    expect(sanitizeTagSuggestions({ existing: [], new: 7 }, HOUSEHOLD).new).toBeNull()
  })

  it('returns the empty result for malformed input', () => {
    expect(sanitizeTagSuggestions(null, HOUSEHOLD)).toEqual(EMPTY_TAG_SUGGESTIONS)
    expect(sanitizeTagSuggestions('garbage', HOUSEHOLD)).toEqual(EMPTY_TAG_SUGGESTIONS)
    expect(sanitizeTagSuggestions({ existing: 'pasta' }, HOUSEHOLD)).toEqual(EMPTY_TAG_SUGGESTIONS)
  })
})

describe('tagSuggestionRules', () => {
  it('lists the household tags and names the target language', () => {
    const rules = tagSuggestionRules({ householdTags: ['pasta', 'quick'], language: 'sk' })
    expect(rules).toContain('"pasta", "quick"')
    expect(rules).toContain('Slovak')
  })

  it('says so when the household has no tags yet', () => {
    expect(tagSuggestionRules({ householdTags: [], language: 'en' })).toContain('(none yet)')
  })
})
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run src/lib/ai/suggest-tags.test.ts`
Expected: FAIL — cannot resolve `./suggest-tags`.

- [ ] **Step 4: Implement**

Create `src/lib/ai/suggest-tags.ts`:

```ts
import { LANGUAGE_NAMES } from '@/lib/constants/languages'
import type { TagSuggestions } from '@/types/recipe'

export const MAX_EXISTING_SUGGESTIONS = 8

export const EMPTY_TAG_SUGGESTIONS: TagSuggestions = { existing: [], new: null }

export interface TagPromptContext {
  householdTags: readonly string[]
  /** Household `preferred_language` code, e.g. "sk". */
  language: string
}

function clean(tag: string): string {
  return tag.trim().toLowerCase()
}

/**
 * Prompt rules for the `existing` / `new` fields. Shared by the standalone
 * suggestion call and the recipe-parse call, which describe the surrounding
 * JSON shape themselves.
 */
export function tagSuggestionRules({ householdTags, language }: TagPromptContext): string {
  const languageName = LANGUAGE_NAMES[language] ?? language
  const list = householdTags.length > 0 ? householdTags.map((tag) => `"${tag}"`).join(', ') : '(none yet)'
  return `Tag suggestion rules:
- The household already uses these tags: ${list}
- "existing": up to ${MAX_EXISTING_SUGGESTIONS} tags copied exactly from that list that genuinely fit this recipe, best fit first. An empty array is fine.
- "new": at most ONE tag that is not in that list, or null. Only suggest one when the recipe obviously belongs to a cuisine (e.g. italian for carbonara, mexican for burrito) or a dish type (e.g. dessert, soup) and no listed tag already covers it. Never suggest dietary, health, difficulty or occasion tags (e.g. low-fat, healthy, easy, party) as new. Write it in ${languageName}, lowercase, in the same style as the listed tags. When in doubt, use null.`
}

/**
 * Enforces the suggestion rules in code, whatever the model returned:
 * existing tags must be household tags (max 8), the new tag must not be one,
 * and there is at most one new tag.
 */
export function sanitizeTagSuggestions(raw: unknown, householdTags: readonly string[]): TagSuggestions {
  if (!raw || typeof raw !== 'object') return EMPTY_TAG_SUGGESTIONS
  const { existing, new: newTag } = raw as { existing?: unknown; new?: unknown }
  if (!Array.isArray(existing)) return EMPTY_TAG_SUGGESTIONS

  const known = new Set(householdTags.map(clean))
  const picked: string[] = []
  for (const item of existing) {
    if (picked.length === MAX_EXISTING_SUGGESTIONS) break
    if (typeof item !== 'string') continue
    const tag = clean(item)
    if (known.has(tag) && !picked.includes(tag)) picked.push(tag)
  }

  const candidate = Array.isArray(newTag) ? newTag[0] : newTag
  const cleanedNew = typeof candidate === 'string' ? clean(candidate) : ''

  return { existing: picked, new: cleanedNew && !known.has(cleanedNew) ? cleanedNew : null }
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run src/lib/ai/suggest-tags.test.ts`
Expected: PASS (12 tests).

- [ ] **Step 6: Commit**

```bash
git -C /Users/vacuumlabs/Developer/dapcook add src/types/recipe.ts src/lib/ai/suggest-tags.ts src/lib/ai/suggest-tags.test.ts
git -C /Users/vacuumlabs/Developer/dapcook commit -m "feat: tag suggestion rules and sanitizer"
```

---

### Task 2: Standalone `suggestTags` call

**Files:**
- Modify: `src/lib/ai/suggest-tags.ts`
- Test: `src/lib/ai/suggest-tags.test.ts`

- [ ] **Step 1: Write the failing tests**

In `src/lib/ai/suggest-tags.test.ts`, replace the top mock block and imports (everything above `const HOUSEHOLD`) with:

```ts
// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockCreate } = vi.hoisted(() => ({ mockCreate: vi.fn() }))

vi.mock('@anthropic-ai/sdk', () => ({
  default: vi.fn().mockImplementation(function () {
    return { messages: { create: mockCreate } }
  }),
}))
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn(() => ({})) }))
vi.mock('./log-usage', () => ({ logAiUsage: vi.fn() }))

import { logAiUsage } from './log-usage'
import { sanitizeTagSuggestions, tagSuggestionRules, suggestTags, EMPTY_TAG_SUGGESTIONS } from './suggest-tags'

beforeEach(() => {
  vi.clearAllMocks()
})

function mockAnthropicResponse(text: string) {
  mockCreate.mockResolvedValue({
    content: [{ type: 'text', text }],
    usage: { input_tokens: 40, output_tokens: 10 },
  })
}
```

Append at the end of the file:

```ts
describe('suggestTags', () => {
  const input = {
    title: 'Beef burrito',
    ingredientNames: ['tortilla', 'beef', 'black beans'],
    householdTags: HOUSEHOLD,
    language: 'en',
    householdId: 'hh-1',
  }

  it('returns sanitized suggestions from the model response', async () => {
    mockAnthropicResponse('{"existing": ["dinner", "brunch"], "new": "Mexican"}')
    expect(await suggestTags(input)).toEqual({ existing: ['dinner'], new: 'mexican' })
  })

  it('sends title, ingredients and the rules to Haiku', async () => {
    mockAnthropicResponse('{"existing": [], "new": null}')
    await suggestTags(input)
    const args = mockCreate.mock.calls[0][0]
    expect(args.model).toBe('claude-haiku-4-5-20251001')
    const prompt = args.messages[0].content as string
    expect(prompt).toContain('Beef burrito')
    expect(prompt).toContain('tortilla, beef, black beans')
    expect(prompt).toContain('"dinner", "pasta"')
  })

  it('logs usage as tag_suggest', async () => {
    mockAnthropicResponse('{"existing": [], "new": null}')
    await suggestTags(input)
    expect(logAiUsage).toHaveBeenCalledWith(expect.anything(), 'hh-1', 'tag_suggest', { input_tokens: 40, output_tokens: 10 })
  })

  it('returns the empty result when the response has no JSON', async () => {
    mockAnthropicResponse('Sorry.')
    expect(await suggestTags(input)).toEqual(EMPTY_TAG_SUGGESTIONS)
  })

  it('returns the empty result when the SDK throws', async () => {
    mockCreate.mockRejectedValue(new Error('overloaded'))
    expect(await suggestTags(input)).toEqual(EMPTY_TAG_SUGGESTIONS)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/ai/suggest-tags.test.ts`
Expected: FAIL — `suggestTags` is not exported.

- [ ] **Step 3: Implement**

In `src/lib/ai/suggest-tags.ts`, replace the imports with:

```ts
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@/lib/supabase/server'
import { LANGUAGE_NAMES } from '@/lib/constants/languages'
import type { TagSuggestions } from '@/types/recipe'
import { logAiUsage } from './log-usage'

const client = new Anthropic()

// Enough to identify the dish; keeps prompts small for huge ingredient lists.
const MAX_INGREDIENTS = 40
```

and append:

```ts
export interface SuggestTagsInput extends TagPromptContext {
  title: string
  ingredientNames: readonly string[]
  householdId: string
}

/** Standalone suggestion call for recipes that are not going through AI import. Never throws. */
export async function suggestTags({
  title,
  ingredientNames,
  householdTags,
  language,
  householdId,
}: SuggestTagsInput): Promise<TagSuggestions> {
  const ingredients = ingredientNames.slice(0, MAX_INGREDIENTS).join(', ') || '(none given)'
  const prompt = `Suggest tags for this recipe.

Recipe title: ${title}
Ingredients: ${ingredients}

${tagSuggestionRules({ householdTags, language })}

Return a JSON object with EXACTLY this structure, no other text:
{"existing": ["dinner"], "new": "mexican"}`

  try {
    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 256,
      messages: [{ role: 'user', content: prompt }],
    })

    void logAiUsage(createClient(), householdId, 'tag_suggest', response.usage)

    const text = response.content[0].type === 'text' ? response.content[0].text : ''
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) return EMPTY_TAG_SUGGESTIONS
    return sanitizeTagSuggestions(JSON.parse(jsonMatch[0]), householdTags)
  } catch (err) {
    console.error('[suggest-tags] Tag suggestion failed:', err)
    return EMPTY_TAG_SUGGESTIONS
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/ai/suggest-tags.test.ts`
Expected: PASS (17 tests).

- [ ] **Step 5: Commit**

```bash
git -C /Users/vacuumlabs/Developer/dapcook add src/lib/ai/suggest-tags.ts src/lib/ai/suggest-tags.test.ts
git -C /Users/vacuumlabs/Developer/dapcook commit -m "feat: standalone AI tag suggestion call"
```

---

### Task 3: Shared household tag loader

The import route builds the household's tag-name set inline (`src/app/api/recipes/import/route.ts:68-79`). The suggest endpoint needs the same list, so extract it.

**Files:**
- Create: `src/lib/tags/household-tags.ts`
- Test: `src/lib/tags/household-tags.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/tags/household-tags.test.ts`:

```ts
// @vitest-environment node
import { describe, it, expect, vi } from 'vitest'
import { loadHouseholdTagNames } from './household-tags'

function selectChain(data: unknown) {
  return {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    then: (resolve: (v: unknown) => unknown) => Promise.resolve({ data }).then(resolve),
  }
}

function makeSupabase(recipes: unknown, tags: unknown) {
  return {
    from: vi.fn((table: string) => (table === 'recipes' ? selectChain(recipes) : selectChain(tags))),
  }
}

describe('loadHouseholdTagNames', () => {
  it('merges recipe tags and tag-table names, lowercased, unique and sorted', async () => {
    const supabase = makeSupabase(
      [{ tags: ['Quick', 'pasta'] }, { tags: ['pasta'] }, { tags: null }],
      [{ name: 'dinner' }, { name: 'quick' }]
    )
    expect(await loadHouseholdTagNames(supabase as never, 'hh-1')).toEqual(['dinner', 'pasta', 'quick'])
  })

  it('returns an empty list when both queries return nothing', async () => {
    expect(await loadHouseholdTagNames(makeSupabase(null, null) as never, 'hh-1')).toEqual([])
  })

  it('reads only non-archived recipes of the household', async () => {
    const supabase = makeSupabase([], [])
    await loadHouseholdTagNames(supabase as never, 'hh-1')
    const recipesChain = supabase.from.mock.results[0].value
    expect(recipesChain.eq).toHaveBeenCalledWith('household_id', 'hh-1')
    expect(recipesChain.eq).toHaveBeenCalledWith('is_archived', false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/tags/household-tags.test.ts`
Expected: FAIL — cannot resolve `./household-tags`.

- [ ] **Step 3: Implement**

Create `src/lib/tags/household-tags.ts`:

```ts
import type { createClient } from '@/lib/supabase/server'

type Supabase = ReturnType<typeof createClient>

/**
 * Every tag name the household uses — on non-archived recipes or in the
 * `tags` metadata table — lowercased, unique and sorted.
 */
export async function loadHouseholdTagNames(supabase: Supabase, householdId: string): Promise<string[]> {
  const [{ data: recipes }, { data: tagRows }] = await Promise.all([
    supabase.from('recipes').select('tags').eq('household_id', householdId).eq('is_archived', false),
    supabase.from('tags').select('name').eq('household_id', householdId),
  ])
  const names = new Set<string>()
  for (const recipe of recipes ?? []) for (const tag of recipe.tags ?? []) names.add(tag.toLowerCase())
  for (const row of tagRows ?? []) names.add(row.name.toLowerCase())
  return Array.from(names).sort()
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/tags/household-tags.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git -C /Users/vacuumlabs/Developer/dapcook add src/lib/tags/household-tags.ts src/lib/tags/household-tags.test.ts
git -C /Users/vacuumlabs/Developer/dapcook commit -m "refactor: shared household tag name loader"
```

---

### Task 4: Piggyback suggestions on `parseRecipeData`

**Files:**
- Modify: `src/lib/ai/parse-recipe.ts`
- Test: `src/lib/ai/parse-recipe.test.ts` (new — there are no tests for this file yet)

- [ ] **Step 1: Write the failing tests**

Create `src/lib/ai/parse-recipe.test.ts`:

```ts
// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const { mockCreate } = vi.hoisted(() => ({ mockCreate: vi.fn() }))

vi.mock('@anthropic-ai/sdk', () => ({
  default: vi.fn().mockImplementation(function () {
    return { messages: { create: mockCreate } }
  }),
}))
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn(() => ({})) }))
vi.mock('./log-usage', () => ({ logAiUsage: vi.fn() }))

import { parseRecipeData } from './parse-recipe'

const RAW_INGREDIENTS = ['200 g spaghetti', '100 g guanciale']
const RAW_STEPS = ['Boil the pasta.']
const TAG_CONTEXT = { title: 'Carbonara', householdTags: ['dinner', 'pasta'], language: 'en' }

const PARSED = {
  ingredients: [
    { quantity: 200, unit: 'g', name: 'spaghetti', notes: '' },
    { quantity: 100, unit: 'g', name: 'guanciale', notes: '' },
  ],
  steps: [{ order: 1, text: 'Boil the pasta.' }],
}

function mockAnthropicJson(body: unknown) {
  mockCreate.mockResolvedValue({
    content: [{ type: 'text', text: JSON.stringify(body) }],
    usage: { input_tokens: 100, output_tokens: 50 },
  })
}

function sentPrompt(): string {
  return mockCreate.mock.calls[0][0].messages[0].content as string
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubEnv('RECIPE_IMPORT_USE_AI', 'true')
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('parseRecipeData', () => {
  it('parses ingredients and steps without tag suggestions when no tagContext is given', async () => {
    mockAnthropicJson(PARSED)
    const result = await parseRecipeData(RAW_INGREDIENTS, RAW_STEPS, 'hh-1')
    expect(result.ingredients.map((i) => i.name)).toEqual(['spaghetti', 'guanciale'])
    expect(result.suggestedTags).toBeUndefined()
    expect(sentPrompt()).not.toContain('suggestedTags')
  })

  it('asks for and returns sanitized tag suggestions when tagContext is given', async () => {
    mockAnthropicJson({ ...PARSED, suggestedTags: { existing: ['pasta', 'brunch'], new: 'Italian' } })
    const result = await parseRecipeData(RAW_INGREDIENTS, RAW_STEPS, 'hh-1', TAG_CONTEXT)
    expect(result.suggestedTags).toEqual({ existing: ['pasta'], new: 'italian' })
    expect(sentPrompt()).toContain('suggestedTags')
    expect(sentPrompt()).toContain('Carbonara')
    expect(sentPrompt()).toContain('"dinner", "pasta"')
  })

  it('keeps parsed ingredients and returns empty suggestions when the tag field is malformed', async () => {
    mockAnthropicJson({ ...PARSED, suggestedTags: 'pasta, italian' })
    const result = await parseRecipeData(RAW_INGREDIENTS, RAW_STEPS, 'hh-1', TAG_CONTEXT)
    expect(result.ingredients.map((i) => i.name)).toEqual(['spaghetti', 'guanciale'])
    expect(result.suggestedTags).toEqual({ existing: [], new: null })
  })

  it('returns no suggestions and makes no call when AI is disabled', async () => {
    vi.stubEnv('RECIPE_IMPORT_USE_AI', 'false')
    const result = await parseRecipeData(RAW_INGREDIENTS, RAW_STEPS, 'hh-1', TAG_CONTEXT)
    expect(mockCreate).not.toHaveBeenCalled()
    expect(result.suggestedTags).toBeUndefined()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/ai/parse-recipe.test.ts`
Expected: the "tagContext is given" and "malformed" tests FAIL (`suggestedTags` undefined); the other two pass.

- [ ] **Step 3: Implement**

In `src/lib/ai/parse-recipe.ts`:

1. Extend imports:

```ts
import type { Ingredient, Step, TagSuggestions } from '@/types/recipe'
import { sanitizeTagSuggestions, tagSuggestionRules, type TagPromptContext } from './suggest-tags'
```

2. Replace the `ParseResult` interface with:

```ts
interface ParseResult {
  ingredients: Ingredient[]
  steps: Step[]
  /** Present only when `tagContext` was passed and the AI call succeeded. */
  suggestedTags?: TagSuggestions
}

export interface ParseTagContext extends TagPromptContext {
  title: string
}
```

3. Change the signature to:

```ts
export async function parseRecipeData(
  rawIngredients: string[],
  rawSteps: string[],
  householdId?: string,
  tagContext?: ParseTagContext
): Promise<ParseResult> {
```

4. Right after the `if (rawIngredients.length === 0 && rawSteps.length === 0)` early return, add:

```ts
  const tagSection = tagContext
    ? `

Also add a top-level "suggestedTags" field to the JSON object: {"existing": [...], "new": "..." or null}, suggesting tags for the recipe titled "${tagContext.title}".
${tagSuggestionRules(tagContext)}`
    : ''
```

5. Append `${tagSection}` to the end of the prompt template literal — the last line becomes:

```ts
- Handle mixed languages (Slovak, English, etc.) — do not translate, keep original language${tagSection}`
```

6. Widen the parsed type and add the field to the returned object:

```ts
    const parsed = JSON.parse(jsonMatch[0]) as {
      ingredients: Array<{ quantity: number | null; unit: string; name: string; notes: string }>
      steps: Array<{ order: number; text: string }>
      suggestedTags?: unknown
    }
```

and after the `steps: parsed.steps.map(...)` entry inside the returned object:

```ts
      ...(tagContext && { suggestedTags: sanitizeTagSuggestions(parsed.suggestedTags, tagContext.householdTags) }),
```

(`sanitizeTagSuggestions` never throws, so a broken tag field can't trigger the raw fallback.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/ai/parse-recipe.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git -C /Users/vacuumlabs/Developer/dapcook add src/lib/ai/parse-recipe.ts src/lib/ai/parse-recipe.test.ts
git -C /Users/vacuumlabs/Developer/dapcook commit -m "feat: return tag suggestions from recipe parsing"
```

---

### Task 5: Import route forwards suggestions

**Files:**
- Modify: `src/app/api/recipes/import/route.ts:64-89`
- Test: `src/app/api/recipes/import/route.test.ts`

- [ ] **Step 1: Write the failing test**

In `src/app/api/recipes/import/route.test.ts`, inside `describe('POST /api/recipes/import', ...)`, add:

```ts
  it('passes household tags to parsing and forwards suggested tags to the draft', async () => {
    const supabase = makeSupabase()
    const defaultFrom = supabase.from.getMockImplementation()!
    supabase.from.mockImplementation((table: string) => {
      if (table === 'recipes') return makeSelectChain([{ tags: ['Pasta', 'quick'] }])
      if (table === 'tags') return makeSelectChain([{ name: 'dinner' }])
      return defaultFrom(table)
    })
    vi.mocked(createClient).mockReturnValue(supabase as unknown as ReturnType<typeof createClient>)
    vi.mocked(parseRecipeData).mockResolvedValue({
      ...parsedParts,
      suggestedTags: { existing: ['pasta'], new: 'italian' },
    })

    const events = await collectEvents(await POST(req({ url: 'https://example.com/pasta' })))

    expect(parseRecipeData).toHaveBeenCalledWith(
      rawScraped.rawIngredients,
      rawScraped.rawSteps,
      'hh-1',
      { title: 'Pasta', householdTags: ['dinner', 'pasta', 'quick'], language: 'en' }
    )
    expect(getDoneEvent(events)?.draft.suggestedTags).toEqual({ existing: ['pasta'], new: 'italian' })
  })
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/app/api/recipes/import/route.test.ts`
Expected: the new test FAILS (`parseRecipeData` called with 3 args); existing tests pass.

- [ ] **Step 3: Implement**

In `src/app/api/recipes/import/route.ts`:

1. Add the import:

```ts
import { loadHouseholdTagNames } from '@/lib/tags/household-tags'
```

2. Replace the block from `const [{ ingredients, steps }, existingTags, { data: household }] = await Promise.all([` through the closing `])` (lines 68-86) with:

```ts
      const householdId = profile?.household_id ?? undefined
      // Tags and language are needed as input to parsing (for tag suggestions), so they load first.
      const [householdTags, { data: household }] = await Promise.all([
        householdId ? loadHouseholdTagNames(supabase, householdId) : Promise.resolve([] as string[]),
        householdId
          ? supabase.from('households').select('preferred_language, preferred_units, translation_enabled').eq('id', householdId).single()
          : Promise.resolve({ data: null }),
      ])
      const existingTags = new Set(householdTags)

      const { ingredients, steps, suggestedTags } = await parseRecipeData(
        rawIngredients,
        rawSteps,
        householdId,
        household ? { title: meta.title, householdTags, language: household.preferred_language } : undefined
      )
```

3. In `baseDraft`, after `steps,` add:

```ts
        ...(suggestedTags && { suggestedTags }),
```

The translated draft later in the route spreads `...baseDraft`, so `suggestedTags` carries through unchanged.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/app/api/recipes/import/route.test.ts`
Expected: PASS (all tests, including the new one).

- [ ] **Step 5: Commit**

```bash
git -C /Users/vacuumlabs/Developer/dapcook add src/app/api/recipes/import/route.ts src/app/api/recipes/import/route.test.ts
git -C /Users/vacuumlabs/Developer/dapcook commit -m "feat: forward AI tag suggestions from URL import"
```

---

### Task 6: `POST /api/tags/suggest`

`src/app/api/tags/[name]` exists; a static `suggest` segment takes precedence over the dynamic one in the App Router.

**Files:**
- Create: `src/app/api/tags/suggest/route.ts`
- Test: `src/app/api/tags/suggest/route.test.ts`
- Modify: `.env.local.example`

- [ ] **Step 1: Write the failing tests**

Create `src/app/api/tags/suggest/route.test.ts`:

```ts
// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('@/lib/auth/household', async () => ({
  getCurrentHouseholdId: (await import('@/test/householdMock')).householdIdMock,
}))
vi.mock('@/lib/tags/household-tags', () => ({ loadHouseholdTagNames: vi.fn() }))
vi.mock('@/lib/ai/suggest-tags', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/ai/suggest-tags')>()),
  suggestTags: vi.fn(),
}))

import { POST } from './route'
import { createClient } from '@/lib/supabase/server'
import { loadHouseholdTagNames } from '@/lib/tags/household-tags'
import { suggestTags } from '@/lib/ai/suggest-tags'
import { authMock } from '@/test/authMock'
import { householdIdMock } from '@/test/householdMock'

const EMPTY = { existing: [], new: null }

function makeSupabase(user: { id: string } | null = { id: 'user-1' }) {
  return {
    auth: authMock(user),
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: { preferred_language: 'sk' } }),
    })),
  }
}

function req(body: unknown) {
  return new NextRequest('http://localhost/api/tags/suggest', { method: 'POST', body: JSON.stringify(body) })
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubEnv('TAG_SUGGEST_USE_AI', 'true')
  vi.mocked(createClient).mockReturnValue(makeSupabase() as unknown as ReturnType<typeof createClient>)
  householdIdMock.mockResolvedValue('hh-1')
  vi.mocked(loadHouseholdTagNames).mockResolvedValue(['dinner', 'pasta'])
  vi.mocked(suggestTags).mockResolvedValue({ existing: ['dinner'], new: 'mexické' })
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('POST /api/tags/suggest', () => {
  it('returns 401 when unauthenticated', async () => {
    vi.mocked(createClient).mockReturnValue(makeSupabase(null) as unknown as ReturnType<typeof createClient>)
    const res = await POST(req({ title: 'Burrito' }))
    expect(res.status).toBe(401)
  })

  it('returns empty suggestions without calling AI when the flag is off', async () => {
    vi.stubEnv('TAG_SUGGEST_USE_AI', 'false')
    const res = await POST(req({ title: 'Burrito' }))
    expect(await res.json()).toEqual(EMPTY)
    expect(suggestTags).not.toHaveBeenCalled()
  })

  it('returns empty suggestions for an empty title', async () => {
    const res = await POST(req({ title: '   ', ingredientNames: ['beef'] }))
    expect(await res.json()).toEqual(EMPTY)
    expect(suggestTags).not.toHaveBeenCalled()
  })

  it('returns empty suggestions when the user has no household', async () => {
    householdIdMock.mockResolvedValue(null)
    const res = await POST(req({ title: 'Burrito' }))
    expect(await res.json()).toEqual(EMPTY)
    expect(suggestTags).not.toHaveBeenCalled()
  })

  it('suggests with server-side tags and language, ignoring non-string ingredients', async () => {
    const res = await POST(req({ title: ' Burrito ', ingredientNames: ['tortilla', 3, ' ', 'beef'] }))
    expect(await res.json()).toEqual({ existing: ['dinner'], new: 'mexické' })
    expect(suggestTags).toHaveBeenCalledWith({
      title: 'Burrito',
      ingredientNames: ['tortilla', 'beef'],
      householdTags: ['dinner', 'pasta'],
      language: 'sk',
      householdId: 'hh-1',
    })
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/app/api/tags/suggest/route.test.ts`
Expected: FAIL — cannot resolve `./route`.

- [ ] **Step 3: Implement**

Create `src/app/api/tags/suggest/route.ts`:

```ts
import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getCurrentUser } from '@/lib/auth/current-user'
import { getCurrentHouseholdId } from '@/lib/auth/household'
import { loadHouseholdTagNames } from '@/lib/tags/household-tags'
import { suggestTags, EMPTY_TAG_SUGGESTIONS } from '@/lib/ai/suggest-tags'

const MAX_TITLE_CHARS = 200

export async function POST(request: NextRequest) {
  const supabase = createClient()
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Guard: the tag field fires this on focus, so without the flag every form visit would cost an AI call.
  if (process.env.TAG_SUGGEST_USE_AI !== 'true') return NextResponse.json(EMPTY_TAG_SUGGESTIONS)

  const householdId = await getCurrentHouseholdId()
  if (!householdId) return NextResponse.json(EMPTY_TAG_SUGGESTIONS)

  const body = (await request.json().catch(() => ({}))) as { title?: unknown; ingredientNames?: unknown }
  const title = typeof body.title === 'string' ? body.title.trim().slice(0, MAX_TITLE_CHARS) : ''
  if (!title) return NextResponse.json(EMPTY_TAG_SUGGESTIONS)

  const ingredientNames = Array.isArray(body.ingredientNames)
    ? body.ingredientNames
        .filter((name): name is string => typeof name === 'string')
        .map((name) => name.trim())
        .filter(Boolean)
    : []

  const [householdTags, { data: household }] = await Promise.all([
    loadHouseholdTagNames(supabase, householdId),
    supabase.from('households').select('preferred_language').eq('id', householdId).single(),
  ])

  const suggestions = await suggestTags({
    title,
    ingredientNames,
    householdTags,
    language: household?.preferred_language ?? 'en',
    householdId,
  })
  return NextResponse.json(suggestions)
}
```

- [ ] **Step 4: Document the flag**

In `.env.local.example`, directly below the `RECIPE_IMPORT_USE_AI=false` line, add:

```
# Set to "true" on Vercel to enable AI tag suggestions in the recipe form.
# Leave unset or "false" locally: the tag field requests suggestions on focus.
TAG_SUGGEST_USE_AI=false
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run src/app/api/tags/suggest/route.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 6: Commit**

```bash
git -C /Users/vacuumlabs/Developer/dapcook add src/app/api/tags/suggest .env.local.example
git -C /Users/vacuumlabs/Developer/dapcook commit -m "feat: tag suggestion endpoint behind TAG_SUGGEST_USE_AI"
```

---

### Task 7: i18n strings

**Files:**
- Modify: `messages/en/recipes.json:99-103`, `messages/sk/recipes.json:99-103`

- [ ] **Step 1: Add keys**

`messages/en/recipes.json` — the `tagInput` block becomes:

```json
  "tagInput": {
    "placeholder": "Type a tag and press Enter",
    "helper": "Press Enter or comma to add",
    "mostUsed": "Most used",
    "suggested": "Suggested",
    "new": "New"
  },
```

`messages/sk/recipes.json` — the `tagInput` block becomes:

```json
  "tagInput": {
    "placeholder": "Napíšte štítok a stlačte Enter",
    "helper": "Pridáte stlačením Enter alebo čiarky",
    "mostUsed": "Najpoužívanejšie",
    "suggested": "Navrhované",
    "new": "Nový"
  },
```

- [ ] **Step 2: Commit**

```bash
git -C /Users/vacuumlabs/Developer/dapcook add messages/en/recipes.json messages/sk/recipes.json
git -C /Users/vacuumlabs/Developer/dapcook commit -m "copy: tag suggestion labels"
```

---

### Task 8: `TagInput` renders suggestions

**Files:**
- Modify: `src/components/recipe/TagInput.tsx`
- Test: `src/components/recipe/TagInput.test.tsx` (new)

- [ ] **Step 1: Write the failing tests**

Create `src/components/recipe/TagInput.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { TagInput } from './TagInput'
import { mockTranslate } from '@/test/mockMessages'
import type { TagData } from '@/app/api/tags/route'

vi.mock('next-intl', () => ({
  useTranslations: (namespace: string) => (key: string) => mockTranslate(namespace, key),
}))

const ALL_TAGS: TagData[] = [
  { name: 'dinner', color: null, groupId: null, count: 9 },
  { name: 'quick', color: null, groupId: null, count: 5 },
  { name: 'pasta', color: '#ef4444', groupId: null, count: 2 },
]

function renderInput(props: Partial<React.ComponentProps<typeof TagInput>> = {}) {
  const onChange = vi.fn()
  render(<TagInput tags={[]} onChange={onChange} allTags={ALL_TAGS} {...props} />)
  return { onChange }
}

describe('TagInput suggestions', () => {
  it('shows most used tags when there are no suggestions', () => {
    renderInput({ suggestions: null })
    expect(screen.getByText('Most used')).toBeInTheDocument()
    expect(screen.queryByText('Suggested')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'dinner' })).toBeInTheDocument()
  })

  it('shows suggestions instead of most used', () => {
    renderInput({ suggestions: { existing: ['pasta'], new: null } })
    expect(screen.getByText('Suggested')).toBeInTheDocument()
    expect(screen.queryByText('Most used')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'pasta' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'dinner' })).not.toBeInTheDocument()
  })

  it('marks the new tag and adds it on click', () => {
    const { onChange } = renderInput({ suggestions: { existing: [], new: 'italian' } })
    const chip = screen.getByRole('button', { name: /italian/ })
    expect(chip).toHaveTextContent('New')
    fireEvent.click(chip)
    expect(onChange).toHaveBeenCalledWith(['italian'])
  })

  it('hides suggestions that are already selected', () => {
    renderInput({ tags: ['pasta', 'italian'], suggestions: { existing: ['pasta', 'dinner'], new: 'italian' } })
    expect(screen.getByRole('button', { name: 'dinner' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /New/ })).not.toBeInTheDocument()
  })

  it('falls back to most used when every suggestion is already selected', () => {
    renderInput({ tags: ['pasta'], suggestions: { existing: ['pasta'], new: null } })
    expect(screen.getByText('Most used')).toBeInTheDocument()
  })

  it('requests suggestions when the input gains focus', () => {
    const onRequestSuggestions = vi.fn()
    renderInput({ onRequestSuggestions })
    fireEvent.focus(screen.getByPlaceholderText('Type a tag and press Enter'))
    expect(onRequestSuggestions).toHaveBeenCalledTimes(1)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/components/recipe/TagInput.test.tsx`
Expected: FAIL — suggestion tests fail (no "Suggested" label, focus callback not called); the first test passes.

- [ ] **Step 3: Implement**

In `src/components/recipe/TagInput.tsx`:

1. Add the import and props:

```tsx
import type { TagSuggestions } from '@/types/recipe'

interface TagInputProps {
  tags: string[]
  onChange: (tags: string[]) => void
  allTags: TagData[]
  /** AI suggestions; when null/empty the "most used" row is shown instead. */
  suggestions?: TagSuggestions | null
  /** Fired when the input gains focus — the parent decides whether to fetch. */
  onRequestSuggestions?: () => void
}
```

2. Update the signature:

```tsx
export function TagInput({ tags, onChange, allTags, suggestions, onRequestSuggestions }: TagInputProps) {
```

3. Replace the "Most used" computation block (`// Most used: top 8 ...` through `: []`) with:

```tsx
  // AI suggestions, minus tags already on the recipe
  const suggestedExisting = !input && suggestions ? suggestions.existing.filter((name) => !tags.includes(name)) : []
  const suggestedNew = !input && suggestions?.new && !tags.includes(suggestions.new) ? suggestions.new : null
  const hasSuggestions = suggestedExisting.length > 0 || suggestedNew !== null

  // Most used: top 8 unused tags shown when input is empty and there are no suggestions
  const mostUsed = !input && !hasSuggestions
    ? allTags.filter((tag) => tag.count > 0 && !tags.includes(tag.name)).slice(0, 8)
    : []
```

4. Change the input's `onFocus` to:

```tsx
          onFocus={() => { setOpen(true); onRequestSuggestions?.() }}
```

5. Directly above the `{/* Most used suggestions */}` block, add:

```tsx
      {/* AI suggestions */}
      {hasSuggestions && (
        <div>
          <p className="text-xs text-gray-400 mb-1.5">{t('tagInput.suggested')}</p>
          <div className="flex flex-wrap gap-1.5">
            {suggestedExisting.map((name) => {
              const color = colorFor(name, allTags)
              return (
                <button
                  key={name}
                  type="button"
                  onClick={() => addTag(name)}
                  className={`${tagClass(color)} hover:opacity-75 transition-opacity cursor-pointer`}
                  style={tagStyle(color)}
                >
                  {name}
                </button>
              )
            })}
            {suggestedNew && (
              <button
                type="button"
                onClick={() => addTag(suggestedNew)}
                className="inline-flex items-center gap-1.5 border border-dashed border-gray-300 text-gray-600 text-xs font-medium px-2.5 py-1 rounded-full hover:bg-gray-50 transition-colors cursor-pointer"
              >
                {suggestedNew}
                <span className="text-[10px] uppercase tracking-wide text-gray-400">{t('tagInput.new')}</span>
              </button>
            )}
          </div>
        </div>
      )}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/components/recipe/TagInput.test.tsx`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git -C /Users/vacuumlabs/Developer/dapcook add src/components/recipe/TagInput.tsx src/components/recipe/TagInput.test.tsx
git -C /Users/vacuumlabs/Developer/dapcook commit -m "feat: show AI tag suggestions in TagInput"
```

---

### Task 9: `RecipeForm` fetches suggestions

**Files:**
- Modify: `src/components/recipe/RecipeForm.tsx`
- Test: `src/components/recipe/RecipeForm.test.tsx`

- [ ] **Step 1: Write the failing tests**

Append to `src/components/recipe/RecipeForm.test.tsx`:

```tsx
describe('tag suggestions', () => {
  const TAG_PLACEHOLDER = 'Type a tag and press Enter'
  const SUGGESTIONS = { existing: [], new: 'mexican' }

  function mockFetchWithSuggestions() {
    global.fetch = vi.fn(async (url: RequestInfo | URL) => {
      if (url === '/api/tags/suggest') return { ok: true, json: async () => SUGGESTIONS } as Response
      return { ok: true, json: async () => [] } as Response
    }) as typeof fetch
  }

  function suggestCalls() {
    return vi.mocked(global.fetch).mock.calls.filter(([url]) => url === '/api/tags/suggest')
  }

  it('uses suggestions from the import draft without fetching', async () => {
    mockFetchWithSuggestions()
    render(<RecipeForm draft={{ ...sampleDraft, suggestedTags: { existing: [], new: 'italian' } }} />)
    expect(screen.getByRole('button', { name: /italian/ })).toBeInTheDocument()
    fireEvent.focus(screen.getByPlaceholderText(TAG_PLACEHOLDER))
    expect(suggestCalls()).toHaveLength(0)
  })

  it('fetches suggestions on first focus of the tag field', async () => {
    mockFetchWithSuggestions()
    render(<RecipeForm />)
    fireEvent.change(screen.getByLabelText(/title/i), { target: { value: 'Burrito' } })
    fireEvent.focus(screen.getByPlaceholderText(TAG_PLACEHOLDER))

    expect(await screen.findByRole('button', { name: /mexican/ })).toBeInTheDocument()
    expect(suggestCalls()).toHaveLength(1)
    expect(JSON.parse(suggestCalls()[0][1]!.body as string)).toEqual({ title: 'Burrito', ingredientNames: [] })
  })

  it('does not refetch until the title changes', async () => {
    mockFetchWithSuggestions()
    render(<RecipeForm />)
    const tagInput = screen.getByPlaceholderText(TAG_PLACEHOLDER)
    fireEvent.change(screen.getByLabelText(/title/i), { target: { value: 'Burrito' } })
    fireEvent.focus(tagInput)
    await screen.findByRole('button', { name: /mexican/ })

    fireEvent.blur(tagInput)
    fireEvent.focus(tagInput)
    expect(suggestCalls()).toHaveLength(1)

    fireEvent.change(screen.getByLabelText(/title/i), { target: { value: 'Chicken burrito' } })
    fireEvent.focus(tagInput)
    await waitFor(() => expect(suggestCalls()).toHaveLength(2))
  })

  it('does not fetch while the title is empty', () => {
    mockFetchWithSuggestions()
    render(<RecipeForm />)
    fireEvent.focus(screen.getByPlaceholderText(TAG_PLACEHOLDER))
    expect(suggestCalls()).toHaveLength(0)
  })
})
```

Note: `getByLabelText(/title/i)` assumes `recipes.form.titleLabel` is "Title" in `messages/en/recipes.json`. Check the file and use the actual English label if it differs.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/components/recipe/RecipeForm.test.tsx`
Expected: the new `tag suggestions` tests FAIL (no chips, no fetch); existing tests pass.

- [ ] **Step 3: Implement**

In `src/components/recipe/RecipeForm.tsx`:

1. Update imports:

```tsx
import { useState, useEffect, useRef } from 'react'
```

```tsx
import type { RecipeDraft, IngredientFormItem, Step, TagSuggestions } from '@/types/recipe'
```

2. Above `export function RecipeForm`, add:

```tsx
/** Identifies the inputs a suggestion request was made for, so unchanged inputs aren't re-sent. */
function suggestionKey(title: string, ingredients: { name: string }[]): string {
  return JSON.stringify([title.trim(), ingredients.map((ing) => ing.name.trim()).filter(Boolean)])
}
```

3. After the `const [allTags, setAllTags] = useState<TagData[]>([])` line, add:

```tsx
  const [tagSuggestions, setTagSuggestions] = useState<TagSuggestions | null>(draft?.suggestedTags ?? null)
  // Import suggestions count as already fetched for the draft's own title + ingredients.
  const lastSuggestionKey = useRef<string | null>(
    draft?.suggestedTags ? suggestionKey(draft.title, draft.ingredients) : null
  )
  const suggestionInFlight = useRef(false)

  async function requestTagSuggestions() {
    if (!title.trim() || suggestionInFlight.current) return
    const key = suggestionKey(title, ingredients)
    if (key === lastSuggestionKey.current) return

    suggestionInFlight.current = true
    try {
      const [trimmedTitle, ingredientNames] = JSON.parse(key) as [string, string[]]
      const res = await fetch('/api/tags/suggest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: trimmedTitle, ingredientNames }),
      })
      if (res.ok) {
        setTagSuggestions(await res.json() as TagSuggestions)
        lastSuggestionKey.current = key
      }
    } catch {
      // Suggestions are optional — the "most used" row stays as the fallback.
    } finally {
      suggestionInFlight.current = false
    }
  }
```

4. Replace the `<TagInput ... />` line with:

```tsx
            <TagInput
              tags={tags}
              onChange={setTags}
              allTags={allTags}
              suggestions={tagSuggestions}
              onRequestSuggestions={requestTagSuggestions}
            />
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/components/recipe/RecipeForm.test.tsx src/components/recipe/TagInput.test.tsx`
Expected: PASS (all tests).

- [ ] **Step 5: Commit**

```bash
git -C /Users/vacuumlabs/Developer/dapcook add src/components/recipe/RecipeForm.tsx src/components/recipe/RecipeForm.test.tsx
git -C /Users/vacuumlabs/Developer/dapcook commit -m "feat: fetch AI tag suggestions from the recipe form"
```

---

### Task 10: Full verification and staging

- [ ] **Step 1: Run the full suite, type-check and lint**

```bash
npm test
```

```bash
npm run type-check
```

```bash
npm run lint
```

Expected: all pass. Fix any failures before continuing.

- [ ] **Step 2: Manual smoke check (no AI)**

With `npm run dev` running (`TAG_SUGGEST_USE_AI` unset), sign in via http://localhost:3000/dev/login?next=/recipes/new, type a title, focus the tag field. Expected: one `POST /api/tags/suggest` returning `{"existing":[],"new":null}`, and the "Most used" row still shows. Do **not** enable the flag locally.

- [ ] **Step 3: Push the branch and merge into staging**

```bash
git -C /Users/vacuumlabs/Developer/dapcook push -u origin feat/ai-tag-suggestions
```

```bash
git -C /Users/vacuumlabs/Developer/dapcook checkout staging
```

```bash
git -C /Users/vacuumlabs/Developer/dapcook pull
```

```bash
git -C /Users/vacuumlabs/Developer/dapcook merge --no-ff feat/ai-tag-suggestions
```

```bash
git -C /Users/vacuumlabs/Developer/dapcook push
```

- [ ] **Step 4: Hand off to the user**

Tell the user:
- `TAG_SUGGEST_USE_AI=true` must be set in Vercel for the staging environment (and later production) — until then the lazy path returns empty suggestions.
- Test on https://dapcook-staging.vercel.app: import a recipe URL (suggestions arrive with the draft), create a manual recipe, edit an existing one.
- After approval, merge `feat/ai-tag-suggestions` (not `staging`) into `main`.
- No database migration is needed (`ai_usage_logs.feature` is free text).
