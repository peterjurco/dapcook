# Admin Access Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an email-gated admin page that shows all households with recipe counts, member emails, last sign-in, and AI token usage with cost estimates.

**Architecture:** Admin detection is env-var based (`ADMIN_EMAIL`). A new `ai_usage_logs` table captures input/output tokens after every Anthropic call. The admin page is a server-rendered table using a Supabase service-role client to read `auth.users` emails.

**Tech Stack:** Next.js 14 App Router, Supabase (anon + service role), Anthropic SDK, Vitest + Testing Library

---

## File Map

| File | Action |
|------|--------|
| `supabase/migrations/012_admin_features.sql` | Create |
| `src/types/database.ts` | Modify — add `ai_usage_logs` table, `last_sign_in_at` to households |
| `src/lib/supabase/admin.ts` | Create — service role client |
| `src/lib/ai/log-usage.ts` | Create — `logAiUsage` helper |
| `src/lib/ai/make-shopping-list.ts` | Modify — call `logAiUsage` after response |
| `src/lib/ai/parse-recipe.ts` | Modify — add optional `householdId` param, call `logAiUsage` |
| `src/app/api/recipes/parse-text/route.ts` | Modify — fetch `household_id`, pass to `parseRecipeData` |
| `src/app/api/recipes/import/route.ts` | Modify — pass `household_id` to `parseRecipeData` |
| `src/app/auth/callback/route.ts` | Modify — update `last_sign_in_at` on successful login |
| `src/components/layout/AppShell.tsx` | Modify — accept `isAdmin` prop, render Admin nav item conditionally |
| `src/components/layout/AppShell.test.tsx` | Modify — add tests for `isAdmin` |
| `src/app/(app)/layout.tsx` | Modify — derive `isAdmin`, pass to `AppShell` |
| `src/app/(app)/admin/layout.tsx` | Create — server-side guard redirect |
| `src/app/(app)/admin/page.tsx` | Create — admin dashboard table |

---

## Task 1: DB migration

**Files:**
- Create: `supabase/migrations/012_admin_features.sql`

- [ ] **Step 1: Write the migration file**

```sql
-- Add last sign-in tracking to households
ALTER TABLE households ADD COLUMN last_sign_in_at TIMESTAMPTZ;

-- AI usage log table
CREATE TABLE ai_usage_logs (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id  UUID        NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  feature       TEXT        NOT NULL,
  input_tokens  INT         NOT NULL,
  output_tokens INT         NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_ai_usage_logs_household ON ai_usage_logs(household_id);

ALTER TABLE ai_usage_logs ENABLE ROW LEVEL SECURITY;

-- Users can insert their own household's logs (server routes run as the authed user)
CREATE POLICY "household_insert" ON ai_usage_logs
  FOR INSERT WITH CHECK (household_id = public.user_household_id());

-- No SELECT policy — only service role (admin page) can read
```

- [ ] **Step 2: Apply migration**

Run in Supabase dashboard SQL editor, or via CLI:
```bash
supabase db push
```
Verify the `ai_usage_logs` table and `households.last_sign_in_at` column exist in the Supabase dashboard.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/012_admin_features.sql
git commit -m "feat: add ai_usage_logs table and households.last_sign_in_at"
```

---

## Task 2: Update TypeScript types

**Files:**
- Modify: `src/types/database.ts`

- [ ] **Step 1: Add `last_sign_in_at` to the households type**

In `src/types/database.ts`, update the `households` table Row, Insert, and Update types:

```typescript
// In Row:
last_sign_in_at: string | null

// In Insert:
last_sign_in_at?: string | null

// In Update:
last_sign_in_at?: string | null
```

- [ ] **Step 2: Add the `ai_usage_logs` table definition**

Add after the `chat_messages` table (before `Views`):

```typescript
ai_usage_logs: {
  Row: {
    id: string
    household_id: string
    feature: string
    input_tokens: number
    output_tokens: number
    created_at: string
  }
  Insert: {
    id?: string
    household_id: string
    feature: string
    input_tokens: number
    output_tokens: number
    created_at?: string
  }
  Update: {
    id?: string
    household_id?: string
    feature?: string
    input_tokens?: number
    output_tokens?: number
    created_at?: string
  }
  Relationships: []
}
```

- [ ] **Step 3: Add convenience type at the bottom of the file**

```typescript
export type AiUsageLog = Tables<'ai_usage_logs'>
```

- [ ] **Step 4: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/types/database.ts
git commit -m "feat: add ai_usage_logs and last_sign_in_at to database types"
```

