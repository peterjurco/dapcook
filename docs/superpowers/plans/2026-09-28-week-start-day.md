# Household Week Start Day — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a household choose Monday (default), Saturday or Sunday as the first day of its week, in Settings and in onboarding, without ever rewriting a planned meal's date.

**Architecture:** Meal slots move from `(week_plan_id, day_of_week)` to absolute `(household_id, date)`. A week is a view: the household's `week_start_day` decides which 7 dates are shown, and a pure `placeInWeek` function turns dated slots into 1–7 grid positions (clipping meals that straddle a week edge). `week_plans` survives only as the anchor for the per-week rules snapshot.

**Tech Stack:** Next.js 14 App Router, Supabase (Postgres + RLS), next-intl, @dnd-kit, Vitest + Testing Library.

**Spec:** `docs/superpowers/specs/2026-09-28-week-start-day-design.md`

**Branch:** `feat/week-start-day` (already created, spec committed).

---

## Conventions for every task

- Run a single test file: `npx vitest run <path>`. Full suite: `npm test`. Types: `npm run type-check`.
- **Type-check is expected to fail in two windows:** after Task 3 until Task 6 (week utilities gain a required argument), and after Task 7 until Task 13 (the `meal_slots` type change ripples through many files). Each task still runs its own test files green. Task 6 and Task 13 end with `npm run type-check` passing.
- Commit messages end with:
  ```
  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  ```
- Never call the Anthropic API while testing (see `CLAUDE.md`).
- Dates as strings are always `YYYY-MM-DD`. Build local-midnight `Date`s with `parseDateString` (Task 3), never `new Date('YYYY-MM-DD')` (that is UTC midnight).

## File map

| File | Responsibility |
| --- | --- |
| `supabase/migrations/022_week_start.sql` (new) | `households.week_start_day`, onboarding step, dated `meal_slots` |
| `src/types/database.ts` | Row types for the above |
| `src/lib/utils/week.ts` | Week arithmetic parameterised by `WeekStartDay` |
| `src/lib/auth/household.ts` | `getHouseholdWeekStartDay()` server helper |
| `src/components/providers/WeekStartProvider.tsx` (new) | Client context `useWeekStartDay()` |
| `src/lib/planner/placement.ts` (new) | `placeInWeek(slots, weekStart)` → `PlacedSlot[]` |
| `src/lib/planner/layout.ts` | Lane/agenda/edit-day layout on `PlacedSlot` |
| `src/app/api/planner/week/route.ts` | Overlapping-slot query |
| `src/app/api/planner/slots/route.ts`, `[id]/route.ts` | Date-based create/update + span validation |
| `src/components/planner/*` | Render placed slots, continuation cue |
| `src/components/recipe/AddToPlanPicker.tsx` | Household week start, posts `date` |
| `src/app/api/shopping/generate/route.ts`, `src/app/(flow)/shopping/generate/page.tsx`, `src/components/shopping/GenerateShoppingPage.tsx` | Date-based slot selection and labels |
| `src/app/(app)/planner/page.tsx` | Default week from dated slots |
| `src/components/settings/WeekStartSelector.tsx` (new) | Settings control |
| `src/components/onboarding/steps/WeekStartStep.tsx` (new) | Onboarding step |
| `src/lib/onboarding/steps.ts` | Step order |
| `messages/en/*.json`, `messages/sk/*.json` | Copy |

---

### Task 1: Migration

**Files:**
- Create: `supabase/migrations/022_week_start.sql`

- [ ] **Step 1: Write the migration**

```sql
-- Which day a household's week starts on. Existing households keep Monday.
ALTER TABLE households
  ADD COLUMN IF NOT EXISTS week_start_day TEXT NOT NULL DEFAULT 'monday'
  CHECK (week_start_day IN ('monday', 'saturday', 'sunday'));

-- Onboarding gains a week-start step right after units.
ALTER TABLE households DROP CONSTRAINT IF EXISTS households_onboarding_step_check;
ALTER TABLE households
  ADD CONSTRAINT households_onboarding_step_check
  CHECK (onboarding_step IN ('translation', 'units', 'week_start', 'tags', 'shopping_categories', 'invite'));

-- Meal slots are stored against real dates, so a later change of week start
-- never moves a meal. week_plans stays as the anchor for week_plan_rules.
ALTER TABLE meal_slots ADD COLUMN IF NOT EXISTS household_id UUID REFERENCES households(id) ON DELETE CASCADE;
ALTER TABLE meal_slots ADD COLUMN IF NOT EXISTS date DATE;

UPDATE meal_slots ms
SET household_id = wp.household_id,
    date = wp.week_start + (ms.day_of_week - 1)
FROM week_plans wp
WHERE wp.id = ms.week_plan_id
  AND ms.date IS NULL;

ALTER TABLE meal_slots ALTER COLUMN household_id SET NOT NULL;
ALTER TABLE meal_slots ALTER COLUMN date SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_meal_slots_household_date ON meal_slots(household_id, date);

DROP POLICY IF EXISTS "household_access" ON meal_slots;
CREATE POLICY "household_access" ON meal_slots
  FOR ALL USING (household_id = public.user_household_id())
  WITH CHECK (household_id = public.user_household_id());

DROP INDEX IF EXISTS idx_meal_slots_week_plan;
ALTER TABLE meal_slots DROP COLUMN IF EXISTS week_plan_id;
ALTER TABLE meal_slots DROP COLUMN IF EXISTS day_of_week;
```

- [ ] **Step 2: Sanity-check the backfill arithmetic**

`DATE + INTEGER` in Postgres adds days, so `'2026-06-01'::date + 2 = '2026-06-03'`. Nothing to run locally; staging applies this when the branch is merged there (Task 16).

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/022_week_start.sql
git commit -m "feat(db): household week start day and dated meal slots"
```

---

### Task 2: Household types + `PATCH /api/household`

**Files:**
- Modify: `src/types/database.ts:6-44` (households) — slot types are changed in Task 7
- Modify: `src/app/api/household/route.ts:17-31`
- Test: `src/app/api/household/route.test.ts`

- [ ] **Step 1: Write failing tests** — append inside `describe('PATCH /api/household', ...)`:

```ts
  it('stores a supported week start day', async () => {
    const res = await patch({ week_start_day: 'sunday' })
    expect(res.status).toBe(200)
    expect(mocks.update).toHaveBeenCalledWith({ week_start_day: 'sunday' })
  })

  it('rejects an unsupported week start day', async () => {
    expect((await patch({ week_start_day: 'wednesday' })).status).toBe(400)
    expect(mocks.update).not.toHaveBeenCalled()
  })

  it('accepts the week_start onboarding step', async () => {
    expect((await patch({ onboarding_step: 'week_start' })).status).toBe(200)
  })
```

- [ ] **Step 2: Run** `npx vitest run src/app/api/household/route.test.ts` — expected: the three new tests FAIL (400 "Nothing to update" / 400 invalid step).

- [ ] **Step 3: Add the type and constant to `src/lib/utils/week.ts`** (top of file, below the import):

```ts
export const WEEK_START_DAYS = ['monday', 'saturday', 'sunday'] as const
export type WeekStartDay = (typeof WEEK_START_DAYS)[number]

export function isWeekStartDay(value: unknown): value is WeekStartDay {
  return WEEK_START_DAYS.includes(value as WeekStartDay)
}
```

- [ ] **Step 4: Update `src/types/database.ts` households** — in `Row`, `Insert` and `Update` add `week_start_day` (`Row`: required, others optional) and add `'week_start'` to every `onboarding_step` union:

```ts
          week_start_day: 'monday' | 'saturday' | 'sunday'
          onboarding_step: 'translation' | 'units' | 'week_start' | 'tags' | 'shopping_categories' | 'invite' | null
```
(`Insert`/`Update`: `week_start_day?: ...`, `onboarding_step?: ...`.)

- [ ] **Step 5: Validate in the route** — `src/app/api/household/route.ts`. Add `import { isWeekStartDay } from '@/lib/utils/week'`, add `week_start_day?: unknown` to the body type, and after the `preferred_units` block:

```ts
  if (body.week_start_day !== undefined) {
    if (!isWeekStartDay(body.week_start_day)) {
      return NextResponse.json({ error: 'Invalid week_start_day' }, { status: 400 })
    }
    updates.week_start_day = body.week_start_day
  }
```

- [ ] **Step 6: Add `'week_start'` to the step lists** — `src/lib/onboarding/steps.ts`:

```ts
export const ONBOARDING_STEPS = [
  'language',
  'intro',
  'household',
  'translation',
  'units',
  'week_start',
  'tags',
  'shopping_categories',
  'invite',
  'done',
] as const
```
```ts
export const PERSISTED_STEPS = ['translation', 'units', 'week_start', 'tags', 'shopping_categories', 'invite'] as const
```

- [ ] **Step 7: Update `src/lib/onboarding/steps.test.ts`** — change `expect(TOTAL_STEPS).toBe(7)` to `8` and add:

```ts
  it('asks for the week start right after units', () => {
    expect(nextStep('units')).toBe('week_start')
    expect(nextStep('week_start')).toBe('tags')
    expect(previousStep('tags')).toBe('week_start')
    expect(persistedStepAfter('units')).toBe('week_start')
    expect(persistedStepAfter('week_start')).toBe('tags')
  })
