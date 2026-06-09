# Multi-meal Planner Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a day hold any number of meals (category-agnostic) with freely-overlapping multi-day spans, replacing the one-meal-per-day model — desktop renders a lane-packed calendar of spanning bars, mobile renders a day agenda (View) and a per-day edit list (Edit).

**Architecture:** All multi-day/overlap/ordering logic moves into one pure, unit-tested module (`src/lib/planner/layout.ts`). `PlannerClient` becomes a thin orchestrator that loads data and renders one of three presentational views: `PlannerDesktopGrid` (lane bars), `PlannerMobileAgenda` (View), `MobileEditList` (Edit). The cascade/displacement logic is deleted — overlaps are legal. "Add to Plan" from a recipe gets a destination-picker popover that posts to the existing `POST /api/planner/slots`.

**Tech Stack:** Next.js (app router), React 18, TypeScript, Tailwind, @dnd-kit, Supabase, Vitest + @testing-library/react.

**Conventions for every task:** `npm run test` runs the suite (`vitest run`). Tests are colocated `*.test.ts(x)`, `globals: true`, jsdom, `@` → `src/`. Commit after each task with the message shown.

---

## File Structure

**Create:**
- `src/lib/planner/layout.ts` — pure layout/ordering functions (grouping, lane packing, agenda, edit-days, span clamp).
- `src/lib/planner/layout.test.ts` — unit tests for the above.
- `src/components/planner/PlannerDesktopGrid.tsx` — desktop lane-bar calendar (md+ only).
- `src/components/planner/PlannerMobileAgenda.tsx` — mobile View agenda (continuations + day x/y).
- `src/components/recipe/AddToPlanPicker.tsx` — destination-picker popover + confirmation state.

**Modify:**
- `src/components/planner/PlannerClient.tsx` — remove single-slot map + displacement; orchestrate the three views.
- `src/components/planner/SlotCard.tsx` — accept an explicit grid placement (column start/span + lane row); keep resize.
- `src/components/planner/MobileEditList.tsx` — day-sectioned, multiple meals/day, "+ Add meal" per day, drag-move sets start day.
- `src/components/planner/RecipeSearch.tsx` — add free-text "Use '<text>' as a custom meal" row.
- `src/components/recipe/AddToPlanButton.tsx` — render `AddToPlanPicker` instead of posting to next-empty.
- `src/types/planner.ts` — export new layout types if needed.

**Delete:**
- `src/app/api/planner/slots/next-empty/route.ts` — replaced by the picker calling `POST /api/planner/slots`.

**Tests to update:**
- `src/components/planner/PlannerClient.test.tsx`, `src/components/recipe/AddToPlanButton.test.tsx`.

---

## Task 1: Pure layout module — ordering + grouping

**Files:**
- Create: `src/lib/planner/layout.ts`
- Test: `src/lib/planner/layout.test.ts`

- [ ] **Step 1: Write failing tests for `compareInDay`, `buildEditDays`, `maxSpanForStart`**

```typescript
// src/lib/planner/layout.test.ts
import { describe, it, expect } from 'vitest'
import { compareInDay, buildEditDays, maxSpanForStart } from './layout'
import type { MealSlotWithRecipe } from '@/types/planner'

function slot(p: Partial<MealSlotWithRecipe> & { id: string; day_of_week: number; span_days: number }): MealSlotWithRecipe {
  return {
    id: p.id, week_plan_id: 'w', day_of_week: p.day_of_week, meal_type: 'lunch',
    recipe_id: p.recipe_id ?? null, custom_label: p.custom_label ?? null,
    servings_scale: 1, span_days: p.span_days, recipe: p.recipe ?? null,
  }
}

describe('compareInDay', () => {
  it('orders by start day, then longer span first, then id', () => {
    const a = slot({ id: 'a', day_of_week: 3, span_days: 1 })
    const b = slot({ id: 'b', day_of_week: 2, span_days: 1 })
    const c = slot({ id: 'c', day_of_week: 2, span_days: 3 })
    const d = slot({ id: 'd', day_of_week: 2, span_days: 3 })
    const sorted = [a, b, c, d].sort(compareInDay).map((s) => s.id)
    expect(sorted).toEqual(['c', 'd', 'b', 'a'])
  })
})

describe('maxSpanForStart', () => {
  it('clamps span to the remaining days in the week', () => {
    expect(maxSpanForStart(1)).toBe(7)
    expect(maxSpanForStart(5)).toBe(3)
    expect(maxSpanForStart(7)).toBe(1)
  })
})

describe('buildEditDays', () => {
  it('returns 7 days, each with meals starting that day, ordered', () => {
    const s1 = slot({ id: 's1', day_of_week: 2, span_days: 4 })
    const s2 = slot({ id: 's2', day_of_week: 2, span_days: 1 })
    const s3 = slot({ id: 's3', day_of_week: 4, span_days: 1 })
    const days = buildEditDays([s3, s2, s1])
    expect(days).toHaveLength(7)
    expect(days[1].dayOfWeek).toBe(2)
    expect(days[1].slots.map((s) => s.id)).toEqual(['s1', 's2']) // span 4 before span 1
    expect(days[3].slots.map((s) => s.id)).toEqual(['s3'])
    expect(days[0].slots).toEqual([])
  })
})
```

