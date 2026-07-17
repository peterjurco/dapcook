# Unlisted Recipe Sharing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let household members create revocable, unguessable public recipe URLs that render the full recipe without actions, remain out of search and autonomous AI indexes, and stay readable by user-directed chatbots.

**Architecture:** Store one nullable unique `share_token` on each recipe. Authenticated endpoints manage it through normal household RLS; `/s/[token]` performs an exact server-only lookup with the Supabase admin client and renders shared recipe content as semantic HTML plus Recipe JSON-LD. Page metadata and crawler-specific robots rules prevent compliant indexing without blocking user-directed fetchers.

**Tech Stack:** Next.js 14 App Router, React 18, TypeScript, Supabase/PostgreSQL RLS, Tailwind CSS, Vitest, Testing Library

## Global Constraints

- Sharing is opt-in and available to every authenticated member of the recipe's household.
- `share_token` is nullable, unique, URL-safe, and contains at least 192 bits of cryptographic entropy.
- Disabling and later re-enabling sharing must generate a different URL.
- Archiving a recipe must invalidate its share URL permanently.
- Shared pages expose every recipe field, including notes and original source URL.
- Shared pages contain no application action buttons, forms, authenticated navigation, or account controls.
- Shared HTML must be server-rendered and contain Schema.org Recipe JSON-LD.
- Unknown, revoked, and archived tokens return the same `404`.
- Existing recipe RLS must not be weakened and anonymous table access must not be added.
- Shared pages must be uncached and excluded from indexing with both page metadata and `X-Robots-Tag`.
- Autonomous AI crawlers are disallowed on `/s/`; `ChatGPT-User` and `Claude-User` remain allowed.
- Preserve the user's untracked `AGENTS.md` and unrelated working-tree changes.
- After implementation and verification, commit and push to the current branch so Vercel deploys it.

---

## File Structure

- Create `supabase/migrations/015_recipe_sharing.sql` — database column and unique partial index.
- Modify `src/types/database.ts` — add `share_token` to recipe Row/Insert/Update types.
- Modify `src/components/recipe/RecipeCard.test.tsx` — add the new required Row field to its typed fixture.
- Modify `src/components/recipe/RecipeForm.test.tsx` — add the new required Row field to its typed fixture.
- Modify `src/app/(app)/recipes/[id]/page.test.tsx` — add the new required Row field to its typed fixture.
- Create `src/lib/recipes/share-token.ts` — cryptographically secure token generation.
- Create `src/lib/recipes/share-token.test.ts` — token format, entropy-length, and uniqueness tests.
- Create `src/app/api/recipes/[id]/share/route.ts` — authenticated enable/disable API.
- Create `src/app/api/recipes/[id]/share/route.test.ts` — API auth, lifecycle, RLS-shaped not-found, collision, and failure tests.
- Modify `src/app/api/recipes/[id]/route.ts` — clear token while archiving.
- Modify `src/app/api/recipes/[id]/route.test.ts` — regression test for archive revocation.
- Create `src/components/recipe/RecipeView.tsx` — action-free recipe presentation shared by authenticated and public pages.
- Create `src/components/recipe/RecipeView.test.tsx` — full-field rendering and absence-of-actions tests.
- Modify `src/app/(app)/recipes/[id]/page.tsx` — use `RecipeView` and add the authenticated sharing control.
- Modify `src/app/(app)/recipes/[id]/page.test.tsx` — preserve authenticated controls and pass initial sharing state.
- Create `src/lib/recipes/recipe-json-ld.ts` — map a Recipe row to Schema.org Recipe JSON-LD.
- Create `src/lib/recipes/recipe-json-ld.test.ts` — structured-data mapping tests.
- Create `src/app/s/[token]/page.tsx` — public exact-token server route and noindex metadata.
- Create `src/app/s/[token]/page.test.tsx` — active/invalid/archived lookup and public rendering tests.
- Create `src/components/recipe/ShareRecipeButton.tsx` — share modal and clipboard lifecycle.
- Create `src/components/recipe/ShareRecipeButton.test.tsx` — enable/copy/disable/error behavior.
- Modify `src/middleware.ts` — make `/s/*` public.
- Create `src/middleware.test.ts` — public-path regression tests.
- Create `src/app/robots.ts` — crawler-specific robots policy.
- Create `src/app/robots.test.ts` — autonomous versus user-directed crawler rules.
- Modify `next.config.mjs` — add `X-Robots-Tag` for `/s/:path*`.