```

- [ ] **Step 8: Run** `npx vitest run src/app/api/household/route.test.ts src/lib/onboarding` — expected: PASS. (`OnboardingWizard` will render nothing for `week_start` until Task 14; its existing tests don't walk past units → tags, so if one does and fails, note it and fix it in Task 14.)

- [ ] **Step 9: Commit**

```bash
git add src/lib/utils/week.ts src/types/database.ts src/app/api/household src/lib/onboarding
git commit -m "feat: week_start_day household setting and onboarding step order"
```

---

### Task 3: Week utilities parameterised by start day

**Files:**
- Modify: `src/lib/utils/week.ts`
- Test: `src/lib/utils/week.test.ts`

- [ ] **Step 1: Write failing tests** — append to `src/lib/utils/week.test.ts` (extend the import list with the new names):

```ts
import {
  addDays,
  dayIndexInWeek,
  daysBetween,
  getWeekStart,
  isCurrentWeek,
  isNextWeek,
  parseDateString,
  parseWeekParam,
  spanFitsWeek,
  toDateString,
} from './week'
import { afterEach, beforeEach, vi } from 'vitest'

const local = (s: string) => parseDateString(s)!

describe('getWeekStart', () => {
  // 2026-09-30 is a Wednesday.
  it('finds the Monday, Saturday or Sunday on or before the date', () => {
    expect(toDateString(getWeekStart(local('2026-09-30'), 'monday'))).toBe('2026-09-28')
    expect(toDateString(getWeekStart(local('2026-09-30'), 'sunday'))).toBe('2026-09-27')
    expect(toDateString(getWeekStart(local('2026-09-30'), 'saturday'))).toBe('2026-09-26')
  })

  it('returns the date itself when it is the start day', () => {
    expect(toDateString(getWeekStart(local('2026-09-27'), 'sunday'))).toBe('2026-09-27')
    expect(toDateString(getWeekStart(local('2026-09-26'), 'saturday'))).toBe('2026-09-26')
    expect(toDateString(getWeekStart(local('2026-09-28'), 'monday'))).toBe('2026-09-28')
  })

  it('treats Sunday as the last day of a Monday week', () => {
    expect(toDateString(getWeekStart(local('2026-10-04'), 'monday'))).toBe('2026-09-28')
  })

  it('crosses month and year boundaries', () => {
    expect(toDateString(getWeekStart(local('2027-01-01'), 'saturday'))).toBe('2026-12-26')
  })
})

describe('parseWeekParam', () => {
  it('normalises any date to its week start', () => {
    expect(toDateString(parseWeekParam('2026-09-28', 'sunday'))).toBe('2026-09-27')
  })
})

describe('date helpers', () => {
  it('parses YYYY-MM-DD as local midnight and rejects junk', () => {
    const d = local('2026-03-29')
    expect([d.getFullYear(), d.getMonth(), d.getDate(), d.getHours()]).toEqual([2026, 2, 29, 0])
    expect(parseDateString('2026-13-01')).toBeNull()
    expect(parseDateString('nope')).toBeNull()
  })

  it('adds and counts days across a DST change', () => {
    // Europe switches to summer time on 2026-03-29.
    expect(toDateString(addDays(local('2026-03-28'), 2))).toBe('2026-03-30')
    expect(daysBetween(local('2026-03-28'), local('2026-04-04'))).toBe(7)
    expect(daysBetween(local('2026-04-04'), local('2026-03-28'))).toBe(-7)
  })

  it('gives the 1-based position of a date in its week', () => {
    expect(dayIndexInWeek(local('2026-09-27'), local('2026-09-27'))).toBe(1)
    expect(dayIndexInWeek(local('2026-10-03'), local('2026-09-27'))).toBe(7)
  })

  it('checks whether a meal fits inside the week it starts in', () => {
    expect(spanFitsWeek('2026-10-03', 1, 'sunday')).toBe(true) // Saturday, last day
    expect(spanFitsWeek('2026-10-03', 2, 'sunday')).toBe(false)
    expect(spanFitsWeek('2026-09-27', 7, 'sunday')).toBe(true)
    expect(spanFitsWeek('2026-10-03', 7, 'saturday')).toBe(true) // Saturday, first day
  })
})

describe('isCurrentWeek / isNextWeek', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 8, 30, 12)) // Wed 2026-09-30, local
  })
  afterEach(() => vi.useRealTimers())

  it('is true when today falls inside the week, whatever day it starts on', () => {
    expect(isCurrentWeek(local('2026-09-27'))).toBe(true) // Sunday week
    expect(isCurrentWeek(local('2026-09-26'))).toBe(true) // Saturday week
    expect(isCurrentWeek(local('2026-09-20'))).toBe(false)
    expect(isNextWeek(local('2026-10-04'))).toBe(true)
    expect(isNextWeek(local('2026-09-27'))).toBe(false)
  })
})
```

- [ ] **Step 2: Run** `npx vitest run src/lib/utils/week.test.ts` — expected: FAIL (missing exports / wrong signatures).

- [ ] **Step 3: Implement** in `src/lib/utils/week.ts`.

Keep the `import` line and the `WEEK_START_DAYS` / `WeekStartDay` / `isWeekStartDay` block added in Task 2; replace the old `getWeekStart`, `getWeekDays`, `nextWeekStart`, `prevWeekStart` with:

```ts
/** `Date.getDay()` value of each start day. */
const JS_DAY: Record<WeekStartDay, number> = { sunday: 0, monday: 1, saturday: 6 }

/** Returns the first day (local midnight) of the week containing `date`. */
export function getWeekStart(date: Date, startDay: WeekStartDay): Date {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() - ((d.getDay() - JS_DAY[startDay] + 7) % 7))
  return d
}

/** Returns a new Date `days` calendar days after `date`. */
export function addDays(date: Date, days: number): Date {
  const d = new Date(date)
  d.setDate(d.getDate() + days)
  return d
}

/** Whole calendar days from `a` to `b` (negative when `b` is earlier). DST-safe. */
export function daysBetween(a: Date, b: Date): number {
  const utc = (d: Date) => Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())
  return Math.round((utc(b) - utc(a)) / 86_400_000)
}

/** Parses YYYY-MM-DD as local midnight; null when malformed or not a real date. */
export function parseDateString(value: string | undefined | null): Date | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null
  const [y, m, d] = value.split('-').map(Number)
  const date = new Date(y, m - 1, d)
  return date.getMonth() === m - 1 && date.getDate() === d ? date : null
}

/** Returns an array of the 7 dates of the week starting at `weekStart` */
export function getWeekDays(weekStart: Date): Date[] {
  return Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))
}

/** Returns the start of the next week */
export function nextWeekStart(weekStart: Date): Date {
  return addDays(weekStart, 7)
}

/** Returns the start of the previous week */
export function prevWeekStart(weekStart: Date): Date {
  return addDays(weekStart, -7)
}
```

and, below `toDateString`:

```ts
/** Parses a YYYY-MM-DD string into the start of its week; falls back to the current week. */
export function parseWeekParam(param: string | undefined, startDay: WeekStartDay): Date {
  return getWeekStart(parseDateString(param) ?? new Date(), startDay)
}

function todayMidnight(): Date {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d
}

/** True if today falls inside the week starting at `weekStart` */
export function isCurrentWeek(weekStart: Date): boolean {
  const offset = daysBetween(weekStart, todayMidnight())
  return offset >= 0 && offset < 7
}

/** True if today + 7 days falls inside the week starting at `weekStart` */
export function isNextWeek(weekStart: Date): boolean {
  return isCurrentWeek(prevWeekStart(weekStart))
}

/** 1-based position (1–7) of `date` in the week starting at `weekStart` */
export function dayIndexInWeek(date: Date, weekStart: Date): number {
  return daysBetween(weekStart, date) + 1
}

/** True if a meal starting on `date` and lasting `span` days ends inside the week it starts in. */
export function spanFitsWeek(date: string, span: number, startDay: WeekStartDay): boolean {
  const d = parseDateString(date)
  if (!d) return false
  return dayIndexInWeek(d, getWeekStart(d, startDay)) - 1 + span <= 7
}
```

Delete `dayOfWeekNumber` and the old `parseWeekParam`/`isCurrentWeek`/`isNextWeek`. `formatWeekLabel`, `formatDayLabel`, `formatDayLabelLong` and `toDateString` are unchanged.

- [ ] **Step 4: Run** `npx vitest run src/lib/utils/week.test.ts` — expected: PASS.

- [ ] **Step 5: Commit** (callers are fixed in Task 6; type-check fails until then)

```bash
git add src/lib/utils/week.ts src/lib/utils/week.test.ts
git commit -m "feat: week utilities take the household week start day"
```

---

### Task 4: `getHouseholdWeekStartDay()` server helper

**Files:**
- Modify: `src/lib/auth/household.ts`
- Test: `src/lib/auth/household-week-start.test.ts` (new — the existing `household.test.ts` mocks the admin client, this helper uses the request client)

- [ ] **Step 1: Write the failing test** — `getCurrentHouseholdId` is driven for real through its admin-client lookup (as in `household.test.ts`); the week start comes from the request client.

```ts
import { describe, expect, it, vi, beforeEach } from 'vitest'

const mocks = vi.hoisted(() => ({
  profile: vi.fn(),
  household: vi.fn(),
  householdEq: vi.fn(),
}))

vi.mock('next/cache', () => ({ unstable_cache: (fn: unknown) => fn, revalidateTag: vi.fn() }))
vi.mock('./current-user', () => ({ getCurrentUser: vi.fn(async () => ({ id: 'user-1', email: null })) }))
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: () => ({ select: () => ({ eq: () => ({ single: mocks.profile }) }) }),
  }),
}))
vi.mock('@/lib/supabase/server', () => ({
  createClient: () => ({
    from: () => ({
      select: () => ({
        eq: (...args: unknown[]) => {
          mocks.householdEq(...args)
          return { single: mocks.household }
        },
      }),
    }),
  }),
}))

import { getHouseholdWeekStartDay } from './household'

