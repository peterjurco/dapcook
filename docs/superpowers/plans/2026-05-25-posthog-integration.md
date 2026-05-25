# PostHog Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Integrate PostHog client-side analytics with session recording, automatic pageview tracking, user identification tied to Supabase user IDs, and six custom events.

**Architecture:** A `PostHogProvider` client component wraps `<body>` in the root layout to initialize PostHog and handle SPA pageviews. A `PostHogIdentifier` client component in the authenticated `(app)` layout calls `posthog.identify()` on mount and detects onboarding completion via a `?ob=1` query param. Custom events are fired via `usePostHog()` in the components where actions complete.

**Tech Stack:** `posthog-js`, `posthog-js/react`, Next.js 14 App Router, Supabase SSR, Vitest + Testing Library

---

## File Map

| Action | File | Responsibility |
|---|---|---|
| Create | `src/components/providers/PostHogProvider.tsx` | Initializes posthog-js; wraps app in PHProvider; renders PostHogPageView |
| Create | `src/components/providers/PostHogPageView.tsx` | Fires `$pageview` on SPA route changes (needed because Next.js App Router doesn't trigger page reloads) |
| Create | `src/components/providers/PostHogIdentifier.tsx` | Calls `posthog.identify()` on mount; fires `onboarding_completed` when `?ob=1` detected |
| Create | `src/components/providers/PostHogIdentifier.test.tsx` | Tests for identification and onboarding event |
| Modify | `src/app/layout.tsx` | Wrap `<body>` children with `PostHogProvider` |
| Modify | `src/app/(app)/layout.tsx` | Render `<PostHogIdentifier>` alongside `<AppShell>` |
| Modify | `src/components/layout/AppShell.tsx` | Call `posthog.reset()` on sign-out form submit |
| Modify | `src/lib/auth/actions.ts` | Redirect to `/recipes?ob=1` after successful `createHousehold` / `joinHousehold` |
| Modify | `src/components/recipe/RecipeForm.tsx` | Fire `recipe_created` after new recipe saves |
| Modify | `src/components/recipe/RecipeForm.test.tsx` | Add test for `recipe_created` capture |
| Modify | `src/components/recipe/DeleteRecipeButton.tsx` | Fire `recipe_deleted` after confirmed delete |
| Create | `src/components/recipe/DeleteRecipeButton.test.tsx` | Tests for `recipe_deleted` capture |
| Modify | `src/components/planner/PlannerClient.tsx` | Fire `meal_planned` after `handleAddRecipe` succeeds |
| Modify | `src/components/shopping/ShoppingClient.tsx` | Fire `shopping_list_viewed` on mount; `shopping_list_generated` after `generateList` succeeds |
| Create | `src/components/shopping/ShoppingClient.test.tsx` | Tests for shopping events |

---

## Task 1: Install posthog-js and add env vars

**Files:**
- Modify: `package.json` (via npm)
- Create: `.env.local` entry (manual — not committed)

- [ ] **Step 1: Install the package**

```bash
npm install posthog-js
```

Expected: `posthog-js` appears in `package.json` dependencies.

- [ ] **Step 2: Add env vars to `.env.local`**

Open `.env.local` and append:

```
NEXT_PUBLIC_POSTHOG_KEY=phc_YOUR_KEY_HERE
NEXT_PUBLIC_POSTHOG_HOST=https://eu.i.posthog.com
```

Replace `phc_YOUR_KEY_HERE` with the key from your PostHog project settings (posthog.com → Project Settings → Project API key). Use `https://us.i.posthog.com` if your PostHog region is US.

- [ ] **Step 3: Add the vars to Vercel**

In the Vercel dashboard → project → Settings → Environment Variables, add both vars with the same values (Environment: Production + Preview + Development).

- [ ] **Step 4: Commit the package changes**

```bash
git add package.json package-lock.json
git commit -m "feat: install posthog-js"
```

---

## Task 2: PostHogProvider and pageview tracking

**Files:**
- Create: `src/components/providers/PostHogProvider.tsx`
- Create: `src/components/providers/PostHogPageView.tsx`
- Modify: `src/app/layout.tsx`

- [ ] **Step 1: Create PostHogPageView**

Create `src/components/providers/PostHogPageView.tsx`:

```tsx
'use client'

import { usePathname, useSearchParams } from 'next/navigation'
import { useEffect, Suspense } from 'react'
import { usePostHog } from 'posthog-js/react'

function PostHogPageViewInner() {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const posthog = usePostHog()

  useEffect(() => {
    if (!posthog) return
    let url = window.location.origin + pathname
    const params = searchParams.toString()
    if (params) url += `?${params}`
    posthog.capture('$pageview', { $current_url: url })
  }, [pathname, searchParams, posthog])

  return null
}

export function PostHogPageView() {
  return (
    <Suspense fallback={null}>
      <PostHogPageViewInner />
    </Suspense>
  )
}
```

- [ ] **Step 2: Create PostHogProvider**

Create `src/components/providers/PostHogProvider.tsx`:

```tsx
'use client'

import posthog from 'posthog-js'
import { PostHogProvider as PHProvider } from 'posthog-js/react'
import { PostHogPageView } from './PostHogPageView'

if (typeof window !== 'undefined') {
  posthog.init(process.env.NEXT_PUBLIC_POSTHOG_KEY!, {
    api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST ?? 'https://eu.i.posthog.com',
    capture_pageview: false,
    capture_pageleave: true,
    session_recording: {
      maskAllInputs: false,
    },
  })
}

export function PostHogProvider({ children }: { children: React.ReactNode }) {
  return (
    <PHProvider client={posthog}>
      <PostHogPageView />
      {children}
    </PHProvider>
  )
}
```

Note: `capture_pageview: false` disables PostHog's built-in pageview capture — `PostHogPageView` handles it manually so SPA navigations are tracked correctly.

- [ ] **Step 3: Wrap layout body with PostHogProvider**

Modify `src/app/layout.tsx` to:

```tsx
import type { Metadata } from 'next'
import './globals.css'
import { PostHogProvider } from '@/components/providers/PostHogProvider'

export const metadata: Metadata = {
  title: 'dapcook',
  description: 'Your shared cookbook & meal planner',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="font-sans antialiased">
        <PostHogProvider>{children}</PostHogProvider>
      </body>
    </html>
  )
}
```

- [ ] **Step 4: Verify dev server starts without errors**

```bash
npm run dev
```

Open http://localhost:3000. Open browser DevTools → Network tab, filter by `posthog`. You should see requests to your PostHog host on page load and on navigation. No console errors about missing API key (if you've set `.env.local`).

- [ ] **Step 5: Commit**

```bash
git add src/components/providers/PostHogProvider.tsx src/components/providers/PostHogPageView.tsx src/app/layout.tsx
git commit -m "feat: add PostHog provider with SPA pageview tracking"
```

---

## Task 3: User identification and onboarding event

**Files:**
- Create: `src/components/providers/PostHogIdentifier.tsx`
- Create: `src/components/providers/PostHogIdentifier.test.tsx`
- Modify: `src/app/(app)/layout.tsx`
- Modify: `src/components/layout/AppShell.tsx`
- Modify: `src/lib/auth/actions.ts`

- [ ] **Step 1: Modify auth actions to signal onboarding completion**

In `src/lib/auth/actions.ts`, change the final `redirect('/recipes')` in `createHousehold` and `joinHousehold` to `redirect('/recipes?ob=1')`:

```ts
// In createHousehold — replace the last line:
redirect('/recipes?ob=1')

// In joinHousehold — replace the last line:
redirect('/recipes?ob=1')
```

- [ ] **Step 2: Write the failing tests**

Create `src/components/providers/PostHogIdentifier.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render } from '@testing-library/react'
import { PostHogIdentifier } from './PostHogIdentifier'

const mockCapture = vi.fn()
const mockIdentify = vi.fn()
const mockReplace = vi.fn()

vi.mock('posthog-js/react', () => ({
  usePostHog: () => ({ capture: mockCapture, identify: mockIdentify }),
  PostHogProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))

const mockSearchParams = new URLSearchParams()
let mockPathname = '/recipes'

vi.mock('next/navigation', () => ({
  useSearchParams: () => mockSearchParams,
  usePathname: () => mockPathname,
  useRouter: () => ({ replace: mockReplace }),
}))

beforeEach(() => {
  vi.clearAllMocks()
  mockSearchParams.delete('ob')
  mockPathname = '/recipes'
})

describe('PostHogIdentifier', () => {
  it('identifies the user on mount', () => {
    render(<PostHogIdentifier userId="user-123" email="test@example.com" />)
    expect(mockIdentify).toHaveBeenCalledWith('user-123', { email: 'test@example.com' })
  })

  it('does not fire onboarding_completed without ?ob=1', () => {
    render(<PostHogIdentifier userId="user-123" email="test@example.com" />)
    expect(mockCapture).not.toHaveBeenCalledWith('onboarding_completed')
  })

  it('fires onboarding_completed when ?ob=1 is present', () => {
    mockSearchParams.set('ob', '1')
    render(<PostHogIdentifier userId="user-123" email="test@example.com" />)
    expect(mockCapture).toHaveBeenCalledWith('onboarding_completed')
  })

  it('cleans up ?ob=1 from the URL after firing onboarding_completed', () => {
    mockSearchParams.set('ob', '1')
    render(<PostHogIdentifier userId="user-123" email="test@example.com" />)
    expect(mockReplace).toHaveBeenCalledWith('/recipes')
  })
})
```

- [ ] **Step 3: Run tests to verify they fail**

```bash
npm test -- PostHogIdentifier
```

Expected: tests fail with "Cannot find module './PostHogIdentifier'" — the component doesn't exist yet.

- [ ] **Step 4: Create PostHogIdentifier**

Create `src/components/providers/PostHogIdentifier.tsx`:

```tsx
'use client'

import { useEffect, Suspense } from 'react'
import { usePostHog } from 'posthog-js/react'
import { useSearchParams, usePathname, useRouter } from 'next/navigation'

interface Props {
  userId: string
  email: string
}

function PostHogIdentifierInner({ userId, email }: Props) {
  const posthog = usePostHog()
  const searchParams = useSearchParams()
  const pathname = usePathname()
  const router = useRouter()

  useEffect(() => {
    posthog.identify(userId, { email })
  }, [posthog, userId, email])

  useEffect(() => {
    if (searchParams.get('ob') !== '1') return
    posthog.capture('onboarding_completed')
    const params = new URLSearchParams(searchParams.toString())
    params.delete('ob')
    router.replace(pathname + (params.toString() ? `?${params.toString()}` : ''))
  }, [posthog, searchParams, pathname, router])

  return null
}

export function PostHogIdentifier(props: Props) {
  return (
    <Suspense fallback={null}>
      <PostHogIdentifierInner {...props} />
    </Suspense>
  )
}
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
npm test -- PostHogIdentifier
```

Expected: 4 passing tests.

- [ ] **Step 6: Add PostHogIdentifier to the authenticated layout**

Modify `src/app/(app)/layout.tsx`:

```tsx
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { AppShell } from '@/components/layout/AppShell'
import { PostHogIdentifier } from '@/components/providers/PostHogIdentifier'
import type { Profile } from '@/types/database'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single() as { data: Profile | null; error: unknown }

  if (!profile?.household_id) redirect('/onboarding')

  const isAdmin = user.email === process.env.ADMIN_EMAIL

  return (
    <>
      <PostHogIdentifier userId={user.id} email={user.email ?? ''} />
      <AppShell user={user} profile={profile} isAdmin={isAdmin}>
        {children}
      </AppShell>
    </>
  )
}
```

- [ ] **Step 7: Add posthog.reset() to AppShell sign-out**

Modify `src/components/layout/AppShell.tsx`. Add the import and hook, then update the form:

```tsx
// Add to imports at top:
import { usePostHog } from 'posthog-js/react'

// Inside AppShell component body, after usePathname():
const posthog = usePostHog()

// Update both sign-out forms (sidebar and mobile) — find the form with action={signOut} and add onSubmit:
<form action={signOut} onSubmit={() => posthog.reset()}>
```

There are two instances of the sign-out form in AppShell (desktop sidebar and mobile nav). Update both.

- [ ] **Step 8: Commit**

```bash
git add src/components/providers/PostHogIdentifier.tsx src/components/providers/PostHogIdentifier.test.tsx src/app/(app)/layout.tsx src/components/layout/AppShell.tsx src/lib/auth/actions.ts
git commit -m "feat: add PostHog user identification and onboarding_completed event"
```

---

## Task 4: recipe_created event

**Files:**
- Modify: `src/components/recipe/RecipeForm.tsx`
- Modify: `src/components/recipe/RecipeForm.test.tsx`

- [ ] **Step 1: Add the posthog mock to RecipeForm.test.tsx**

In `src/components/recipe/RecipeForm.test.tsx`, add near the top with the other mocks:

```tsx
const mockCapture = vi.fn()

vi.mock('posthog-js/react', () => ({
  usePostHog: () => ({ capture: mockCapture }),
}))
```

Also add `mockCapture` to the `beforeEach` cleanup (if there's already a `beforeEach` with `vi.clearAllMocks()`, this is covered automatically; if not, add):

```tsx
beforeEach(() => {
  vi.clearAllMocks()
})
```

- [ ] **Step 2: Write the failing test**

Add to `src/components/recipe/RecipeForm.test.tsx`:

```tsx
describe('PostHog events', () => {
  it('captures recipe_created after saving a new recipe', async () => {
    mockFetchSuccess('recipe-456')
    render(<RecipeForm />)
    await userEvent.type(screen.getByLabelText(/title/i), 'New Recipe')
    await userEvent.click(screen.getByRole('button', { name: /save recipe/i }))
    await waitFor(() => expect(mockCapture).toHaveBeenCalledWith('recipe_created'))
  })

  it('does not capture recipe_created when editing an existing recipe', async () => {
    mockFetchSuccess('r-1')
    render(<RecipeForm recipe={sampleRecipe} />)
    await userEvent.click(screen.getByRole('button', { name: /save changes/i }))
    await waitFor(() => expect(mockPush).toHaveBeenCalled())
    expect(mockCapture).not.toHaveBeenCalledWith('recipe_created')
  })
})
```

- [ ] **Step 3: Run tests to verify they fail**

```bash
npm test -- RecipeForm
```

Expected: the new `recipe_created` tests fail.

- [ ] **Step 4: Add usePostHog to RecipeForm**

In `src/components/recipe/RecipeForm.tsx`, add the import and hook:

```tsx
// Add to imports:
import { usePostHog } from 'posthog-js/react'

// Inside RecipeForm component, after useRouter():
const posthog = usePostHog()
```

Then in `handleSubmit`, after `const saved = await res.json() as { id: string }` and before `router.push(...)`:

```tsx
if (!isEdit) posthog.capture('recipe_created')
router.push(`/recipes/${saved.id}`)
router.refresh()
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
npm test -- RecipeForm
```

Expected: all tests pass including the new ones.

- [ ] **Step 6: Commit**

```bash
git add src/components/recipe/RecipeForm.tsx src/components/recipe/RecipeForm.test.tsx
git commit -m "feat: track recipe_created PostHog event"
```

---

## Task 5: recipe_deleted event

**Files:**
- Modify: `src/components/recipe/DeleteRecipeButton.tsx`
- Create: `src/components/recipe/DeleteRecipeButton.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `src/components/recipe/DeleteRecipeButton.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { DeleteRecipeButton } from './DeleteRecipeButton'

const mockCapture = vi.fn()
const mockPush = vi.fn()
const mockRefresh = vi.fn()

vi.mock('posthog-js/react', () => ({
  usePostHog: () => ({ capture: mockCapture }),
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush, refresh: mockRefresh }),
}))