---

## Task 3: Service role Supabase client

**Files:**
- Create: `src/lib/supabase/admin.ts`

- [ ] **Step 1: Create the admin client module**

```typescript
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'

export function createAdminClient() {
  return createSupabaseClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}
```

- [ ] **Step 2: Add `SUPABASE_SERVICE_ROLE_KEY` to env**

Add to `.env.local`:
```
SUPABASE_SERVICE_ROLE_KEY=<your-service-role-key-from-supabase-dashboard>
ADMIN_EMAIL=<your-email>
```

Also add both vars in the Vercel project settings (Settings → Environment Variables).

- [ ] **Step 3: Commit**

```bash
git add src/lib/supabase/admin.ts
git commit -m "feat: add service role Supabase admin client"
```

---

## Task 4: AI usage logging helper

**Files:**
- Create: `src/lib/ai/log-usage.ts`

- [ ] **Step 1: Write the helper**

```typescript
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'

export async function logAiUsage(
  supabase: SupabaseClient<Database>,
  householdId: string,
  feature: string,
  usage: { input_tokens: number; output_tokens: number }
): Promise<void> {
  await supabase.from('ai_usage_logs').insert({
    household_id: householdId,
    feature,
    input_tokens: usage.input_tokens,
    output_tokens: usage.output_tokens,
  })
}
```

- [ ] **Step 2: Write a unit test**

Create `src/lib/ai/log-usage.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest'
import { logAiUsage } from './log-usage'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'

describe('logAiUsage', () => {
  it('inserts a row with the correct fields', async () => {
    const insert = vi.fn().mockResolvedValue({ error: null })
    const supabase = {
      from: vi.fn().mockReturnValue({ insert }),
    } as unknown as SupabaseClient<Database>

    await logAiUsage(supabase, 'hh-1', 'shopping_smart', {
      input_tokens: 100,
      output_tokens: 200,
    })

    expect(supabase.from).toHaveBeenCalledWith('ai_usage_logs')
    expect(insert).toHaveBeenCalledWith({
      household_id: 'hh-1',
      feature: 'shopping_smart',
      input_tokens: 100,
      output_tokens: 200,
    })
  })
})
```

- [ ] **Step 3: Run the test**

```bash
npx vitest run src/lib/ai/log-usage.test.ts
```
Expected: 1 passed.

- [ ] **Step 4: Commit**

```bash
git add src/lib/ai/log-usage.ts src/lib/ai/log-usage.test.ts
git commit -m "feat: add logAiUsage helper with test"
```

---

## Task 5: Log usage in make-shopping-list

**Files:**
- Modify: `src/lib/ai/make-shopping-list.ts`

The `householdId` is already passed as a parameter. We just need to wire in `logAiUsage`.

- [ ] **Step 1: Add `logAiUsage` call after the Anthropic response**

At the top of `make-shopping-list.ts`, add the import:
```typescript
import { createClient } from '@/lib/supabase/server'
import { logAiUsage } from './log-usage'
```

After `const response = await client.messages.create(...)`, add:
```typescript
void logAiUsage(createClient(), householdId, 'shopping_smart', response.usage)
```

The final shape of the function after the `client.messages.create` call:
```typescript
const response = await client.messages.create({
  model: process.env.SHOPPING_AI_MODEL ?? 'claude-haiku-4-5-20251001',
  max_tokens: 8192,
  messages: [{ role: 'user', content: prompt }],
})

void logAiUsage(createClient(), householdId, 'shopping_smart', response.usage)

const text = response.content[0].type === 'text' ? response.content[0].text : ''
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/ai/make-shopping-list.ts
git commit -m "feat: log AI token usage for shopping smart feature"
```

---

## Task 6: Log usage in parse-recipe

**Files:**
- Modify: `src/lib/ai/parse-recipe.ts`

- [ ] **Step 1: Add optional `householdId` param and log usage**