beforeEach(() => vi.clearAllMocks())

describe('getHouseholdWeekStartDay', () => {
  it("returns the household's week start day", async () => {
    mocks.profile.mockResolvedValue({ data: { household_id: 'hh-1' } })
    mocks.household.mockResolvedValue({ data: { week_start_day: 'sunday' } })
    expect(await getHouseholdWeekStartDay()).toBe('sunday')
    expect(mocks.householdEq).toHaveBeenCalledWith('id', 'hh-1')
  })

  it('falls back to Monday without a household', async () => {
    mocks.profile.mockResolvedValue({ data: { household_id: null } })
    expect(await getHouseholdWeekStartDay()).toBe('monday')
    expect(mocks.household).not.toHaveBeenCalled()
  })

  it('falls back to Monday for an unknown value', async () => {
    mocks.profile.mockResolvedValue({ data: { household_id: 'hh-1' } })
    mocks.household.mockResolvedValue({ data: { week_start_day: 'friday' } })
    expect(await getHouseholdWeekStartDay()).toBe('monday')
  })
})
```

- [ ] **Step 2: Run** `npx vitest run src/lib/auth/household-week-start.test.ts` — expected: FAIL (`getHouseholdWeekStartDay` is not a function).

- [ ] **Step 3: Implement** — append to `src/lib/auth/household.ts`:

```ts
import { createClient } from '@/lib/supabase/server'
import { isWeekStartDay, type WeekStartDay } from '@/lib/utils/week'
```
(move these imports to the top of the file with the others)

```ts
/**
 * The signed-in user's household week start. Read fresh on every request (not
 * cross-request cached like the household id) so a change in Settings shows
 * up on the next navigation.
 */
export const getHouseholdWeekStartDay = perRequest(async (): Promise<WeekStartDay> => {
  const householdId = await getCurrentHouseholdId()
  if (!householdId) return 'monday'
  const { data } = await createClient()
    .from('households')
    .select('week_start_day')
    .eq('id', householdId)
    .single()
  return isWeekStartDay(data?.week_start_day) ? data.week_start_day : 'monday'
})
```

- [ ] **Step 4: Run** `npx vitest run src/lib/auth` — expected: PASS (both household test files).

- [ ] **Step 5: Commit**

```bash
git add src/lib/auth/household.ts src/lib/auth/household-week-start.test.ts
git commit -m "feat: server helper for the household week start day"
```

---

### Task 5: `WeekStartProvider` client context

**Files:**
- Create: `src/components/providers/WeekStartProvider.tsx`
- Test: `src/components/providers/WeekStartProvider.test.tsx`
- Modify: `src/app/(app)/layout.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { WeekStartProvider, useWeekStartDay } from './WeekStartProvider'

function Probe() {
  return <span>{useWeekStartDay()}</span>
}

describe('WeekStartProvider', () => {
  it('provides the household week start day', () => {
    render(<WeekStartProvider value="saturday"><Probe /></WeekStartProvider>)
    expect(screen.getByText('saturday')).toBeInTheDocument()
  })

  it('defaults to Monday outside a provider', () => {
    render(<Probe />)
    expect(screen.getByText('monday')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run** `npx vitest run src/components/providers/WeekStartProvider.test.tsx` — expected: FAIL (module not found).

- [ ] **Step 3: Implement** `src/components/providers/WeekStartProvider.tsx`:

```tsx
'use client'

import { createContext, useContext } from 'react'
import type { WeekStartDay } from '@/lib/utils/week'

const WeekStartContext = createContext<WeekStartDay>('monday')

/** Makes the household's week start day available to client components. */
export function WeekStartProvider({ value, children }: { value: WeekStartDay; children: React.ReactNode }) {
  return <WeekStartContext.Provider value={value}>{children}</WeekStartContext.Provider>
}

export function useWeekStartDay(): WeekStartDay {
  return useContext(WeekStartContext)
}
```

- [ ] **Step 4: Wire into `src/app/(app)/layout.tsx`** — import `getHouseholdWeekStartDay` from `@/lib/auth/household` and `WeekStartProvider`; after `const messages = ...` add `const weekStartDay = await getHouseholdWeekStartDay()` and wrap `AppShell`:

```tsx
      <WeekStartProvider value={weekStartDay}>
        <AppShell user={user} profile={profile} isAdmin={isAdmin} birthdayConfig={birthdayConfig}>
          {children}
        </AppShell>
      </WeekStartProvider>
```

- [ ] **Step 5: Run** `npx vitest run src/components/providers` — expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/components/providers/WeekStartProvider.tsx src/components/providers/WeekStartProvider.test.tsx "src/app/(app)/layout.tsx"
git commit -m "feat: provide the household week start day to client components"
```

---

### Task 6: Pass the start day to every week caller (still slot-per-week-plan)

This keeps the old data model but anchors weeks on the household start day. After this task `npm run type-check` must pass again.

**Files:**
- Modify: `src/app/(app)/planner/page.tsx`
- Modify: `src/app/(flow)/shopping/generate/page.tsx`
- Modify: `src/app/api/planner/week/route.ts`
- Modify: `src/app/api/planner/slots/route.ts`
- Modify: `src/components/recipe/AddToPlanPicker.tsx`
- Test: `src/components/recipe/AddToPlanButton.test.tsx`

- [ ] **Step 1: Server callers** — in each of the four server files import `getHouseholdWeekStartDay` from `@/lib/auth/household`, read it once (`const startDay = await getHouseholdWeekStartDay()`), and pass it:
  - `planner/page.tsx`: `parseWeekParam(searchParams.week, startDay)`; inside `getDefaultWeek` use `getWeekStart(new Date(), startDay)` and `parseWeekParam(latestWithMeals.week_start, startDay)` (pass `startDay` in as a parameter of `getDefaultWeek`).
  - `shopping/generate/page.tsx`: `parseWeekParam(searchParams.week, startDay)` (it already falls back to the current week, so drop the `getWeekStart()` branch).
  - `api/planner/week/route.ts` and `api/planner/slots/route.ts`: `parseWeekParam(weekParam, startDay)` / `parseWeekParam(body.week_start, startDay)`.

- [ ] **Step 2: Write the failing picker test** — in `src/components/recipe/AddToPlanButton.test.tsx` add `import { WeekStartProvider } from '@/components/providers/WeekStartProvider'` and `afterEach` to the vitest import, then:

```tsx
describe('AddToPlanButton with a Sunday week', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(2026, 8, 30, 12)) // Wednesday 2026-09-30, local
  })
  afterEach(() => vi.useRealTimers())

  it('uses the household week and preselects today', async () => {
    render(
      <WeekStartProvider value="sunday">
        <AddToPlanButton recipeId="recipe-1" />
      </WeekStartProvider>,
    )
    await userEvent.click(screen.getByRole('button', { name: /add to plan/i }))
    await userEvent.click(screen.getByRole('button', { name: /add to \w+ \d+/i }))

    await waitFor(() => expect(global.fetch).toHaveBeenCalled())
    expect(lastFetchBody()).toMatchObject({ week_start: '2026-09-27', day_of_week: 4 })
  })
})
```

Also rename the existing test `'defaults next week to Monday'` to `'defaults a later week to its first day'` (the assertion `day_of_week === 1` stays).

- [ ] **Step 3: Run** `npx vitest run src/components/recipe/AddToPlanButton.test.tsx` — expected: the new test FAILS.

- [ ] **Step 4: Update `AddToPlanPicker.tsx`**
  - `import { useWeekStartDay } from '@/components/providers/WeekStartProvider'`; `const startDay = useWeekStartDay()`.
  - `getWeekStart(today)` → `getWeekStart(today, startDay)`; `getWeekStart(new Date(saved))` → `getWeekStart(parseDateString(saved) ?? today, startDay)`.
  - Replace `dayOfWeekNumber(today)` (two places) with `dayIndexInWeek(today, weekStart)` / `dayIndexInWeek(today, next)`.
  - Update the import list accordingly (drop `dayOfWeekNumber`, add `dayIndexInWeek`, `parseDateString`).

- [ ] **Step 5: Run** `npx vitest run src/components/recipe src/lib/utils && npm run type-check` — expected: PASS, no type errors.

- [ ] **Step 6: Commit**

```bash
git add src/app "src/app/(app)/planner/page.tsx" "src/app/(flow)/shopping/generate/page.tsx" src/components/recipe
git commit -m "feat: anchor planner weeks on the household week start day"
```

---

### Task 7: Dated slot types + `placeInWeek`

**Files:**
- Modify: `src/types/database.ts:253-285` (`meal_slots`)
- Create: `src/lib/planner/placement.ts`
- Test: `src/lib/planner/placement.test.ts`

- [ ] **Step 1: Change the `meal_slots` types** — replace `week_plan_id` / `day_of_week` in `Row`, `Insert`, `Update` with:

```ts
          household_id: string
          date: string
```
(`Insert`: both required; `Update`: both optional.) Leave `shopping_lists.week_plan_id` alone.

- [ ] **Step 2: Write the failing test** `src/lib/planner/placement.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { placeInWeek } from './placement'
import { parseDateString } from '@/lib/utils/week'
import type { MealSlotWithRecipe } from '@/types/planner'

function slot(id: string, date: string, span_days = 1): MealSlotWithRecipe {
  return {
    id,
    household_id: 'hh',
    date,
    meal_type: 'lunch',
    recipe_id: null,
    custom_label: 'Leftovers',
    servings_scale: 1,
    span_days,
    created_at: '2026-01-01T00:00:00.000Z',
    recipe: null,
  }
}

const sundayWeek = parseDateString('2026-09-27')!

describe('placeInWeek', () => {
  it('places a meal inside the week at its day', () => {
    const [p] = placeInWeek([slot('a', '2026-09-29', 2)], sundayWeek)
    expect(p).toMatchObject({ id: 'a', day: 3, span: 2, hiddenBefore: 0, continued: false })
  })

  it('clips a meal that started in the previous week and marks it continued', () => {
    // Saturday 2026-09-26 for 3 days → Sat, Sun, Mon
    const [p] = placeInWeek([slot('a', '2026-09-26', 3)], sundayWeek)
    expect(p).toMatchObject({ day: 1, span: 2, hiddenBefore: 1, continued: true })
  })

  it('clips a meal that runs past the end of the week', () => {
    const [p] = placeInWeek([slot('a', '2026-10-03', 3)], sundayWeek)
    expect(p).toMatchObject({ day: 7, span: 1, hiddenBefore: 0, continued: false })
  })

  it('drops meals that do not touch the week', () => {
    expect(placeInWeek([slot('a', '2026-09-25', 2), slot('b', '2026-10-04')], sundayWeek)).toEqual([])
  })

  it('keeps the original slot fields', () => {
    const [p] = placeInWeek([slot('a', '2026-09-27', 1)], sundayWeek)
    expect(p.date).toBe('2026-09-27')
    expect(p.span_days).toBe(1)
  })
})
```

- [ ] **Step 3: Run** `npx vitest run src/lib/planner/placement.test.ts` — expected: FAIL (module not found).

- [ ] **Step 4: Implement** `src/lib/planner/placement.ts`:

```ts
import { daysBetween, parseDateString } from '@/lib/utils/week'
import type { MealSlotWithRecipe } from '@/types/planner'

/** A meal as drawn in one week: where it sits and how much of it is visible. */
export interface PlacedSlot extends MealSlotWithRecipe {
  /** 1–7 column of the first visible day. */
  day: number
  /** Visible days in this week. */
  span: number
  /** Days of the meal that fall before this week. */
  hiddenBefore: number
  /** The meal began in an earlier week (only possible after a week-start change). */
  continued: boolean
}

/** Places each slot that touches the week starting at `weekStart`; the rest are dropped. */
export function placeInWeek(slots: MealSlotWithRecipe[], weekStart: Date): PlacedSlot[] {
  const placed: PlacedSlot[] = []
  for (const slot of slots) {
    const date = parseDateString(slot.date)
    if (!date) continue
    const first = daysBetween(weekStart, date) // 0-based, may be negative
    const last = first + slot.span_days - 1
    if (last < 0 || first > 6) continue
    const visibleFirst = Math.max(0, first)
    const visibleLast = Math.min(6, last)
    placed.push({
      ...slot,
      day: visibleFirst + 1,
      span: visibleLast - visibleFirst + 1,
      hiddenBefore: visibleFirst - first,
      continued: first < 0,
    })
  }
  return placed
}
```

- [ ] **Step 5: Run** `npx vitest run src/lib/planner/placement.test.ts` — expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/types/database.ts src/lib/planner/placement.ts src/lib/planner/placement.test.ts
git commit -m "feat: dated meal slot types and week placement"
```

---

### Task 8: Layout on placed slots

**Files:**
- Modify: `src/lib/planner/layout.ts`
- Test: `src/lib/planner/layout.test.ts`

- [ ] **Step 1: Update the test fixture and add a continuation test** — in `layout.test.ts` replace the `slot` builder with one that returns a `PlacedSlot`, taking `day` and `span` (rename every `day_of_week:` / `span_days:` argument in the file to `day:` / `span:`):

```ts
import type { PlacedSlot } from './placement'

function slot(
  p: Partial<PlacedSlot> & { id: string; day: number; span: number },
): PlacedSlot {
  return {
    id: p.id,
    household_id: 'hh',
    date: '2026-06-01',
    meal_type: 'lunch',
    recipe_id: p.recipe_id ?? null,
    custom_label: p.custom_label ?? null,
    servings_scale: 1,
    span_days: p.span_days ?? p.span + (p.hiddenBefore ?? 0),
    created_at: p.created_at ?? '2026-01-01T00:00:00.000Z',
    recipe: p.recipe ?? null,
    day: p.day,
    span: p.span,
    hiddenBefore: p.hiddenBefore ?? 0,
    continued: (p.hiddenBefore ?? 0) > 0,
  }
}
```

Add inside `describe('buildMobileAgenda', ...)`:

```ts
  it('counts days of a continued meal from its real start', () => {
    // Started one day before this week, 3 days long → visible on days 1–2 as day 2/3 and 3/3.
    const soup = slot({ id: 'soup', day: 1, span: 2, hiddenBefore: 1 })
    const days = buildMobileAgenda([soup])
    expect(days[0].cards[0]).toMatchObject({ dayIndex: 2, span: 3 })
    expect(days[1].cards[0]).toMatchObject({ dayIndex: 3, span: 3 })
    expect(days[2].cards).toEqual([])
  })
```

- [ ] **Step 2: Run** `npx vitest run src/lib/planner/layout.test.ts` — expected: FAIL.

- [ ] **Step 3: Update `layout.ts`** — switch the element type to `PlacedSlot` and read `day`/`span`:

```ts
import type { PlacedSlot } from './placement'

export function compareInDay(a: PlacedSlot, b: PlacedSlot): number {
  if (a.day !== b.day) return a.day - b.day
  if (a.span !== b.span) return b.span - a.span
  const ca = a.created_at ?? ''
  const cb = b.created_at ?? ''
  if (ca !== cb) return ca < cb ? -1 : 1
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
}
```

- `EditDay.slots: PlacedSlot[]`; `buildEditDays(slots: PlacedSlot[])` filters `s.day === d`.
- `packLanes(slots: PlacedSlot[])`: `const start = s.day; const end = s.day + s.span`.
- `AgendaCard.slot: PlacedSlot`; `buildMobileAgenda(slots: PlacedSlot[])`:

```ts
    const active = slots.filter((s) => s.day <= d && d < s.day + s.span).sort(compareInDay)
    days.push({
      dayOfWeek: d,
      cards: active.map((s) => ({ slot: s, dayIndex: s.hiddenBefore + d - s.day + 1, span: s.span_days })),
    })
```

`maxSpanForStart` stays unchanged.

- [ ] **Step 4: Run** `npx vitest run src/lib/planner` — expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/planner/layout.ts src/lib/planner/layout.test.ts
git commit -m "refactor: planner layout works on placed slots"
```

---

### Task 9: `GET /api/planner/week` — overlapping dated slots

**Files:**
- Modify: `src/app/api/planner/week/route.ts`
- Test: `src/app/api/planner/week/route.test.ts` (new)

- [ ] **Step 1: Write the failing test**

```ts
// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const mocks = vi.hoisted(() => ({
  slotFilters: [] as Array<[string, string, unknown]>,
  slots: [] as unknown[],
}))

