# Shopping Item Realtime Race Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prevent a locally created shopping item from briefly appearing twice when its Supabase Realtime `INSERT` arrives.

**Architecture:** Give each optimistic row its final UUID before persistence and track pending status in a separate `Set<string>`. The POST API inserts that UUID, making the optimistic row, API response, and realtime payload share one stable identity.

**Tech Stack:** React 18, Next.js 14 route handlers, Supabase, Vitest, Testing Library, TypeScript

## Global Constraints

- Preserve realtime updates from other clients.
- Keep the existing save-error and retry behavior.
- Do not add a database migration or dependency.
- Cover the realtime race and API UUID propagation with regression tests.

---

### Task 1: Accept a client-generated shopping item UUID

**Files:**
- Create: `src/app/api/shopping/items/route.test.ts`
- Modify: `src/app/api/shopping/items/route.ts:14-61`

**Interfaces:**
- Consumes: POST JSON `{ id, list_id, name, quantity?, unit?, category? }`
- Produces: a persisted `ShoppingItem` whose `id` equals the supplied valid UUID

- [ ] **Step 1: Write the failing API test**

Create a Supabase chain mock and assert that POST passes the supplied UUID to `.insert()`:

```ts
const itemId = '11111111-1111-4111-8111-111111111111'
const response = await POST(request({ id: itemId, list_id: 'list-1', name: 'Milk' }))

expect(response.status).toBe(201)
expect(insert).toHaveBeenCalledWith(expect.objectContaining({ id: itemId }))
```

Also assert an invalid UUID returns `400` without calling `.insert()`.

- [ ] **Step 2: Run the API test and verify RED**

Run: `npm test -- src/app/api/shopping/items/route.test.ts`

Expected: FAIL because the inserted object does not contain `id`, and malformed IDs are not rejected.

- [ ] **Step 3: Implement UUID validation and insertion**

Extend the body type with `id: string`, validate it with a UUID regex, return `400` when invalid, and include `id: body.id` in the Supabase insert:

```ts
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

if (!UUID_PATTERN.test(body.id)) {
  return NextResponse.json({ error: 'A valid id is required' }, { status: 400 })
}
```

- [ ] **Step 4: Run the API test and verify GREEN**

Run: `npm test -- src/app/api/shopping/items/route.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit the API boundary**

```bash
git add src/app/api/shopping/items/route.ts src/app/api/shopping/items/route.test.ts
git commit -m "fix(shopping): accept stable item ids"
```

### Task 2: Reuse the UUID across optimistic and realtime state

**Files:**
- Modify: `src/components/shopping/ShoppingClient.test.tsx`
- Modify: `src/components/shopping/ShoppingClient.tsx:1-220,258-265,395`

**Interfaces:**
- Consumes: `crypto.randomUUID()` for each new optimistic row
- Produces: pending-row membership through `pendingItemIds: Set<string>` and POST JSON containing the row ID

- [ ] **Step 1: Write the failing realtime race test**

Mock the browser Supabase channel while rendering the real `ShoppingItemRow`. Create an item, type `Milk`, press Enter, emit a realtime `INSERT` with the same UUID before resolving the POST, and assert there is one visible `Milk`:

```ts
fireEvent.click(screen.getByRole('button', { name: 'Add item' }))
fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Milk' } })
fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Enter' })
act(() => insertHandler({ new: persistedItem }))

expect(screen.getAllByText('Milk')).toHaveLength(1)
expect(JSON.parse(fetch.mock.calls[0][1]!.body as string)).toMatchObject({ id: persistedItem.id })
```

- [ ] **Step 2: Run the component test and verify RED**

Run: `npm test -- src/components/shopping/ShoppingClient.test.tsx`

Expected: FAIL because the client uses a `pending-*` ID, omits `id` from POST, and appends the realtime row.

- [ ] **Step 3: Implement stable identity and separate pending state**

Generate `crypto.randomUUID()` in both create handlers, add it to `pendingItemIds`, replace all `id.startsWith('pending-')` checks with set membership, include `id` in the POST body, and clear pending membership after successful persistence or deletion. Reconcile the response with:

```ts
setItems((prev) => prev.map((item) =>
  item.id === id ? { ...created, sort_order: targetOrder } : item
))
setPendingItemIds((prev) => {
  const next = new Set(prev)
  next.delete(id)
  return next
})
```

- [ ] **Step 4: Run the focused component test and verify GREEN**

Run: `npm test -- src/components/shopping/ShoppingClient.test.tsx`

Expected: PASS with one `Milk` row throughout the race.

- [ ] **Step 5: Run repository verification**

Run:

```bash
npm test
npm run type-check
npm run lint
```

Expected: all tests, TypeScript, and ESLint pass without new warnings.

- [ ] **Step 6: Commit and push**

```bash
git add src/components/shopping/ShoppingClient.tsx src/components/shopping/ShoppingClient.test.tsx docs/superpowers/plans/2026-07-23-shopping-item-realtime-race.md
git commit -m "fix(shopping): prevent realtime item duplicates"
git push
```
