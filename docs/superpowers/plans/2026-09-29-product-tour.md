# Product Tour & Activation Milestones Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Contextual spotlight tours for recipe → plan → shopping, plus PostHog activation milestone events.

**Architecture:** A small custom tour engine (`src/components/tour/`). A `TourProvider` holds which tours are seen and which one is active, and renders a portaled `TourOverlay` (box-shadow spotlight plus tooltip) against `data-tour="…"` targets. Feature components call `useTour(id, condition)`. Seen tours persist in `profiles.tours_seen` through an idempotent RPC behind `PATCH /api/profile`. Milestones go through one `trackMilestone` helper that adds `$set_once` first-occurrence person properties.

**Tech Stack:** Next.js 14 App Router, React 18, Tailwind, next-intl, posthog-js, Supabase, Vitest + Testing Library.

**Spec:** `docs/superpowers/specs/2026-09-29-product-tour-design.md`

**Conventions to know:**
- Run a single test file: `npx vitest run <path>`. Full suite: `npm test`. Types: `npm run type-check`.
- Component tests mock `next-intl` with `mockTranslate` from `@/test/mockMessages`. It auto-loads every `messages/en/*.json`, so a new namespace file is picked up automatically.
- The `posthog-js/react` mock pattern is `const mockCapture = vi.fn()` plus `vi.mock('posthog-js/react', () => ({ usePostHog: () => ({ capture: mockCapture }) }))`.
- Slovak copy uses formal address (vykanie).
- All tour hooks work **without** a provider (they become no-ops), so existing component tests don't need a `TourProvider`.
- Target lookup picks the **first visible** element carrying the `data-tour` value (`getClientRects().length > 0`). Putting the same attribute on every row or card is intended: the first visible one is the anchor, and the hidden desktop/mobile duplicates are ignored.
- Commit trailer on every commit: `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- This is a big feature. Work on a feature branch (`feat/product-tour`), merge it into `staging` for testing, and never push straight to `main`.

---

## File Structure

**Create**
- `supabase/migrations/023_tours_seen.sql`: column plus the `mark_tour_seen` RPC.
- `src/lib/tours/ids.ts`: `TOUR_IDS`, `TourId`, `isTourId`. Server-safe, so the API route imports it.
- `src/lib/analytics/milestones.ts` (+ `.test.ts`): `trackMilestone`.
- `src/components/tour/tours.ts`: declarative step definitions.
- `src/components/tour/placement.ts` (+ `.test.ts`): pure tooltip positioning.
- `src/components/tour/TourProvider.tsx` (+ `.test.tsx`): context, state machine, persistence, hooks.
- `src/components/tour/TourOverlay.tsx` (+ `.test.tsx`): target resolution, spotlight, tooltip.
- `src/components/tour/useIsDesktop.ts`: `matchMedia('(min-width: 768px)')`.
- `messages/en/tour.json`, `messages/sk/tour.json`.

**Modify**
- `src/types/database.ts`: `tours_seen` and the `mark_tour_seen` function type.
- `src/app/api/profile/route.ts` (+ test): `tour_seen`.
- `src/app/dev/login/route.ts` (+ test): `?fresh=1` also resets `tours_seen`.
- `src/i18n/request.ts`: register the `tour` namespace.
- `src/app/(app)/layout.tsx`, `src/app/(flow)/layout.tsx`: mount `TourProvider`.
- `src/components/recipe/RecipeForm.tsx` (+ test), `AddToPlanButton.tsx` (+ test), `AddToPlanPicker.tsx`.
- `src/components/planner/PlannerClient.tsx` (+ test), `MobileEditList.tsx`, `PlannerDesktopGrid.tsx`, `SlotCard.tsx`, `CustomLabelCard.tsx`, `ResizeHandle.tsx`.
- `src/components/shopping/GenerateShoppingPage.tsx` (+ test), `ShoppingPlanBox.tsx`, `ShoppingItemRow.tsx`, `ShoppingClient.tsx` (+ test).

---

### Task 0: Branch

- [ ] **Step 1: Create the feature branch from the current worktree HEAD**

```bash
git -C /Users/vacuumlabs/Developer/dapcook/.claude/worktrees/jolly-wiles-66356d switch -c feat/product-tour
```

---

### Task 1: Migration, DB types, tour ids

**Files:**
- Create: `supabase/migrations/023_tours_seen.sql`
- Create: `src/lib/tours/ids.ts`
- Modify: `src/types/database.ts` (profiles Row/Insert/Update, Functions)

- [ ] **Step 1: Write the migration**

`supabase/migrations/023_tours_seen.sql`:

```sql
-- Product tours a user has completed or skipped, so each one shows only once.
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS tours_seen TEXT[] NOT NULL DEFAULT '{}';

-- Appends one tour id for the caller, only if it is not there yet. Running it
-- server-side means two tabs can never overwrite each other's list.
-- SECURITY INVOKER: the profile_update_own RLS policy still applies.
CREATE OR REPLACE FUNCTION public.mark_tour_seen(p_tour TEXT) RETURNS void
LANGUAGE sql SECURITY INVOKER SET search_path = public
AS $$
  UPDATE profiles
    SET tours_seen = array_append(tours_seen, p_tour)
  WHERE id = auth.uid() AND NOT (p_tour = ANY(tours_seen));
$$;
```

- [ ] **Step 2: Write the tour ids module**

`src/lib/tours/ids.ts`:

```ts
/** Every product tour. Stored in profiles.tours_seen once completed or skipped. */
export const TOUR_IDS = [
  'plan-recipe',
  'planner-mobile-view',
  'planner-mobile-edit',
  'planner-desktop',
  'shopping-generate',
  'shopping-list',
] as const

export type TourId = (typeof TOUR_IDS)[number]

export function isTourId(value: unknown): value is TourId {
  return typeof value === 'string' && (TOUR_IDS as readonly string[]).includes(value)
}
```

- [ ] **Step 3: Update DB types**

In `src/types/database.ts`, add `tours_seen: string[]` to `profiles.Row` (after `ui_language`), and `tours_seen?: string[]` to `profiles.Insert` and `profiles.Update`. In `Functions`, after `delete_tag`, add:

```ts
      mark_tour_seen: {
        Args: { p_tour: string }
        Returns: void
      }
```

- [ ] **Step 4: Type-check**

Run: `npm run type-check`
Expected: PASS. If any test fixture builds a full `Profile` object literal, add `tours_seen: []` to it.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/023_tours_seen.sql src/lib/tours/ids.ts src/types/database.ts
git commit -m "feat(tour): tours_seen column and mark_tour_seen RPC"
```

---

### Task 2: `PATCH /api/profile` accepts `tour_seen`

**Files:**
- Modify: `src/app/api/profile/route.ts`
- Test: `src/app/api/profile/route.test.ts`

- [ ] **Step 1: Add `rpc` to the test's Supabase mock and write the failing tests**

In `makeSupabase` in `route.test.ts`, add `rpc: vi.fn().mockResolvedValue({ error: null }),` next to `from`. Append these tests inside `describe('PATCH /api/profile', …)`:

```ts
  it('marks a tour seen through the idempotent RPC without a profile update', async () => {
    const supabase = makeSupabase()
    vi.mocked(createClient).mockReturnValue(supabase as unknown as ReturnType<typeof createClient>)

    const res = await PATCH(req({ tour_seen: 'plan-recipe' }))
    expect(res.status).toBe(200)
    expect(supabase.rpc).toHaveBeenCalledWith('mark_tour_seen', { p_tour: 'plan-recipe' })
    expect(supabase.from).not.toHaveBeenCalled()
  })

  it('rejects an unknown tour id', async () => {
    const supabase = makeSupabase()
    vi.mocked(createClient).mockReturnValue(supabase as unknown as ReturnType<typeof createClient>)

    const res = await PATCH(req({ tour_seen: 'nope' }))
    expect(res.status).toBe(400)
    expect(supabase.rpc).not.toHaveBeenCalled()
  })

  it('returns 500 when the RPC fails', async () => {
    const supabase = makeSupabase()
    supabase.rpc.mockResolvedValue({ error: { message: 'boom' } })
    vi.mocked(createClient).mockReturnValue(supabase as unknown as ReturnType<typeof createClient>)

    const res = await PATCH(req({ tour_seen: 'shopping-list' }))
    expect(res.status).toBe(500)
  })
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/app/api/profile/route.test.ts`
Expected: the 3 new tests FAIL. The first two get 400 "Nothing to update".

- [ ] **Step 3: Implement**

Replace the body of `PATCH` in `src/app/api/profile/route.ts` with the following, keeping the imports and adding `import { isTourId } from '@/lib/tours/ids'`:

```ts
export async function PATCH(request: NextRequest) {
  const supabase = createClient()
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json() as {
    default_recipe_filter?: unknown
    ui_language?: unknown
    tour_seen?: unknown
  }

  if (body.default_recipe_filter === undefined && body.ui_language === undefined && body.tour_seen === undefined) {
    return NextResponse.json({ error: 'Nothing to update' }, { status: 400 })
  }

  if (body.tour_seen !== undefined && !isTourId(body.tour_seen)) {
    return NextResponse.json({ error: 'tour_seen must be a known tour id' }, { status: 400 })
  }

  const update: ProfileUpdate = {}

  if (body.default_recipe_filter !== undefined) {
    if (
      !Array.isArray(body.default_recipe_filter) ||
      !body.default_recipe_filter.every((v) => typeof v === 'string')
    ) {
      return NextResponse.json({ error: 'default_recipe_filter must be an array of strings' }, { status: 400 })
    }
    update.default_recipe_filter = body.default_recipe_filter
  }

  if (body.ui_language !== undefined) {
    const candidate = typeof body.ui_language === 'string' ? body.ui_language : undefined
    if (!isLocale(candidate)) {
      return NextResponse.json({ error: 'ui_language must be one of: ' + locales.join(', ') }, { status: 400 })
    }
    update.ui_language = candidate
  }

  if (Object.keys(update).length > 0) {
    const { error } = await supabase
      .from('profiles')
      .update(update)
      .eq('id', user.id)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }

  if (isTourId(body.tour_seen)) {
    const { error } = await supabase.rpc('mark_tour_seen', { p_tour: body.tour_seen })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/app/api/profile/route.test.ts`
Expected: all PASS, old and new.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/profile
git commit -m "feat(tour): persist seen tours via PATCH /api/profile"
```

---

### Task 3: Dev login `?fresh=1` resets tours

**Files:**
- Modify: `src/app/dev/login/route.ts:66`
- Test: `src/app/dev/login/route.test.ts:79`

- [ ] **Step 1: Update the test expectation**

In `src/app/dev/login/route.test.ts`, change line 79 to:

```ts
    expect(mocks.adminUpdate).toHaveBeenCalledWith({ household_id: null, ui_language: 'en', tours_seen: [] })
```

- [ ] **Step 2: Run it and verify it fails**

Run: `npx vitest run src/app/dev/login/route.test.ts`
Expected: FAIL (`tours_seen` missing).

- [ ] **Step 3: Implement**

In `src/app/dev/login/route.ts` line 66:

```ts
    await admin.from('profiles').update({ household_id: null, ui_language: 'en', tours_seen: [] }).eq('id', userId)
```

Also update `CLAUDE.md`. The `?fresh=1` bullet should read: "detach the dev user from its household (and reset its language to English and its seen product tours) and open `/onboarding`…".

- [ ] **Step 4: Run it and verify it passes**

Run: `npx vitest run src/app/dev/login/route.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/app/dev/login CLAUDE.md
git commit -m "feat(tour): dev fresh login resets seen tours"
```

---

### Task 4: `trackMilestone` helper

**Files:**
- Create: `src/lib/analytics/milestones.ts`
- Test: `src/lib/analytics/milestones.test.ts`

- [ ] **Step 1: Write the failing test**

`src/lib/analytics/milestones.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { trackMilestone } from './milestones'

describe('trackMilestone', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-29T10:00:00.000Z'))
  })
  afterEach(() => vi.useRealTimers())

  it('captures the event with its props and a first-occurrence person property', () => {
    const capture = vi.fn()
    trackMilestone({ capture }, 'meal_planned', { source: 'recipe', kind: 'recipe' })
    expect(capture).toHaveBeenCalledWith('meal_planned', {
      source: 'recipe',
      kind: 'recipe',
      $set_once: { first_meal_planned_at: '2026-09-29T10:00:00.000Z' },
    })
  })

  it('works without props', () => {
    const capture = vi.fn()
    trackMilestone({ capture }, 'shopping_item_checked')
    expect(capture).toHaveBeenCalledWith('shopping_item_checked', {
      $set_once: { first_shopping_item_checked_at: '2026-09-29T10:00:00.000Z' },
    })
  })
})
```

- [ ] **Step 2: Run it and verify it fails**

Run: `npx vitest run src/lib/analytics/milestones.test.ts`
Expected: FAIL, "Cannot find module './milestones'".

- [ ] **Step 3: Implement**

`src/lib/analytics/milestones.ts`:

```ts
import type { PostHog } from 'posthog-js'

/** Activation funnel: recipe → planned meal → generated list → shopping. */
export type MilestoneEvent =
  | 'recipe_created'
  | 'meal_planned'
  | 'shopping_list_generated'
  | 'shopping_item_checked'

/**
 * Captures a milestone event and records when the person first reached it
 * (`first_<event>_at`, set once) so activated users can be filtered as a cohort.
 */
export function trackMilestone(
  posthog: Pick<PostHog, 'capture'>,
  event: MilestoneEvent,
  props: Record<string, string | number> = {},
) {
  posthog.capture(event, {
    ...props,
    $set_once: { [`first_${event}_at`]: new Date().toISOString() },
  })
}
```

- [ ] **Step 4: Run it and verify it passes**

Run: `npx vitest run src/lib/analytics/milestones.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/analytics
git commit -m "feat(analytics): trackMilestone helper with first-occurrence person props"
```

---

### Task 5: Wire milestones: `recipe_created` and `meal_planned`

**Files:**
- Modify: `src/components/recipe/RecipeForm.tsx:127`
- Modify: `src/components/planner/PlannerClient.tsx` (`handleAddRecipe`, `handleAddCustom`)
- Modify: `src/components/recipe/AddToPlanPicker.tsx` (`handleAdd`)
- Test: `src/components/recipe/RecipeForm.test.tsx:301-317`, `src/components/planner/PlannerClient.test.tsx`, `src/components/recipe/AddToPlanButton.test.tsx`

- [ ] **Step 1: Update and add the failing tests**

In `RecipeForm.test.tsx`, replace the `describe('PostHog events', …)` block with:

```ts
describe('PostHog events', () => {
  it('captures recipe_created with source manual after saving a new recipe', async () => {
    mockFetchSuccess('recipe-456')
    render(<RecipeForm />)
    await userEvent.type(screen.getByLabelText(/title/i), 'New Recipe')
    await userEvent.click(screen.getByRole('button', { name: /save recipe/i }))
    await waitFor(() =>
      expect(mockCapture).toHaveBeenCalledWith('recipe_created', expect.objectContaining({ source: 'manual' })),
    )
  })

  it('does not capture recipe_created when editing an existing recipe', async () => {
    mockFetchSuccess('r-1')
    render(<RecipeForm recipe={sampleRecipe} />)
    await userEvent.click(screen.getByRole('button', { name: /^save$/i }))
    await waitFor(() => expect(mockPush).toHaveBeenCalled())
    expect(mockCapture).not.toHaveBeenCalledWith('recipe_created', expect.anything())
  })
})
```

If the file already has a draft/import-mode save test, add a sibling assertion for `expect.objectContaining({ source: 'import' })`. If not, skip it; the ternary is trivial.

In `PlannerClient.test.tsx`, replace the posthog mock with a shared spy:

```ts
const mockCapture = vi.fn()
vi.mock('posthog-js/react', () => ({
  usePostHog: () => ({ capture: mockCapture }),
}))
```

and at the end of the existing `it('adds a meal by date', …)` test, after its current assertions, add:

```ts
    await waitFor(() =>
      expect(mockCapture).toHaveBeenCalledWith(
        'meal_planned',
        expect.objectContaining({ source: 'planner', kind: 'custom' }),
      ),
    )
```

In `AddToPlanButton.test.tsx`, add a posthog mock under the `next-intl` mock:

```ts
const mockCapture = vi.fn()
vi.mock('posthog-js/react', () => ({
  usePostHog: () => ({ capture: mockCapture }),
}))
```

and a new test inside `describe('AddToPlanButton', …)`. Return a slot id so the success path runs:

```ts
  it('captures meal_planned with source recipe after adding from the picker', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ id: 'slot-1' }) } as Response)
    render(<AddToPlanButton recipeId="recipe-1" />)

    await userEvent.click(screen.getByRole('button', { name: /add to plan/i }))
    await userEvent.click(await screen.findByRole('button', { name: /add to \w+ \d+/i }))

    await waitFor(() =>
      expect(mockCapture).toHaveBeenCalledWith(
        'meal_planned',
        expect.objectContaining({ source: 'recipe', kind: 'recipe' }),
      ),
    )
  })
```

- [ ] **Step 2: Run them and verify they fail**

Run: `npx vitest run src/components/recipe/RecipeForm.test.tsx src/components/planner/PlannerClient.test.tsx src/components/recipe/AddToPlanButton.test.tsx`
Expected: the 3 new/changed assertions FAIL.

- [ ] **Step 3: Implement**

`RecipeForm.tsx`: add `import { trackMilestone } from '@/lib/analytics/milestones'`, and replace line 127:

```ts
    if (!isEdit) trackMilestone(posthog, 'recipe_created', { source: draft ? 'import' : 'manual' })
```

`PlannerClient.tsx`: add `import { trackMilestone } from '@/lib/analytics/milestones'`. In `handleAddRecipe`, replace `posthog.capture('meal_planned')` with:

```ts
      trackMilestone(posthog, 'meal_planned', { source: 'planner', kind: 'recipe' })