function chain(table: string) {
  const q: Record<string, unknown> = {}
  const record = (op: string) => (col: string, val: unknown) => {
    if (table === 'meal_slots') mocks.slotFilters.push([op, col, val])
    return q
  }
  Object.assign(q, {
    select: () => q,
    eq: record('eq'),
    gte: record('gte'),
    lte: record('lte'),
    order: () => q,
    insert: () => q,
    maybeSingle: async () => ({ data: { id: 'wp-1', week_start: '2026-09-27' } }),
    single: async () => ({ data: { id: 'wp-1' } }),
    then: (resolve: (v: unknown) => void) =>
      resolve({ data: table === 'meal_slots' ? mocks.slots : [] }),
  })
  return q
}

vi.mock('@/lib/supabase/server', () => ({ createClient: () => ({ from: chain }) }))
vi.mock('@/lib/auth/current-user', () => ({ getCurrentUser: vi.fn(async () => ({ id: 'user-1' })) }))
vi.mock('@/lib/auth/household', () => ({
  getCurrentHouseholdId: vi.fn(async () => 'hh-1'),
  getHouseholdWeekStartDay: vi.fn(async () => 'sunday'),
}))

import { GET } from './route'

const slot = (id: string, date: string, span_days: number) => ({ id, date, span_days, household_id: 'hh-1' })

beforeEach(() => {
  mocks.slotFilters.length = 0
  mocks.slots = []
})

describe('GET /api/planner/week', () => {
  it('queries a window that can contain meals straddling into the week', async () => {
    await GET(new NextRequest('http://localhost/api/planner/week?week=2026-09-30'))
    expect(mocks.slotFilters).toEqual(
      expect.arrayContaining([
        ['eq', 'household_id', 'hh-1'],
        ['gte', 'date', '2026-09-21'],
        ['lte', 'date', '2026-10-03'],
      ]),
    )
  })

  it('returns only slots that overlap the week', async () => {
    mocks.slots = [
      slot('before', '2026-09-21', 3), // ends 09-23
      slot('into', '2026-09-26', 2), // Sat–Sun, reaches 09-27
      slot('inside', '2026-09-30', 1),
    ]
    const res = await GET(new NextRequest('http://localhost/api/planner/week?week=2026-09-27'))
    const body = await res.json()
    expect(body.slots.map((s: { id: string }) => s.id)).toEqual(['into', 'inside'])
  })
})
```

- [ ] **Step 2: Run** `npx vitest run src/app/api/planner/week/route.test.ts` — expected: FAIL.

- [ ] **Step 3: Implement** — in `route.ts` import `addDays`, `daysBetween`, `parseDateString` from `@/lib/utils/week`. Replace the "Fetch slots" block:

```ts
  // Slots that touch the week. A meal lasts at most 7 days, so anything that
  // reaches into the week started no more than 6 days before it.
  const weekEndStr = toDateString(addDays(weekStart, 6))
  const { data: candidates } = await supabase
    .from('meal_slots')
    .select('*, recipe:recipes(id, title, image_url, cook_time_min, prep_time_min, servings)')
    .eq('household_id', householdId)
    .gte('date', toDateString(addDays(weekStart, -6)))
    .lte('date', weekEndStr)
    .order('date')
  const slots = (candidates ?? []).filter((s) => {
    const date = parseDateString(s.date)
    return date != null && daysBetween(weekStart, date) + s.span_days - 1 >= 0
  })
