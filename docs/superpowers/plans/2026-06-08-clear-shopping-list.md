# Clear Shopping List Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Clear list" button to the shopping list page that deletes all items after a confirmation dialog.

**Architecture:** New `DELETE /api/shopping/list/[listId]/items` endpoint deletes all items in one DB query. `ShoppingClient` gets a confirmation modal + `handleClearList` handler that optimistically clears items and reverts on error.

**Tech Stack:** Next.js App Router API routes, React state, Tailwind CSS, Vitest + Testing Library

---

### Task 1: API endpoint — DELETE all items in a list

**Files:**
- Create: `src/app/api/shopping/list/[listId]/items/route.ts`
- Create: `src/app/api/shopping/list/[listId]/items/route.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/app/api/shopping/list/[listId]/items/route.test.ts`:

```typescript
// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))

import { createClient } from '@/lib/supabase/server'
import { DELETE } from './route'

function makeSupabase(
  user: { id: string } | null = { id: 'user-1' },
  list: { id: string } | null = { id: 'list-1' }
) {
  const fromMap: Record<string, unknown> = {
    profiles: {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: user ? { household_id: 'hh-1' } : null }),
    },
    shopping_lists: {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: list }),
    },
    shopping_items: {
      delete: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
    },
  }
  return {
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user } }) },
    from: vi.fn((table: string) => fromMap[table]),
  }
}

function req() {
  return new NextRequest('http://localhost/api/shopping/list/list-1/items', { method: 'DELETE' })
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(createClient).mockReturnValue(makeSupabase() as unknown as ReturnType<typeof createClient>)
})

describe('DELETE /api/shopping/list/[listId]/items', () => {
  it('returns 401 when unauthenticated', async () => {
    vi.mocked(createClient).mockReturnValue(makeSupabase(null) as unknown as ReturnType<typeof createClient>)
    const res = await DELETE(req(), { params: { listId: 'list-1' } })
    expect(res.status).toBe(401)
  })

  it('returns 404 when list does not belong to household', async () => {
    vi.mocked(createClient).mockReturnValue(makeSupabase({ id: 'user-1' }, null) as unknown as ReturnType<typeof createClient>)
    const res = await DELETE(req(), { params: { listId: 'list-1' } })
    expect(res.status).toBe(404)
  })

  it('deletes all items for the list and returns 204', async () => {
    const res = await DELETE(req(), { params: { listId: 'list-1' } })
    expect(res.status).toBe(204)
  })
})
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
npx vitest run src/app/api/shopping/list/[listId]/items/route.test.ts
```

Expected: error — module not found.

- [ ] **Step 3: Create the route**

Create `src/app/api/shopping/list/[listId]/items/route.ts`:

```typescript
import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function DELETE(
  _request: NextRequest,
  { params }: { params: { listId: string } }
) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles').select('household_id').eq('id', user.id).single()
  if (!profile?.household_id) return NextResponse.json({ error: 'No household' }, { status: 403 })

  const { data: list } = await supabase
    .from('shopping_lists')
    .select('id')
    .eq('id', params.listId)
    .eq('household_id', profile.household_id)
    .maybeSingle()

  if (!list) return NextResponse.json({ error: 'List not found' }, { status: 404 })

  await supabase.from('shopping_items').delete().eq('shopping_list_id', params.listId)

  return new NextResponse(null, { status: 204 })
}
```

- [ ] **Step 4: Run test to confirm it passes**

```bash
npx vitest run src/app/api/shopping/list/[listId]/items/route.test.ts
```