---

### Task 1: Database Contract and Token Generator

**Files:**
- Create: `supabase/migrations/015_recipe_sharing.sql`
- Modify: `src/types/database.ts`
- Modify: `src/components/recipe/RecipeCard.test.tsx`
- Modify: `src/components/recipe/RecipeForm.test.tsx`
- Modify: `src/app/(app)/recipes/[id]/page.test.tsx`
- Create: `src/lib/recipes/share-token.ts`
- Test: `src/lib/recipes/share-token.test.ts`

**Interfaces:**
- Produces: `recipes.share_token: string | null`
- Produces: `createShareToken(): string`

- [ ] **Step 1: Write the failing token tests**

```ts
// src/lib/recipes/share-token.test.ts
import { describe, expect, it } from 'vitest'
import { createShareToken } from './share-token'

describe('createShareToken', () => {
  it('returns 24 random bytes encoded as 32 URL-safe characters', () => {
    const token = createShareToken()
    expect(token).toMatch(/^[A-Za-z0-9_-]{32}$/)
  })

  it('does not reuse tokens', () => {
    const tokens = new Set(Array.from({ length: 100 }, createShareToken))
    expect(tokens.size).toBe(100)
  })
})
```

- [ ] **Step 2: Run the test and verify the missing module failure**

Run: `npm test -- src/lib/recipes/share-token.test.ts`

Expected: FAIL because `./share-token` does not exist.

- [ ] **Step 3: Implement the token generator**

```ts
// src/lib/recipes/share-token.ts
import { randomBytes } from 'node:crypto'

export function createShareToken(): string {
  return randomBytes(24).toString('base64url')
}
```

- [ ] **Step 4: Add the database migration**

```sql
-- supabase/migrations/015_recipe_sharing.sql
ALTER TABLE public.recipes
  ADD COLUMN share_token TEXT;

CREATE UNIQUE INDEX recipes_share_token_unique
  ON public.recipes (share_token)
  WHERE share_token IS NOT NULL;
```

- [ ] **Step 5: Update generated-style database types manually**

Add `share_token: string | null` to `Database['public']['Tables']['recipes']['Row']`, and `share_token?: string | null` to both `Insert` and `Update` in `src/types/database.ts`.

- [ ] **Step 6: Verify the unit and type contracts**

Before type-checking, add `share_token: null` to every test fixture declared with `satisfies Recipe` or `: Recipe` in `RecipeCard.test.tsx`, `RecipeForm.test.tsx`, and the recipe detail page test.

Run: `npm test -- src/lib/recipes/share-token.test.ts && npm run type-check`

Expected: 2 tests PASS and TypeScript exits 0.

- [ ] **Step 7: Commit the database contract**

```bash
git add supabase/migrations/015_recipe_sharing.sql src/types/database.ts src/lib/recipes/share-token.ts src/lib/recipes/share-token.test.ts src/components/recipe/RecipeCard.test.tsx src/components/recipe/RecipeForm.test.tsx 'src/app/(app)/recipes/[id]/page.test.tsx'
git commit -m "feat: add recipe share tokens"
```

---

### Task 2: Authenticated Share Lifecycle API

**Files:**
- Create: `src/app/api/recipes/[id]/share/route.ts`
- Test: `src/app/api/recipes/[id]/share/route.test.ts`

**Interfaces:**
- Consumes: `createShareToken(): string`
- Produces: `POST /api/recipes/:id/share -> { share_token: string; share_url: string }`
- Produces: `DELETE /api/recipes/:id/share -> 204`