```

and return `slots` (not `slots ?? []`).

- [ ] **Step 4: Run** `npx vitest run src/app/api/planner/week/route.test.ts` — expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/planner/week
git commit -m "feat: week endpoint returns dated slots overlapping the week"
```

---

### Task 10: Slot create/update take a date and enforce the week edge

**Files:**
- Modify: `src/app/api/planner/slots/route.ts`
- Modify: `src/app/api/planner/slots/[id]/route.ts`
- Test: `src/app/api/planner/slots/route.test.ts` (new), `src/app/api/planner/slots/[id]/route.test.ts` (new)

- [ ] **Step 1: Write the failing POST test** `slots/route.test.ts`:

```ts
// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const mocks = vi.hoisted(() => ({ insert: vi.fn(), single: vi.fn() }))

vi.mock('@/lib/supabase/server', () => ({
  createClient: () => ({
    from: () => ({
      insert: (row: unknown) => {
        mocks.insert(row)
        return { select: () => ({ single: mocks.single }) }
      },
    }),
  }),
}))
vi.mock('@/lib/auth/current-user', () => ({ getCurrentUser: vi.fn(async () => ({ id: 'user-1' })) }))
vi.mock('@/lib/auth/household', () => ({
  getCurrentHouseholdId: vi.fn(async () => 'hh-1'),
  getHouseholdWeekStartDay: vi.fn(async () => 'sunday'),
}))

import { POST } from './route'

const post = (body: unknown) =>
  POST(new NextRequest('http://localhost/api/planner/slots', { method: 'POST', body: JSON.stringify(body) }))

beforeEach(() => {
  vi.clearAllMocks()
  mocks.single.mockResolvedValue({ data: { id: 'slot-1' }, error: null })
})

describe('POST /api/planner/slots', () => {
  it('creates a dated slot for the household', async () => {
    const res = await post({ date: '2026-09-30', recipe_id: 'r-1', span_days: 2 })
    expect(res.status).toBe(201)
    expect(mocks.insert).toHaveBeenCalledWith(
      expect.objectContaining({ household_id: 'hh-1', date: '2026-09-30', span_days: 2, recipe_id: 'r-1' }),
    )
  })

  it('rejects a missing or malformed date', async () => {
    expect((await post({ recipe_id: 'r-1' })).status).toBe(400)
    expect((await post({ date: '2026-02-30', recipe_id: 'r-1' })).status).toBe(400)
  })

  it('rejects a meal that would run past the end of the week', async () => {
    // Saturday is the last day of a Sunday week.
    expect((await post({ date: '2026-10-03', recipe_id: 'r-1', span_days: 2 })).status).toBe(400)
    expect(mocks.insert).not.toHaveBeenCalled()
  })

  it('requires a recipe or a custom label', async () => {
    expect((await post({ date: '2026-09-30' })).status).toBe(400)
  })
})
```

- [ ] **Step 2: Write the failing PUT test** `slots/[id]/route.test.ts`:

```ts
// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const mocks = vi.hoisted(() => ({ update: vi.fn(), current: vi.fn(), updated: vi.fn() }))

vi.mock('@/lib/supabase/server', () => ({
  createClient: () => ({
    from: () => ({
      select: () => ({ eq: () => ({ single: mocks.current }) }),
      update: (values: unknown) => {
        mocks.update(values)
        return { eq: () => ({ select: () => ({ single: mocks.updated }) }) }
      },
    }),
  }),
}))
vi.mock('@/lib/auth/current-user', () => ({ getCurrentUser: vi.fn(async () => ({ id: 'user-1' })) }))
vi.mock('@/lib/auth/household', () => ({ getHouseholdWeekStartDay: vi.fn(async () => 'sunday') }))

import { PUT } from './route'

const put = (body: unknown) =>
  PUT(new NextRequest('http://localhost/api/planner/slots/s-1', { method: 'PUT', body: JSON.stringify(body) }), {
    params: { id: 's-1' },
  })

beforeEach(() => {
  vi.clearAllMocks()
  mocks.updated.mockResolvedValue({ data: { id: 's-1' }, error: null })
})

describe('PUT /api/planner/slots/[id]', () => {
  it('moves a meal to another date inside the week', async () => {
    mocks.current.mockResolvedValue({ data: { date: '2026-09-28', span_days: 2 } })
    expect((await put({ date: '2026-09-30' })).status).toBe(200)
    expect(mocks.update).toHaveBeenCalledWith({ date: '2026-09-30' })
  })

  it('rejects a move that would straddle the week edge', async () => {
    mocks.current.mockResolvedValue({ data: { date: '2026-09-28', span_days: 2 } })
    expect((await put({ date: '2026-10-03' })).status).toBe(400)
    expect(mocks.update).not.toHaveBeenCalled()
  })

  it('lets a legacy straddling meal be shortened to fit', async () => {
    mocks.current.mockResolvedValue({ data: { date: '2026-10-03', span_days: 3 } })
    expect((await put({ span_days: 1 })).status).toBe(200)
  })

  it('does not validate updates that leave date and span alone', async () => {
    expect((await put({ custom_label: 'Takeaway' })).status).toBe(200)
    expect(mocks.current).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 3: Run** `npx vitest run src/app/api/planner/slots` — expected: FAIL.

- [ ] **Step 4: Implement POST** — replace the body of `POST` after the auth/household checks in `slots/route.ts`:

```ts
  const body = await request.json() as {
    date?: string
    recipe_id?: string
    custom_label?: string
    span_days?: number
  }

  const span = body.span_days ?? 1
  if (!parseDateString(body.date)) {
    return NextResponse.json({ error: 'date is required (YYYY-MM-DD)' }, { status: 400 })
  }
  if (!Number.isInteger(span) || span < 1 || span > 7) {
    return NextResponse.json({ error: 'span_days must be 1–7' }, { status: 400 })
  }
  if (!body.recipe_id && !body.custom_label) {
    return NextResponse.json({ error: 'recipe_id or custom_label is required' }, { status: 400 })
  }
  if (!spanFitsWeek(body.date!, span, await getHouseholdWeekStartDay())) {
    return NextResponse.json({ error: 'Meal must end within its week' }, { status: 400 })
  }

  const { data: slot, error } = await supabase
    .from('meal_slots')
    .insert({
      household_id: householdId,
      date: body.date!,
      meal_type: 'lunch',
      recipe_id: body.recipe_id ?? null,
      custom_label: body.custom_label ?? null,
      span_days: span,
    })
    .select('*, recipe:recipes(id, title, image_url, cook_time_min, prep_time_min)')
    .single()
```

Remove the whole "Get or create week_plan" block (the week endpoint creates week plans and their rules snapshot when a week is opened). Imports: `parseDateString`, `spanFitsWeek` from `@/lib/utils/week`; `getCurrentHouseholdId`, `getHouseholdWeekStartDay` from `@/lib/auth/household`; drop `parseWeekParam`/`toDateString`.

- [ ] **Step 5: Implement PUT** in `slots/[id]/route.ts`:

```ts
  const body = await request.json() as {
    date?: string
    recipe_id?: string | null
    custom_label?: string | null
    span_days?: number
  }

  const update: Record<string, unknown> = {}
  if (body.date !== undefined) {
    if (!parseDateString(body.date)) return NextResponse.json({ error: 'Invalid date' }, { status: 400 })
    update.date = body.date
  }
  if (body.span_days !== undefined) {
    if (!Number.isInteger(body.span_days) || body.span_days < 1 || body.span_days > 7) {
      return NextResponse.json({ error: 'span_days must be 1–7' }, { status: 400 })
    }
    update.span_days = body.span_days
  }
  if (body.recipe_id !== undefined) update.recipe_id = body.recipe_id
  if (body.custom_label !== undefined) update.custom_label = body.custom_label

  if (body.date !== undefined || body.span_days !== undefined) {
    const { data: current } = await supabase.from('meal_slots').select('date, span_days').eq('id', params.id).single()
    if (!current) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    const date = body.date ?? current.date
    const span = body.span_days ?? current.span_days
    if (!spanFitsWeek(date, span, await getHouseholdWeekStartDay())) {
      return NextResponse.json({ error: 'Meal must end within its week' }, { status: 400 })
    }
  }
```

Imports: `parseDateString`, `spanFitsWeek` from `@/lib/utils/week`; `getHouseholdWeekStartDay` from `@/lib/auth/household`.

- [ ] **Step 6: Run** `npx vitest run src/app/api/planner` — expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/app/api/planner/slots
git commit -m "feat: slots are created and moved by date within their week"
```

---

### Task 11: Planner UI on placed slots, with the continuation cue

**Files:**
- Modify: `src/components/planner/PlannerClient.tsx`
- Modify: `src/components/planner/PlannerDesktopGrid.tsx`
- Modify: `src/components/planner/SlotCard.tsx`, `src/components/planner/CustomLabelCard.tsx`
- Modify: `src/components/planner/MobileEditList.tsx`, `src/components/planner/PlannerMobileAgenda.tsx`
- Modify: `messages/en/planner.json`, `messages/sk/planner.json`
- Test: `src/components/planner/PlannerClient.test.tsx`, `PlannerDesktopGrid.test.tsx`, `MobileEditList.test.tsx`, `PlannerMobileAgenda.test.tsx`, `CustomLabelCard.test.tsx`, `plannerWeekCache.test.ts`