```

In `handleAddCustom`, inside `if (res.ok) {`, after `setSlotsAndCache(...)`:

```ts
      trackMilestone(posthog, 'meal_planned', { source: 'planner', kind: 'custom' })
```

`AddToPlanPicker.tsx`: add the imports

```ts
import { usePostHog } from 'posthog-js/react'
import { trackMilestone } from '@/lib/analytics/milestones'
```

add `const posthog = usePostHog()` after `const router = useRouter()`, and in `handleAdd`, inside `if (res.ok) {` as its first statement:

```ts
      // "Change" re-places the same meal; only the first placement counts as planning.
      if (!placed) trackMilestone(posthog, 'meal_planned', { source: 'recipe', kind: 'recipe' })
```

- [ ] **Step 4: Run them and verify they pass**

Run: `npx vitest run src/components/recipe/RecipeForm.test.tsx src/components/planner/PlannerClient.test.tsx src/components/recipe/AddToPlanButton.test.tsx`
Expected: all PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/recipe src/components/planner/PlannerClient.tsx src/components/planner/PlannerClient.test.tsx
git commit -m "feat(analytics): source props on recipe_created/meal_planned, track planning from recipes"
```

---

### Task 6: Wire milestones: `shopping_list_generated` and `shopping_item_checked`

**Files:**
- Modify: `src/components/shopping/GenerateShoppingPage.tsx` (`handleAdd`)
- Modify: `src/components/shopping/ShoppingClient.tsx:136` (`handleCheck`)
- Test: `src/components/shopping/GenerateShoppingPage.test.tsx`, `src/components/shopping/ShoppingClient.test.tsx`

- [ ] **Step 1: Write the failing tests**

In `GenerateShoppingPage.test.tsx`, add a posthog mock next to the other `vi.mock` calls:

```ts
const mockCapture = vi.fn()
vi.mock('posthog-js/react', () => ({
  usePostHog: () => ({ capture: mockCapture }),
}))
```

Then add a test next to `'leaves checked ingredients out and adds the rest to the list'`. Reuse that test's render and "add" interaction verbatim (the same props/fixture and the same click on the add button), and assert:

```ts
    await waitFor(() =>
      expect(mockCapture).toHaveBeenCalledWith(
        'shopping_list_generated',
        expect.objectContaining({ item_count: expect.any(Number), recipe_count: expect.any(Number), removed_recipe_count: 0 }),
      ),
    )
```

In `ShoppingClient.test.tsx`, which already has `mockCapture`, add a test that renders with at least one unchecked item. Use the same fixture/render helper as `'shows Clear list button when list has items'`. Click the item's checkbox, then:

```ts
    await waitFor(() => expect(mockCapture).toHaveBeenCalledWith('shopping_item_checked', expect.anything()))
```

The row animates before calling `onCheck` (350 ms + 250 ms). Use `vi.useFakeTimers({ shouldAdvanceTime: true })` and `act(() => vi.advanceTimersByTime(700))` before the assertion, or `waitFor` with `{ timeout: 1500 }`.

- [ ] **Step 2: Run them and verify they fail**

Run: `npx vitest run src/components/shopping/GenerateShoppingPage.test.tsx src/components/shopping/ShoppingClient.test.tsx`
Expected: the 2 new tests FAIL.

- [ ] **Step 3: Implement**

`GenerateShoppingPage.tsx`: add the imports

```ts
import { usePostHog } from 'posthog-js/react'
import { trackMilestone } from '@/lib/analytics/milestones'
```

add `const posthog = usePostHog()` at the top of the component, and in `handleAdd`, right before `router.push('/shopping')`:

```ts
      trackMilestone(posthog, 'shopping_list_generated', {
        item_count: itemCount,
        recipe_count: entries.filter((e) => e.kind === 'recipe' && !e.removed).length,
        removed_recipe_count: entries.filter((e) => e.kind === 'recipe' && e.removed).length,
      })
```

`ShoppingClient.tsx`: add `import { trackMilestone } from '@/lib/analytics/milestones'`. In `handleCheck`, as the first line:

```ts
    if (checked) trackMilestone(posthog, 'shopping_item_checked')
```

- [ ] **Step 4: Run them and verify they pass**

Run: `npx vitest run src/components/shopping`
Expected: all PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/shopping
git commit -m "feat(analytics): shopping_list_generated and shopping_item_checked milestones"
```

---

### Task 7: Tour definitions and copy

**Files:**
- Create: `src/components/tour/tours.ts`
- Create: `messages/en/tour.json`, `messages/sk/tour.json`
- Modify: `src/i18n/request.ts`

- [ ] **Step 1: Write the definitions**

`src/components/tour/tours.ts`:

```ts
import type { TourId } from '@/lib/tours/ids'

export type Placement = 'top' | 'bottom' | 'left' | 'right'

export interface TourStep {
  /** Matches a `data-tour="…"` attribute; the first visible match is highlighted. */
  target: string
  /** Message key under the `tour` namespace; `.title` and `.body` are read. */
  key: string
  placement: Placement
  /** Clicking the highlighted element itself advances (or finishes) the tour. */
  advanceOnTargetClick?: boolean
}

export const TOURS: Record<TourId, TourStep[]> = {
  'plan-recipe': [
    { target: 'plan-button', key: 'planRecipe.planButton', placement: 'bottom', advanceOnTargetClick: true },
  ],
  'planner-mobile-view': [
    { target: 'planner-edit', key: 'plannerMobileView.edit', placement: 'bottom', advanceOnTargetClick: true },
  ],
  'planner-mobile-edit': [
    { target: 'edit-grip', key: 'plannerMobileEdit.grip', placement: 'bottom' },
    { target: 'edit-span', key: 'plannerMobileEdit.span', placement: 'bottom' },
    { target: 'edit-add', key: 'plannerMobileEdit.add', placement: 'top' },
    { target: 'planner-done', key: 'plannerMobileEdit.done', placement: 'bottom', advanceOnTargetClick: true },
  ],
  'planner-desktop': [
    { target: 'grid-slot', key: 'plannerDesktop.slot', placement: 'right' },
    { target: 'grid-resize', key: 'plannerDesktop.resize', placement: 'right' },
    { target: 'grid-add', key: 'plannerDesktop.add', placement: 'right' },
  ],
  'shopping-generate': [
    { target: 'item-name', key: 'shoppingGenerate.itemName', placement: 'bottom' },
    { target: 'item-delete', key: 'shoppingGenerate.itemDelete', placement: 'left' },
    { target: 'generate-portions', key: 'shoppingGenerate.portions', placement: 'top' },
    { target: 'generate-remove', key: 'shoppingGenerate.remove', placement: 'bottom' },
  ],
  'shopping-list': [
    { target: 'shopping-add', key: 'shoppingList.add', placement: 'top' },
  ],
}
```

- [ ] **Step 2: Write the English copy**

`messages/en/tour.json`:

```json
{
  "controls": {
    "next": "Next",
    "back": "Back",
    "done": "Done",
    "gotIt": "Got it",
    "skip": "Skip tour",
    "stepOf": "{current} / {total}"
  },
  "planRecipe": {
    "planButton": { "title": "Plan this recipe", "body": "Add it to a day in your weekly plan." }
  },
  "plannerMobileView": {
    "edit": { "title": "Edit your plan", "body": "Move meals, stretch them over several days or add your own items." }
  },
  "plannerMobileEdit": {
    "grip": { "title": "Drag to move", "body": "Hold and drag a meal to another day." },
    "span": { "title": "Cooking in batches?", "body": "Stretch a meal over multiple days." },
    "add": { "title": "Add anything", "body": "Search a recipe or type your own item, like “rice” or “eating out”." },
    "done": { "title": "All set?", "body": "Tap Done when you're finished." }
  },
  "plannerDesktop": {
    "slot": { "title": "Move meals", "body": "Drag a meal to another day." },
    "resize": { "title": "Cooking in batches?", "body": "Drag the edge to stretch a meal over multiple days." },
    "add": { "title": "Add anything", "body": "Add a recipe or your own item, like “rice” or “eating out”." }
  },
  "shoppingGenerate": {
    "itemName": { "title": "Adjust items", "body": "Tap an item to change its name or quantity." },
    "itemDelete": { "title": "Already have it at home?", "body": "Remove it from the list." },
    "portions": { "title": "Cooking for more people?", "body": "Change the portions and the quantities follow." },
    "remove": { "title": "Not cooking it this time?", "body": "Skip the whole recipe." }
  },
  "shoppingList": {
    "add": { "title": "Take this list to the store", "body": "Tick items off as they go into the cart. Add anything else here." }
  }
}
```

- [ ] **Step 3: Write the Slovak copy**

`messages/sk/tour.json`:

```json
{
  "controls": {
    "next": "Ďalej",
    "back": "Späť",
    "done": "Hotovo",
    "gotIt": "Rozumiem",
    "skip": "Preskočiť",
    "stepOf": "{current} / {total}"
  },
  "planRecipe": {
    "planButton": { "title": "Naplánujte si tento recept", "body": "Pridajte ho na niektorý deň do týždenného plánu." }
  },
  "plannerMobileView": {
    "edit": { "title": "Upravte si plán", "body": "Presúvajte jedlá, roztiahnite ich na viac dní alebo pridajte vlastné položky." }
  },
  "plannerMobileEdit": {
    "grip": { "title": "Presúvajte ťahaním", "body": "Podržte jedlo a potiahnite ho na iný deň." },
    "span": { "title": "Varíte do zásoby?", "body": "Roztiahnite jedlo na viac dní." },
    "add": { "title": "Pridajte čokoľvek", "body": "Vyhľadajte recept alebo napíšte vlastnú položku, napríklad „ryža“ alebo „jeme vonku“." },
    "done": { "title": "Hotovo?", "body": "Keď skončíte, ťuknite na Hotovo." }
  },
  "plannerDesktop": {
    "slot": { "title": "Presúvajte jedlá", "body": "Potiahnite jedlo na iný deň." },
    "resize": { "title": "Varíte do zásoby?", "body": "Potiahnutím okraja roztiahnete jedlo na viac dní." },
    "add": { "title": "Pridajte čokoľvek", "body": "Pridajte recept alebo vlastnú položku, napríklad „ryža“ alebo „jeme vonku“." }
  },
  "shoppingGenerate": {
    "itemName": { "title": "Upravte položky", "body": "Ťuknutím na položku zmeníte jej názov alebo množstvo." },
    "itemDelete": { "title": "Máte to už doma?", "body": "Odstráňte to zo zoznamu." },
    "portions": { "title": "Varíte pre viac ľudí?", "body": "Zmeňte počet porcií a množstvá sa prepočítajú." },
    "remove": { "title": "Tentoraz to nevaríte?", "body": "Vynechajte celý recept." }
  },
  "shoppingList": {
    "add": { "title": "Vezmite si zoznam do obchodu", "body": "Odškrtávajte položky, ktoré vložíte do košíka. Tu môžete pridať aj ďalšie." }
  }
}
```

- [ ] **Step 4: Register the namespace**

In `src/i18n/request.ts`, add `tour` to the destructured array and to the `Promise.all` list (`import(\`../../messages/${resolved}/tour.json\`)`), and add `tour: tour.default,` to `messages`.

- [ ] **Step 5: Type-check and commit**

Run: `npm run type-check`
Expected: PASS. If `src/types/next-intl.d.ts` derives message types from a fixed set of en files, add `tour.json` there too.

```bash
git add src/components/tour/tours.ts messages src/i18n/request.ts src/types/next-intl.d.ts
git commit -m "feat(tour): tour step definitions and en/sk copy"
```

---

### Task 8: Tooltip placement (pure function)

**Files:**
- Create: `src/components/tour/placement.ts`
- Test: `src/components/tour/placement.test.ts`

- [ ] **Step 1: Write the failing test**

`src/components/tour/placement.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { placeCard, GAP, GUTTER } from './placement'

const viewport = { width: 1000, height: 800 }
const card = { width: 288, height: 150 }

describe('placeCard', () => {
  it('places below and centred on the spotlight', () => {
    const spot = { top: 100, left: 400, width: 200, height: 40 }
    expect(placeCard(spot, 'bottom', viewport, card)).toEqual({ top: 140 + GAP, left: 500 - 144 })
  })

  it('flips to top when there is no room below', () => {
    const spot = { top: 700, left: 400, width: 200, height: 40 }
    expect(placeCard(spot, 'bottom', viewport, card).top).toBe(700 - GAP - 150)
  })

  it('flips to bottom when there is no room above', () => {
    const spot = { top: 20, left: 400, width: 200, height: 40 }
    expect(placeCard(spot, 'top', viewport, card).top).toBe(60 + GAP)
  })

  it('falls back from right to left, then to bottom', () => {
    const nearRight = { top: 300, left: 800, width: 150, height: 100 }
    expect(placeCard(nearRight, 'right', viewport, card).left).toBe(800 - GAP - 288)

    const phone = { width: 375, height: 800 }
    const wide = { top: 300, left: 16, width: 343, height: 60 }
    expect(placeCard(wide, 'right', phone, card).top).toBe(360 + GAP)
  })

  it('clamps inside the viewport gutter', () => {
    const spot = { top: 100, left: 0, width: 40, height: 40 }
    expect(placeCard(spot, 'bottom', viewport, card).left).toBe(GUTTER)
  })
})
```

- [ ] **Step 2: Run it and verify it fails**

Run: `npx vitest run src/components/tour/placement.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement**

`src/components/tour/placement.ts`:

```ts
import type { Placement } from './tours'

export const GAP = 12
export const GUTTER = 16

export interface Box { top: number; left: number; width: number; height: number }
interface Size { width: number; height: number }

const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(v, max))

/** Tooltip position next to the spotlight: preferred side, flipped when it would overflow. */
export function placeCard(spot: Box, placement: Placement, viewport: Size, card: Size): { top: number; left: number } {
  const fitsBelow = spot.top + spot.height + GAP + card.height <= viewport.height - GUTTER
  const fitsAbove = spot.top - GAP - card.height >= GUTTER
  const fitsRight = spot.left + spot.width + GAP + card.width <= viewport.width - GUTTER
  const fitsLeft = spot.left - GAP - card.width >= GUTTER

  let side = placement
  if (side === 'right' && !fitsRight) side = fitsLeft ? 'left' : 'bottom'
  if (side === 'left' && !fitsLeft) side = fitsRight ? 'right' : 'bottom'
  if (side === 'bottom' && !fitsBelow && fitsAbove) side = 'top'
  if (side === 'top' && !fitsAbove && fitsBelow) side = 'bottom'

  const centreLeft = spot.left + spot.width / 2 - card.width / 2
  const centreTop = spot.top + spot.height / 2 - card.height / 2
  const pos =
    side === 'bottom' ? { top: spot.top + spot.height + GAP, left: centreLeft }
    : side === 'top' ? { top: spot.top - GAP - card.height, left: centreLeft }
    : side === 'right' ? { top: centreTop, left: spot.left + spot.width + GAP }
    : { top: centreTop, left: spot.left - GAP - card.width }

  return {
    top: clamp(pos.top, GUTTER, viewport.height - GUTTER - card.height),
    left: clamp(pos.left, GUTTER, viewport.width - GUTTER - card.width),
  }
}
```

- [ ] **Step 4: Run it and verify it passes**

Run: `npx vitest run src/components/tour/placement.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/tour/placement.ts src/components/tour/placement.test.ts
git commit -m "feat(tour): tooltip placement with viewport flipping"
```

---

### Task 9: `TourOverlay`

**Files:**
- Create: `src/components/tour/TourOverlay.tsx`
- Test: `src/components/tour/TourOverlay.test.tsx`

- [ ] **Step 1: Write the failing test**

`src/components/tour/TourOverlay.test.tsx`:

```tsx
import { act, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TourOverlay, TARGET_TIMEOUT_MS } from './TourOverlay'
import { mockTranslate } from '@/test/mockMessages'
import type { TranslationValues } from 'use-intl'
import type { TourStep } from './tours'

vi.mock('next-intl', () => ({
  useTranslations: (namespace: string) => (key: string, values?: TranslationValues) =>
    mockTranslate(namespace, key, values),
}))

const step: TourStep = { target: 'plan-button', key: 'planRecipe.planButton', placement: 'bottom', advanceOnTargetClick: true }

function renderOverlay(overrides: Partial<Parameters<typeof TourOverlay>[0]> = {}) {
  const props = { step, stepIndex: 0, total: 1, onNext: vi.fn(), onBack: vi.fn(), onClose: vi.fn(), ...overrides }
  render(<TourOverlay {...props} />)
  return props
}

beforeEach(() => {
  // jsdom has no layout: make every element "visible" with a fixed rect.
  vi.spyOn(Element.prototype, 'getClientRects').mockReturnValue([{}] as unknown as DOMRectList)
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue(
    { top: 100, left: 100, width: 80, height: 32, right: 180, bottom: 132, x: 100, y: 100, toJSON: () => ({}) } as DOMRect,
  )
})
afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
  document.body.innerHTML = ''
})