Expected: 3 passed.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/shopping/list/[listId]/items/route.ts src/app/api/shopping/list/[listId]/items/route.test.ts
git commit -m "feat: add DELETE /api/shopping/list/[listId]/items endpoint"
```

---

### Task 2: UI — Clear list button and confirmation modal in ShoppingClient

**Files:**
- Modify: `src/components/shopping/ShoppingClient.tsx`
- Modify: `src/components/shopping/ShoppingClient.test.tsx`

- [ ] **Step 1: Write the failing tests**

Replace the contents of `src/components/shopping/ShoppingClient.test.tsx` with:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, fireEvent } from '@testing-library/react'
import { ShoppingClient } from './ShoppingClient'
import type { ShoppingItem, ShoppingList, ShoppingCategory } from '@/types/database'

const mockCapture = vi.fn()

vi.mock('posthog-js/react', () => ({
  usePostHog: () => ({ capture: mockCapture }),
}))

vi.mock('./ShoppingItemRow', () => ({
  ShoppingItemRow: () => null,
}))

const mockList: ShoppingList = {
  id: 'list-1',
  household_id: 'hh-1',
  week_plan_id: null,
  name: 'My List',
  date_from: null,
  date_to: null,
  created_at: '2026-06-08T00:00:00Z',
}

const mockItem: ShoppingItem = {
  id: 'item-1',
  shopping_list_id: 'list-1',
  name: 'Milk',
  quantity: 1,
  unit: 'l',
  category: null,
  is_checked: false,
  sort_order: 0,
  source_recipe_ids: [],
  created_at: '2026-06-08T00:00:00Z',
}

const defaultProps = {
  initialList: null,
  initialItems: [] as ShoppingItem[],
  initialCategories: [] as ShoppingCategory[],
  initialRecipeNames: {},
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }))
})

describe('ShoppingClient', () => {
  it('captures shopping_list_viewed on mount', () => {
    render(<ShoppingClient {...defaultProps} />)
    expect(mockCapture).toHaveBeenCalledWith('shopping_list_viewed')
  })

  it('shows empty state when there are no items', () => {
    const { getByText } = render(<ShoppingClient {...defaultProps} />)
    expect(getByText(/add items manually or generate from the planner/i)).toBeTruthy()
  })

  it('shows Clear list button when list has items', () => {
    const { getByText } = render(
      <ShoppingClient {...defaultProps} initialList={mockList} initialItems={[mockItem]} />
    )
    expect(getByText('Clear list')).toBeTruthy()
  })

  it('does not show Clear list button when list is empty', () => {
    const { queryByText } = render(
      <ShoppingClient {...defaultProps} initialList={mockList} initialItems={[]} />
    )
    expect(queryByText('Clear list')).toBeNull()
  })

  it('shows confirmation dialog when Clear list is clicked', () => {
    const { getByText } = render(
      <ShoppingClient {...defaultProps} initialList={mockList} initialItems={[mockItem]} />
    )
    fireEvent.click(getByText('Clear list'))
    expect(getByText('Remove all items from the list?')).toBeTruthy()
  })

  it('hides confirmation dialog when Cancel is clicked', () => {
    const { getByText, queryByText } = render(
      <ShoppingClient {...defaultProps} initialList={mockList} initialItems={[mockItem]} />
    )
    fireEvent.click(getByText('Clear list'))
    fireEvent.click(getByText('Cancel'))
    expect(queryByText('Remove all items from the list?')).toBeNull()
  })

  it('calls DELETE API and removes items when Clear is confirmed', async () => {
    const { getByText, queryByText } = render(
      <ShoppingClient {...defaultProps} initialList={mockList} initialItems={[mockItem]} />
    )
    fireEvent.click(getByText('Clear list'))
    fireEvent.click(getByText('Clear'))
    expect(vi.mocked(fetch)).toHaveBeenCalledWith(
      '/api/shopping/list/list-1/items',
      { method: 'DELETE' }
    )
    // Dialog closes immediately on confirm
    expect(queryByText('Remove all items from the list?')).toBeNull()
  })
})
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npx vitest run src/components/shopping/ShoppingClient.test.tsx
```

Expected: tests for "Clear list" fail — button doesn't exist yet.

- [ ] **Step 3: Update ShoppingClient**

In `src/components/shopping/ShoppingClient.tsx`:

**a) Update import line for lucide-react** — add `Trash2`:

```typescript
import { Copy, Check, Trash2 } from 'lucide-react'
```

**b) Add `showClearConfirm` state** after the `copied` state (line ~76):

```typescript
const [showClearConfirm, setShowClearConfirm] = useState(false)
```

**c) Add `handleClearList` function** after `copyToClipboard`:

```typescript
async function handleClearList() {
  setShowClearConfirm(false)
  const snapshot = items
  setItems([])
  const res = await fetch(`/api/shopping/list/${list!.id}/items`, { method: 'DELETE' })
  if (!res.ok) {
    setItems(snapshot)
  }
}
```

**d) Replace the header button block** (currently the single copy button wrapped in `{visibleItems.length > 0 && (...)}`) with:

```tsx
{visibleItems.length > 0 && (
  <div className="flex items-center gap-2">
    <button
      type="button"
      onClick={copyToClipboard}
      className="flex items-center gap-2 px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-medium rounded-lg transition-colors"
    >
      {copied ? <Check size={15} className="text-green-600" /> : <Copy size={15} />}
      {copied ? 'Copied!' : 'Copy list'}
    </button>
    {list && (
      <button
        type="button"
        onClick={() => setShowClearConfirm(true)}
        className="flex items-center gap-2 px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-medium rounded-lg transition-colors"
      >
        <Trash2 size={15} />
        Clear list
      </button>
    )}
  </div>
)}
```

**e) Add the confirmation modal** just before the closing `</div>` of the component's root element:

```tsx
{showClearConfirm && (
  <div
    className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
    onClick={() => setShowClearConfirm(false)}
  >
    <div
      className="bg-white rounded-xl p-6 shadow-xl max-w-sm mx-4 w-full"
      onClick={(e) => e.stopPropagation()}
    >
      <p className="text-gray-900 font-medium mb-5">Remove all items from the list?</p>
      <div className="flex gap-3 justify-end">
        <button
          type="button"
          onClick={() => setShowClearConfirm(false)}
          className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={handleClearList}
          className="px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors"
        >
          Clear
        </button>
      </div>
    </div>
  </div>
)}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
npx vitest run src/components/shopping/ShoppingClient.test.tsx
```

Expected: all tests pass.

- [ ] **Step 5: Run full test suite to check for regressions**

```bash
npx vitest run
```

Expected: all tests pass.

- [ ] **Step 6: Commit and push**

```bash
git add src/components/shopping/ShoppingClient.tsx src/components/shopping/ShoppingClient.test.tsx
git commit -m "feat: add Clear list button with confirmation dialog to shopping list"
git push
```