- [ ] **Step 1: Copy** — add to `messages/en/planner.json` under `"slotCard"`: `"continues": "Continues from last week"`; under `"editList"`: `"continued": "From last week"`. Slovak (`messages/sk/planner.json`): `"continues": "Pokračuje z minulého týždňa"`, `"continued": "Z minulého týždňa"`.

- [ ] **Step 2: Update fixtures in the planner tests** — in every file listed under *Test*, replace `week_plan_id: '…'` with `household_id: 'household-1'` and `day_of_week: N` with `date: '<weekStart + N − 1>'` matching the week the test renders (e.g. `PlannerClient.test.tsx` `weekData()` uses `weekStart` 2026-06-01 → `date: '2026-06-01'`; the "multiple meals" test renders 2026-08-03, so its slots need `date: '2026-08-03'`). Components that take `PlacedSlot` in tests (`CustomLabelCard`, grid, edit list, agenda) should build them with `placeInWeek([...], weekStart)` rather than hand-writing `day`/`span`.

- [ ] **Step 3: Write failing behaviour tests**

`PlannerClient.test.tsx` mocks the grid, so test placement and the POST shape there, and the cue on the card itself.

In `PlannerClient.test.tsx`, replace the `./PlannerDesktopGrid` mock so it exposes placement and an add action:

```tsx
vi.mock('./PlannerDesktopGrid', () => ({
  PlannerDesktopGrid: ({
    slots,
    onAddCustom,
  }: {
    slots: Array<WeekData['slots'][number] & { day: number; span: number; continued: boolean }>
    onAddCustom: (day: number, label: string) => void
  }) => (
    <div data-testid="planner-grid">
      {slots.map((s) => (
        <div key={s.id} data-day={s.day} data-span={s.span} data-continued={String(s.continued)}>
          {s.recipe?.title ?? s.custom_label}
        </div>
      ))}
      <button type="button" onClick={() => onAddCustom(3, 'Leftovers')}>add on day 3</button>
    </div>
  ),
}))
```

Add:

```tsx
  it('places a meal continuing from the previous week at the first column', async () => {
    const data = emptyWeekData('2026-06-08')
    data.slots = [{
      id: 'straddle',
      household_id: 'household-1',
      date: '2026-06-06', // Saturday before the week, 3 days → visible on 06-08 only
      meal_type: 'lunch',
      recipe_id: null,
      servings_scale: 1,
      custom_label: 'Leftovers',
      span_days: 3,
      created_at: '2026-01-01T00:00:00.000Z',
      recipe: null,
    }]
    global.fetch = vi.fn().mockResolvedValue(response(data))

    render(<PlannerClient weekStart={new Date(2026, 5, 8)} />)

    const card = await within(await screen.findByTestId('planner-grid')).findByText('Leftovers')
    expect(card).toHaveAttribute('data-day', '1')
    expect(card).toHaveAttribute('data-span', '1')
    expect(card).toHaveAttribute('data-continued', 'true')
  })

  it('adds a meal by date', async () => {
    const data = emptyWeekData('2026-06-08')
    data.slots = weekData('Something').slots.map((s) => ({ ...s, date: '2026-06-08' }))
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response(data))
      .mockResolvedValue({ ok: true, json: async () => ({ id: 'new' }) } as Response)
    global.fetch = fetchMock

    render(<PlannerClient weekStart={new Date(2026, 5, 8)} />)
    await userEvent.click(await screen.findByRole('button', { name: 'add on day 3' }))

    const post = fetchMock.mock.calls.find(([url, init]) => url === '/api/planner/slots' && (init as RequestInit)?.method === 'POST')
    expect(JSON.parse((post![1] as RequestInit).body as string)).toEqual({ date: '2026-06-10', custom_label: 'Leftovers' })
  })
```

(The week must contain a meal, otherwise the empty state renders instead of the grid.)

In `CustomLabelCard.test.tsx` (it renders the real card):

```tsx
describe('CustomLabelCard continuing from last week', () => {
  it('shows the continuation cue and no resize handle', () => {
    render(
      <DndContext>
        <CustomLabelCard
          slot={customSlot({ id: 's1', date: '2026-06-06', span_days: 3, label: 'Takeaway' })}
          onDelete={() => {}}
          startDay={1}
          lane={0}
          span={1}
          maxSpanDays={7}
          continued
          onSpanPreview={() => {}}
          onSpanCommit={() => {}}
        />
      </DndContext>,
    )
    expect(screen.getByLabelText('Continues from last week')).toBeInTheDocument()
    expect(screen.queryByLabelText('Drag to extend or shrink across days')).toBeNull()
  })
})
```

(`customSlot` in that file takes `date` instead of `day_of_week` after Step 2. `ResizeHandle` only renders once hovered — `showResizeHandle` — so if the second assertion passes even before the change, additionally `fireEvent.mouseEnter` the card first, mirroring the existing resize test in the file.)

- [ ] **Step 4: Run** `npx vitest run src/components/planner` — expected: new tests FAIL (and fixtures may fail on missing `day`).

- [ ] **Step 5: `PlannerClient.tsx`**
  - Import `placeInWeek` from `@/lib/planner/placement`, `addDays` from `@/lib/utils/week`.
  - After `const weekDays = getWeekDays(weekStart)` add `const placed = placeInWeek(slots, weekStart)`. Pass `placed` (not `slots`) to `PlannerDesktopGrid`, `PlannerMobileAgenda`, and `buildEditDays(placed)`.
  - Add a helper inside the component: `const dateOf = (day: number) => toDateString(addDays(weekStart, day - 1))`.
  - `handleAddRecipe` / `handleAddCustom` body: `JSON.stringify({ date: dateOf(dayOfWeek), recipe_id: recipe.id })` / `{ date: dateOf(dayOfWeek), custom_label: label }`.
  - `handleMove`:

```ts
  // Move a meal to another start day. Overlaps are allowed — no other slot is touched.
  function handleMove(slotId: string, newDay: number) {
    const slot = slots.find((s) => s.id === slotId)
    if (!slot) return
    const date = dateOf(Math.max(1, Math.min(8 - slot.span_days, newDay)))
    if (date === slot.date) return
    const prevDate = slot.date
    setSlotsAndCache((prev) => prev.map((s) => (s.id === slotId ? { ...s, date } : s)))
    fetch(`/api/planner/slots/${slotId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date }),
    }).catch(() => {
      setSlotsAndCache((prev) => prev.map((s) => (s.id === slotId ? { ...s, date: prevDate } : s)))
    })
  }
```

  - `handleSpanCommit`: look up the placed slot for its column — `const p = placed.find((s) => s.id === slotId); if (!p || p.continued) return; const span = Math.max(1, Math.min(maxSpanForStart(p.day), newSpan))`. Because `placed` is computed below the handlers, move `const weekDays`/`const placed` above the handler definitions.
  - `activeSlot` state type stays `MealSlotWithRecipe | null` (a `PlacedSlot` is assignable).

- [ ] **Step 6: `PlannerDesktopGrid.tsx`** — prop `slots: PlacedSlot[]`; `maxCoveringLane` uses `s.day <= day && day < s.day + s.span`; cards get `startDay={slot.day}`, `span={slot.span}`, `maxSpanDays={maxSpanForStart(slot.day)}`, `continued={slot.continued}`.

- [ ] **Step 7: `SlotCard.tsx` and `CustomLabelCard.tsx`** — add prop `continued?: boolean` (doc comment: `/** The meal began in an earlier week: show a cue, no resizing from here. */`). Pass `spanDays: span ?? slot.span_days` to `useSpanResize`. Render the handle only when not continued, and a cue when it is:

```tsx
        {continued ? (
          <span
            aria-label={t('slotCard.continues')}
            title={t('slotCard.continues')}
            className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-1/2 rounded-full bg-white border border-gray-200 px-1 text-[10px] text-gray-400"
          >
            ↤
          </span>
        ) : (
          <ResizeHandle
            show={showResizeHandle}
            isResizing={isResizing}
            title={t('slotCard.extendTitle')}
            onMouseDown={handleResizeMouseDown}
          />
        )}
```

- [ ] **Step 8: `MobileEditList.tsx`** — types `PlacedSlot` for `MealRow`'s `slot`. `rangeLabel` uses `slot.day` and `slot.span` (index `weekDays[slot.day - 1]`, `weekDays[slot.day + slot.span - 2]`, `days: slot.span`), and when `slot.continued` prefixes `t('editList.continued') + ' · '`. `maxSpan = maxSpanForStart(slot.day)`. Both span chevrons get `disabled={slot.continued || …existing condition}`; `onSpanChange(slot.span - 1)` / `(slot.span + 1)`.

- [ ] **Step 9: `PlannerMobileAgenda.tsx`** — prop `slots: PlacedSlot[]`. `buildMobileAgenda` already reports `dayIndex`/`span` relative to the real meal (Task 8), so no other change.

- [ ] **Step 10: Run** `npx vitest run src/components/planner src/lib/planner` — expected: PASS.

- [ ] **Step 11: Commit**

```bash
git add src/components/planner messages
git commit -m "feat: planner renders dated meals and meals continuing from last week"
```

---

### Task 12: Add-to-plan picker posts a date

**Files:**
- Modify: `src/components/recipe/AddToPlanPicker.tsx`
- Test: `src/components/recipe/AddToPlanButton.test.tsx`

- [ ] **Step 1: Update tests** — change `lastFetchBody()`'s type to `{ date: string; recipe_id: string }`. Replace the `day_of_week`/`week_start` assertions: the basic test asserts `body.date` matches `/^\d{4}-\d{2}-\d{2}$/`; the "defaults to the first day of a later week" test (currently `day_of_week === 1`) asserts `body.date` equals that week's start date; the Sunday-week test from Task 6 asserts `date: '2026-09-30'`.

- [ ] **Step 2: Run** `npx vitest run src/components/recipe/AddToPlanButton.test.tsx` — expected: FAIL.

- [ ] **Step 3: Implement** — in `handleAdd` send

```ts
      body: JSON.stringify({
        date: toDateString(addDays(weekStart, selectedDay - 1)),
        recipe_id: recipeId,
      }),