function addTarget(name = 'plan-button') {
  const el = document.createElement('button')
  el.dataset.tour = name
  document.body.appendChild(el)
  return el
}

describe('TourOverlay', () => {
  it('shows the step copy next to a present target', async () => {
    addTarget()
    renderOverlay()
    expect(await screen.findByText('Plan this recipe')).toBeInTheDocument()
    expect(screen.getByText('Add it to a day in your weekly plan.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Got it' })).toBeInTheDocument()
  })

  it('shows the step counter, Back and Next in a multi-step tour', async () => {
    addTarget()
    const props = renderOverlay({ stepIndex: 1, total: 3 })
    expect(await screen.findByText('2 / 3')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Back' }))
    expect(props.onBack).toHaveBeenCalled()
    await userEvent.click(screen.getByRole('button', { name: 'Next' }))
    expect(props.onNext).toHaveBeenCalled()
  })

  it('waits for a target that mounts later', async () => {
    renderOverlay()
    expect(screen.queryByText('Plan this recipe')).not.toBeInTheDocument()
    act(() => { addTarget() })
    expect(await screen.findByText('Plan this recipe')).toBeInTheDocument()
  })

  it('advances past a target that never appears', () => {
    vi.useFakeTimers()
    const props = renderOverlay()
    act(() => { vi.advanceTimersByTime(TARGET_TIMEOUT_MS) })
    expect(props.onNext).toHaveBeenCalled()
  })

  it('advances when the target itself is clicked', async () => {
    const el = addTarget()
    const props = renderOverlay()
    await screen.findByText('Plan this recipe')
    fireEvent.click(el)
    expect(props.onNext).toHaveBeenCalled()
  })

  it('closes on Escape and on Skip', async () => {
    addTarget()
    const props = renderOverlay({ total: 2 })
    await screen.findByText('Plan this recipe')
    fireEvent.keyDown(document, { key: 'Escape' })
    await userEvent.click(screen.getByRole('button', { name: 'Skip tour' }))
    expect(props.onClose).toHaveBeenCalledTimes(2)
  })
})
```

- [ ] **Step 2: Run it and verify it fails**

Run: `npx vitest run src/components/tour/TourOverlay.test.tsx`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement**

`src/components/tour/TourOverlay.tsx`:

```tsx
'use client'