- [ ] **Step 1: Write failing API tests using the query-builder mock pattern from `src/app/api/recipes/[id]/route.test.ts`**

Cover these exact cases in `route.test.ts`:

```ts
it('returns 401 for unauthenticated POST')
it('returns 404 when POST cannot select the recipe through RLS')
it('returns the existing token without updating')
it('creates a token and an absolute /s/ URL')
it('retries a 23505 unique violation with a new token')
it('returns 500 after three token collisions')
it('returns 401 for unauthenticated DELETE')
it('clears an active token and returns 204')
it('returns 404 when DELETE cannot update the recipe through RLS')
```

Mock `createShareToken` with `vi.mock('@/lib/recipes/share-token')`; use deterministic values `token-one` through `token-four`. Assert the successful POST body exactly equals:

```ts
{
  share_token: 'token-one',
  share_url: 'https://dapcook.test/s/token-one',
}
```

- [ ] **Step 2: Run the route test and verify it fails because the route is missing**

Run: `npm test -- 'src/app/api/recipes/[id]/share/route.test.ts'`

Expected: FAIL resolving `./route`.

- [ ] **Step 3: Implement the route**

```ts
// src/app/api/recipes/[id]/share/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createShareToken } from '@/lib/recipes/share-token'
import { createClient } from '@/lib/supabase/server'

const MAX_TOKEN_ATTEMPTS = 3

function shareResponse(request: NextRequest, token: string) {
  return NextResponse.json({
    share_token: token,
    share_url: new URL(`/s/${token}`, request.nextUrl.origin).toString(),
  })
}

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: recipe, error: readError } = await supabase
    .from('recipes')
    .select('id, share_token')
    .eq('id', params.id)
    .maybeSingle()

  if (readError) return NextResponse.json({ error: 'Unable to share recipe' }, { status: 500 })
  if (!recipe) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (recipe.share_token) return shareResponse(request, recipe.share_token)

  for (let attempt = 0; attempt < MAX_TOKEN_ATTEMPTS; attempt += 1) {
    const token = createShareToken()
    const { data, error } = await supabase
      .from('recipes')
      .update({ share_token: token })
      .eq('id', params.id)
      .is('share_token', null)
      .select('share_token')
      .maybeSingle()

    if (data?.share_token) return shareResponse(request, data.share_token)
    if (error?.code === '23505') continue
    if (error) return NextResponse.json({ error: 'Unable to share recipe' }, { status: 500 })

    const { data: concurrent } = await supabase
      .from('recipes')
      .select('share_token')
      .eq('id', params.id)
      .maybeSingle()
    if (concurrent?.share_token) return shareResponse(request, concurrent.share_token)
  }

  return NextResponse.json({ error: 'Unable to share recipe' }, { status: 500 })
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await supabase
    .from('recipes')
    .update({ share_token: null })
    .eq('id', params.id)
    .select('id')
    .maybeSingle()

  if (error) return NextResponse.json({ error: 'Unable to disable sharing' }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return new NextResponse(null, { status: 204 })
}
```

- [ ] **Step 4: Run API tests and type-check**

Run: `npm test -- 'src/app/api/recipes/[id]/share/route.test.ts' && npm run type-check`

Expected: all share-route tests PASS and TypeScript exits 0.

- [ ] **Step 5: Commit the lifecycle API**

```bash
git add 'src/app/api/recipes/[id]/share/route.ts' 'src/app/api/recipes/[id]/share/route.test.ts'
git commit -m "feat: manage recipe share links"
```

---

### Task 3: Revoke Sharing When Archiving

**Files:**
- Modify: `src/app/api/recipes/[id]/route.ts`
- Test: `src/app/api/recipes/[id]/route.test.ts`

**Interfaces:**
- Consumes: `recipes.share_token`
- Produces: archive update `{ is_archived: true, share_token: null, updated_at: string }`

- [ ] **Step 1: Strengthen the existing archive regression test**

Update `it('sets is_archived=true on soft delete')` to assert both fields:

```ts
expect(updateArg.is_archived).toBe(true)
expect(updateArg.share_token).toBeNull()
```