Add imports at the top:
```typescript
import { createClient } from '@/lib/supabase/server'
import { logAiUsage } from './log-usage'
```

Update the `parseRecipeData` function signature:
```typescript
export async function parseRecipeData(
  rawIngredients: string[],
  rawSteps: string[],
  householdId?: string
): Promise<ParseResult> {
```

After `const response = await client.messages.create(...)`, add:
```typescript
if (householdId) {
  void logAiUsage(createClient(), householdId, 'recipe_parse', response.usage)
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/ai/parse-recipe.ts
git commit -m "feat: log AI token usage for recipe parse feature"
```

---

## Task 7: Thread `household_id` through recipe parse callers

**Files:**
- Modify: `src/app/api/recipes/parse-text/route.ts`
- Modify: `src/app/api/recipes/import/route.ts`

- [ ] **Step 1: Update parse-text route to fetch and pass `household_id`**

Current `parse-text/route.ts` doesn't fetch `household_id`. Replace the route body:

```typescript
export async function POST(request: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles').select('household_id').eq('id', user.id).single()

  const body = await request.json() as { ingredients_text?: string; steps_text?: string }

  const rawIngredients = body.ingredients_text ? splitIngredients(body.ingredients_text) : []
  const rawSteps = body.steps_text ? splitSteps(body.steps_text) : []

  if (rawIngredients.length === 0 && rawSteps.length === 0) {
    return NextResponse.json({ ingredients: [], steps: [] })
  }

  const result = await parseRecipeData(rawIngredients, rawSteps, profile?.household_id ?? undefined)
  return NextResponse.json(result)
}
```

- [ ] **Step 2: Update import route to pass `household_id`**

In `src/app/api/recipes/import/route.ts`, the `profile` is already fetched. Find this line:

```typescript
const [{ ingredients, steps }, existingTags] = await Promise.all([
  parseRecipeData(rawIngredients, rawSteps),
```

Change it to:
```typescript
const [{ ingredients, steps }, existingTags] = await Promise.all([
  parseRecipeData(rawIngredients, rawSteps, profile?.household_id ?? undefined),
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/recipes/parse-text/route.ts src/app/api/recipes/import/route.ts
git commit -m "feat: pass household_id to parseRecipeData for usage tracking"
```

---

## Task 8: Track `last_sign_in_at` in auth callback

**Files:**
- Modify: `src/app/auth/callback/route.ts`

- [ ] **Step 1: Update `last_sign_in_at` on the household after successful login**

After the `upsert profile` block and the subsequent `select profile` block, add an update when a household is found. Find the section starting with `// Check if user has a household` and update it so that when `profile?.household_id` exists, we also update `last_sign_in_at`:

```typescript
if (profile?.household_id) {
  await supabase
    .from('households')
    .update({ last_sign_in_at: new Date().toISOString() })
    .eq('id', profile.household_id)
}
```

Place this block right after the `select profile` query, before the `if (!profile?.household_id)` check. The updated section looks like:

```typescript
const { data: profile } = await supabase
  .from('profiles')
  .select('household_id')
  .eq('id', data.user.id)
  .single()

if (profile?.household_id) {
  await supabase
    .from('households')
    .update({ last_sign_in_at: new Date().toISOString() })
    .eq('id', profile.household_id)
}

if (!profile?.household_id) {
  // ... existing invite/onboarding logic unchanged
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/auth/callback/route.ts
git commit -m "feat: update household last_sign_in_at on login"
```

---

## Task 9: Add Admin nav item to AppShell

**Files:**
- Modify: `src/components/layout/AppShell.tsx`
- Modify: `src/components/layout/AppShell.test.tsx`

- [ ] **Step 1: Write failing tests first**

Add these tests to `AppShell.test.tsx`:

```typescript
import { Shield } from 'lucide-react'

it('shows Admin nav link when isAdmin is true', () => {
  render(
    <AppShell user={mockUser} profile={mockProfile} isAdmin={true}>
      <div>content</div>
    </AppShell>
  )
  expect(screen.getAllByRole('link', { name: /admin/i }).length).toBeGreaterThan(0)
})

it('hides Admin nav link when isAdmin is false', () => {
  render(
    <AppShell user={mockUser} profile={mockProfile} isAdmin={false}>
      <div>content</div>
    </AppShell>
  )
  expect(screen.queryByRole('link', { name: /admin/i })).toBeNull()
})

it('hides Admin nav link when isAdmin is omitted', () => {
  render(
    <AppShell user={mockUser} profile={mockProfile}>
      <div>content</div>
    </AppShell>
  )
  expect(screen.queryByRole('link', { name: /admin/i })).toBeNull()
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run src/components/layout/AppShell.test.tsx
```
Expected: 3 new tests FAIL (isAdmin prop not yet accepted).

- [ ] **Step 3: Update AppShell to accept `isAdmin` and render the nav item**

In `AppShell.tsx`, add `Shield` to the lucide import:
```typescript
import { BookOpen, Calendar, ShoppingCart, Settings, LogOut, Shield } from 'lucide-react'
```

Add `isAdmin` to the props interface:
```typescript
interface AppShellProps {
  user: User
  profile: Profile
  isAdmin?: boolean
  children: React.ReactNode
}
```

Update the function signature:
```typescript
export function AppShell({ user, profile, isAdmin = false, children }: AppShellProps) {
```

In the desktop sidebar `<nav>`, after the `NAV_ITEMS.map(...)` block, add:
```tsx
{isAdmin && (
  <Link
    href="/admin"
    className={cn(
      'flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors',
      pathname.startsWith('/admin')
        ? 'bg-gray-100 text-gray-900'
        : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
    )}
  >
    <Shield size={18} />
    Admin
  </Link>
)}
```

In the mobile bottom nav `<nav>`, after the `NAV_ITEMS.map(...)` block, add:
```tsx
{isAdmin && (
  <Link
    href="/admin"
    className={cn(
      'flex-1 flex flex-col items-center justify-center gap-1 py-2 text-xs font-medium transition-colors',
      pathname.startsWith('/admin') ? 'text-gray-900' : 'text-gray-400'
    )}
  >
    <Shield size={18} />
    Admin
  </Link>
)}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run src/components/layout/AppShell.test.tsx
```
Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/components/layout/AppShell.tsx src/components/layout/AppShell.test.tsx
git commit -m "feat: add conditional Admin nav item to AppShell"
```

---

## Task 10: Pass `isAdmin` from app layout

**Files:**
- Modify: `src/app/(app)/layout.tsx`

- [ ] **Step 1: Derive `isAdmin` and pass it to AppShell**

Replace the current `layout.tsx` content:

```typescript
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { AppShell } from '@/components/layout/AppShell'
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
    <AppShell user={user} profile={profile} isAdmin={isAdmin}>
      {children}
    </AppShell>
  )
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/(app)/layout.tsx
git commit -m "feat: derive and pass isAdmin to AppShell from app layout"
```

---

## Task 11: Admin route guard layout

**Files:**
- Create: `src/app/(app)/admin/layout.tsx`

- [ ] **Step 1: Create the guard layout**

```typescript
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user || user.email !== process.env.ADMIN_EMAIL) {
    redirect('/recipes')
  }

  return <>{children}</>
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/(app)/admin/layout.tsx
git commit -m "feat: add admin route guard layout"
```

---

## Task 12: Admin dashboard page

**Files:**
- Create: `src/app/(app)/admin/page.tsx`

- [ ] **Step 1: Create the admin page**

```typescript
import { createAdminClient } from '@/lib/supabase/admin'