import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslations } from 'next-intl'
import { placeCard, GUTTER } from './placement'
import type { TourStep } from './tours'

/** How long to wait for a step's target to mount before skipping the step. */
export const TARGET_TIMEOUT_MS = 1000
const SPOT_PADDING = 6
const CARD_WIDTH = 288
const CARD_EST_HEIGHT = 150

/** First element carrying the data-tour value that is actually rendered (not display:none). */
function findTarget(target: string): HTMLElement | null {
  const els = document.querySelectorAll<HTMLElement>(`[data-tour="${target}"]`)
  for (const el of Array.from(els)) if (el.getClientRects().length > 0) return el
  return null
}

interface TourOverlayProps {
  step: TourStep
  stepIndex: number
  total: number
  onNext: () => void
  onBack: () => void
  onClose: () => void
}

export function TourOverlay({ step, stepIndex, total, onNext, onBack, onClose }: TourOverlayProps) {
  const t = useTranslations('tour')
  const [target, setTarget] = useState<HTMLElement | null>(null)
  const [rect, setRect] = useState<DOMRect | null>(null)
  const cardRef = useRef<HTMLDivElement>(null)
  const [cardHeight, setCardHeight] = useState(CARD_EST_HEIGHT)

  // Resolve the target, waiting briefly for it to mount; never trap the user on a missing one.
  useEffect(() => {
    const found = findTarget(step.target)
    if (found) {
      setTarget(found)
      return
    }
    const observer = new MutationObserver(() => {
      const el = findTarget(step.target)
      if (el) {
        observer.disconnect()
        clearTimeout(timer)
        setTarget(el)
      }
    })
    observer.observe(document.body, { childList: true, subtree: true, attributes: true })
    const timer = setTimeout(() => {
      observer.disconnect()
      onNext()
    }, TARGET_TIMEOUT_MS)
    return () => {
      observer.disconnect()
      clearTimeout(timer)
    }
  }, [step.target, onNext])

  // Keep the spotlight on the target through scrolling (any container) and resizes.
  useLayoutEffect(() => {
    if (!target) return
    target.scrollIntoView?.({ block: 'center', behavior: 'smooth' })
    const update = () => setRect(target.getBoundingClientRect())
    update()
    window.addEventListener('scroll', update, true)
    window.addEventListener('resize', update)
    return () => {
      window.removeEventListener('scroll', update, true)
      window.removeEventListener('resize', update)
    }
  }, [target])

  // Clicking the highlighted control is progress (e.g. tapping Plan or Edit).
  useEffect(() => {
    if (!target || !step.advanceOnTargetClick) return
    target.addEventListener('click', onNext)
    return () => target.removeEventListener('click', onNext)
  }, [target, step.advanceOnTargetClick, onNext])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  useLayoutEffect(() => {
    const h = cardRef.current?.offsetHeight
    if (h && h !== cardHeight) setCardHeight(h)
  })

  if (!rect) return null

  const spot = {
    top: rect.top - SPOT_PADDING,
    left: rect.left - SPOT_PADDING,
    width: rect.width + SPOT_PADDING * 2,
    height: rect.height + SPOT_PADDING * 2,
  }
  const viewport = { width: window.innerWidth, height: window.innerHeight }
  const cardWidth = Math.min(CARD_WIDTH, viewport.width - GUTTER * 2)
  const pos = placeCard(spot, step.placement, viewport, { width: cardWidth, height: cardHeight })
  const isLast = stepIndex === total - 1

  return createPortal(
    // The layer ignores pointer events so the highlighted control stays clickable.
    <div className="fixed inset-0 z-[60] pointer-events-none">
      <div
        className="absolute rounded-xl transition-all duration-200"
        style={{ ...spot, boxShadow: '0 0 0 9999px rgb(0 0 0 / 0.5)' }}
      />
      <div
        ref={cardRef}
        role="dialog"
        aria-labelledby="tour-title"
        className="pointer-events-auto absolute rounded-xl bg-white p-4 shadow-xl"
        style={{ top: pos.top, left: pos.left, width: cardWidth }}
      >
        <p id="tour-title" className="text-sm font-semibold text-gray-900">{t(`${step.key}.title`)}</p>
        <p className="mt-1 text-sm leading-5 text-gray-600">{t(`${step.key}.body`)}</p>
        <div className="mt-4 flex items-center gap-2">
          {total > 1 && (
            <span className="text-xs text-gray-400">{t('controls.stepOf', { current: stepIndex + 1, total })}</span>
          )}
          {total > 1 && (
            <button type="button" onClick={onClose} className="ml-auto text-xs font-medium text-gray-500 hover:text-gray-900">
              {t('controls.skip')}
            </button>
          )}
          {stepIndex > 0 && (
            <button
              type="button"
              onClick={onBack}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-100 ${total > 1 ? '' : 'ml-auto'}`}
            >
              {t('controls.back')}
            </button>
          )}
          <button
            type="button"
            onClick={onNext}
            className={`rounded-lg bg-gray-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-gray-700 ${total > 1 ? '' : 'ml-auto'}`}
          >
            {total === 1 ? t('controls.gotIt') : isLast ? t('controls.done') : t('controls.next')}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
```

- [ ] **Step 4: Run it and verify it passes**

Run: `npx vitest run src/components/tour/TourOverlay.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/tour/TourOverlay.tsx src/components/tour/TourOverlay.test.tsx
git commit -m "feat(tour): spotlight overlay with tooltip, target wait and skip"
```

---

### Task 10: `TourProvider` and hooks

**Files:**
- Create: `src/components/tour/TourProvider.tsx`
- Test: `src/components/tour/TourProvider.test.tsx`

- [ ] **Step 1: Write the failing test**

`src/components/tour/TourProvider.test.tsx`:

```tsx
import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TourProvider, useTour, useTourControls, useTourStep, TOUR_START_DELAY_MS } from './TourProvider'
import type { TourId } from '@/lib/tours/ids'

let mockPathname = '/recipes/1'
vi.mock('next/navigation', () => ({ usePathname: () => mockPathname }))

// Stand-in overlay: exposes the active step and its controls.
vi.mock('./TourOverlay', () => ({
  TourOverlay: ({ step, stepIndex, onNext, onBack, onClose }: {
    step: { target: string }; stepIndex: number; onNext: () => void; onBack: () => void; onClose: () => void
  }) => (
    <div data-testid="overlay">
      {step.target}:{stepIndex}
      <button type="button" onClick={onNext}>next</button>
      <button type="button" onClick={onBack}>back</button>
      <button type="button" onClick={onClose}>close</button>
    </div>
  ),
}))

function Starter({ id, when = true }: { id: TourId; when?: boolean }) {
  useTour(id, when)
  return null
}

function StepProbe({ target }: { target: string }) {
  return <span data-testid="probe">{String(useTourStep(target))}</span>
}

function MarkSeen({ id }: { id: TourId }) {
  const tour = useTourControls()
  return <button type="button" onClick={() => tour?.markSeen(id)}>mark</button>
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true })
  mockPathname = '/recipes/1'
  global.fetch = vi.fn().mockResolvedValue({ ok: true } as Response)
})
afterEach(() => vi.useRealTimers())

const advance = () => act(() => { vi.advanceTimersByTime(TOUR_START_DELAY_MS) })

function patchedTours() {
  return (global.fetch as ReturnType<typeof vi.fn>).mock.calls.map((c) => JSON.parse((c[1] as RequestInit).body as string).tour_seen)
}

describe('TourProvider', () => {
  it('starts a tour after the delay when its condition holds', () => {
    render(<TourProvider initialSeen={[]}><Starter id="plan-recipe" /></TourProvider>)
    expect(screen.queryByTestId('overlay')).not.toBeInTheDocument()
    advance()
    expect(screen.getByTestId('overlay')).toHaveTextContent('plan-button:0')
  })

  it('does not start a seen tour or one whose condition is false', () => {
    render(
      <TourProvider initialSeen={['plan-recipe']}>
        <Starter id="plan-recipe" />
        <Starter id="shopping-list" when={false} />
      </TourProvider>,
    )
    advance()
    expect(screen.queryByTestId('overlay')).not.toBeInTheDocument()
  })

  it('runs one tour at a time and starts the next once the first closes', async () => {
    render(
      <TourProvider initialSeen={[]}>
        <Starter id="plan-recipe" />
        <Starter id="shopping-list" />
      </TourProvider>,
    )
    advance()
    expect(screen.getAllByTestId('overlay')).toHaveLength(1)
    const first = screen.getByTestId('overlay').textContent
    await userEvent.click(screen.getByRole('button', { name: 'close' }))
    advance()
    expect(screen.getByTestId('overlay').textContent).not.toBe(first)
  })

  it('steps forward and back, finishes after the last step and persists it', async () => {
    render(<TourProvider initialSeen={[]}><Starter id="planner-desktop" /><StepProbe target="grid-resize" /></TourProvider>)
    advance()
    await userEvent.click(screen.getByRole('button', { name: 'next' }))
    expect(screen.getByTestId('overlay')).toHaveTextContent('grid-resize:1')
    expect(screen.getByTestId('probe')).toHaveTextContent('true')
    await userEvent.click(screen.getByRole('button', { name: 'back' }))
    expect(screen.getByTestId('overlay')).toHaveTextContent('grid-slot:0')
    await userEvent.click(screen.getByRole('button', { name: 'next' }))
    await userEvent.click(screen.getByRole('button', { name: 'next' }))
    await userEvent.click(screen.getByRole('button', { name: 'next' }))
    expect(screen.queryByTestId('overlay')).not.toBeInTheDocument()
    expect(patchedTours()).toEqual(['planner-desktop'])
  })

  it('skipping marks the tour seen so it does not come back', async () => {
    const { rerender } = render(<TourProvider initialSeen={[]}><Starter id="plan-recipe" /></TourProvider>)
    advance()
    await userEvent.click(screen.getByRole('button', { name: 'close' }))
    rerender(<TourProvider initialSeen={[]}><Starter id="plan-recipe" when={false} /></TourProvider>)
    rerender(<TourProvider initialSeen={[]}><Starter id="plan-recipe" /></TourProvider>)
    advance()
    expect(screen.queryByTestId('overlay')).not.toBeInTheDocument()
    expect(patchedTours()).toEqual(['plan-recipe'])
  })

  it('markSeen suppresses a tour without showing it, and persists once', async () => {
    render(<TourProvider initialSeen={[]}><MarkSeen id="plan-recipe" /></TourProvider>)
    await userEvent.click(screen.getByRole('button', { name: 'mark' }))
    await userEvent.click(screen.getByRole('button', { name: 'mark' }))
    expect(patchedTours()).toEqual(['plan-recipe'])
  })

  it('closes the active tour when its condition turns false', () => {
    const { rerender } = render(<TourProvider initialSeen={[]}><Starter id="plan-recipe" /></TourProvider>)
    advance()
    rerender(<TourProvider initialSeen={[]}><Starter id="plan-recipe" when={false} /></TourProvider>)
    expect(screen.queryByTestId('overlay')).not.toBeInTheDocument()
  })

  it('closes the active tour on navigation', () => {
    const { rerender } = render(<TourProvider initialSeen={[]}><Starter id="plan-recipe" /></TourProvider>)
    advance()
    mockPathname = '/planner'
    rerender(<TourProvider initialSeen={[]}><Starter id="plan-recipe" /></TourProvider>)
    expect(screen.queryByTestId('overlay')).not.toBeInTheDocument()
  })

  it('hooks are no-ops without a provider', () => {
    render(<><Starter id="plan-recipe" /><StepProbe target="grid-resize" /><MarkSeen id="plan-recipe" /></>)
    advance()
    expect(screen.getByTestId('probe')).toHaveTextContent('false')
  })
})
```

- [ ] **Step 2: Run it and verify it fails**

Run: `npx vitest run src/components/tour/TourProvider.test.tsx`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement**

`src/components/tour/TourProvider.tsx`:

```tsx
'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { usePathname } from 'next/navigation'
import { isTourId, type TourId } from '@/lib/tours/ids'
import { TOURS } from './tours'
import { TourOverlay } from './TourOverlay'

/** Lets layout and scroll settle before a tour appears. */
export const TOUR_START_DELAY_MS = 600

interface ActiveTour {
  id: TourId
  stepIndex: number
  pathname: string
}

interface TourContextValue {
  seen: ReadonlySet<TourId>
  active: ActiveTour | null
  start: (id: TourId) => void
  next: () => void
  back: () => void
  /** Ends the active tour (finished or skipped) and marks it seen. */
  close: () => void
  /** Marks a tour seen without showing it, e.g. once the user already did what it teaches. */
  markSeen: (id: TourId) => void
}

const TourContext = createContext<TourContextValue | null>(null)

export function TourProvider({ initialSeen, children }: { initialSeen: string[]; children: React.ReactNode }) {
  const pathname = usePathname()
  const [seen, setSeen] = useState<ReadonlySet<TourId>>(() => new Set(initialSeen.filter(isTourId)))
  const seenRef = useRef(seen)
  const [active, setActiveState] = useState<ActiveTour | null>(null)
  // Refs mirror state synchronously so two tours starting in one tick can't both win.
  const activeRef = useRef<ActiveTour | null>(null)
  const pathnameRef = useRef(pathname)
  pathnameRef.current = pathname

  const setActive = useCallback((next: ActiveTour | null) => {
    activeRef.current = next
    setActiveState(next)
  }, [])

  const markSeen = useCallback((id: TourId) => {
    if (seenRef.current.has(id)) return
    const next = new Set(seenRef.current).add(id)
    seenRef.current = next
    setSeen(next)
    fetch('/api/profile', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tour_seen: id }),
    }).catch(() => {
      // Best effort — worst case the tour shows once more on another device.
    })
  }, [])

  const start = useCallback((id: TourId) => {
    if (seenRef.current.has(id) || activeRef.current) return
    setActive({ id, stepIndex: 0, pathname: pathnameRef.current })
  }, [setActive])

  const close = useCallback(() => {
    const current = activeRef.current
    if (!current) return
    setActive(null)
    markSeen(current.id)
  }, [markSeen, setActive])

  const next = useCallback(() => {
    const current = activeRef.current
    if (!current) return
    if (current.stepIndex + 1 >= TOURS[current.id].length) close()
    else setActive({ ...current, stepIndex: current.stepIndex + 1 })
  }, [close, setActive])

  const back = useCallback(() => {
    const current = activeRef.current
    if (!current || current.stepIndex === 0) return
    setActive({ ...current, stepIndex: current.stepIndex - 1 })
  }, [setActive])

  // Leaving the page ends the tour; it counts as skipped.
  useEffect(() => {
    if (activeRef.current && activeRef.current.pathname !== pathname) close()
  }, [pathname, close])

  const value = useMemo(
    () => ({ seen, active, start, next, back, close, markSeen }),
    [seen, active, start, next, back, close, markSeen],
  )

  return (
    <TourContext.Provider value={value}>
      {children}
      {active && (
        <TourOverlay
          key={`${active.id}-${active.stepIndex}`}
          step={TOURS[active.id][active.stepIndex]}
          stepIndex={active.stepIndex}
          total={TOURS[active.id].length}
          onNext={next}
          onBack={back}
          onClose={close}
        />
      )}
    </TourContext.Provider>
  )
}

/** Tour controls, or null outside a TourProvider. */
export function useTourControls(): TourContextValue | null {
  return useContext(TourContext)
}

/**
 * Shows tour `id` once `condition` holds (after a short settle delay), unless it was
 * already seen or another tour is running. Ends the tour if `condition` stops holding.
 */
export function useTour(id: TourId, condition: boolean) {
  const ctx = useContext(TourContext)
  const start = ctx?.start
  const close = ctx?.close
  const isSeen = ctx ? ctx.seen.has(id) : true
  const activeId = ctx?.active?.id ?? null

  useEffect(() => {
    if (!start || !condition || isSeen || activeId) return
    const timer = setTimeout(() => start(id), TOUR_START_DELAY_MS)
    return () => clearTimeout(timer)
  }, [start, id, condition, isSeen, activeId])

  useEffect(() => {
    if (!condition && activeId === id) close?.()
  }, [condition, activeId, id, close])
}

/** True while the active tour step highlights `target` — used to force hover-only controls visible. */
export function useTourStep(target: string): boolean {
  const active = useContext(TourContext)?.active
  if (!active) return false
  return TOURS[active.id][active.stepIndex]?.target === target
}
```

- [ ] **Step 4: Run it and verify it passes**

Run: `npx vitest run src/components/tour`
Expected: all PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/tour/TourProvider.tsx src/components/tour/TourProvider.test.tsx
git commit -m "feat(tour): TourProvider state machine with useTour/useTourStep hooks"
```

---

### Task 11: Mount the provider in both layouts

**Files:**
- Modify: `src/app/(app)/layout.tsx`
- Modify: `src/app/(flow)/layout.tsx`
- Test: `src/app/(app)/layout.test.tsx`, `src/app/(flow)/layout.test.tsx`

- [ ] **Step 1: Implement**

`src/app/(app)/layout.tsx`: add `import { TourProvider } from '@/components/tour/TourProvider'` and wrap `AppShell`:

```tsx
      <WeekStartProvider value={weekStartDay}>
        <TourProvider initialSeen={profile.tours_seen ?? []}>
          <AppShell user={user} profile={profile} isAdmin={isAdmin} birthdayConfig={birthdayConfig}>
            {children}
          </AppShell>
        </TourProvider>
      </WeekStartProvider>
```

`src/app/(flow)/layout.tsx`: same import, and wrap the inner div:

```tsx
    <NextIntlClientProvider locale={locale} messages={messages}>
      <TourProvider initialSeen={profile?.tours_seen ?? []}>
        <div className="min-h-screen bg-gray-50">
          {children}
        </div>
      </TourProvider>
    </NextIntlClientProvider>
```

`?? []` guards against the gap between deploy and migration on production, where the migration is applied by hand.

- [ ] **Step 2: Run the layout tests**

Run: `npx vitest run "src/app/(app)/layout.test.tsx" "src/app/(flow)/layout.test.tsx"`
Expected: PASS. If one fails because `usePathname` or `TourProvider` renders in a server-test context, add to that test file:

```ts
vi.mock('@/components/tour/TourProvider', () => ({ TourProvider: ({ children }: { children: unknown }) => children }))
```

- [ ] **Step 3: Commit**

```bash
git add "src/app/(app)" "src/app/(flow)"
git commit -m "feat(tour): mount TourProvider in app and flow layouts"
```

---

### Task 12: Tour 1, `plan-recipe`

**Files:**
- Modify: `src/components/recipe/AddToPlanButton.tsx`
- Modify: `src/components/recipe/AddToPlanPicker.tsx`
- Modify: `src/components/planner/PlannerClient.tsx`
- Test: `src/components/recipe/AddToPlanButton.test.tsx`

- [ ] **Step 1: Write the failing tests**

Append to `AddToPlanButton.test.tsx`:

```tsx
import { TourProvider } from '@/components/tour/TourProvider'
vi.mock('@/components/tour/TourOverlay', () => ({ TourOverlay: () => null }))
```

(Put the `import` with the other imports and the `vi.mock` with the other mocks. Also add `usePathname: () => '/recipes/1'` to the existing `next/navigation` mock.)

```tsx
  it('marks the toolbar button as the plan-recipe tour target, but not the card overlay', () => {
    const { container, rerender } = render(<AddToPlanButton recipeId="recipe-1" />)
    expect(container.querySelector('[data-tour="plan-button"]')).not.toBeNull()
    rerender(<AddToPlanButton recipeId="recipe-1" variant="overlay" />)
    expect(container.querySelector('[data-tour="plan-button"]')).toBeNull()
  })

  it('marks the plan-recipe tour seen after planning from the picker', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ id: 'slot-1' }) } as Response)
    render(<TourProvider initialSeen={[]}><AddToPlanButton recipeId="recipe-1" /></TourProvider>)

    await userEvent.click(screen.getByRole('button', { name: /add to plan/i }))
    await userEvent.click(await screen.findByRole('button', { name: /add to \w+ \d+/i }))

    await waitFor(() =>
      expect(global.fetch).toHaveBeenCalledWith('/api/profile', expect.objectContaining({
        body: JSON.stringify({ tour_seen: 'plan-recipe' }),
      })),
    )
  })