```

(import `addDays`). Keep `addSlotToCachedWeek(targetWeek, slot)` — the cache is keyed by week start.

- [ ] **Step 4: Run** `npx vitest run src/components/recipe` — expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/recipe
git commit -m "feat: add-to-plan picker places meals by date"
```

---

### Task 13: Shopping generation and planner default week by date

**Files:**
- Modify: `src/app/api/shopping/generate/route.ts:44-88`
- Modify: `src/app/(flow)/shopping/generate/page.tsx`
- Modify: `src/components/shopping/GenerateShoppingPage.tsx:28-34`
- Modify: `src/app/(app)/planner/page.tsx`
- Test: `src/components/shopping/GenerateShoppingPage.test.tsx`, `src/lib/shopping/plan-entries.test.ts`

- [ ] **Step 1: Update fixtures** — `GenerateShoppingPage.test.tsx` and `plan-entries.test.ts`: replace `week_plan_id: 'w', day_of_week: p.day…` with `household_id: 'hh', date: …`. In `GenerateShoppingPage.test.tsx` the page renders `weekStart = 2026-06-08`, so change the builders' `day_of_week` parameter to `date` and pass `'2026-06-08'`, `'2026-06-09'`, `'2026-06-10'` for days 1/2/3. In `plan-entries.test.ts` change `dayLabel` to ``(slot: PlanSlot) => `D${slot.date}` `` and adjust the expected `days` strings accordingly.

- [ ] **Step 2: Run** `npx vitest run src/components/shopping src/lib/shopping` — expected: FAIL in `GenerateShoppingPage` (it still reads `day_of_week`).

- [ ] **Step 3: `GenerateShoppingPage.tsx`** — drop the `weekDays` lookup and label from the slot's own date:

```ts
  const [entries, setEntries] = useState<PlanEntry[]>(() =>
    buildPlanEntries(slots, (slot) => {
      const { weekday, day } = formatDayLabel(parseDateString(slot.date)!, locale)
      return `${weekday} ${day}`
    }),
  )
```

Imports: `formatDayLabel`, `parseDateString` (drop `getWeekDays`). `weekStart` was only used for that lookup, so remove it from `Props` and the destructuring, stop passing it in `shopping/generate/page.tsx`, and drop it from `renderPage` / the `weekStart` const in `GenerateShoppingPage.test.tsx`.

- [ ] **Step 4: `shopping/generate/page.tsx`** — replace the week-plan lookup with a dated query (meals count by their start date, as today):

```ts
  const startDay = await getHouseholdWeekStartDay()
  const weekStart = parseWeekParam(searchParams.week, startDay)

  const { data } = await supabase
    .from('meal_slots')
    .select('*, recipe:recipes(id, title, image_url, cook_time_min, prep_time_min, servings, ingredients)')
    .eq('household_id', householdId)
    .gte('date', toDateString(weekStart))
    .lte('date', toDateString(addDays(weekStart, 6)))
    .order('date')
  const slots = (data ?? []) as unknown as PlanSlot[]
```

- [ ] **Step 5: `api/shopping/generate/route.ts`** — replace everything from the "Find week_plans" comment through the `relevantSlots` filter with:

```ts
  const { data: slots } = await supabase
    .from('meal_slots')
    .select('*, recipe:recipes(id, title, servings, ingredients)')
    .eq('household_id', householdId)
    .gte('date', date_from)
    .lte('date', date_to)
    .not('recipe_id', 'is', null)
  const relevantSlots = slots ?? []

  if (!relevantSlots.length) {
    // Nothing planned in range — create empty list
    const { data: newList, error } = await supabase
      .from('shopping_lists')
      .insert({ household_id: householdId, name: formatListName(date_from, date_to, locale), date_from, date_to })
      .select()
      .single()
    if (error || !newList) return NextResponse.json({ error: 'Failed to create list' }, { status: 500 })
    return NextResponse.json({ list: newList, items: [] })
  }
```

Leave the rest (ingredient building) unchanged. If the old "no week plans" branch's empty-list response differs from what follows for zero slots, keep this early return so behaviour matches.

- [ ] **Step 6: `planner/page.tsx` default week** —

```ts
async function getDefaultWeek(startDay: WeekStartDay): Promise<Date> {
  const currentWeekStart = getWeekStart(new Date(), startDay)

  const user = await getCurrentUser()
  if (!user) return currentWeekStart
  const householdId = await getCurrentHouseholdId()
  if (!householdId) return currentWeekStart

  const { data: latest } = await createClient()
    .from('meal_slots')
    .select('date')
    .eq('household_id', householdId)
    .gte('date', toDateString(currentWeekStart))
    .order('date', { ascending: false })
    .limit(1)
    .maybeSingle()

  return latest ? parseWeekParam(latest.date, startDay) : currentWeekStart
}
```

Update the JSDoc above it to "Returns the week containing the latest meal on or after the current week; falls back to the current week."

- [ ] **Step 7: Run the full checks**

```bash
npm run type-check
npm test
```

Expected: both PASS. Any remaining `day_of_week` / `week_plan_id` (meal slot) reference is a bug — `grep -rn "day_of_week\|dayOfWeekNumber" src` must only show the `dayOfWeek` drop-target data keys in planner components.

- [ ] **Step 8: Commit**

```bash
git add src/app src/components/shopping src/lib/shopping
git commit -m "feat: shopping and planner default week read dated slots"
```

---

### Task 14: Settings — `WeekStartSelector`

**Files:**
- Create: `src/components/settings/WeekStartSelector.tsx`
- Test: `src/components/settings/WeekStartSelector.test.tsx`
- Modify: `src/app/(app)/settings/page.tsx:113-120`
- Modify: `messages/en/settings.json`, `messages/sk/settings.json`

- [ ] **Step 1: Copy** — `messages/en/settings.json`: add a top-level `"weekStart": { "monday": "Monday", "saturday": "Saturday", "sunday": "Sunday" }` and in `"page"`: `"weekStartLabel": "Week starts on"`, `"weekStartHelp": "The planner shows weeks from this day."`. Slovak: `"monday": "Pondelok"`, `"saturday": "Sobota"`, `"sunday": "Nedeľa"`, `"weekStartLabel": "Týždeň začína v"`, `"weekStartHelp": "Plánovač zobrazuje týždne od tohto dňa."`.

- [ ] **Step 2: Write the failing test** — follow the mocking style of `src/components/settings/UnitPreferenceSelector.test.tsx` (next-intl + `next/navigation` mocks):

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { WeekStartSelector } from './WeekStartSelector'

const refresh = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }))
// + the same useTranslations mock UnitPreferenceSelector.test.tsx uses

beforeEach(() => {
  vi.clearAllMocks()
  global.fetch = vi.fn().mockResolvedValue({ ok: true })
})