interface HouseholdRow {
  id: string
  name: string
  created_at: string
  last_sign_in_at: string | null
  recipe_count: number
  total_input_tokens: number
  total_output_tokens: number
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}k`
  return String(n)
}

function formatCost(inputTokens: number, outputTokens: number): string {
  const cost = (inputTokens / 1_000_000) * 0.25 + (outputTokens / 1_000_000) * 1.25
  return `$${cost.toFixed(4)}`
}

function formatRelativeTime(dateStr: string | null): string {
  if (!dateStr) return 'never'
  const diff = Date.now() - new Date(dateStr).getTime()
  const minutes = Math.floor(diff / 60_000)
  const hours = Math.floor(diff / 3_600_000)
  const days = Math.floor(diff / 86_400_000)
  if (minutes < 60) return `${minutes}m ago`
  if (hours < 24) return `${hours}h ago`
  return `${days}d ago`
}

export default async function AdminPage() {
  const adminClient = createAdminClient()

  // All queries use the service role client — ai_usage_logs has no SELECT policy for regular users
  const { data: households } = await adminClient
    .from('households')
    .select(`
      id, name, created_at, last_sign_in_at,
      recipes(id),
      ai_usage_logs(input_tokens, output_tokens)
    `)
    .order('last_sign_in_at', { ascending: false, nullsFirst: false })

  // Fetch member emails via service role (accesses auth.users)
  const { data: profiles } = await adminClient
    .from('profiles')
    .select('household_id, id')

  const { data: { users } } = await adminClient.auth.admin.listUsers()

  // Build a map of household_id → emails
  const emailsByHousehold = new Map<string, string[]>()
  for (const profile of profiles ?? []) {
    if (!profile.household_id) continue
    const authUser = users.find((u) => u.id === profile.id)
    if (!authUser?.email) continue
    const list = emailsByHousehold.get(profile.household_id) ?? []
    list.push(authUser.email)
    emailsByHousehold.set(profile.household_id, list)
  }

  const rows: HouseholdRow[] = (households ?? []).map((h) => ({
    id: h.id,
    name: h.name,
    created_at: h.created_at,
    last_sign_in_at: h.last_sign_in_at,
    recipe_count: Array.isArray(h.recipes) ? h.recipes.length : 0,
    total_input_tokens: Array.isArray(h.ai_usage_logs)
      ? h.ai_usage_logs.reduce((sum: number, l: { input_tokens: number }) => sum + l.input_tokens, 0)
      : 0,
    total_output_tokens: Array.isArray(h.ai_usage_logs)
      ? h.ai_usage_logs.reduce((sum: number, l: { output_tokens: number }) => sum + l.output_tokens, 0)
      : 0,
  }))

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <h1 className="text-xl font-semibold text-gray-900 mb-6">Admin — Households</h1>
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50">
              <th className="px-4 py-3 text-left font-medium text-gray-600">Household</th>
              <th className="px-4 py-3 text-left font-medium text-gray-600">Members</th>
              <th className="px-4 py-3 text-right font-medium text-gray-600">Recipes</th>
              <th className="px-4 py-3 text-left font-medium text-gray-600">Last sign-in</th>
              <th className="px-4 py-3 text-right font-medium text-gray-600">AI tokens</th>
              <th className="px-4 py-3 text-right font-medium text-gray-600">Est. cost</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr
                key={row.id}
                className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}
              >
                <td className="px-4 py-3 font-medium text-gray-900">{row.name}</td>
                <td className="px-4 py-3 text-gray-600 text-xs">
                  {(emailsByHousehold.get(row.id) ?? []).join(', ') || '—'}
                </td>
                <td className="px-4 py-3 text-right text-gray-700">{row.recipe_count}</td>
                <td
                  className="px-4 py-3 text-gray-600"
                  title={row.last_sign_in_at ?? undefined}
                >
                  {formatRelativeTime(row.last_sign_in_at)}
                </td>
                <td className="px-4 py-3 text-right text-gray-600 font-mono text-xs">
                  {formatTokens(row.total_input_tokens)} in / {formatTokens(row.total_output_tokens)} out
                </td>
                <td className="px-4 py-3 text-right text-gray-700">
                  {formatCost(row.total_input_tokens, row.total_output_tokens)}
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-gray-400">
                  No households yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 3: Run all tests to check for regressions**

```bash
npx vitest run
```
Expected: all tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/app/(app)/admin/layout.tsx src/app/(app)/admin/page.tsx src/lib/supabase/admin.ts
git commit -m "feat: add admin dashboard page with household stats"
```

- [ ] **Step 5: Push to trigger Vercel deploy**

```bash
git push
```

Log in with the admin email and verify:
- "Admin" link appears in the sidebar
- `/admin` shows the household table with recipe counts, member emails, last sign-in, token counts, and cost
- Logging in as a non-admin email: no Admin link appears, visiting `/admin` redirects to `/recipes`
- Make one AI call (e.g. use shopping smart), then reload admin — token count increases