```

- [ ] **Step 2: Run them and verify they fail**

Run: `npx vitest run src/components/recipe/AddToPlanButton.test.tsx`
Expected: the 2 new tests FAIL.

- [ ] **Step 3: Implement**

`AddToPlanButton.tsx`: add `import { useTour } from '@/components/tour/TourProvider'`. After the `useState` declarations:

```ts
  useTour('plan-recipe', variant === 'toolbar' && !open)
```

On the trigger `<button>`, add:

```tsx
        data-tour={variant === 'toolbar' ? 'plan-button' : undefined}
```

`AddToPlanPicker.tsx`: add `import { useTourControls } from '@/components/tour/TourProvider'`, add `const tour = useTourControls()` after `const posthog = usePostHog()`, and extend the Task 5 line inside `if (res.ok) {`:

```ts
      // "Change" re-places the same meal; only the first placement counts as planning.
      if (!placed) trackMilestone(posthog, 'meal_planned', { source: 'recipe', kind: 'recipe' })
      tour?.markSeen('plan-recipe')
```

`PlannerClient.tsx`: add `import { useTourControls } from '@/components/tour/TourProvider'`, add `const tour = useTourControls()` after `const router = useRouter()`, and call `tour?.markSeen('plan-recipe')` right after each of the two `trackMilestone(posthog, 'meal_planned', …)` lines from Task 5.

- [ ] **Step 4: Run them and verify they pass**

Run: `npx vitest run src/components/recipe src/components/planner/PlannerClient.test.tsx`
Expected: all PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/recipe src/components/planner/PlannerClient.tsx
git commit -m "feat(tour): plan-recipe tour on the recipe detail Plan button"
```

---

### Task 13: Planner tours (mobile view, mobile edit, desktop)

**Files:**
- Create: `src/components/tour/useIsDesktop.ts`
- Modify: `src/components/planner/PlannerClient.tsx` (`useTour` calls, `PlannerActions` data-tour)
- Modify: `src/components/planner/MobileEditList.tsx` (grip, span buttons, add button)
- Modify: `src/components/planner/PlannerDesktopGrid.tsx` (add wrapper)
- Modify: `src/components/planner/SlotCard.tsx`, `CustomLabelCard.tsx` (card root)
- Modify: `src/components/planner/ResizeHandle.tsx` (target + forced visible)
- Test: `src/components/planner/PlannerClient.test.tsx`, `src/components/planner/MobileEditList.test.tsx`, `src/components/planner/PlannerDesktopGrid.test.tsx`

- [ ] **Step 1: Write the failing tests**

In `PlannerClient.test.tsx`, add a test next to `'shows only Done in the mobile planner actions while editing'`. Reuse its setup (same fetch fixture and the click on Edit), and assert the targets:

```tsx
  it('marks Edit and Done as planner tour targets', async () => {
    // ...same setup as 'shows only Done in the mobile planner actions while editing' up to rendering...
    expect(await screen.findByRole('button', { name: 'Edit' })).toHaveAttribute('data-tour', 'planner-edit')
    await userEvent.click(screen.getByRole('button', { name: 'Edit' }))
    expect(screen.getByRole('button', { name: 'Done' })).toHaveAttribute('data-tour', 'planner-done')
  })
```

In `MobileEditList.test.tsx`, add a test using the file's existing render helper/fixture with at least one slot:

```tsx
  it('marks the grip, span controls and add button as tour targets', () => {
    // ...render as in the file's first test...
    expect(screen.getAllByRole('button', { name: 'Drag to move to another day' })[0]).toHaveAttribute('data-tour', 'edit-grip')
    expect(screen.getAllByRole('button', { name: 'Extend by one day' })[0].closest('[data-tour="edit-span"]')).not.toBeNull()
    expect(document.querySelector('[data-tour="edit-add"]')).not.toBeNull()
  })
```

(Check `messages/en/planner.json` `editList.dragMoveAria` / `extendAria` for the exact English labels and adjust the names.)

In `PlannerDesktopGrid.test.tsx`, add a test using its existing render with one slot:

```tsx
  it('marks slot cards and day add affordances as tour targets', () => {
    // ...render as in the file's first test...
    expect(document.querySelector('[data-tour="grid-slot"]')).not.toBeNull()
    expect(document.querySelector('[data-tour="grid-add"]')).not.toBeNull()
  })
```

If that file mocks `SlotCard`, assert only `grid-add` there, and cover `grid-slot` by rendering a real `SlotCard` in `SlotCard.test.tsx` with `expect(container.firstChild).toHaveAttribute('data-tour', 'grid-slot')`.

- [ ] **Step 2: Run them and verify they fail**

Run: `npx vitest run src/components/planner`
Expected: the new tests FAIL.

- [ ] **Step 3: Implement `useIsDesktop`**

`src/components/tour/useIsDesktop.ts`:

```ts
'use client'

import { useEffect, useState } from 'react'

/** Tailwind `md` breakpoint. null until measured on the client (and in environments without matchMedia). */
export function useIsDesktop(): boolean | null {
  const [isDesktop, setIsDesktop] = useState<boolean | null>(null)
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return
    const mq = window.matchMedia('(min-width: 768px)')
    setIsDesktop(mq.matches)
    const onChange = (e: MediaQueryListEvent) => setIsDesktop(e.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])
  return isDesktop
}
```

- [ ] **Step 4: Wire `PlannerClient`**

Add the imports `import { useTour } from '@/components/tour/TourProvider'` (merge with the existing `useTourControls` import) and `import { useIsDesktop } from '@/components/tour/useIsDesktop'`. After `const hasRecipeSlots = …`:

```ts
  const isDesktop = useIsDesktop()
  const hasSlots = !loading && !isWeekEmpty
  useTour('planner-mobile-view', isDesktop === false && hasSlots && !isMobileEditMode)
  useTour('planner-mobile-edit', isDesktop === false && hasSlots && isMobileEditMode)
  useTour('planner-desktop', isDesktop === true && hasSlots && openSearchDay === null)
```

In `PlannerActions`, add `data-tour="planner-done"` to the Done `<button>` and `data-tour="planner-edit"` to the Edit `<button>`.

- [ ] **Step 5: Wire `MobileEditList`**

In `MealRow`, add `data-tour="edit-grip"` to the drag-handle `<button>`. Wrap the two span buttons (shrink and extend) in:

```tsx
            <span data-tour="edit-span" className="flex items-center gap-1.5">
              {/* existing shrink <button> */}
              {/* existing extend <button> */}
            </span>
```

In `DaySection`, add `data-tour="edit-add"` to the dashed "Add meal" `<button>`.

- [ ] **Step 6: Wire the desktop grid and cards**

`PlannerDesktopGrid.tsx`: on the per-day add wrapper `<div key={\`add-${day}\`} …>`, add `data-tour="grid-add"`.

`SlotCard.tsx` and `CustomLabelCard.tsx`: on the root card `<div ref={setNodeRef} …>`, add `data-tour="grid-slot"`. Neither is rendered on mobile outside the hidden desktop grid, so the first visible match rule keeps this desktop-only.

`ResizeHandle.tsx`: add `import { useTourStep } from '@/components/tour/TourProvider'`, then:

```tsx
export function ResizeHandle({ show, isResizing, title, onMouseDown }: ResizeHandleProps) {
  // Hover-only in normal use; forced visible while the tour points at it.
  const highlighted = useTourStep('grid-resize')
  if (!show) return null
  return (
    <div
      data-tour="grid-resize"
      onMouseDown={onMouseDown}
      className={`hidden md:flex absolute top-0 bottom-0 right-[-10px] w-7 flex-col items-center justify-center cursor-ew-resize rounded-r-lg z-10 transition-opacity ${
        isResizing || highlighted ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
      }`}
      title={title}
      aria-label={title}
    >
      <GripHorizontal size={12} className="text-gray-400" />
    </div>
  )
}
```

- [ ] **Step 7: Run the tests and verify they pass**

Run: `npx vitest run src/components/planner src/components/tour`
Expected: all PASS

- [ ] **Step 8: Commit**

```bash
git add src/components/planner src/components/tour/useIsDesktop.ts
git commit -m "feat(tour): planner tours for mobile view, mobile edit and desktop grid"
```

---

### Task 14: Tour 5, `shopping-generate`

**Files:**
- Modify: `src/components/shopping/ShoppingItemRow.tsx` (name span, delete X)
- Modify: `src/components/shopping/ShoppingPlanBox.tsx` (remove button, portions)
- Modify: `src/components/shopping/GenerateShoppingPage.tsx` (`useTour`)
- Test: `src/components/shopping/GenerateShoppingPage.test.tsx`

- [ ] **Step 1: Write the failing test**

Add to `GenerateShoppingPage.test.tsx`, using the same render as `'shows a box per recipe with its scaled ingredients…'`:

```tsx
  it('marks ingredient name, delete, portions and remove as tour targets', () => {
    // ...same render as the first test...
    expect(document.querySelector('[data-tour="item-name"]')).not.toBeNull()
    expect(document.querySelector('[data-tour="item-delete"]')).not.toBeNull()
    expect(document.querySelector('[data-tour="generate-portions"]')).not.toBeNull()
    expect(document.querySelector('[data-tour="generate-remove"]')).not.toBeNull()
  })
```

- [ ] **Step 2: Run it and verify it fails**

Run: `npx vitest run src/components/shopping/GenerateShoppingPage.test.tsx`
Expected: the new test FAILS.

- [ ] **Step 3: Implement**

`ShoppingItemRow.tsx`, non-editing branch: add `data-tour="item-name"` to the `<span onClick={startEdit} …>` and `data-tour="item-delete"` to the delete `<button … title={t('itemRow.deleteTitle')}>`. The X is always visible, so nothing needs forcing.

`ShoppingPlanBox.tsx`: add `data-tour="generate-remove"` to the remove/undo `<button onClick={onToggleRemove} …>`. Add `data-tour="generate-portions"` to the `<div className="flex flex-col items-center gap-1 flex-shrink-0">` that wraps the portions label and `Stepper`.

`GenerateShoppingPage.tsx`: add `import { useTour } from '@/components/tour/TourProvider'`. Near the top of the component, after `entries` state:

```ts
  useTour(
    'shopping-generate',
    entries.some((e) => e.kind === 'recipe' && !e.removed && e.ingredients.length > 0) && !isAdding,
  )
```

(`isAdding` is declared further down. Place this call **after** the `useState` for `isAdding`.)

- [ ] **Step 4: Run it and verify it passes**

Run: `npx vitest run src/components/shopping`
Expected: all PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/shopping
git commit -m "feat(tour): shopping-generate tour targets"
```

---

### Task 15: "+ Add item" row and tour 6, `shopping-list`

**Files:**
- Modify: `src/components/shopping/ShoppingClient.tsx` (`handleCreateFirst` → `handleAddItem`, add row, `useTour`)
- Test: `src/components/shopping/ShoppingClient.test.tsx`

- [ ] **Step 1: Write the failing test**

Add to `ShoppingClient.test.tsx`, rendering with items as in `'shows Clear list button when list has items'`:

```tsx
  it('adds a blank editable item at the end from the Add item row', async () => {
    // ...same render with items...
    const addRow = screen.getByRole('button', { name: 'Add item' })
    expect(addRow).toHaveAttribute('data-tour', 'shopping-add')
    await userEvent.click(addRow)
    // New pending item opens straight in edit mode (autofocused text input)
    expect(document.activeElement?.tagName).toBe('INPUT')
    expect(document.activeElement).toHaveAttribute('type', expect.not.stringMatching('checkbox'))
  })
```

Import `userEvent` if the file doesn't already. If the `toHaveAttribute('type', …)` matcher form is awkward, assert `expect((document.activeElement as HTMLInputElement).type).not.toBe('checkbox')` instead.

- [ ] **Step 2: Run it and verify it fails**

Run: `npx vitest run src/components/shopping/ShoppingClient.test.tsx`
Expected: FAIL, no "Add item" button while the list has items.

- [ ] **Step 3: Implement**

In `ShoppingClient.tsx`, replace `handleCreateFirst` with an appending version (and update its one call site in the empty state to `handleAddItem`):

```ts
  // Blank item at the end of the list, opened in edit mode. Enter chains more items below it.
  function handleAddItem() {
    const pendingItem: ShoppingItem = {
      id: crypto.randomUUID(),
      shopping_list_id: list?.id ?? '',
      name: '',
      quantity: null,
      unit: null,
      category: null,
      is_checked: false,
      sort_order: items.reduce((max, i) => Math.max(max, i.sort_order), -1) + 1,
      source_recipe_ids: [],
    }
    setPendingItemIds((prev) => new Set(prev).add(pendingItem.id))
    setItems((prev) => [...prev, pendingItem])
  }
```

Directly after the closing `</DndContext>` in the non-empty branch, wrap both in a fragment so the row sits inside the list card:

```tsx
          <>
            <DndContext …>{/* unchanged */}</DndContext>
            <button
              type="button"
              onClick={handleAddItem}
              data-tour="shopping-add"
              className="flex w-full items-center gap-2 px-4 py-3 text-sm font-medium text-gray-500 transition-colors hover:bg-gray-50 hover:text-gray-900"
            >
              <Plus size={16} />
              {t('client.addItem')}
            </button>
          </>
```

Add the tour, after `visibleItems` is computed. Add `import { useTour } from '@/components/tour/TourProvider'`:

```ts
  useTour('shopping-list', visibleItems.length > 0 && !showClearConfirm && pendingItemIds.size === 0)
```

- [ ] **Step 4: Run it and verify it passes**

Run: `npx vitest run src/components/shopping`
Expected: all PASS, including the existing empty-state "Add item" test.

- [ ] **Step 5: Commit**

```bash
git add src/components/shopping
git commit -m "feat(shopping): visible Add item row; shopping-list tour"
```

---

### Task 16: Full verification and manual check

- [ ] **Step 1: Full test suite, types, lint**

Run: `npm test && npm run type-check && npm run lint`
Expected: all green. Fix anything that fails before continuing.

- [ ] **Step 2: Manual walkthrough in the browser**

Start `npm run dev -- -H localhost`, open `http://localhost:3000/dev/login?fresh=1`, and finish onboarding. `.env.local` points at staging Supabase, so apply `023_tours_seen.sql` there first: staging applies it automatically once the branch reaches `staging`, or run it in the staging SQL editor for local testing. Do not trigger any AI features.

Check at desktop width, then at 375 px (mobile):
1. Create a recipe manually → the detail page spotlights **Plan**. Clicking Plan closes the tour and the picker opens.
2. Add it to this week → open the planner:
   - Desktop: 3 steps (card → resize handle, which is forced visible → day add).
   - Mobile: the Edit tip, then after tapping Edit, 4 steps ending on Done.
3. Generate shopping list → 4 steps (item name → X → portions → Remove).
4. Add to list → shopping page → one step on **+ Add item**. Clicking it adds an editable row at the end, and Enter chains another.
5. Reload each page → no tour reappears. Esc and "Skip tour" both end a tour for good.
6. PostHog live events show `recipe_created{source}`, `meal_planned{source,kind}`, `shopping_list_generated`, and `shopping_item_checked`, each with `$set_once`.

- [ ] **Step 3: Push the branch and merge into staging (big-feature flow)**

```bash
git -C /Users/vacuumlabs/Developer/dapcook/.claude/worktrees/jolly-wiles-66356d push -u origin feat/product-tour
```

Then merge `feat/product-tour` into `staging` and test on https://dapcook-staging.vercel.app. After approval, merge **the same branch** into `main`, and apply `023_tours_seen.sql` by hand in the production Supabase SQL editor **before** or together with the deploy.