describe('WeekStartSelector', () => {
  it('marks the current day and saves a new one', async () => {
    render(<WeekStartSelector initialValue="monday" />)
    expect(screen.getByRole('button', { name: 'Monday' })).toHaveAttribute('aria-pressed', 'true')

    await userEvent.click(screen.getByRole('button', { name: 'Sunday' }))

    expect(global.fetch).toHaveBeenCalledWith('/api/household', expect.objectContaining({
      method: 'PATCH',
      body: JSON.stringify({ week_start_day: 'sunday' }),
    }))
    expect(screen.getByRole('button', { name: 'Sunday' })).toHaveAttribute('aria-pressed', 'true')
    expect(refresh).toHaveBeenCalled()
  })

  it('reverts when saving fails', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false })
    render(<WeekStartSelector initialValue="monday" />)
    await userEvent.click(screen.getByRole('button', { name: 'Saturday' }))
    expect(screen.getByRole('button', { name: 'Monday' })).toHaveAttribute('aria-pressed', 'true')
    expect(refresh).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 3: Run** `npx vitest run src/components/settings/WeekStartSelector.test.tsx` — expected: FAIL.

- [ ] **Step 4: Implement** `src/components/settings/WeekStartSelector.tsx`:

```tsx
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { WEEK_START_DAYS, type WeekStartDay } from '@/lib/utils/week'

export function WeekStartSelector({ initialValue }: { initialValue: WeekStartDay }) {
  const t = useTranslations('settings')
  const router = useRouter()
  const [value, setValue] = useState<WeekStartDay>(initialValue)
  const [saving, setSaving] = useState(false)

  async function handleChange(next: WeekStartDay) {
    if (next === value) return
    const previous = value
    setValue(next)
    setSaving(true)
    const res = await fetch('/api/household', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ week_start_day: next }),
    })
    setSaving(false)
    if (!res.ok) return setValue(previous)
    // The week start is read on the server; refresh so the app shell picks it up.
    router.refresh()
  }

  return (
    <div className="flex items-center gap-1">
      {WEEK_START_DAYS.map((option) => (
        <button
          key={option}
          type="button"
          aria-pressed={value === option}
          onClick={() => void handleChange(option)}
          disabled={saving}
          className={`px-3 py-1 text-sm rounded-lg border transition-colors ${
            value === option
              ? 'bg-gray-900 text-white border-gray-900'
              : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
          }`}
        >
          {t(`weekStart.${option}`)}
        </button>
      ))}
    </div>
  )
}
```

- [ ] **Step 5: Place it in Settings** — in `settings/page.tsx`, directly after the units `<div>` block:

```tsx
          <div>
            <p className="text-xs text-gray-500 mb-2">{t('page.weekStartLabel')}</p>
            <p className="text-xs text-gray-400 mb-2">{t('page.weekStartHelp')}</p>
            <WeekStartSelector initialValue={household?.week_start_day ?? 'monday'} />
          </div>
```

(import `WeekStartSelector`).

- [ ] **Step 6: Run** `npx vitest run src/components/settings` — expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/components/settings "src/app/(app)/settings/page.tsx" messages
git commit -m "feat: week start day in household settings"
```

---

### Task 15: Onboarding — `WeekStartStep`

**Files:**
- Create: `src/components/onboarding/steps/WeekStartStep.tsx`
- Modify: `src/components/onboarding/OnboardingWizard.tsx`
- Modify: `src/app/onboarding/page.tsx`
- Modify: `messages/en/auth.json`, `messages/sk/auth.json`
- Test: `src/components/onboarding/steps/steps.test.tsx`, `src/components/onboarding/OnboardingWizard.test.tsx`, `src/app/onboarding/page.test.tsx`

- [ ] **Step 1: Copy** — under `onboarding` in `messages/en/auth.json`:

```json
    "weekStart": {
      "title": "When does your week start?",
      "help": "The planner shows your weeks from this day.",
      "monday": "Monday",
      "saturday": "Saturday",
      "sunday": "Sunday"
    },
```

Slovak `messages/sk/auth.json`:

```json
    "weekStart": {
      "title": "Kedy vám začína týždeň?",
      "help": "Plánovač zobrazuje vaše týždne od tohto dňa.",
      "monday": "Pondelok",
      "saturday": "Sobota",
      "sunday": "Nedeľa"
    },
```

- [ ] **Step 2: Write the failing step test** — add to `steps.test.tsx`, following how that file already tests `UnitsStep` (reuse its render helpers and `fetch` mock):

```tsx
describe('WeekStartStep', () => {
  it('preselects the saved day and saves the chosen one before moving on', async () => {
    const onSaved = vi.fn()
    const onNext = vi.fn(async () => {})
    render(<WeekStartStep value="monday" onSaved={onSaved} onNext={onNext} onSkip={vi.fn()} onBack={vi.fn()} />)

    expect(screen.getByRole('button', { name: /monday/i })).toHaveAttribute('aria-pressed', 'true')
    await userEvent.click(screen.getByRole('button', { name: /sunday/i }))
    await userEvent.click(screen.getByRole('button', { name: 'Next' }))

    expect(global.fetch).toHaveBeenCalledWith('/api/household', expect.objectContaining({
      body: JSON.stringify({ week_start_day: 'sunday' }),
    }))
    expect(onSaved).toHaveBeenCalledWith('sunday')
    expect(onNext).toHaveBeenCalled()
  })
})
```

Add `import { WeekStartStep } from './WeekStartStep'` and `import userEvent from '@testing-library/user-event'` if the file doesn't already import them.

- [ ] **Step 3: Run** `npx vitest run src/components/onboarding/steps/steps.test.tsx` — expected: FAIL.

- [ ] **Step 4: Implement** `src/components/onboarding/steps/WeekStartStep.tsx`:

```tsx
'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { StepFrame } from '../StepFrame'
import { sendJson } from '../send-json'
import { WEEK_START_DAYS, type WeekStartDay } from '@/lib/utils/week'

interface Props {
  /** The last saved answer, shown again when the step is revisited. */
  value: WeekStartDay
  onSaved: (value: WeekStartDay) => void
  onNext: () => Promise<void>
  onSkip: () => Promise<void>
  onBack: () => void
}

export function WeekStartStep({ value, onSaved, onNext, onSkip, onBack }: Props) {
  const t = useTranslations('auth')
  const [day, setDay] = useState<WeekStartDay>(value)
  const [failed, setFailed] = useState(false)

  async function save() {
    setFailed(false)
    const ok = await sendJson('PATCH', '/api/household', { week_start_day: day })
    if (!ok) return setFailed(true)
    onSaved(day)
    await onNext()
  }

  return (
    <StepFrame
      title={t('onboarding.weekStart.title')}
      help={t('onboarding.weekStart.help')}
      error={failed ? t('onboarding.saveError') : null}
      onNext={save}
      onSkip={onSkip}
      onBack={onBack}
      settingsNote
    >
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {WEEK_START_DAYS.map((option) => (
          <button
            key={option}
            type="button"
            aria-pressed={day === option}
            onClick={() => setDay(option)}
            className={`text-left p-4 rounded-xl border transition-colors ${
              day === option ? 'border-emerald-600 bg-emerald-50' : 'border-gray-300 hover:border-gray-500'
            }`}
          >
            <span className="block text-sm font-semibold text-gray-900">{t(`onboarding.weekStart.${option}`)}</span>
          </button>
        ))}
      </div>
    </StepFrame>
  )
}
```

- [ ] **Step 5: Wire into the wizard** — `OnboardingWizard.tsx`:
  - `household` prop type gains `weekStartDay: WeekStartDay` (find the `household?:` shape in `Props` and add it).
  - State: `const [weekStart, setWeekStart] = useState<WeekStartDay>(household?.weekStartDay ?? 'monday')`.
  - Render after the units block:

```tsx
        {step === 'week_start' && household && (
          <WeekStartStep value={weekStart} onSaved={setWeekStart} onNext={next} onSkip={skip} onBack={back} />
        )}
```

- [ ] **Step 6: Onboarding page** — `src/app/onboarding/page.tsx`: add `week_start_day` to the households `select(...)` and pass `weekStartDay: household.week_start_day` in the `household` prop.

- [ ] **Step 7: Update wizard/page tests**

`OnboardingWizard.test.tsx`:
- `const household = { translationEnabled: false, preferredLanguage: 'en', preferredUnits: 'metric' as const, weekStartDay: 'monday' as const }`
- `'Step 2 of 7'` → `'Step 2 of 8'` (and any other `of 7`).
- In `'saves the step, then stores the next one'` (starts at `units`), expect the week-start heading and the new stored step:

```tsx
    expect(await screen.findByText('When does your week start?')).toBeInTheDocument()
    expect(bodies()).toEqual([
      ['/api/household', JSON.stringify({ preferred_units: 'metric' })],
      ['/api/household', JSON.stringify({ onboarding_step: 'week_start' })],
    ])
```

- Add:

```tsx
  it('saves the week start, then moves on to tags', async () => {
    render(<OnboardingWizard initialStep="week_start" locale="en" household={household} />)
    fireEvent.click(screen.getByRole('button', { name: 'Sunday' }))
    fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    expect(await screen.findByText('What kind of recipes will you add?')).toBeInTheDocument()
    expect(bodies()).toEqual([
      ['/api/household', JSON.stringify({ week_start_day: 'sunday' })],
      ['/api/household', JSON.stringify({ onboarding_step: 'tags' })],
    ])
  })
```

Any other test that walks `units → tags` needs one extra Next click through the week-start step.

`src/app/onboarding/page.test.tsx`: add `week_start_day: 'sunday'` to the `mocks.household` row in `'resumes a household at its stored onboarding step'` and assert `expect(result.props.household).toMatchObject({ weekStartDay: 'sunday' })`.

- [ ] **Step 8: Run** `npx vitest run src/components/onboarding src/app/onboarding` — expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add src/components/onboarding src/app/onboarding messages
git commit -m "feat: onboarding asks which day the week starts on"
```

---

### Task 16: Verify, then ship through staging

- [ ] **Step 1: Full local checks**

```bash
npm run type-check
npm run lint
npm test
```

Expected: all PASS. Fix anything red before continuing.

- [ ] **Step 2: Push the branch and merge into `staging`** (staging applies `022_week_start.sql` itself):

```bash
git push -u origin feat/week-start-day
git -C /Users/vacuumlabs/Developer/dapcook checkout staging
git -C /Users/vacuumlabs/Developer/dapcook pull
git -C /Users/vacuumlabs/Developer/dapcook merge feat/week-start-day
git -C /Users/vacuumlabs/Developer/dapcook push
git -C /Users/vacuumlabs/Developer/dapcook checkout feat/week-start-day
```

Note: `.env.local` points at the staging Supabase project, so once staging has the migration the local dev server works against the new schema too.

- [ ] **Step 3: Manual check on https://dapcook-staging.vercel.app** (or locally via `/dev/login`):
  1. With Monday: existing meals are on the same dates as before.
  2. Plan a 3-day meal starting Saturday (Monday week: Sat–Sun only fits 2, so plan Fri–Sun instead) and a 1-day meal on Wednesday.
  3. Settings → Week starts on → Sunday. Planner now shows Sun–Sat; every meal is on the same calendar date; the Fri–Sun meal shows in this week (Fri–Sat) and continues into next week (Sun) with the "↤" cue and no resize handle.
  4. Move the continued meal to Tuesday in the next week — it becomes a normal meal.
  5. Add to plan from a recipe: "This week" chip and today's preselection follow Sunday start.
  6. Shopping list for the week includes meals by their start date.
  7. `/dev/login?fresh=1` → wizard shows "Step n of 8", the week start step after units, Skip works, choice persists.

- [ ] **Step 4: After approval, merge the same branch into `main`**, and **at the same time** run `supabase/migrations/022_week_start.sql` in the production Supabase SQL editor (the old code breaks against the new schema and vice versa, so do both together).