- [ ] **Step 2: Run, verify fail**

Run: `npm run test -- src/lib/planner/layout.test.ts`
Expected: FAIL — module/exports not found.

- [ ] **Step 3: Implement `layout.ts` (this part)**

```typescript
// src/lib/planner/layout.ts
import type { MealSlotWithRecipe } from '@/types/planner'

/** Deterministic within-day order: earliest start, then longest span, then id (stable). */
export function compareInDay(a: MealSlotWithRecipe, b: MealSlotWithRecipe): number {
  if (a.day_of_week !== b.day_of_week) return a.day_of_week - b.day_of_week
  if (a.span_days !== b.span_days) return b.span_days - a.span_days
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
}

/** Largest span a meal starting on `startDay` (1–7) can have without leaving the week. */
export function maxSpanForStart(startDay: number): number {
  return 8 - startDay
}

export interface EditDay {
  dayOfWeek: number // 1–7
  slots: MealSlotWithRecipe[] // meals STARTING this day, ordered
}

/** One entry per weekday; each lists the meals whose start day is that day. */
export function buildEditDays(slots: MealSlotWithRecipe[]): EditDay[] {
  const days: EditDay[] = []
  for (let d = 1; d <= 7; d++) {
    days.push({
      dayOfWeek: d,
      slots: slots.filter((s) => s.day_of_week === d).sort(compareInDay),
    })
  }
  return days
}
```

- [ ] **Step 4: Run, verify pass**

Run: `npm run test -- src/lib/planner/layout.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/planner/layout.ts src/lib/planner/layout.test.ts
git commit -m "feat(planner): add layout ordering + edit-day grouping"
```

---

## Task 2: Lane packing (desktop) + mobile agenda

**Files:**
- Modify: `src/lib/planner/layout.ts`
- Test: `src/lib/planner/layout.test.ts`

- [ ] **Step 1: Add failing tests for `packLanes` and `buildMobileAgenda`**

```typescript
// append to src/lib/planner/layout.test.ts
import { packLanes, buildMobileAgenda } from './layout'

describe('packLanes', () => {
  it('puts non-overlapping meals on the same lane and overlaps on separate lanes', () => {
    const soup = slot({ id: 'soup', day_of_week: 2, span_days: 4 }) // Tue–Fri
    const kura = slot({ id: 'kura', day_of_week: 3, span_days: 2 }) // Wed–Thu
    const dessert = slot({ id: 'des', day_of_week: 4, span_days: 1 }) // Thu
    const mon = slot({ id: 'mon', day_of_week: 1, span_days: 1 }) // Mon, no overlap with soup
    const lanes = packLanes([soup, kura, dessert, mon])
    expect(lanes.get('soup')).toBe(0)
    expect(lanes.get('mon')).toBe(0) // Mon is free on lane 0 before soup starts
    expect(lanes.get('kura')).toBe(1)
    expect(lanes.get('des')).toBe(2)
  })

  it('stacks two single-day meals on the same day onto different lanes', () => {
    const a = slot({ id: 'a', day_of_week: 3, span_days: 1 })
    const b = slot({ id: 'b', day_of_week: 3, span_days: 1 })
    const lanes = packLanes([a, b])
    expect(new Set([lanes.get('a'), lanes.get('b')])).toEqual(new Set([0, 1]))
  })
})

describe('buildMobileAgenda', () => {
  it('repeats multi-day meals on each covered day with dayIndex/span', () => {
    const soup = slot({ id: 'soup', day_of_week: 2, span_days: 4 })
    const days = buildMobileAgenda([soup])
    expect(days[0].cards).toEqual([]) // Mon
    expect(days[1].cards[0]).toMatchObject({ dayIndex: 1, span: 4 }) // Tue
    expect(days[4].cards[0]).toMatchObject({ dayIndex: 4, span: 4 }) // Fri
    expect(days[5].cards).toEqual([]) // Sat
  })

  it('orders multiple meals within a day by compareInDay', () => {
    const soup = slot({ id: 'soup', day_of_week: 2, span_days: 4 }) // active Thu, started Tue
    const kura = slot({ id: 'kura', day_of_week: 3, span_days: 2 }) // active Thu, started Wed
    const dessert = slot({ id: 'des', day_of_week: 4, span_days: 1 }) // active Thu, started Thu
    const thu = buildMobileAgenda([dessert, kura, soup])[3]
    expect(thu.cards.map((c) => c.slot.id)).toEqual(['soup', 'kura', 'des'])
  })
})
```