beforeEach(() => {
  vi.clearAllMocks()
})

describe('DeleteRecipeButton', () => {
  it('captures recipe_deleted after confirmed delete', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true } as Response)
    render(<DeleteRecipeButton recipeId="r-1" />)
    await userEvent.click(screen.getByRole('button', { name: /delete/i }))
    await userEvent.click(screen.getByRole('button', { name: /yes, delete/i }))
    await waitFor(() => expect(mockCapture).toHaveBeenCalledWith('recipe_deleted'))
  })

  it('does not capture recipe_deleted when delete fails', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false } as Response)
    render(<DeleteRecipeButton recipeId="r-1" />)
    await userEvent.click(screen.getByRole('button', { name: /delete/i }))
    await userEvent.click(screen.getByRole('button', { name: /yes, delete/i }))
    await waitFor(() => expect(mockPush).not.toHaveBeenCalled())
    expect(mockCapture).not.toHaveBeenCalledWith('recipe_deleted')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm test -- DeleteRecipeButton
```

Expected: tests fail because `recipe_deleted` is not yet captured.

- [ ] **Step 3: Add usePostHog to DeleteRecipeButton**

In `src/components/recipe/DeleteRecipeButton.tsx`, add the import and hook, then fire the event:

```tsx
// Add to imports:
import { usePostHog } from 'posthog-js/react'

