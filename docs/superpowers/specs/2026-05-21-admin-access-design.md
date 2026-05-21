# Admin Access Design

**Date:** 2026-05-21

## Overview

Add a private admin area visible only to a single designated email (configured via env var). The admin page shows all registered households with recipe counts, member emails, last sign-in, and AI token usage with estimated cost.

---

## 1. Auth & Navigation

### Admin detection

- New env var `ADMIN_EMAIL` holds the admin's email address.
- The `(app)` layout server component (`src/app/(app)/layout.tsx`) derives `isAdmin = user.email === process.env.ADMIN_EMAIL` and passes it as a prop to `AppShell`.
- `AppShell` adds an "Admin" nav item (shield icon, href `/admin`) only when `isAdmin` is true — both in the desktop sidebar and the mobile bottom tab bar.

### Route protection

- A new route group `src/app/(app)/admin/` gets its own `layout.tsx` that re-derives `isAdmin` server-side and redirects to `/recipes` if false.
- Double-check (nav visibility + layout guard) ensures direct URL access is also blocked.

---

## 2. Data Layer

### New table: `ai_usage_logs`

```sql
CREATE TABLE ai_usage_logs (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id  uuid NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  feature       text NOT NULL,  -- 'shopping_smart' | 'recipe_parse'
  input_tokens  int  NOT NULL,
  output_tokens int  NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);
```

- Inserted after every successful Anthropic API call (fire-and-forget, non-blocking).
- `household_id` threaded through to `parseRecipeData` (currently missing, needs to be added to its callers).
- RLS: no read access for anon/authenticated users — admin page uses service role client.

### New column: `households.last_sign_in_at`

```sql
ALTER TABLE households ADD COLUMN last_sign_in_at timestamptz;
```

- Updated in `/auth/callback` (`src/app/auth/callback/route.ts`) after a successful login, using the user's `household_id` from their profile.

### AI logging helper

New file `src/lib/ai/log-usage.ts` — a single async function `logAiUsage(supabase, householdId, feature, usage)` that does the insert. Called after each Anthropic response using `response.usage.input_tokens` / `response.usage.output_tokens`.

---

## 3. Admin Page UI

**Route:** `src/app/(app)/admin/page.tsx` — fully server-rendered.

### Data fetching

Two fetches in the admin page:

1. **Supabase service role client** — queries `auth.users` joined with `profiles` to get member emails per household.
2. **Standard Supabase client** — aggregation query:

```sql
SELECT
  h.id, h.name, h.created_at, h.last_sign_in_at,
  COUNT(DISTINCT r.id)        AS recipe_count,
  COALESCE(SUM(a.input_tokens), 0)  AS total_input_tokens,
  COALESCE(SUM(a.output_tokens), 0) AS total_output_tokens
FROM households h
LEFT JOIN recipes r ON r.household_id = h.id
LEFT JOIN ai_usage_logs a ON a.household_id = h.id
GROUP BY h.id
ORDER BY h.last_sign_in_at DESC NULLS LAST
```

### Table columns

| Column | Notes |
|--------|-------|
| Household | Name |
| Members | Comma-separated emails of all profiles in that household |
| Recipes | Count |
| Last sign-in | Relative (e.g. "3 days ago"), absolute date on hover via `title` attribute |
| AI tokens | `120k in / 45k out` |
| Est. cost | `(input / 1_000_000 * 0.25) + (output / 1_000_000 * 1.25)` — Haiku pricing, formatted as `$0.09` |

- Sorted by last sign-in descending (most recently active first).
- No pagination.
- Styled to match existing app: white card, gray table rows, same typography as settings page.

---

## 4. Files Changed / Created

| File | Change |
|------|--------|
| `.env.local` / Vercel env | Add `ADMIN_EMAIL`, `SUPABASE_SERVICE_ROLE_KEY` |
| `src/app/(app)/layout.tsx` | Derive and pass `isAdmin` prop |
| `src/components/layout/AppShell.tsx` | Accept `isAdmin`, conditionally render Admin nav item |
| `src/app/(app)/admin/layout.tsx` | New — guard redirect |
| `src/app/(app)/admin/page.tsx` | New — admin dashboard table |
| `src/lib/ai/log-usage.ts` | New — `logAiUsage` helper |
| `src/lib/ai/make-shopping-list.ts` | Accept `householdId`, call `logAiUsage` after response |
| `src/lib/ai/parse-recipe.ts` | Accept `householdId`, call `logAiUsage` after response |
| `src/app/auth/callback/route.ts` | Update `households.last_sign_in_at` on login |
| `src/lib/supabase/admin.ts` | New — service role Supabase client |
| `src/types/database.ts` | Add `ai_usage_logs` table type, `last_sign_in_at` to households |
| Supabase migration | Create `ai_usage_logs` table, add `last_sign_in_at` column |

---

## 5. Out of Scope

- Multiple admin emails
- Admin actions (deleting households, impersonation)
- Historical AI cost graphs / charts
- Pagination of the household table