- [ ] **Step 2: Run, verify fail** — Run: `npm run test -- src/lib/planner/layout.test.ts` → FAIL (exports missing).

- [ ] **Step 3: Implement packing + agenda**

```typescript
// append to src/lib/planner/layout.ts

/** Greedy lane assignment for the desktop calendar: returns slotId → lane index (0-based). */
export function packLanes(slots: MealSlotWithRecipe[]): Map<string, number> {
  const sorted = [...slots].sort(compareInDay)
  const laneFreeFrom: number[] = [] // lane → first day (1–8) the lane is free again
  const result = new Map<string, number>()
  for (const s of sorted) {
    const start = s.day_of_week
    const end = s.day_of_week + s.span_days // exclusive
    let lane = laneFreeFrom.findIndex((freeFrom) => freeFrom <= start)
    if (lane === -1) {
      lane = laneFreeFrom.length
      laneFreeFrom.push(end)
    } else {
      laneFreeFrom[lane] = end
    }
    result.set(s.id, lane)
  }
  return result
}

export interface AgendaCard {
  slot: MealSlotWithRecipe
  dayIndex: number // 1-based position within the meal's span
  span: number
}
export interface AgendaDay {
  dayOfWeek: number // 1–7
  cards: AgendaCard[]
}

/** For mobile View: each weekday lists every meal active that day (multi-day meals repeat). */
export function buildMobileAgenda(slots: MealSlotWithRecipe[]): AgendaDay[] {
  const days: AgendaDay[] = []
  for (let d = 1; d <= 7; d++) {
    const active = slots
      .filter((s) => s.day_of_week <= d && d < s.day_of_week + s.span_days)
      .sort(compareInDay)
    days.push({
      dayOfWeek: d,
      cards: active.map((s) => ({ slot: s, dayIndex: d - s.day_of_week + 1, span: s.span_days })),
    })
  }
  return days
}
```

- [ ] **Step 4: Run, verify pass** — Run: `npm run test -- src/lib/planner/layout.test.ts` → PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/planner/layout.ts src/lib/planner/layout.test.ts
git commit -m "feat(planner): add lane packing and mobile agenda builders"
```

---

## Task 3: SlotCard accepts explicit grid placement

**Files:**
- Modify: `src/components/planner/SlotCard.tsx`

Currently SlotCard relies on its parent `DaySlot` wrapper for column span and uses the parent grid's geometry for resize. In the lane grid the card itself is the grid item, so it must place itself via `gridColumn` / `gridRow` and compute resize from the 7-col grid width.

- [ ] **Step 1: Extend props with placement (additive)**

Add to `SlotCardProps`:
```typescript
  /** 1–7 start column (day_of_week). md+ only. */
  startDay: number
  /** lane index, 0-based; becomes gridRow on md+. */
  lane: number
  /** current span in days (drives gridColumn end). */
  span: number