// Inside DeleteRecipeButton, after useRouter():
const posthog = usePostHog()
```

In `handleDelete`, after `if (res.ok) {`:

```tsx
if (res.ok) {
  posthog.capture('recipe_deleted')
  router.push('/recipes')
  router.refresh()
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm test -- DeleteRecipeButton
```

Expected: both tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/components/recipe/DeleteRecipeButton.tsx src/components/recipe/DeleteRecipeButton.test.tsx
git commit -m "feat: track recipe_deleted PostHog event"
```

---

## Task 6: meal_planned event

**Files:**
- Modify: `src/components/planner/PlannerClient.tsx`

- [ ] **Step 1: Add usePostHog to PlannerClient**

In `src/components/planner/PlannerClient.tsx`, add the import:

```tsx
// Add to imports:
import { usePostHog } from 'posthog-js/react'
```

Inside `PlannerClient`, after the existing hooks (`useState`, `useCallback`, etc.):

```tsx
const posthog = usePostHog()
```

In `handleAddRecipe`, after `setSlots((prev) => [...prev, slot])`:

```tsx
async function handleAddRecipe(dayOfWeek: number, recipe: Recipe) {
  const res = await fetch('/api/planner/slots', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ week_start: weekStartStr, day_of_week: dayOfWeek, recipe_id: recipe.id }),
  })
  if (res.ok) {
    const slot = await res.json() as MealSlotWithRecipe
    setSlots((prev) => [...prev, slot])
    posthog.capture('meal_planned')
    if (!weekPlan) loadWeek()
  }
}
```

- [ ] **Step 2: Verify no TypeScript errors**

```bash
npm run type-check
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/planner/PlannerClient.tsx
git commit -m "feat: track meal_planned PostHog event"
```

---

## Task 7: shopping events

**Files:**
- Modify: `src/components/shopping/ShoppingClient.tsx`
- Create: `src/components/shopping/ShoppingClient.test.tsx`

- [ ] **Step 1: Write the failing tests**

Create `src/components/shopping/ShoppingClient.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { screen } from '@testing-library/react'
import { ShoppingClient } from './ShoppingClient'
import type { ShoppingList, ShoppingItem, ShoppingCategory, ShoppingRule } from '@/types/database'

const mockCapture = vi.fn()

vi.mock('posthog-js/react', () => ({
  usePostHog: () => ({ capture: mockCapture }),
}))

vi.mock('./ShoppingItemRow', () => ({
  ShoppingItemRow: () => null,
}))

vi.mock('@/components/ui/ConfirmModal', () => ({
  ConfirmModal: () => null,
}))

const defaultProps = {
  initialList: null,
  initialItems: [] as ShoppingItem[],
  initialCategories: [] as ShoppingCategory[],
  initialRecipeNames: {},
  initialRules: [] as ShoppingRule[],
  defaultDateFrom: '2026-05-19',
  defaultDateTo: '2026-05-25',
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('ShoppingClient', () => {
  it('captures shopping_list_viewed on mount', () => {
    render(<ShoppingClient {...defaultProps} />)
    expect(mockCapture).toHaveBeenCalledWith('shopping_list_viewed')
  })

  it('captures shopping_list_generated after successful generation', async () => {
    global.fetch = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          list: { id: 'list-1' } as ShoppingList,
          items: [] as ShoppingItem[],
        }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ recipeNames: {} }),
      } as Response)
      .mockResolvedValueOnce({ ok: true } as Response) // make-smarter

    render(<ShoppingClient {...defaultProps} />)
    await userEvent.click(screen.getByRole('button', { name: /generate/i }))
    await waitFor(() => expect(mockCapture).toHaveBeenCalledWith('shopping_list_generated'))
  })

  it('does not capture shopping_list_generated on 409 (overwrite prompt)', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 409 } as Response)
    render(<ShoppingClient {...defaultProps} />)
    await userEvent.click(screen.getByRole('button', { name: /generate/i }))
    await waitFor(() => expect(global.fetch).toHaveBeenCalled())
    expect(mockCapture).not.toHaveBeenCalledWith('shopping_list_generated')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm test -- ShoppingClient
```

Expected: `shopping_list_viewed` and `shopping_list_generated` tests fail.

- [ ] **Step 3: Add usePostHog and fire events in ShoppingClient**

In `src/components/shopping/ShoppingClient.tsx`, add the import:

```tsx
// Add to existing imports at top:
import { useEffect } from 'react'
import { usePostHog } from 'posthog-js/react'
```

Note: `useState` is already imported — just add `useEffect` to that import if not already present.

Inside `ShoppingClient`, after the `useState` declarations:

```tsx
const posthog = usePostHog()

useEffect(() => {
  posthog.capture('shopping_list_viewed')
}, [posthog])
```

In `generateList`, after `await makeSmarter(data.list.id)` inside the `if (res.ok)` block:

```tsx
if (res.ok) {
  const data = await res.json() as { list: ShoppingList; items: ShoppingItem[] }
  setList(data.list)
  setItems(data.items)
  const listRes = await fetch('/api/shopping/list')
  if (listRes.ok) {
    const listData = await listRes.json() as { recipeNames: Record<string, string> }
    setRecipeNames(listData.recipeNames)
  }
  await makeSmarter(data.list.id)
  posthog.capture('shopping_list_generated')
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm test -- ShoppingClient
```

Expected: all 3 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/components/shopping/ShoppingClient.tsx src/components/shopping/ShoppingClient.test.tsx
git commit -m "feat: track shopping_list_viewed and shopping_list_generated PostHog events"
```

---

## Task 8: Final verification

- [ ] **Step 1: Run the full test suite**

```bash
npm test
```

Expected: all tests pass with no failures.

- [ ] **Step 2: Type check**

```bash
npm run type-check
```

Expected: no errors.

- [ ] **Step 3: Manual smoke test**

Start the dev server (`npm run dev`) and with PostHog open in another tab (Live Events view):

1. Sign up as a new user → verify `onboarding_completed` appears in PostHog
2. Create a recipe → verify `recipe_created`
3. Delete the recipe → verify `recipe_deleted`
4. Add a meal to the planner → verify `meal_planned`
5. Visit the shopping page → verify `shopping_list_viewed`
6. Generate a shopping list → verify `shopping_list_generated`
7. Sign out → verify the session is detached in PostHog (no new events tied to the user)

- [ ] **Step 4: Push to Vercel**

```bash
git push
```