- [ ] **Step 2: Run the regression test and observe the missing null assignment**

Run: `npm test -- 'src/app/api/recipes/[id]/route.test.ts'`

Expected: FAIL because `updateArg.share_token` is `undefined`.

- [ ] **Step 3: Clear the token in the archive update**

```ts
.update({
  is_archived: true,
  share_token: null,
  updated_at: new Date().toISOString(),
})
```

- [ ] **Step 4: Run the recipe API test**

Run: `npm test -- 'src/app/api/recipes/[id]/route.test.ts'`

Expected: all tests PASS.

- [ ] **Step 5: Commit archive revocation**

```bash
git add 'src/app/api/recipes/[id]/route.ts' 'src/app/api/recipes/[id]/route.test.ts'
git commit -m "fix: revoke recipe sharing on archive"
```

---

### Task 4: Action-Free Recipe Presentation and JSON-LD

**Files:**
- Create: `src/components/recipe/RecipeView.tsx`
- Test: `src/components/recipe/RecipeView.test.tsx`
- Create: `src/lib/recipes/recipe-json-ld.ts`
- Test: `src/lib/recipes/recipe-json-ld.test.ts`
- Modify: `src/app/(app)/recipes/[id]/page.tsx`
- Modify: `src/app/(app)/recipes/[id]/page.test.tsx`

**Interfaces:**
- Produces: `RecipeView({ recipe, toolbar }: { recipe: Recipe; toolbar?: ReactNode }): ReactElement`
- Produces: `buildRecipeJsonLd(recipe: Recipe): Record<string, unknown>`

- [ ] **Step 1: Write `RecipeView` tests with a fully populated recipe fixture**

The fixture must include image, title, tags, description, prep/cook times, servings, ingredients, steps, Markdown notes, and source URL. Assert all text is visible, the source link has the original URL, and these queries are absent:

```ts
expect(screen.queryByRole('button')).toBeNull()
expect(screen.queryByRole('link', { name: /edit|planner|share|copy|all recipes/i })).toBeNull()
expect(document.querySelector('form')).toBeNull()
```

- [ ] **Step 2: Write the JSON-LD mapping test**

```ts
expect(buildRecipeJsonLd(recipe)).toMatchObject({
  '@context': 'https://schema.org',
  '@type': 'Recipe',
  name: 'Tomato Pasta',
  description: 'Fast pasta',
  image: ['https://images.test/pasta.jpg'],
  prepTime: 'PT10M',
  cookTime: 'PT20M',
  totalTime: 'PT30M',
  recipeYield: '4 servings',
  keywords: 'quick, vegetarian',
  recipeIngredient: ['200 g pasta', '2 tomato, chopped'],
  recipeInstructions: [
    { '@type': 'HowToStep', position: 1, text: 'Boil pasta.' },
    { '@type': 'HowToStep', position: 2, text: 'Add tomato.' },
  ],
})
```

- [ ] **Step 3: Run both tests and verify the modules are missing**

Run: `npm test -- src/components/recipe/RecipeView.test.tsx src/lib/recipes/recipe-json-ld.test.ts`

Expected: FAIL resolving both modules.

- [ ] **Step 4: Extract the action-free recipe markup**

Move the hero image, title, tags, description, time/servings bar, ingredients, method, notes, and original-source blocks from the authenticated recipe page into `RecipeView.tsx`. Move `formatTime`, `TAG_COLORS`, and `tagColor` with that markup. Preserve the current toolbar position by accepting an optional server-provided toolbar between the hero and title. The exported boundary must be:

```tsx
import type { ReactNode } from 'react'
import type { Recipe } from '@/types/database'

interface RecipeViewProps {
  recipe: Recipe
  toolbar?: ReactNode
}

export function RecipeView({ recipe: r, toolbar }: RecipeViewProps) {
  const ingredients = (r.ingredients ?? []) as unknown as Ingredient[]
  const steps = (r.steps ?? []) as unknown as Step[]
  const totalTime = (r.prep_time_min ?? 0) + (r.cook_time_min ?? 0)
  const times = [
    formatTime(r.prep_time_min, 'Prep'),
    formatTime(r.cook_time_min, 'Cook'),
    totalTime > 0 ? formatTime(totalTime, 'Total') : null,
  ].filter(Boolean) as { label: string; time: string }[]
}
```