```

- [ ] **Step 2: Apply grid placement on the root element (md+ only)**

On the card's outer wrapper, add an inline style applied only at md+ via a wrapper. Since Tailwind can't express dynamic `gridColumn`, use inline `style` with a `hidden md:block` strategy is not enough — instead set style directly and let the mobile renderer not use SlotCard for layout. Set:
```tsx
style={{ gridColumn: `${startDay} / ${startDay + span}`, gridRow: lane + 1 }}
```
Keep existing classes; this style is harmless on mobile because the mobile agenda uses its own card (Task 5), so SlotCard renders only inside the desktop grid.

- [ ] **Step 3: Fix resize math to use the parent 7-col grid**

The existing `handleResizeMouseDown` computes `singleColWidth` from the card's own width and current span. Keep the existing approach but ensure `maxSpanDays` is passed as `maxSpanForStart(startDay)` from the parent (Task 4), and `onSpanCommit` no longer triggers displacement (Task 4). No code change needed inside SlotCard beyond reading the new `span` prop where it currently reads `slot.span_days` for live width baseline. Replace internal reads of `slot.span_days` for layout with the `span` prop.

- [ ] **Step 4: Typecheck** — Run: `npm run build` is heavy; instead run `npx tsc --noEmit`.
Expected: no type errors. (No unit test here; covered via PlannerClient/desktop tests in Task 4.)

- [ ] **Step 5: Commit**

```bash
git add src/components/planner/SlotCard.tsx
git commit -m "feat(planner): SlotCard self-places in lane grid"
```

---

## Task 4: PlannerDesktopGrid + PlannerClient orchestration (remove displacement)

**Files:**
- Create: `src/components/planner/PlannerDesktopGrid.tsx`
- Modify: `src/components/planner/PlannerClient.tsx`

### 4a. PlannerDesktopGrid

- [ ] **Step 1: Implement the desktop grid**

Responsibilities:
- Render `DayHeader` row (7 columns) — reuse existing component.
- Compute `lanes = packLanes(slots)` and `laneCount = max(lane)+1`.
- Render a single `grid grid-cols-7` with `gridAutoRows` lane height; place each meal via SlotCard (`recipe_id`) or CustomLabelCard wrapped to self-place (give CustomLabelCard the same `startDay/lane/span` style wrapper — wrap it in a `<div style={{gridColumn, gridRow}}>`).
- Behind the cards, render 7 full-height droppable columns (`useDroppable id=day-N data={dayOfWeek}`) as a background grid layer so dropping anywhere in a day column targets that day. Use a relative container; background grid `absolute inset-0 grid grid-cols-7`, cards grid on top.
- Render an "add row" after the last lane: 7 cells at `gridRow: laneCount+1`, each a `+` button that opens `RecipeSearch` for that day (reuse the open/close/add handlers passed from PlannerClient).

Props:
```typescript
interface PlannerDesktopGridProps {
  weekDays: Date[]
  today: Date
  slots: MealSlotWithRecipe[]
  openSearchDay: number | null
  addingToDay: number | null
  onOpenSearch: (day: number) => void
  onCloseSearch: () => void
  onAddRecipe: (day: number, recipe: Recipe) => void
  onAddCustom: (day: number, label: string) => void
  onDelete: (slotId: string) => void
  onSpanPreview: (slotId: string, newSpan: number) => void
  onSpanCommit: (slotId: string, newSpan: number) => void
}
```

### 4b. PlannerClient

- [ ] **Step 2: Update PlannerClient.test.tsx expectations first (TDD)**

The existing test mocks child components and asserts DOM. Rewrite the relevant assertions to the new behavior:
- Multiple slots on the same `day_of_week` both render (no overwrite).
- Moving a slot does NOT change other slots' `day_of_week` (no displacement): simulate `handleMove` and assert only the moved slot's PUT fires.

Add a focused test (mock fetch) — e.g.:
```typescript
it('move sets only the dragged slot start day, leaving others untouched', async () => {
  // render with two slots on different days; invoke the desktop grid drop for slot A → day 5
  // assert exactly one PUT to /api/planner/slots/<A> with { day_of_week: 5 }
})
```
(Match existing mock style: `vi.mock('@dnd-kit/core')`, component mocks, `response()`/`weekData()` helpers already present.)

- [ ] **Step 3: Run, verify fail** — Run: `npm run test -- src/components/planner/PlannerClient.test.tsx` → FAIL.

- [ ] **Step 4: Rewrite PlannerClient internals**

- Delete `slotByDay`, `coveredBySlot`, `computeDisplacements`, the displacement branch of `handleSpanCommit`, and the greedy day-reassign in `handleMobileReorder`.
- Add:
```typescript
function handleMove(slotId: string, newDay: number) {
  const slot = slots.find((s) => s.id === slotId)
  if (!slot) return
  const day = Math.max(1, Math.min(8 - slot.span_days, newDay))
  if (day === slot.day_of_week) return
  const prevDay = slot.day_of_week
  setSlotsAndCache((p) => p.map((s) => (s.id === slotId ? { ...s, day_of_week: day } : s)))
  fetch(`/api/planner/slots/${slotId}`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ day_of_week: day }),
  }).catch(() => setSlotsAndCache((p) => p.map((s) => (s.id === slotId ? { ...s, day_of_week: prevDay } : s))))
}
```
- Simplify `handleSpanCommit(slotId, newSpan)`: clamp to `maxSpanForStart(slot.day_of_week)`, optimistic set, single PUT `{ span_days }`, no displacement.
- `handleDragEnd`: read `over.data.current.dayOfWeek` → `handleMove(draggedSlot.id, targetDay)`. Remove the delta-column fallback (full-height column droppables make it unnecessary).
- Render switch:
  - Desktop: `<div className="hidden md:block"><DndContext …><PlannerDesktopGrid …/></DndContext></div>`
  - Mobile View: `<div className="md:hidden">{!isMobileEditMode && <PlannerMobileAgenda …/>}</div>` (Task 5)
  - Mobile Edit: existing `<MobileEditList …/>` (Task 6)
- Build inputs with the new helpers: `buildEditDays(slots)` for MobileEditList, `buildMobileAgenda(slots)` for the agenda; desktop grid does its own `packLanes`.

- [ ] **Step 5: Run, verify pass** — Run: `npm run test -- src/components/planner/PlannerClient.test.tsx` → PASS. Then `npx tsc --noEmit` clean.

- [ ] **Step 6: Commit**

```bash
git add src/components/planner/PlannerDesktopGrid.tsx src/components/planner/PlannerClient.tsx src/components/planner/PlannerClient.test.tsx
git commit -m "feat(planner): desktop lane grid + remove displacement logic"
```

---

## Task 5: PlannerMobileAgenda (mobile View)

**Files:**
- Create: `src/components/planner/PlannerMobileAgenda.tsx`
- Test: add a small render test in `PlannerClient.test.tsx` or a dedicated `PlannerMobileAgenda.test.tsx`

- [ ] **Step 1: Failing test (dedicated file)**

```typescript
// src/components/planner/PlannerMobileAgenda.test.tsx
import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { PlannerMobileAgenda } from './PlannerMobileAgenda'
import { getWeekDays } from '@/lib/utils/week'
// reuse a slot() factory or inline a slot object with day_of_week:2, span_days:4, recipe
it('shows a multi-day meal on each covered day with day x/y', () => {
  const weekDays = getWeekDays(new Date(2026, 5, 8)) // Mon 8 Jun 2026
  const soup = /* slot id soup, day_of_week 2, span_days 4, recipe {title:'Soup'} */
  render(<PlannerMobileAgenda weekDays={weekDays} today={new Date(2026,5,8)} slots={[soup]} onOpenRecipe={()=>{}} />)
  expect(screen.getAllByText('Soup')).toHaveLength(4)
  expect(screen.getByText('day 1/4')).toBeInTheDocument()
  expect(screen.getByText('day 4/4')).toBeInTheDocument()
})
```

- [ ] **Step 2: Run, verify fail.**

- [ ] **Step 3: Implement the agenda**

- Props: `{ weekDays: Date[]; today: Date; slots: MealSlotWithRecipe[]; onOpenRecipe?: (recipeId: string) => void }`.
- `const days = buildMobileAgenda(slots)`.
- For each `AgendaDay`: render a section with header `formatDayLabel(weekDays[d-1])` (highlight if today). For each `AgendaCard`:
  - recipe card: thumbnail + title + badge `day {dayIndex}/{span}` when `span > 1`; continuation styling (dashed/muted) when `dayIndex > 1`; tap → `onOpenRecipe(slot.recipe_id)` (link to `/recipes/<id>`).
  - custom-label card: label text + same badge rule.
  - Empty day: quiet `Nothing planned` placeholder.
- Read-only: no add/delete/drag.

- [ ] **Step 4: Run, verify pass.**

- [ ] **Step 5: Commit**

```bash
git add src/components/planner/PlannerMobileAgenda.tsx src/components/planner/PlannerMobileAgenda.test.tsx
git commit -m "feat(planner): mobile View agenda with multi-day continuations"
```

---

## Task 6: MobileEditList — multiple meals/day, drag-move, per-day add

**Files:**
- Modify: `src/components/planner/MobileEditList.tsx`
- Modify: `src/components/planner/PlannerClient.tsx` (props wiring)
- Test: `src/components/planner/MobileEditList.test.tsx` (new)

Switch the data contract from `WeekItem[]` (one row per day, single slot) to `EditDay[]` (day sections, each with `slots[]`).

- [ ] **Step 1: Failing test**

```typescript
// src/components/planner/MobileEditList.test.tsx
// render with an EditDay[] where day 2 has two meals; assert both rows render,
// assert "+ Add meal" appears under every day,
// assert clicking the right chevron calls onSpanChange(slotId, span+1),
// assert dragging is wired (smoke): onMove prop exists and is called via a simulated drop.
```

- [ ] **Step 2: Run, verify fail.**

- [ ] **Step 3: Rewrite MobileEditList**

- Props:
```typescript
interface MobileEditListProps {
  editDays: EditDay[]
  weekDays: Date[]
  onMove: (slotId: string, newDay: number) => void
  onDelete: (slotId: string) => void
  onSpanChange: (slotId: string, newSpan: number) => void
  onAddRecipe: (dayOfWeek: number, recipe: Recipe) => Promise<void>
  onAddCustom: (dayOfWeek: number, label: string) => Promise<void>
}
```
- Render per day: a header (`formatDayLabel` + range is per-meal), then each meal as a row: `⠿` drag handle, thumbnail, title + range label (`formatDayLabel(start) → formatDayLabel(start+span-1) · N days` or single day), `‹ ›` chevrons calling `onSpanChange(slot.id, slot.span_days ∓ 1)` (disable `‹` at span 1, `›` at `maxSpanForStart(slot.day_of_week)`), `🗑` delete. Then a `+ Add meal` row that opens RecipeSearch anchored to that day.
- Drag: keep `@dnd-kit` but make each **day section a droppable** (`id=day-N`); dragging a meal row onto a day section calls `onMove(slotId, targetDay)`. Remove `arrayMove`/greedy reorder. (Keep `arrayMove` export only if other files import it — grep; none do, so delete it.)

- [ ] **Step 4: Wire PlannerClient** — pass `editDays={buildEditDays(slots)}`, `weekDays`, `onMove={handleMove}`, drop `onReorder`/`weekItems`/`handleMobileReorder`.

- [ ] **Step 5: Run tests** — `npm run test -- src/components/planner/MobileEditList.test.tsx` and the planner suite → PASS. `npx tsc --noEmit` clean.

- [ ] **Step 6: Commit**

```bash
git add src/components/planner/MobileEditList.tsx src/components/planner/MobileEditList.test.tsx src/components/planner/PlannerClient.tsx
git commit -m "feat(planner): mobile edit list supports multiple meals per day"
```

---

## Task 7: Free-text custom meal in RecipeSearch

**Files:**
- Modify: `src/components/planner/RecipeSearch.tsx`
- Test: `src/components/planner/RecipeSearch.test.tsx` (new)

- [ ] **Step 1: Failing test**

```typescript
// render RecipeSearch; type "Side salad" into the input; when query has no recipe match,
// a row "Use “Side salad” as a custom meal" appears; clicking it calls onSelectCustom("Side salad").
```

- [ ] **Step 2: Run, verify fail.**

- [ ] **Step 3: Implement** — when `query.trim()` is non-empty, render a row at the top/bottom of results: button labelled `Use “{query.trim()}” as a custom meal` → `onSelectCustom(query.trim())`. Existing `onSelectCustom` already flows to `handleAddCustom` → `POST /slots { custom_label }`. No API change.

- [ ] **Step 4: Run, verify pass.**

- [ ] **Step 5: Commit**

```bash
git add src/components/planner/RecipeSearch.tsx src/components/planner/RecipeSearch.test.tsx
git commit -m "feat(planner): free-text custom meals in search"
```

---

## Task 8: Add-to-Plan destination picker

**Files:**
- Create: `src/components/recipe/AddToPlanPicker.tsx`
- Modify: `src/components/recipe/AddToPlanButton.tsx`
- Modify: `src/components/recipe/AddToPlanButton.test.tsx`
- Delete: `src/app/api/planner/slots/next-empty/route.ts`

- [ ] **Step 1: Rewrite AddToPlanButton.test.tsx (TDD)**

New behavior: clicking the button opens the picker; selecting a day + confirm posts to `POST /api/planner/slots` with `{ week_start, day_of_week, recipe_id }` (NOT next-empty); a confirmation state then shows "Added to …". Mock fetch `ok:true` returning a slot.

- [ ] **Step 2: Run, verify fail.**

- [ ] **Step 3: Implement AddToPlanPicker**

- State: `weekStart: Date` (init `getWeekStart(today)`, or `localStorage['addToPlan:lastWeek']` if present), `selectedDay: number` (init: `dayOfWeekNumber(today)` if `isCurrentWeek(weekStart)` else 1).
- UI: quick chips `This week` (`getWeekStart(today)`) / `Next week` (`nextWeekStart(getWeekStart(today))`); `‹ ›` page weeks (`prevWeekStart`/`nextWeekStart`); `formatWeekLabel(weekStart)`; 7-day grid from `getWeekDays(weekStart)` with `formatDayLabel`, selected highlighted, today ring; primary button `Add to {weekday} {day}`.
- Confirm: `POST /api/planner/slots` `{ week_start: toDateString(weekStart), day_of_week: selectedDay, recipe_id }`. On ok: persist `localStorage['addToPlan:lastWeek']=toDateString(weekStart)`, switch to confirmation view: "Added to {weekday} {day} · {this week|next week|date}" with **Change** (back to picker) and **View plan** (`router.push('/planner?week='+toDateString(weekStart))`).
- Props: `{ recipeId: string; onClose: () => void }`.

- [ ] **Step 4: Wire AddToPlanButton** — remove the next-empty fetch; button toggles an `open` state rendering `<AddToPlanPicker recipeId={recipeId} onClose={()=>setOpen(false)} />` as a popover (absolute panel for `toolbar`, and for `overlay` variant render the same panel positioned over the card). Keep the `CalendarPlus`/`Add to Plan` trigger. Drop the `done/error/Full` inline states (the picker owns confirmation).

- [ ] **Step 5: Delete next-empty route** — `git rm src/app/api/planner/slots/next-empty/route.ts`. Grep `next-empty` across `src/` to confirm no other references.

- [ ] **Step 6: Run tests** — `npm run test -- src/components/recipe/AddToPlanButton.test.tsx` → PASS. `npx tsc --noEmit` clean.

- [ ] **Step 7: Commit**

```bash
git add -A src/components/recipe/ src/app/api/planner/slots/
git commit -m "feat(planner): destination picker for Add to Plan; drop next-empty"
```

---

## Task 9: Copy + full-suite verification

**Files:**
- Modify: `src/components/planner/PlannerClient.tsx` (subtitle)

- [ ] **Step 1: Change subtitle** — "Plan your lunches for the week" → "Plan your meals for the week" ([PlannerClient.tsx:344](src/components/planner/PlannerClient.tsx#L344)).

- [ ] **Step 2: Full suite** — Run: `npm run test`. Expected: all PASS.

- [ ] **Step 3: Typecheck + lint** — Run: `npx tsc --noEmit` and `npm run lint` (if present). Expected: clean.

- [ ] **Step 4: Manual smoke (verify skill / dev server)** — load `/planner`: add two meals to one day; stretch one across days and confirm it repeats on mobile View with `day x/y` and overlaps a second multi-day meal without displacing it; on desktop confirm overlapping bars sit on separate lanes; use Add-to-Plan picker from a recipe; generate a shopping list and confirm quantities unchanged.

- [ ] **Step 5: Commit**

```bash
git add src/components/planner/PlannerClient.tsx
git commit -m "chore(planner): meals copy + final verification"
```

---

## Self-Review notes
- **Spec coverage:** multi-meal/day (Tasks 4–6), overlap w/o displacement (Task 4), desktop lane bars (Tasks 3–4), mobile View continuations + day x/y (Task 5), mobile Edit once-at-start + ‹ › resize + drag move + per-day add (Task 6), derived order (Task 1; uses `id` tiebreaker since `meal_slots` has no `created_at`), free-text (Task 7), destination picker + drop next-empty (Task 8), copy (Task 9). Shopping unchanged — verified in exploration, smoke-checked in Task 9.4.
- **Ambiguity resolved:** ordering tiebreaker is `id` (not `created_at`, which the table lacks) — deterministic and consistent across desktop lanes / mobile order.
- **Type consistency:** `handleMove(slotId, newDay)`, `onSpanChange(slotId, newSpan)`, `EditDay`, `AgendaDay/AgendaCard`, `packLanes` used consistently across tasks.