After these declarations, move the current page's complete JSX return into this function and replace the current `Back + Edit` block with `{toolbar}`. `RecipeView` itself must not create buttons, forms, or application navigation. The authenticated caller supplies the current toolbar; the public caller omits it. Keep the current Tailwind classes so the authenticated view does not visually regress.

- [ ] **Step 5: Implement the JSON-LD mapper**

```ts
// src/lib/recipes/recipe-json-ld.ts
import type { Recipe } from '@/types/database'
import type { Ingredient, Step } from '@/types/recipe'

function duration(minutes: number | null): string | undefined {
  return minutes && minutes > 0 ? `PT${minutes}M` : undefined
}

export function buildRecipeJsonLd(recipe: Recipe): Record<string, unknown> {
  const ingredients = recipe.ingredients as unknown as Ingredient[]
  const steps = recipe.steps as unknown as Step[]
  const total = (recipe.prep_time_min ?? 0) + (recipe.cook_time_min ?? 0)

  return {
    '@context': 'https://schema.org',
    '@type': 'Recipe',
    name: recipe.title,
    ...(recipe.description && { description: recipe.description }),
    ...(recipe.image_url && { image: [recipe.image_url] }),
    ...(duration(recipe.prep_time_min) && { prepTime: duration(recipe.prep_time_min) }),
    ...(duration(recipe.cook_time_min) && { cookTime: duration(recipe.cook_time_min) }),
    ...(duration(total) && { totalTime: duration(total) }),
    ...(recipe.servings && { recipeYield: `${recipe.servings} servings` }),
    ...(recipe.tags.length > 0 && { keywords: recipe.tags.join(', ') }),
    recipeIngredient: ingredients.map((ingredient) =>
      [ingredient.quantity, ingredient.unit, ingredient.name]
        .filter((part) => part !== null && part !== '')
        .join(' ') + (ingredient.notes ? `, ${ingredient.notes}` : '')
    ),
    recipeInstructions: steps.map((step, index) => ({
      '@type': 'HowToStep',
      position: index + 1,
      text: step.text,
    })),
    ...(recipe.source_url && { isBasedOn: recipe.source_url }),
  }
}
```

- [ ] **Step 6: Recompose the authenticated page**

Keep the existing `All recipes`, `AddToPlanButton`, and `Edit` controls in `page.tsx`, add the sharing control in Task 6, and pass that complete toolbar as the `toolbar` prop. Update the page fixture with `share_token: null`. Existing `Add to plan`/no-delete assertions must remain green.

- [ ] **Step 7: Run focused presentation tests**

Run: `npm test -- src/components/recipe/RecipeView.test.tsx src/lib/recipes/recipe-json-ld.test.ts 'src/app/(app)/recipes/[id]/page.test.tsx'`

Expected: all tests PASS.

- [ ] **Step 8: Commit the presentation boundary**

```bash
git add src/components/recipe/RecipeView.tsx src/components/recipe/RecipeView.test.tsx src/lib/recipes/recipe-json-ld.ts src/lib/recipes/recipe-json-ld.test.ts 'src/app/(app)/recipes/[id]/page.tsx' 'src/app/(app)/recipes/[id]/page.test.tsx'
git commit -m "refactor: share action-free recipe view"
```

---

### Task 5: Public Shared Recipe Route

**Files:**
- Create: `src/app/s/[token]/page.tsx`
- Test: `src/app/s/[token]/page.test.tsx`

**Interfaces:**
- Consumes: `RecipeView`, `buildRecipeJsonLd`, `createAdminClient()`
- Produces: anonymous `GET /s/:token` HTML
- Produces: `metadata.robots = { index: false, follow: false }`

- [ ] **Step 1: Write failing public-page tests**

Mock `createAdminClient`, `notFound`, and `RecipeView`. Test:

```ts
it('queries an exact token and requires is_archived=false')
it('renders RecipeView and Recipe JSON-LD for an active token')
it('calls notFound for an unknown token')
it('exports noindex and nofollow metadata')
```

For the query assertion, verify the builder receives `.eq('share_token', token)` and `.eq('is_archived', false)`. For JSON-LD, parse the `script[type="application/ld+json"]` text and compare it to `buildRecipeJsonLd(recipe)`.

- [ ] **Step 2: Run the test and verify the page is missing**

Run: `npm test -- 'src/app/s/[token]/page.test.tsx'`

Expected: FAIL resolving `./page`.

- [ ] **Step 3: Implement the public page**

```tsx
// src/app/s/[token]/page.tsx
import type { Metadata } from 'next'
import { unstable_noStore as noStore } from 'next/cache'
import { notFound } from 'next/navigation'
import { RecipeView } from '@/components/recipe/RecipeView'
import { buildRecipeJsonLd } from '@/lib/recipes/recipe-json-ld'
import { createAdminClient } from '@/lib/supabase/admin'
import type { Recipe } from '@/types/database'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Shared recipe | dapcook',
  robots: { index: false, follow: false },
}

export default async function SharedRecipePage({ params }: { params: { token: string } }) {
  noStore()
  const supabase = createAdminClient()
  const { data: recipe, error } = await supabase
    .from('recipes')
    .select('*')
    .eq('share_token', params.token)
    .eq('is_archived', false)
    .maybeSingle()

  if (error) throw new Error('Unable to load shared recipe')
  if (!recipe) notFound()

  const typedRecipe = recipe as Recipe
  const jsonLd = buildRecipeJsonLd(typedRecipe)

  return (
    <main>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c') }}
      />
      <RecipeView recipe={typedRecipe} />
    </main>
  )
}
```

- [ ] **Step 4: Run the public-page tests and type-check**

Run: `npm test -- 'src/app/s/[token]/page.test.tsx' && npm run type-check`

Expected: all tests PASS and TypeScript exits 0.

- [ ] **Step 5: Commit the public route**

```bash
git add 'src/app/s/[token]/page.tsx' 'src/app/s/[token]/page.test.tsx'
git commit -m "feat: render shared recipes publicly"
```

---

### Task 6: Authenticated Sharing Modal

**Files:**
- Create: `src/components/recipe/ShareRecipeButton.tsx`
- Test: `src/components/recipe/ShareRecipeButton.test.tsx`
- Modify: `src/app/(app)/recipes/[id]/page.tsx`
- Modify: `src/app/(app)/recipes/[id]/page.test.tsx`

**Interfaces:**
- Consumes: `POST` and `DELETE /api/recipes/:id/share`
- Produces: `ShareRecipeButton({ recipeId, initialShareToken }: { recipeId: string; initialShareToken: string | null })`

- [ ] **Step 1: Write failing interaction tests**

Use Testing Library and `userEvent` to cover:

```ts
it('opens in the disabled state and creates a share link')
it('opens in the enabled state with a selectable absolute URL')
it('copies the active URL and shows Copied')
it('keeps the URL selectable and shows an error when clipboard access fails')
it('disables sharing and returns to the create state')
it('shows a generic inline error when enable or disable fails')
it('closes on Escape and backdrop click')
```

Mock `window.location.origin` as `https://dapcook.test`, `fetch`, and `navigator.clipboard.writeText`. Assert the modal uses `role="dialog"` and `aria-modal="true"`.

- [ ] **Step 2: Run the component test and verify the module is missing**

Run: `npm test -- src/components/recipe/ShareRecipeButton.test.tsx`

Expected: FAIL resolving `./ShareRecipeButton`.

- [ ] **Step 3: Implement the sharing control**

Create a client component with these state fields:

```ts
const [open, setOpen] = useState(false)
const [shareToken, setShareToken] = useState(initialShareToken)
const [shareUrl, setShareUrl] = useState('')
const [loading, setLoading] = useState(false)
const [copied, setCopied] = useState(false)
const [error, setError] = useState<string | null>(null)
```

Populate the initial active URL only after hydration, avoiding a server-side `window` access:

```ts
useEffect(() => {
  setShareUrl(shareToken ? `${window.location.origin}/s/${shareToken}` : '')
}, [shareToken])
```

`handleEnable` sends `POST`, reads `{ share_token, share_url }`, and sets both values. `handleDisable` sends `DELETE` and clears both values only after a `204`. `handleCopy` awaits `navigator.clipboard.writeText(shareUrl)` and catches failures. Reset transient errors before each action. Add an Escape listener while open, close on backdrop mouse-down, and disable controls while loading.

The closed control is a `Share` button with the Lucide `Share2` icon. The modal copy must be:

- Disabled heading: `Share recipe`
- Disabled action: `Create share link`
- Enabled helper: `Anyone with this link can view the recipe.`
- Enabled actions: `Copy link` and `Disable sharing`

- [ ] **Step 4: Add the button only to the authenticated page**

Place it beside `AddToPlanButton` and `Edit`:

```tsx
<ShareRecipeButton recipeId={r.id} initialShareToken={r.share_token} />
```

Update the page test to assert `Share` is present. The public `RecipeView` test must continue to assert it is absent.

- [ ] **Step 5: Run focused UI tests**

Run: `npm test -- src/components/recipe/ShareRecipeButton.test.tsx src/components/recipe/RecipeView.test.tsx 'src/app/(app)/recipes/[id]/page.test.tsx'`

Expected: all tests PASS.

- [ ] **Step 6: Commit the authenticated UI**

```bash
git add src/components/recipe/ShareRecipeButton.tsx src/components/recipe/ShareRecipeButton.test.tsx 'src/app/(app)/recipes/[id]/page.tsx' 'src/app/(app)/recipes/[id]/page.test.tsx'
git commit -m "feat: add recipe sharing controls"
```

---

### Task 7: Public Routing and Crawler Controls

**Files:**
- Modify: `src/middleware.ts`
- Create: `src/middleware.test.ts`
- Create: `src/app/robots.ts`
- Test: `src/app/robots.test.ts`
- Modify: `next.config.mjs`

**Interfaces:**
- Produces: `/s/*` public-path classification
- Produces: `GET /robots.txt` crawler groups
- Produces: `X-Robots-Tag: noindex, nofollow` on `/s/:path*`

- [ ] **Step 1: Write failing middleware path tests**

Export `isPublicPath` for direct unit testing, then add:

```ts
expect(isPublicPath('/s/token')).toBe(true)
expect(isPublicPath('/s')).toBe(true)
expect(isPublicPath('/recipes/id')).toBe(false)
```

- [ ] **Step 2: Write failing robots policy tests**

```ts
import robots from './robots'

it('blocks autonomous AI crawlers from shared recipes', () => {
  const output = robots()
  const rules = Array.isArray(output.rules) ? output.rules : [output.rules]
  for (const agent of ['GPTBot', 'OAI-SearchBot', 'ClaudeBot', 'Claude-SearchBot']) {
    expect(rules).toContainEqual({ userAgent: agent, disallow: '/s/' })
  }
})

it('allows user-directed chatbot fetchers', () => {
  const output = robots()
  const rules = Array.isArray(output.rules) ? output.rules : [output.rules]
  expect(rules).toContainEqual({ userAgent: 'ChatGPT-User', allow: '/' })
  expect(rules).toContainEqual({ userAgent: 'Claude-User', allow: '/' })
})
```

- [ ] **Step 3: Run tests and observe failures**

Run: `npm test -- src/middleware.test.ts src/app/robots.test.ts`

Expected: FAIL because `/s` is not public and `robots.ts` is missing.

- [ ] **Step 4: Make the share route public**

```ts
const PUBLIC_PATHS = ['/login', '/auth/callback', '/join', '/onboarding', '/s']

export function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + '/'))
}
```

- [ ] **Step 5: Implement crawler-specific robots rules**

```ts
// src/app/robots.ts
import type { MetadataRoute } from 'next'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      { userAgent: '*', allow: '/' },
      { userAgent: 'GPTBot', disallow: '/s/' },
      { userAgent: 'OAI-SearchBot', disallow: '/s/' },
      { userAgent: 'ClaudeBot', disallow: '/s/' },
      { userAgent: 'Claude-SearchBot', disallow: '/s/' },
      { userAgent: 'ChatGPT-User', allow: '/' },
      { userAgent: 'Claude-User', allow: '/' },
    ],
  }
}
```

- [ ] **Step 6: Add the response header**

Preserve `experimental.staleTimes` and extend the config:

```js
const nextConfig = {
  experimental: {
    staleTimes: { dynamic: 0 },
  },
  async headers() {
    return [
      {
        source: '/s/:path*',
        headers: [
          { key: 'X-Robots-Tag', value: 'noindex, nofollow' },
        ],
      },
    ]
  },
}
```

- [ ] **Step 7: Run routing tests and a production build**

Run: `npm test -- src/middleware.test.ts src/app/robots.test.ts && npm run build`

Expected: tests PASS; build exits 0 and lists `/robots.txt` plus `/s/[token]`.

- [ ] **Step 8: Commit crawler controls**

```bash
git add src/middleware.ts src/middleware.test.ts src/app/robots.ts src/app/robots.test.ts next.config.mjs
git commit -m "feat: keep shared recipes unlisted"
```

---

### Task 8: Full Verification, Deployment, and Smoke Test

**Files:**
- Modify only files required by failures found in this task.

**Interfaces:**
- Consumes: all previous task outputs.
- Produces: verified and deployed unlisted recipe sharing.

- [ ] **Step 1: Run the complete automated suite**

Run: `npm test`

Expected: all Vitest suites PASS.

- [ ] **Step 2: Run static verification**

Run: `npm run type-check && npm run lint && npm run build`

Expected: every command exits 0.

- [ ] **Step 3: Inspect the final diff and working tree**

Run: `git -C /Users/vacuumlabs/Developer/dapcook diff --check && git -C /Users/vacuumlabs/Developer/dapcook status --short`

Expected: no whitespace errors; only intended files or the user's pre-existing untracked `AGENTS.md` appear.

- [ ] **Step 4: Commit any verification fixes**

Stage only the specific feature files changed to fix the failing verification command, then commit them with `git commit -m "fix: address recipe sharing verification"`. Do not stage the user's untracked `AGENTS.md` or unrelated changes.

Skip this commit when Step 1 and Step 2 required no changes.

- [ ] **Step 5: Push the current branch for Vercel**

Run: `git -C /Users/vacuumlabs/Developer/dapcook push origin main`

Expected: push succeeds and Vercel starts a deployment from `main`.

- [ ] **Step 6: Smoke-test the Vercel deployment**

Using a real recipe:

1. Create a share link as an authenticated household member.
2. Open it in a private browser and verify every recipe field is present with no action buttons or app navigation.
3. View page source and verify recipe content plus `application/ld+json` exist without client rendering.
4. Assign the generated URL to `recipe_share_url`, run `curl -I "$recipe_share_url"`, and verify `X-Robots-Tag: noindex, nofollow`.
5. Fetch `/robots.txt` and verify the four autonomous crawler groups disallow `/s/`, while `ChatGPT-User` and `Claude-User` allow `/`.
6. Paste the link into ChatGPT and Claude and ask each to state the title and first ingredient.
7. Disable sharing and verify the old URL immediately returns `404`.
8. Re-enable sharing and verify the new URL works while the old one remains `404`.

- [ ] **Step 7: Report deployment evidence**

Record the pushed commit, Vercel deployment URL, automated command results, header check, robots check, revocation result, and chatbot-read results in the task handoff. Do not claim chatbot compatibility if either provider could not retrieve the page; report the exact provider and observed behavior.
