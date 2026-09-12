# UI Interface Language (next-intl) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a per-user "Interface language" setting (English / Slovenčina) that translates the entire app UI, backed by `next-intl`, with locale resolved server-side from `profiles.ui_language` (no URL routing, no cookie).

**Architecture:** `next-intl` in non-routing mode. The authenticated app-shell layout reads `profiles.ui_language` (already fetching the profile) and wraps the tree in `NextIntlClientProvider`. Every hardcoded string in `src/app/**` and `src/components/**` moves into namespaced JSON message files (`messages/en/*.json`, `messages/sk/*.json`) and is looked up via `useTranslations()` (Client Components) or `getTranslations()` (Server Components/API routes).

**Tech Stack:** Next.js 14 App Router, `next-intl`, Supabase, TypeScript, Vitest.

**Reference spec:** [docs/superpowers/specs/2026-09-11-ui-interface-language-design.md](../specs/2026-09-11-ui-interface-language-design.md)

---

## Deviation from spec (found during planning)

The spec assumed the household's recipe-translation language selector was labeled "Preferred language" via `src/components/settings/LanguageSelector.tsx`, and called for relabeling it to "Recipe translation language."

Investigation found `LanguageSelector.tsx` is **dead code** — it's not imported anywhere. The actual household language picker lives inside `src/components/settings/TranslationSettings.tsx`, under a section already labeled **"Translation"** (not "Preferred language"). There is no existing "Preferred language" label to rename, and the "Translation" heading already disambiguates it from the new "Interface language" setting.

**Plan change:** skip any edit to `LanguageSelector.tsx` (leave the dead file alone — deleting unused code is out of scope for this feature). No relabeling task is needed. The new "Your account" section with "Interface language" is added as originally planned.

## Bug found during execution (fixed between Task 6 and Task 7)

After Task 4/5 shipped, investigation found that `getTranslations()`/`getLocale()` calls in Server Components **without an explicit `locale` argument** (e.g. Task 5's `settings/page.tsx`) always silently resolved to English, ignoring `profile.ui_language` — because `src/i18n/request.ts`'s `getRequestConfig` callback only checked the explicit `locale` override and never consulted next-intl's ambient `requestLocale`. Fixed (commits `121da94`, `951f5de`) by: adding `setRequestLocale(locale)` in `src/app/(app)/layout.tsx`, and having `src/i18n/request.ts` fall back to `await requestLocale` via a new `resolveLocale()` helper in `src/i18n/config.ts`. **This means every later task's Server Component `getTranslations()`/`getLocale()` calls (Tasks 8-17) can safely omit an explicit `locale` argument** — the ambient locale now resolves correctly. No task text changes needed as a result; this is purely an infrastructure correction.

---

## Part A — Infrastructure

### Task 1: Install next-intl and scaffold config

**Files:**
- Modify: `package.json`
- Create: `src/i18n/request.ts`
- Create: `src/i18n/config.ts`
- Modify: `next.config.mjs`

- [ ] **Step 1: Install the dependency**

```bash
npm install next-intl
```

- [ ] **Step 2: Create the locale config**

`src/i18n/config.ts`:
```ts
export const locales = ['en', 'sk'] as const
export type Locale = (typeof locales)[number]
export const defaultLocale: Locale = 'en'

export function isLocale(value: string | null | undefined): value is Locale {
  return locales.includes(value as Locale)
}
```

- [ ] **Step 3: Create the request config**

`src/i18n/request.ts`:
```ts
import { getRequestConfig } from 'next-intl/server'
import { defaultLocale, isLocale } from './config'

export default getRequestConfig(async ({ locale }) => {
  const resolved = isLocale(locale) ? locale : defaultLocale

  const namespaces = ['common', 'nav', 'recipes', 'planner', 'shopping', 'settings', 'auth', 'admin', 'errors']

  const messages = Object.fromEntries(
    await Promise.all(
      namespaces.map(async (ns) => [ns, (await import(`../../messages/${resolved}/${ns}.json`)).default])
    )
  )

  return { locale: resolved, messages }
})
```

- [ ] **Step 4: Wire the next-intl plugin into next.config.mjs**

Replace the contents of `next.config.mjs` with:
```ts
import createNextIntlPlugin from 'next-intl/plugin'

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts')

/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    staleTimes: {
      dynamic: 0,
    },
    instrumentationHook: true,
  },
  async headers() {
    return [
      {
        source: '/s/:path*',
        headers: [
          {
            key: 'X-Robots-Tag',
            value: 'noindex, nofollow',
          },
          {
            key: 'Referrer-Policy',
            value: 'no-referrer',
          },
        ],
      },
    ]
  },
}

export default withNextIntl(nextConfig)
```

- [ ] **Step 5: Create empty placeholder message files so the app builds**

Create `messages/en/common.json`, `messages/en/nav.json`, `messages/en/recipes.json`, `messages/en/planner.json`, `messages/en/shopping.json`, `messages/en/settings.json`, `messages/en/auth.json`, `messages/en/admin.json`, `messages/en/errors.json`, each containing `{}`, and the same nine files under `messages/sk/`.

- [ ] **Step 6: Verify the build still passes**

Run: `npm run build`
Expected: build succeeds (no pages use translations yet, so nothing should break).

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json next.config.mjs src/i18n messages
git commit -m "feat: scaffold next-intl configuration"
```

---

### Task 2: Add `profiles.ui_language` column

**Files:**
- Create: `supabase/migrations/018_ui_language.sql`
- Modify: `src/types/database.ts`

- [ ] **Step 1: Write the migration**

`supabase/migrations/018_ui_language.sql`:
```sql
ALTER TABLE profiles
  ADD COLUMN ui_language TEXT NOT NULL DEFAULT 'en'
  CHECK (ui_language IN ('en', 'sk'));
```

- [ ] **Step 2: Apply the migration locally**

Run: `supabase migration up` (or the project's existing migration-apply command — check `package.json`/README for the exact one already in use if this differs)
Expected: migration applies with no errors; `profiles` table now has `ui_language` defaulting to `'en'`.

- [ ] **Step 3: Update generated types**

In `src/types/database.ts`, find the `profiles` table's `Row`, `Insert`, and `Update` types and add:
```ts
ui_language: string
```
to `Row`, and
```ts
ui_language?: string
```
to `Insert` and `Update`.

- [ ] **Step 4: Verify types compile**

Run: `npm run type-check`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/018_ui_language.sql src/types/database.ts
git commit -m "feat: add profiles.ui_language column"
```

---

### Task 3: Extend `PATCH /api/profile` to accept `ui_language`

**Files:**
- Modify: `src/app/api/profile/route.ts`
- Test: `src/app/api/profile/route.test.ts` (new)

- [ ] **Step 1: Write the failing test**

`src/app/api/profile/route.test.ts` — check whether a test helper/mock for Supabase already exists in the repo (search `**/*.test.ts` under `src/app/api` for an existing pattern to copy); if one exists, follow it. Otherwise use this shape:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { PATCH } from './route'

const mockUpdate = vi.fn()
const mockEq = vi.fn()
const mockGetUser = vi.fn()

vi.mock('@/lib/supabase/server', () => ({
  createClient: () => ({
    auth: { getUser: mockGetUser },
    from: () => ({ update: mockUpdate }),
  }),
}))

beforeEach(() => {
  mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
  mockEq.mockResolvedValue({ error: null })
  mockUpdate.mockReturnValue({ eq: mockEq })
})

function makeRequest(body: unknown) {
  return new Request('http://localhost/api/profile', {
    method: 'PATCH',
    body: JSON.stringify(body),
  }) as any
}

describe('PATCH /api/profile — ui_language', () => {
  it('accepts a valid ui_language value', async () => {
    const res = await PATCH(makeRequest({ ui_language: 'sk' }))
    expect(res.status).toBe(200)
    expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({ ui_language: 'sk' }))
  })

  it('rejects an invalid ui_language value', async () => {
    const res = await PATCH(makeRequest({ ui_language: 'fr' }))
    expect(res.status).toBe(400)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/app/api/profile/route.test.ts`
Expected: FAIL — current handler only recognizes `default_recipe_filter`, so a `ui_language`-only body hits the `'Nothing to update'` 400 branch instead of updating.

- [ ] **Step 3: Extend the handler**

Replace the body of `src/app/api/profile/route.ts` with:
```ts
import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { locales } from '@/i18n/config'

export async function PATCH(request: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json() as {
    default_recipe_filter?: unknown
    ui_language?: unknown
  }

  if (body.default_recipe_filter === undefined && body.ui_language === undefined) {
    return NextResponse.json({ error: 'Nothing to update' }, { status: 400 })
  }

  const update: Record<string, unknown> = {}

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
    if (typeof body.ui_language !== 'string' || !locales.includes(body.ui_language as (typeof locales)[number])) {
      return NextResponse.json({ error: 'ui_language must be one of: ' + locales.join(', ') }, { status: 400 })
    }
    update.ui_language = body.ui_language
  }

  const { error } = await supabase
    .from('profiles')
    .update(update)
    .eq('id', user.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/app/api/profile/route.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/app/api/profile/route.ts src/app/api/profile/route.test.ts
git commit -m "feat: accept ui_language in PATCH /api/profile"
```

---

### Task 4: Resolve locale from profile and wrap the app shell

**Files:**
- Modify: `src/app/(app)/layout.tsx`
- Modify: `src/app/layout.tsx`

- [ ] **Step 1: Have the root layout pass through children untouched (confirm current state)**

Read `src/app/layout.tsx` — it should just render `<html><body>{children}</body></html>` plus global providers. No change needed yet; this step is a checkpoint before Step 2.

- [ ] **Step 2: Wrap the authenticated shell in `NextIntlClientProvider`**

Modify `src/app/(app)/layout.tsx`:
```tsx
import { redirect } from 'next/navigation'
import { NextIntlClientProvider } from 'next-intl'
import { getMessages } from 'next-intl/server'
import { createClient } from '@/lib/supabase/server'
import { AppShell } from '@/components/layout/AppShell'
import { PostHogIdentifier } from '@/components/providers/PostHogIdentifier'
import { isLocale, defaultLocale } from '@/i18n/config'
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

  const birthdayUser = process.env.BIRTHDAY_USER?.toLowerCase()
  const birthdayDate = process.env.BIRTHDAY_DATE
  const birthdayMessage = process.env.BIRTHDAY_MESSAGE
  const birthdayConfig =
    birthdayUser && birthdayDate && birthdayMessage && user.email?.toLowerCase() === birthdayUser
      ? { date: birthdayDate, message: birthdayMessage }
      : undefined

  const locale = isLocale(profile.ui_language) ? profile.ui_language : defaultLocale
  const messages = await getMessages({ locale })

  return (
    <NextIntlClientProvider locale={locale} messages={messages}>
      {user.email && <PostHogIdentifier userId={user.id} email={user.email} optOut={isAdmin} />}
      <AppShell user={user} profile={profile} isAdmin={isAdmin} birthdayConfig={birthdayConfig}>
        {children}
      </AppShell>
    </NextIntlClientProvider>
  )
}
```

- [ ] **Step 3: Set the `<html lang>` attribute dynamically**

The `<html lang="en">` attribute lives in `src/app/layout.tsx`, which runs *outside* the authenticated tree (it also covers `/login`, `/onboarding`, etc. — routes with no profile yet). Leave `<html lang="en">` as the static default there; per-locale `lang` correctness inside the authenticated app is a nice-to-have, not required for translated text to render correctly, and is explicitly out of scope (see spec §7). Do not change `src/app/layout.tsx` in this task.

- [ ] **Step 4: Verify the build**

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 5: Commit**

```bash
git add src/app/\(app\)/layout.tsx
git commit -m "feat: resolve UI locale from profile and provide it to the app shell"
```

---

### Task 5: Build the "Your account" settings section with the Interface language selector

**Files:**
- Create: `src/components/settings/InterfaceLanguageSelector.tsx`
- Modify: `src/app/(app)/settings/page.tsx`
- Create: `messages/en/settings.json` (extend — see Task 12 for the full key set; this task only needs the keys below)
- Create: `messages/sk/settings.json` (same)

- [ ] **Step 1: Add the keys this component needs**

`messages/en/settings.json`:
```json
{
  "account": {
    "heading": "Your account",
    "interfaceLanguage": "Interface language",
    "interfaceLanguageHelp": "Applies only to you — everyone else in your household keeps their own setting."
  }
}
```

`messages/sk/settings.json`:
```json
{
  "account": {
    "heading": "Váš účet",
    "interfaceLanguage": "Jazyk rozhrania",
    "interfaceLanguageHelp": "Platí iba pre vás — ostatní členovia domácnosti majú vlastné nastavenie."
  }
}
```

- [ ] **Step 2: Build the component**

`src/components/settings/InterfaceLanguageSelector.tsx`:
```tsx
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { locales, type Locale } from '@/i18n/config'

const LOCALE_LABELS: Record<Locale, string> = {
  en: 'English',
  sk: 'Slovenčina',
}

export function InterfaceLanguageSelector({ initialValue }: { initialValue: Locale }) {
  const router = useRouter()
  const [value, setValue] = useState<Locale>(initialValue)
  const [saving, setSaving] = useState(false)

  async function handleChange(next: Locale) {
    setValue(next)
    setSaving(true)
    try {
      await fetch('/api/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ui_language: next }),
      })
      router.refresh()
    } finally {
      setSaving(false)
    }
  }

  return (
    <select
      value={value}
      disabled={saving}
      onChange={(e) => handleChange(e.target.value as Locale)}
      className="text-sm border border-gray-300 rounded-lg px-3 py-2 bg-white"
    >
      {locales.map((code) => (
        <option key={code} value={code}>
          {LOCALE_LABELS[code]}
        </option>
      ))}
    </select>
  )
}
```

- [ ] **Step 3: Add the "Your account" section to the settings page**

In `src/app/(app)/settings/page.tsx`, add the import:
```tsx
import { InterfaceLanguageSelector } from '@/components/settings/InterfaceLanguageSelector'
import { getTranslations } from 'next-intl/server'
```

Make the page function read the current profile's `ui_language` (it already fetches the profile for the page — reuse that query result; if the page doesn't currently select `ui_language`, add it to the existing `.select(...)` call) and insert a new section immediately before the existing `{/* Household */}` section:
```tsx
const t = await getTranslations('settings.account')
```
```tsx
{/* Your account */}
<section className="space-y-4">
  <h2 className="text-sm font-medium text-gray-500 uppercase tracking-wide">{t('heading')}</h2>
  <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-2">
    <p className="text-xs text-gray-500 mb-1">{t('interfaceLanguage')}</p>
    <p className="text-xs text-gray-400 mb-2">{t('interfaceLanguageHelp')}</p>
    <InterfaceLanguageSelector initialValue={profile?.ui_language === 'sk' ? 'sk' : 'en'} />
  </div>
</section>
```

- [ ] **Step 4: Manually verify**

Run `npm run dev`, open `/settings`, switch Interface language to Slovenčina, confirm the page refreshes and the selector persists on reload. (Full-page translation isn't wired up yet — this task only proves the setting saves and round-trips.)

- [ ] **Step 5: Commit**

```bash
git add src/components/settings/InterfaceLanguageSelector.tsx src/app/\(app\)/settings/page.tsx messages/en/settings.json messages/sk/settings.json
git commit -m "feat: add Interface language selector to settings"
```

---

### Task 6: Locale-aware date formatting

**Files:**
- Modify: `src/lib/utils/week.ts`
- Modify: `src/app/api/shopping/generate/route.ts`
- Test: `src/lib/utils/week.test.ts` (extend, or create if it doesn't exist)

- [ ] **Step 1: Check for an existing test file**

Run: `ls src/lib/utils/week.test.ts` — if it exists, read it to follow its existing style; if not, create it fresh.

- [ ] **Step 2: Write the failing test**

Add to (or create) `src/lib/utils/week.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { formatWeekLabel } from './week' // adjust to the actual exported function name(s) after reading the file

describe('week formatting — locale', () => {
  it('formats weekday names in Slovak when locale is sk', () => {
    const monday = new Date('2026-09-14T00:00:00Z')
    const result = formatWeekLabel(monday, 'sk') // adjust signature to match real implementation
    expect(result).toContain('po') // Slovak abbreviation for Monday
  })

  it('still formats in English by default', () => {
    const monday = new Date('2026-09-14T00:00:00Z')
    const result = formatWeekLabel(monday, 'en')
    expect(result).toContain('Mon')
  })
})
```

Note: before writing this test, **read the actual current contents of `src/lib/utils/week.ts`** to get the real function names/signatures — the plan above assumes a `formatWeekLabel`-shaped function but the file's real exports must be used. Adjust the test to call the real exported functions that currently call `.toLocaleDateString('en-GB', ...)` at lines 42, 48, and 55.

- [ ] **Step 3: Run the test to verify it fails**

Run: `npx vitest run src/lib/utils/week.test.ts`
Expected: FAIL (locale param doesn't exist yet / result doesn't vary by locale).

- [ ] **Step 4: Add a `locale` parameter to every function in `week.ts` that currently hardcodes `'en-GB'`**

For each of the three call sites (lines 42, 48, 55), change:
```ts
date.toLocaleDateString('en-GB', { weekday: 'short' })
```
to accept a `locale: Locale` parameter (threaded through from each function's own parameters) and use it in place of the literal `'en-GB'`:
```ts
date.toLocaleDateString(locale === 'sk' ? 'sk-SK' : 'en-GB', { weekday: 'short' })
```
Do this for all three call sites, adding a `locale: Locale` parameter to each containing function (import `Locale` from `@/i18n/config`). Update every call site of these functions elsewhere in the codebase to pass the caller's current locale (obtained via `useLocale()` from `next-intl` in Client Components, or the `locale` resolved in the nearest Server Component).

- [ ] **Step 5: Update `src/app/api/shopping/generate/route.ts` similarly**

At lines 140-141, thread the user's `ui_language` (already available in this route after fetching the profile for auth) into the same `locale === 'sk' ? 'sk-SK' : 'en-GB'` pattern in place of the hardcoded `'en-GB'`.

- [ ] **Step 6: Run the test to verify it passes**

Run: `npx vitest run src/lib/utils/week.test.ts`
Expected: PASS

- [ ] **Step 7: Update every caller of the changed `week.ts` functions to pass `locale`**

Search: `grep -rn "from '@/lib/utils/week'" src` (or the actual relative import path) and update each call site to pass the current locale. Client Components get it via `useLocale()` from `'next-intl'`; Server Components get it via `getLocale()` from `'next-intl/server'`.

- [ ] **Step 8: Run the full test suite and type-check**

Run: `npm run type-check && npx vitest run`
Expected: PASS

- [ ] **Step 9: Commit**

```bash
git add src/lib/utils/week.ts src/lib/utils/week.test.ts src/app/api/shopping/generate/route.ts
git commit -m "feat: locale-aware date formatting in week utils and shopping generation"
```

---

### Task 7: Locale-aware duration, relative-time, and pluralization helper

**Files:**
- Create: `src/lib/utils/format.ts`
- Test: `src/lib/utils/format.test.ts`
- Modify: `src/components/recipe/RecipeCard.tsx`
- Modify: `src/components/recipe/RecipeView.tsx`
- Modify: `src/components/planner/MobileEditList.tsx`
- Modify: `src/components/planner/PlannerMobileAgenda.tsx`
- Modify: `src/app/(app)/admin/page.tsx`

- [ ] **Step 1: Write the failing test**

`src/lib/utils/format.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { formatDuration, formatRelativeTime } from './format'

describe('formatDuration', () => {
  it('formats minutes only', () => {
    expect(formatDuration(45, 'en')).toBe('45m')
    expect(formatDuration(45, 'sk')).toBe('45 min')
  })

  it('formats hours and minutes', () => {
    expect(formatDuration(90, 'en')).toBe('1h 30m')
    expect(formatDuration(90, 'sk')).toBe('1 h 30 min')
  })

  it('formats whole hours', () => {
    expect(formatDuration(120, 'en')).toBe('2h')
    expect(formatDuration(120, 'sk')).toBe('2 h')
  })
})

describe('formatRelativeTime', () => {
  it('formats minutes ago', () => {
    expect(formatRelativeTime(5, 'en')).toBe('5m ago')
    expect(formatRelativeTime(5, 'sk')).toBe('pred 5 min')
  })

  it('formats never', () => {
    expect(formatRelativeTime(null, 'en')).toBe('never')
    expect(formatRelativeTime(null, 'sk')).toBe('nikdy')
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/utils/format.test.ts`
Expected: FAIL — module doesn't exist yet.

- [ ] **Step 3: Implement the helpers**

`src/lib/utils/format.ts`:
```ts
import type { Locale } from '@/i18n/config'

export function formatDuration(totalMinutes: number, locale: Locale): string {
  const h = Math.floor(totalMinutes / 60)
  const m = totalMinutes % 60

  if (locale === 'sk') {
    if (h === 0) return `${m} min`
    if (m === 0) return `${h} h`
    return `${h} h ${m} min`
  }

  if (h === 0) return `${m}m`
  if (m === 0) return `${h}h`
  return `${h}h ${m}m`
}

export function formatRelativeTime(minutesAgo: number | null, locale: Locale): string {
  if (minutesAgo === null) return locale === 'sk' ? 'nikdy' : 'never'

  const days = Math.floor(minutesAgo / (60 * 24))
  const hours = Math.floor(minutesAgo / 60)

  if (locale === 'sk') {
    if (days > 0) return `pred ${days} d`
    if (hours > 0) return `pred ${hours} h`
    return `pred ${minutesAgo} min`
  }

  if (days > 0) return `${days}d ago`
  if (hours > 0) return `${hours}h ago`
  return `${minutesAgo}m ago`
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/lib/utils/format.test.ts`
Expected: PASS

- [ ] **Step 5: Update each call site**

Read the current `formatTime`/`formatRelativeTime`/`formatTokens`-equivalent local functions in `RecipeCard.tsx`, `RecipeView.tsx`, and `admin/page.tsx` and replace their bodies with calls to the new shared `formatDuration`/`formatRelativeTime`, passing `locale` obtained via `useLocale()` (Client Components) or `getLocale()` (Server Components — `admin/page.tsx` is a Server Component). Remove the now-duplicated local implementations.

In `MobileEditList.tsx`'s `rangeLabel()` and `PlannerMobileAgenda.tsx`'s `DayBadge`, the hardcoded `"1 day"` / `"${n} days"` / `` `day ${dayIndex}/${span}` `` strings are copy, not formatting logic, so they are translated as ICU plural messages in the `planner` namespace as part of **Task 12** (not in `format.ts`). Skip this bullet in this task; Task 12, Step 2 covers `MobileEditList.tsx`/`PlannerMobileAgenda.tsx` directly.

- [ ] **Step 6: Run full test suite**

Run: `npx vitest run`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/lib/utils/format.ts src/lib/utils/format.test.ts src/components/recipe/RecipeCard.tsx src/components/recipe/RecipeView.tsx src/app/\(app\)/admin/page.tsx
git commit -m "feat: locale-aware duration and relative-time formatting"
```

---

## Part B — Content migration (per feature area)

Each task below follows the same shape: (1) create/extend the namespace's `en`/`sk` JSON files with every string found for that area, (2) update each listed file to import `useTranslations`/`getTranslations` and replace literal strings with `t('key')` calls, (3) handle any interpolation/pluralization with ICU syntax, (4) manually verify the screen in both languages, (5) commit.

**ICU plural syntax reminder** (used throughout): `{count, plural, one {# item} other {# items}}` — next-intl's `t('key', {count})` evaluates this automatically per locale's plural rules.

---

### Task 8: `common` namespace

**Files:**
- Modify: `messages/en/common.json`, `messages/sk/common.json`
- Modify: `src/components/ui/ConfirmModal.tsx`
- Modify: `src/components/ui/BirthdayOverlay.tsx`
- Modify: `src/app/layout.tsx` (metadata only — this file itself does not use `next-intl`, see note below)

- [ ] **Step 1: Populate the message files**

`messages/en/common.json`:
```json
{
  "actions": {
    "cancel": "Cancel",
    "remove": "Remove"
  },
  "birthday": {
    "heading": "Happy Birthday!",
    "subtitle": "You are awesome! 🎉"
  },
  "app": {
    "title": "dapcook",
    "description": "Your shared cookbook & meal planner"
  }
}
```

`messages/sk/common.json`:
```json
{
  "actions": {
    "cancel": "Zrušiť",
    "remove": "Odstrániť"
  },
  "birthday": {
    "heading": "Všetko najlepšie!",
    "subtitle": "Si super! 🎉"
  },
  "app": {
    "title": "dapcook",
    "description": "Vaša spoločná kuchárka a plánovač jedál"
  }
}
```

- [ ] **Step 2: Migrate `ConfirmModal.tsx`**

Add `'use client'`-compatible `import { useTranslations } from 'next-intl'` and `const t = useTranslations('common')`. Replace the default `confirmLabel` prop value `'Remove'` with a default of `undefined`, and inside the component body fall back to `confirmLabel ?? t('actions.remove')`. Replace the JSX text `Cancel` with `{t('actions.cancel')}`.

- [ ] **Step 3: Migrate `BirthdayOverlay.tsx`**

Add `useTranslations('common')`, replace `Happy Birthday!` with `{t('birthday.heading')}` and `You are awesome! 🎉` with `{t('birthday.subtitle')}`. Leave the env-configured `birthdayMessage` untouched (it's operator-authored content, not app copy).

- [ ] **Step 4: Metadata in `src/app/layout.tsx`**

`next-intl` messages aren't available in the root `generateMetadata`/`metadata` export outside the locale-aware subtree (this file wraps *every* route, including pre-auth ones where no locale is known yet). Leave `metadata.title`/`metadata.description` as static English literals in `src/app/layout.tsx` — this is intentional, not a gap: it's the document's default `<title>` before any locale is resolved, and per-page `generateMetadata` inside `(app)/**` can override it per-locale later if ever needed. No change to this file in this task.

- [ ] **Step 5: Manually verify**

`npm run dev`, trigger a `ConfirmModal` (e.g. delete a tag) in both English and Slovak (via the Task 5 selector), confirm button labels translate.

- [ ] **Step 6: Commit**

```bash
git add messages/en/common.json messages/sk/common.json src/components/ui/ConfirmModal.tsx src/components/ui/BirthdayOverlay.tsx
git commit -m "feat(i18n): translate common/shared components"
```

---

### Task 9: `nav` namespace

**Files:**
- Modify: `messages/en/nav.json`, `messages/sk/nav.json`
- Modify: `src/components/layout/AppShell.tsx`

- [ ] **Step 1: Populate the message files**

`messages/en/nav.json`:
```json
{
  "recipes": "Recipes",
  "planner": "Planner",
  "shopping": "Shopping",
  "settings": "Settings",
  "admin": "Admin",
  "signOut": "Sign out",
  "userFallbackAlt": "User"
}
```

`messages/sk/nav.json`:
```json
{
  "recipes": "Recepty",
  "planner": "Plánovač",
  "shopping": "Nákupy",
  "settings": "Nastavenia",
  "admin": "Administrácia",
  "signOut": "Odhlásiť sa",
  "userFallbackAlt": "Používateľ"
}
```

- [ ] **Step 2: Migrate `AppShell.tsx`**

This is a Client Component (has interactive nav state). Add `import { useTranslations } from 'next-intl'` and `const t = useTranslations('nav')`. The `NAV_ITEMS` array is currently a module-level constant with hardcoded labels — move it inside the component (or a hook) so it can call `t()`, e.g.:
```tsx
const navItems = [
  { href: '/recipes', label: t('recipes'), icon: BookOpen },
  { href: '/planner', label: t('planner'), icon: Calendar },
  { href: '/shopping', label: t('shopping'), icon: ShoppingCart },
  { href: '/settings', label: t('settings'), icon: Settings },
]
```
(adjust icon imports/names to match the existing file exactly — read the current `NAV_ITEMS` definition first to preserve icons and hrefs). Replace the `'Admin'` literal (both desktop and mobile copies) with `{t('admin')}`, `alt={profile.display_name ?? 'User'}` with `alt={profile.display_name ?? t('userFallbackAlt')}`, and `Sign out` with `{t('signOut')}`. Leave the `dapcook` brand text untranslated (it's a proper noun/brand name).

- [ ] **Step 3: Manually verify**

Switch to Slovak, confirm the sidebar/tab bar and sign-out button translate.

- [ ] **Step 4: Commit**

```bash
git add messages/en/nav.json messages/sk/nav.json src/components/layout/AppShell.tsx
git commit -m "feat(i18n): translate navigation"
```

---

### Task 10: `recipes` namespace — part 1 (list, view, form)

**Files:**
- Modify: `messages/en/recipes.json`, `messages/sk/recipes.json`
- Modify: `src/components/recipe/RecipeList.tsx`
- Modify: `src/components/recipe/RecipeView.tsx`
- Modify: `src/components/recipe/RecipeForm.tsx`
- Modify: `src/components/recipe/RecipeFiltersModal.tsx`

- [ ] **Step 1: Populate the message files (part 1 keys)**

`messages/en/recipes.json`:
```json
{
  "list": {
    "headingR": "R",
    "headingRest": "ecipes",
    "searchPlaceholder": "Search recipes...",
    "filters": "Filters",
    "import": "Import",
    "newRecipe": "New recipe",
    "new": "New",
    "searchingAllNotice": "Searching all recipes, ignoring your default view.",
    "emptyHeading": "No recipes yet",
    "emptySubtitle": "Import from a URL or add one manually",
    "importRecipe": "Import recipe",
    "addManually": "Add manually",
    "noMatch": "No recipes match your search"
  },
  "filtersModal": {
    "closeAria": "Close filters",
    "heading": "Filters",
    "other": "Other",
    "noTags": "No tags yet. Add some to your recipes.",
    "clearAll": "Clear all",
    "clearDefault": "Clear default",
    "setAsDefault": "Set as default",
    "dialogAria": "Filters",
    "showResults": "{count, plural, one {Show # recipe} other {Show # recipes}}"
  },
  "view": {
    "prep": "Prep",
    "cook": "Cook",
    "total": "Total",
    "ingredients": "Ingredients",
    "method": "Method",
    "servings": "Servings",
    "notes": "Notes",
    "originalRecipe": "Original recipe"
  },
  "form": {
    "titleRequired": "Title is required",
    "genericError": "Something went wrong",
    "titleLabel": "Title *",
    "titlePlaceholder": "e.g. Segedínsky guláš",
    "descriptionLabel": "Description",
    "descriptionPlaceholder": "A short description of the recipe...",
    "prepTimeLabel": "Prep time (min)",
    "prepTimePlaceholder": "15",
    "cookTimeLabel": "Cook time (min)",
    "cookTimePlaceholder": "30",
    "servingsLabel": "Servings",
    "servingsPlaceholder": "4",
    "tagsLabel": "Tags",
    "ingredientsHeading": "Ingredients",
    "methodHeading": "Method",
    "optionalHeading": "Optional",
    "notesLabel": "Notes",
    "notesPlaceholder": "Personal notes, variations, tips...",
    "imageLabel": "Image",
    "sourceUrlLabel": "Source URL",
    "urlPlaceholder": "https://...",
    "draftWarning": "Some recipe details could not be extracted — please fill them in manually.",
    "saving": "Saving...",
    "save": "Save",
    "saveRecipe": "Save recipe",
    "cancel": "Cancel"
  }
}
```

`messages/sk/recipes.json`:
```json
{
  "list": {
    "headingR": "R",
    "headingRest": "ecepty",
    "searchPlaceholder": "Hľadať recepty...",
    "filters": "Filtre",
    "import": "Importovať",
    "newRecipe": "Nový recept",
    "new": "Nový",
    "searchingAllNotice": "Prehľadávam všetky recepty, bez ohľadu na predvolené zobrazenie.",
    "emptyHeading": "Zatiaľ žiadne recepty",
    "emptySubtitle": "Importujte z URL alebo pridajte ručne",
    "importRecipe": "Importovať recept",
    "addManually": "Pridať ručne",
    "noMatch": "Vyhľadávaniu nezodpovedajú žiadne recepty"
  },
  "filtersModal": {
    "closeAria": "Zavrieť filtre",
    "heading": "Filtre",
    "other": "Ostatné",
    "noTags": "Zatiaľ žiadne štítky. Pridajte nejaké k svojim receptom.",
    "clearAll": "Zrušiť všetko",
    "clearDefault": "Zrušiť predvolené",
    "setAsDefault": "Nastaviť ako predvolené",
    "dialogAria": "Filtre",
    "showResults": "{count, plural, one {Zobraziť # recept} few {Zobraziť # recepty} other {Zobraziť # receptov}}"
  },
  "view": {
    "prep": "Príprava",
    "cook": "Varenie",
    "total": "Spolu",
    "ingredients": "Suroviny",
    "method": "Postup",
    "servings": "Porcie",
    "notes": "Poznámky",
    "originalRecipe": "Pôvodný recept"
  },
  "form": {
    "titleRequired": "Názov je povinný",
    "genericError": "Niečo sa pokazilo",
    "titleLabel": "Názov *",
    "titlePlaceholder": "napr. Segedínsky guláš",
    "descriptionLabel": "Popis",
    "descriptionPlaceholder": "Krátky popis receptu...",
    "prepTimeLabel": "Príprava (min)",
    "prepTimePlaceholder": "15",
    "cookTimeLabel": "Varenie (min)",
    "cookTimePlaceholder": "30",
    "servingsLabel": "Porcie",
    "servingsPlaceholder": "4",
    "tagsLabel": "Štítky",
    "ingredientsHeading": "Suroviny",
    "methodHeading": "Postup",
    "optionalHeading": "Voliteľné",
    "notesLabel": "Poznámky",
    "notesPlaceholder": "Osobné poznámky, obmeny, tipy...",
    "imageLabel": "Obrázok",
    "sourceUrlLabel": "Zdrojová URL",
    "urlPlaceholder": "https://...",
    "draftWarning": "Niektoré údaje receptu sa nepodarilo vytiahnuť — doplňte ich prosím ručne.",
    "saving": "Ukladá sa...",
    "save": "Uložiť",
    "saveRecipe": "Uložiť recept",
    "cancel": "Zrušiť"
  }
}
```

- [ ] **Step 2: Migrate `RecipeList.tsx`**

Add `useTranslations('recipes')` (this is a Client Component). Replace: the split `R`/`ecipes` heading spans with `{t('list.headingR')}`/`{t('list.headingRest')}`; `"Search recipes..."` placeholder with `{t('list.searchPlaceholder')}`; the conditional `Filters` label with `{t('list.filters')}`; both `Import` occurrences with `{t('list.import')}`; the responsive `New recipe`/`New` pair with `{t('list.newRecipe')}`/`{t('list.new')}`; `Searching all recipes, ignoring your default view.` with `{t('list.searchingAllNotice')}`; `No recipes yet` with `{t('list.emptyHeading')}`; `Import from a URL or add one manually` with `{t('list.emptySubtitle')}`; `Import recipe` with `{t('list.importRecipe')}`; `Add manually` with `{t('list.addManually')}`; `No recipes match your search` with `{t('list.noMatch')}`.

- [ ] **Step 3: Migrate `RecipeFiltersModal.tsx`**

Add `useTranslations('recipes')`. Replace `aria-label="Close filters"` with `aria-label={t('filtersModal.closeAria')}`; `Filters` heading with `{t('filtersModal.heading')}`; `Other` with `{t('filtersModal.other')}`; the no-tags message with `{t('filtersModal.noTags')}`; `Clear all` with `{t('filtersModal.clearAll')}`; `Clear default`/`Set as default` with `{t('filtersModal.clearDefault')}`/`{t('filtersModal.setAsDefault')}`; `aria-label="Filters"` with `{t('filtersModal.dialogAria')}`. Replace the manual pluralization template
```ts
`Show ${resultCount} ${resultCount === 1 ? 'recipe' : 'recipes'}`
```
with
```ts
t('filtersModal.showResults', { count: resultCount })
```

- [ ] **Step 4: Migrate `RecipeView.tsx`**

Add `useTranslations('recipes')` or `getTranslations('recipes')` depending on whether this is a Client or Server Component (read the file's top to check for `'use client'`). Replace the `'Prep'`/`'Cook'`/`'Total'` literals passed into `formatTime()` calls with `t('view.prep')`/`t('view.cook')`/`t('view.total')`; `Ingredients` with `{t('view.ingredients')}`; `Method` with `{t('view.method')}`; `Servings` with `{t('view.servings')}`; `Notes` with `{t('view.notes')}`; `Original recipe` with `{t('view.originalRecipe')}`.

- [ ] **Step 5: Migrate `RecipeForm.tsx`**

Add `useTranslations('recipes')`. Map every literal listed in the `form` namespace above to its corresponding key at its existing location (validation message, field labels, placeholders, section headings, draft warning, and the three button states). Read the file first to confirm each literal's exact current location before replacing.

- [ ] **Step 6: Manually verify**

In both languages: open the recipe list (search, filters, empty state), open a recipe, open the edit form, confirm every replaced string renders translated and no key shows up literally (e.g. `recipes.list.heading` printed as raw text means a typo in the key).

- [ ] **Step 7: Commit**

```bash
git add messages/en/recipes.json messages/sk/recipes.json src/components/recipe/RecipeList.tsx src/components/recipe/RecipeView.tsx src/components/recipe/RecipeForm.tsx src/components/recipe/RecipeFiltersModal.tsx
git commit -m "feat(i18n): translate recipe list, view, form, and filters"
```

---

### Task 11: `recipes` namespace — part 2 (editors, actions, import flow, pages)

**Files:**
- Modify: `messages/en/recipes.json`, `messages/sk/recipes.json` (extend)
- Modify: `src/components/recipe/IngredientEditor.tsx`
- Modify: `src/components/recipe/StepEditor.tsx`
- Modify: `src/components/recipe/TagInput.tsx`
- Modify: `src/components/recipe/ImageUpload.tsx`
- Modify: `src/components/recipe/DeleteRecipeButton.tsx`
- Modify: `src/components/recipe/ShareRecipeButton.tsx`
- Modify: `src/components/recipe/AddToPlanButton.tsx`
- Modify: `src/components/recipe/AddToPlanPicker.tsx`
- Modify: `src/app/(app)/recipes/[id]/page.tsx`
- Modify: `src/app/(app)/recipes/[id]/edit/page.tsx`
- Modify: `src/app/(app)/recipes/new/page.tsx`
- Modify: `src/app/(app)/recipes/import/page.tsx`

- [ ] **Step 1: Extend the message files**

Add these top-level keys to both `messages/en/recipes.json` and `messages/sk/recipes.json` (merge into the existing objects from Task 10):

English additions:
```json
{
  "ingredientEditor": {
    "tapToAdd": "Tap to add ingredient",
    "removeAria": "Remove ingredient",
    "editAria": "Edit ingredient",
    "qty": "Qty",
    "unit": "Unit",
    "ingredient": "Ingredient",
    "notes": "Notes",
    "done": "Done",
    "parsePlaceholder": "200g chicken breast, sliced\n1 tbsp olive oil\nsalt to taste\n2 cloves garlic, minced",
    "parse": "Parse",
    "cancel": "Cancel",
    "add": "Add ingredient",
    "pasteText": "Paste text"
  },
  "stepEditor": {
    "parsePlaceholder": "1. Preheat the oven to 200°C.\n2. Mix flour and butter until crumbly.\n3. Add eggs and stir until combined.",
    "parse": "Parse",
    "cancel": "Cancel",
    "rowPlaceholder": "Describe this step...",
    "removeAria": "Remove step",
    "add": "Add step",
    "pasteText": "Paste text"
  },
  "tagInput": {
    "placeholder": "Type a tag and press Enter",
    "helper": "Press Enter or comma to add",
    "mostUsed": "Most used"
  },
  "imageUpload": {
    "tooLarge": "Image must be under {maxSizeMb}MB",
    "uploadFailedPrefix": "Upload failed — ",
    "removeAria": "Remove image",
    "uploading": "Uploading...",
    "addPhoto": "Add photo",
    "dragDrop": "or drag and drop",
    "alt": "Recipe"
  },
  "delete": {
    "confirmTitle": "Delete this recipe?",
    "confirmYes": "Yes, delete",
    "cancel": "Cancel",
    "button": "Delete"
  },
  "share": {
    "genericError": "Something went wrong. Try again.",
    "button": "Share",
    "dialogTitle": "Share recipe",
    "closeAria": "Close",
    "description": "Anyone with this link can view the recipe.",
    "linkAria": "Share link",
    "disable": "Disable sharing",
    "copied": "Copied",
    "copyLink": "Copy link",
    "creating": "Creating link…",
    "createLink": "Create share link",
    "copyFailed": "Could not copy the link. Select and copy it manually."
  },
  "addToPlan": {
    "buttonTitle": "Add to weekly plan",
    "button": "Add to Plan",
    "thisWeek": "this week",
    "nextWeek": "next week",
    "change": "Change",
    "viewPlan": "View plan",
    "heading": "Add to plan",
    "thisWeekChip": "This week",
    "nextWeekChip": "Next week",
    "earlierWeekAria": "Earlier week",
    "laterWeekAria": "Later week",
    "addTo": "Add to {weekday} {day}",
    "adding": "Adding…"
  },
  "detailPage": {
    "allRecipesAria": "All recipes",
    "allRecipes": "All recipes",
    "edit": "Edit"
  },
  "editPage": {
    "backToRecipe": "Back to recipe",
    "heading": "Edit recipe"
  },
  "newPage": {
    "heading": "New recipe",
    "subtitle": "Add a recipe from scratch"
  },
  "import": {
    "rateLimitTitle": "Translation rate limit reached",
    "unavailableTitle": "Translation unavailable",
    "timedOutTitle": "Translation timed out",
    "failedTitle": "Translation failed",
    "couldNotImport": "Could not import this URL",
    "genericError": "Something went wrong. Please try again.",
    "reviewHeading": "Review imported recipe",
    "reviewSubtitle": "Check the details and make any edits before saving",
    "translationErrorHeading": "Import recipe",
    "translationErrorBody": "The recipe was imported successfully but could not be translated. You can retry the translation, keep the recipe in its original language, or cancel.",
    "retryTranslation": "Retry translation",
    "keepAsIs": "Keep as-is",
    "cancel": "Cancel",
    "importingHeading": "Import recipe",
    "starting": "Starting...",
    "idleSubtitle": "Paste a link from any recipe website",
    "urlPlaceholder": "https://www.bbcgoodfood.com/recipes/...",
    "importButton": "Import",
    "addManually": "Add recipe manually instead",
    "worksWellWith": "Works well with",
    "worksWellWithOther": "and most recipe sites with structured data"
  }
}
```

Slovak additions:
```json
{
  "ingredientEditor": {
    "tapToAdd": "Ťuknutím pridáte surovinu",
    "removeAria": "Odstrániť surovinu",
    "editAria": "Upraviť surovinu",
    "qty": "Množ.",
    "unit": "Jedn.",
    "ingredient": "Surovina",
    "notes": "Poznámky",
    "done": "Hotovo",
    "parsePlaceholder": "200g kuracie prsia, nakrájané\n1 PL olivového oleja\nsoľ podľa chuti\n2 strúčiky cesnaku, nasekané",
    "parse": "Rozpoznať",
    "cancel": "Zrušiť",
    "add": "Pridať surovinu",
    "pasteText": "Vložiť text"
  },
  "stepEditor": {
    "parsePlaceholder": "1. Rúru predhrejte na 200 °C.\n2. Múku a maslo premiešajte na drobenku.\n3. Pridajte vajcia a premiešajte.",
    "parse": "Rozpoznať",
    "cancel": "Zrušiť",
    "rowPlaceholder": "Popíšte tento krok...",
    "removeAria": "Odstrániť krok",
    "add": "Pridať krok",
    "pasteText": "Vložiť text"
  },
  "tagInput": {
    "placeholder": "Napíšte štítok a stlačte Enter",
    "helper": "Pridáte stlačením Enter alebo čiarky",
    "mostUsed": "Najpoužívanejšie"
  },
  "imageUpload": {
    "tooLarge": "Obrázok musí mať menej ako {maxSizeMb} MB",
    "uploadFailedPrefix": "Nahrávanie zlyhalo — ",
    "removeAria": "Odstrániť obrázok",
    "uploading": "Nahrávanie...",
    "addPhoto": "Pridať fotku",
    "dragDrop": "alebo sem presuňte súbor",
    "alt": "Recept"
  },
  "delete": {
    "confirmTitle": "Odstrániť tento recept?",
    "confirmYes": "Áno, odstrániť",
    "cancel": "Zrušiť",
    "button": "Odstrániť"
  },
  "share": {
    "genericError": "Niečo sa pokazilo. Skúste to znova.",
    "button": "Zdieľať",
    "dialogTitle": "Zdieľať recept",
    "closeAria": "Zavrieť",
    "description": "Ktokoľvek s týmto odkazom si môže recept pozrieť.",
    "linkAria": "Odkaz na zdieľanie",
    "disable": "Vypnúť zdieľanie",
    "copied": "Skopírované",
    "copyLink": "Kopírovať odkaz",
    "creating": "Vytváram odkaz…",
    "createLink": "Vytvoriť odkaz na zdieľanie",
    "copyFailed": "Odkaz sa nepodarilo skopírovať. Označte ho a skopírujte ručne."
  },
  "addToPlan": {
    "buttonTitle": "Pridať do týždenného plánu",
    "button": "Pridať do plánu",
    "thisWeek": "tento týždeň",
    "nextWeek": "budúci týždeň",
    "change": "Zmeniť",
    "viewPlan": "Zobraziť plán",
    "heading": "Pridať do plánu",
    "thisWeekChip": "Tento týždeň",
    "nextWeekChip": "Budúci týždeň",
    "earlierWeekAria": "Skorší týždeň",
    "laterWeekAria": "Neskorší týždeň",
    "addTo": "Pridať na {weekday} {day}",
    "adding": "Pridávam…"
  },
  "detailPage": {
    "allRecipesAria": "Všetky recepty",
    "allRecipes": "Všetky recepty",
    "edit": "Upraviť"
  },
  "editPage": {
    "backToRecipe": "Späť na recept",
    "heading": "Upraviť recept"
  },
  "newPage": {
    "heading": "Nový recept",
    "subtitle": "Pridajte recept od začiatku"
  },
  "import": {
    "rateLimitTitle": "Dosiahnutý limit prekladov",
    "unavailableTitle": "Preklad nedostupný",
    "timedOutTitle": "Vypršal čas na preklad",
    "failedTitle": "Preklad zlyhal",
    "couldNotImport": "Túto URL sa nepodarilo importovať",
    "genericError": "Niečo sa pokazilo. Skúste to znova.",
    "reviewHeading": "Skontrolujte importovaný recept",
    "reviewSubtitle": "Pred uložením skontrolujte a upravte údaje",
    "translationErrorHeading": "Importovať recept",
    "translationErrorBody": "Recept sa podarilo importovať, ale nepodarilo sa ho preložiť. Preklad môžete skúsiť znova, ponechať recept v pôvodnom jazyku alebo import zrušiť.",
    "retryTranslation": "Skúsiť preklad znova",
    "keepAsIs": "Ponechať tak",
    "cancel": "Zrušiť",
    "importingHeading": "Importovať recept",
    "starting": "Spúšťam...",
    "idleSubtitle": "Vložte odkaz z ľubovoľnej stránky s receptami",
    "urlPlaceholder": "https://www.bbcgoodfood.com/recipes/...",
    "importButton": "Importovať",
    "addManually": "Radšej pridať recept ručne",
    "worksWellWith": "Funguje dobre s",
    "worksWellWithOther": "a väčšinou stránok s receptami so štruktúrovanými dátami"
  }
}
```

- [ ] **Step 2: Migrate each component**

For each file, add `useTranslations('recipes')` and replace its literals with the keys defined above, at their existing JSX locations (read each file first — exact locations weren't line-numbered in the inventory for every string):
- `IngredientEditor.tsx` → `ingredientEditor.*` (note: the `"200"`, `"g"`, `"chicken breast"`, `"finely chopped"` example placeholders stay as illustrative examples but should still be translated to natural Slovak examples, e.g. `"200"`, `"g"`, `"kuracie prsia"`, `"nadrobno nakrájaná"` — add these four as additional keys `ingredientEditor.examples.{qty,unit,name,notes}` in both files)
- `StepEditor.tsx` → `stepEditor.*`
- `TagInput.tsx` → `tagInput.*`
- `ImageUpload.tsx` → `imageUpload.*` (the max-size string is interpolated: `t('imageUpload.tooLarge', { maxSizeMb: MAX_SIZE_MB })`; the upload-failed prefix is concatenation: `` `${t('imageUpload.uploadFailedPrefix')}${uploadError.message}` ``)
- `DeleteRecipeButton.tsx` → `delete.*`
- `ShareRecipeButton.tsx` → `share.*`
- `AddToPlanButton.tsx` → `addToPlan.buttonTitle`, `addToPlan.button`
- `AddToPlanPicker.tsx` → remaining `addToPlan.*` keys; the `addTo` key is interpolated: `t('addToPlan.addTo', { weekday: selectedLabel.weekday, day: selectedLabel.day })`

- [ ] **Step 3: Migrate the page files**

- `src/app/(app)/recipes/[id]/page.tsx` → `detailPage.*`
- `src/app/(app)/recipes/[id]/edit/page.tsx` → `editPage.*`
- `src/app/(app)/recipes/new/page.tsx` → `newPage.*`
- `src/app/(app)/recipes/import/page.tsx` → `import.*`. The domain-name list items (`bbcgoodfood.com`, `bbc.co.uk/food`, `kuchynalidla.sk`, `gymbeam.sk`, `themediterraneandish.com`) stay untranslated (they're literal hostnames); only the trailing sentence `and most recipe sites with structured data` uses `import.worksWellWithOther`.

Check each of these files for `'use client'` to decide `useTranslations` vs `getTranslations`.

- [ ] **Step 4: Manually verify**

Test the full recipe editor (ingredients, steps, tags, image upload), delete/share/add-to-plan flows, and the import flow (both the idle and error states) in both languages.

- [ ] **Step 5: Commit**

```bash
git add messages/en/recipes.json messages/sk/recipes.json src/components/recipe src/app/\(app\)/recipes
git commit -m "feat(i18n): translate recipe editors, actions, and import flow"
```

---

### Task 12: `planner` namespace

**Files:**
- Modify: `messages/en/planner.json`, `messages/sk/planner.json`
- Modify: `src/components/planner/CustomLabelCard.tsx`
- Modify: `src/components/planner/MobileEditList.tsx`
- Modify: `src/components/planner/PlannerClient.tsx`
- Modify: `src/components/planner/PlannerDesktopGrid.tsx`
- Modify: `src/components/planner/PlannerMobileAgenda.tsx`
- Modify: `src/components/planner/RecipeSearch.tsx`
- Modify: `src/components/planner/SlotCard.tsx`
- Modify: `src/components/planner/WeekNav.tsx`
- Modify: `src/components/planner/WeekRulesPanel.tsx`
- Modify: `src/types/planner.ts` (or wherever `CUSTOM_LABELS`/`RULE_TYPES` are defined) — coordinate translation of these constants alongside the components that render them

- [ ] **Step 1: Populate the message files**

`messages/en/planner.json`:
```json
{
  "labels": {
    "removeConfirm": "Remove \"{label}\" from the plan?",
    "removeConfirmLabel": "Remove",
    "removeAria": "Remove",
    "dragAria": "Drag to reorder",
    "custom": "Custom"
  },
  "editList": {
    "oneDay": "{weekday} {day} · 1 day",
    "multiDay": "{startWeekday} {startDay} → {endWeekday} {endDay} · {days, plural, one {# day} other {# days}}",
    "recipeFallback": "Meal",
    "dragMoveAria": "Drag to move to another day",
    "shrinkAria": "Shrink by one day",
    "extendAria": "Extend by one day",
    "removeAria": "Remove from plan",
    "addMealAria": "Add meal to {weekday} {day}",
    "addMeal": "Add meal"
  },
  "client": {
    "headingW": "W",
    "headingRest": "eekly Planner",
    "subtitle": "Plan your meals for the week",
    "shoppingActionsAria": "Shopping list actions",
    "generateShoppingList": "Generate shopping list",
    "done": "Done",
    "edit": "Edit",
    "actionsAria": "Planner actions",
    "emptyHeading": "Nothing planned for this week",
    "emptyBody": "Pick a recipe you like and add it to the plan from your cookbook.",
    "browseRecipes": "Browse recipes"
  },
  "desktopGrid": {
    "addMealAria": "Add meal to {weekday}"
  },
  "mobileAgenda": {
    "nothingPlanned": "Nothing planned",
    "dayBadge": "day {index}/{span}",
    "recipeFallback": "Recipe",
    "customFallback": "Custom"
  },
  "search": {
    "placeholder": "Search recipes…",
    "quickLabels": "Quick labels",
    "searching": "Searching…",
    "noResults": "No recipes found",
    "useAsCustom": "Use “{query}” as a custom meal"
  },
  "slotCard": {
    "recipeFallback": "Recipe",
    "portions": "({count} portions)",
    "dragAria": "Drag to move",
    "removeAria": "Remove from plan",
    "extendTitle": "Drag to extend or shrink across days",
    "removeConfirm": "Remove \"{title}\" from the plan?",
    "removeConfirmFallback": "this recipe",
    "removeConfirmLabel": "Remove"
  },
  "weekNav": {
    "prevAria": "Previous week",
    "nextAria": "Next week",
    "thisWeek": "This week",
    "nextWeek": "Next week"
  },
  "rules": {
    "heading": "Planning rules",
    "activeCount": "{count} active",
    "notEnforcedWarning": "These rules are saved but not yet enforced — AI-assisted planning is an upcoming feature.",
    "noneYet": "No rules for this week yet.",
    "disableTitle": "Disable rule",
    "enableTitle": "Enable rule",
    "placeholder": "e.g. No fish two days in a row",
    "add": "Add",
    "cancel": "Cancel",
    "addRuleFor": "Add rule for this week"
  }
}
```

`messages/sk/planner.json`:
```json
{
  "labels": {
    "removeConfirm": "Odstrániť „{label}“ z plánu?",
    "removeConfirmLabel": "Odstrániť",
    "removeAria": "Odstrániť",
    "dragAria": "Presunúť ťahaním",
    "custom": "Vlastné"
  },
  "editList": {
    "oneDay": "{weekday} {day} · 1 deň",
    "multiDay": "{startWeekday} {startDay} → {endWeekday} {endDay} · {days, plural, one {# deň} few {# dni} other {# dní}}",
    "recipeFallback": "Jedlo",
    "dragMoveAria": "Presunúť ťahaním na iný deň",
    "shrinkAria": "Skrátiť o jeden deň",
    "extendAria": "Predĺžiť o jeden deň",
    "removeAria": "Odstrániť z plánu",
    "addMealAria": "Pridať jedlo na {weekday} {day}",
    "addMeal": "Pridať jedlo"
  },
  "client": {
    "headingW": "T",
    "headingRest": "ýždenný plánovač",
    "subtitle": "Naplánujte si jedlá na tento týždeň",
    "shoppingActionsAria": "Akcie nákupného zoznamu",
    "generateShoppingList": "Vytvoriť nákupný zoznam",
    "done": "Hotovo",
    "edit": "Upraviť",
    "actionsAria": "Akcie plánovača",
    "emptyHeading": "Na tento týždeň nie je nič naplánované",
    "emptyBody": "Vyberte si obľúbený recept a pridajte ho do plánu zo svojej kuchárky.",
    "browseRecipes": "Prehliadať recepty"
  },
  "desktopGrid": {
    "addMealAria": "Pridať jedlo na {weekday}"
  },
  "mobileAgenda": {
    "nothingPlanned": "Nič naplánované",
    "dayBadge": "deň {index}/{span}",
    "recipeFallback": "Recept",
    "customFallback": "Vlastné"
  },
  "search": {
    "placeholder": "Hľadať recepty…",
    "quickLabels": "Rýchle štítky",
    "searching": "Vyhľadávam…",
    "noResults": "Nenašli sa žiadne recepty",
    "useAsCustom": "Použiť „{query}“ ako vlastné jedlo"
  },
  "slotCard": {
    "recipeFallback": "Recept",
    "portions": "({count} porcií)",
    "dragAria": "Presunúť ťahaním",
    "removeAria": "Odstrániť z plánu",
    "extendTitle": "Ťahaním predĺžite alebo skrátite naprieč dňami",
    "removeConfirm": "Odstrániť „{title}“ z plánu?",
    "removeConfirmFallback": "tento recept",
    "removeConfirmLabel": "Odstrániť"
  },
  "weekNav": {
    "prevAria": "Predchádzajúci týždeň",
    "nextAria": "Nasledujúci týždeň",
    "thisWeek": "Tento týždeň",
    "nextWeek": "Budúci týždeň"
  },
  "rules": {
    "heading": "Pravidlá plánovania",
    "activeCount": "{count} aktívnych",
    "notEnforcedWarning": "Tieto pravidlá sú uložené, ale zatiaľ sa nevynucujú — plánovanie s AI je pripravovaná funkcia.",
    "noneYet": "Na tento týždeň zatiaľ nie sú žiadne pravidlá.",
    "disableTitle": "Vypnúť pravidlo",
    "enableTitle": "Zapnúť pravidlo",
    "placeholder": "napr. Žiadne ryby dva dni po sebe",
    "add": "Pridať",
    "cancel": "Zrušiť",
    "addRuleFor": "Pridať pravidlo pre tento týždeň"
  }
}
```

Note: this also fixes the existing grammar typo "a upcoming feature" → "an upcoming feature" while translating.

- [ ] **Step 2: Migrate each component**

Add `useTranslations('planner')` to each file (all planner components are Client Components per their use of `useState`/dnd-kit) and replace literals per the table above:
- `CustomLabelCard.tsx`: the confirm message uses interpolation `t('labels.removeConfirm', { label })`; `confirmLabel={t('labels.removeConfirmLabel')}`. **Do not** touch the `LABEL_STYLES` keys (`'Leftovers'`, `'Eating out'`, etc.) in this task — those are data values from `CUSTOM_LABELS`/stored `custom_label` DB values, not UI copy; translating them requires a data-model decision that's explicitly out of scope (see spec §7, "Translating tags, user-entered recipe content, or household names" — the same reasoning applies to custom meal labels, which are user-entered free text).
- `MobileEditList.tsx`: `rangeLabel()` becomes `days === 1 ? t('editList.oneDay', {...}) : t('editList.multiDay', { ..., days })`; fallback title `slot.recipe?.title ?? slot.custom_label ?? t('editList.recipeFallback')`; the four `aria-label`s; `addMealAria` interpolated; `Add meal` → `t('editList.addMeal')`.
- `PlannerClient.tsx`: heading split, subtitle, both `Generate shopping list` occurrences, `Done`/`Edit` toggle, both `aria-label`s, empty-state heading/body/button.
- `PlannerDesktopGrid.tsx`: both `addMealAria` call sites, interpolated with `{ weekday }`.
- `PlannerMobileAgenda.tsx`: `Nothing planned`, `DayBadge` template (interpolated `{ index: dayIndex, span }`), recipe/custom fallbacks.
- `RecipeSearch.tsx`: placeholder, `Quick labels`, `Searching…`, `No recipes found`, and the interpolated `useAsCustom` (note the curly quotes are already baked into the message string, not added at the call site).
- `SlotCard.tsx`: recipe fallback, portions suffix (interpolated `{ count: savedPortions }`), the two `aria-label`s, the `title`/`aria-label` pair, the interpolated confirm message with its fallback title, `confirmLabel`.
- `WeekNav.tsx`: both nav `aria-label`s, `This week`/`Next week` badges.
- `WeekRulesPanel.tsx`: heading, interpolated active count, the (now-fixed) warning copy, empty state, per-rule enable/disable title, placeholder, `Add`/`Cancel` buttons, `Add rule for this week`. The `RULE_TYPES` select options (defined outside this file) are out of scope for this task — flag as a follow-up if `RULE_TYPES` labels need translation; since Task 12's spec doesn't cover data constants, leave as-is unless it visibly breaks the Slovak experience during Step 3 verification (in which case, add a small `planner.ruleTypes.*` key set and update `RULE_TYPES` consumers as an in-task fix, since the plan already touches this file).

- [ ] **Step 3: Manually verify**

Walk through the planner in both languages: week nav, adding/removing/resizing slots, the mobile agenda and edit-list views, and the rules panel.

- [ ] **Step 4: Commit**

```bash
git add messages/en/planner.json messages/sk/planner.json src/components/planner
git commit -m "feat(i18n): translate planner"
```

---

### Task 13: `shopping` namespace

**Files:**
- Modify: `messages/en/shopping.json`, `messages/sk/shopping.json`
- Modify: `src/components/shopping/GenerateShoppingPage.tsx`
- Modify: `src/components/shopping/ShoppingClient.tsx`
- Modify: `src/components/shopping/ShoppingItemRow.tsx`
- Modify: `src/components/shopping/ShoppingReviewClient.tsx`

- [ ] **Step 1: Populate the message files**

`messages/en/shopping.json`:
```json
{
  "generate": {
    "plannerLink": "Planner",
    "heading": "Generate shopping list",
    "emptyPlan": "No meals in this week's plan.",
    "backToPlanner": "Go back to the planner",
    "noServingsWarning": "No servings defined — using 1",
    "portions": "Portions",
    "genericError": "Something went wrong. Please try again.",
    "networkError": "Network error. Please try again.",
    "generating": "Generating…",
    "generate": "Generate shopping list"
  },
  "client": {
    "headingS": "S",
    "headingRest": "hopping List",
    "copied": "Copied!",
    "copy": "Copy",
    "copyListSuffix": " list",
    "clear": "Clear",
    "clearListSuffix": " list",
    "itemCount": "{count, plural, one {# item} other {# items}}",
    "empty": "Your shopping list is empty. Add items manually or generate from the planner.",
    "addItem": "Add item",
    "otherCategory": "Other",
    "clearConfirm": "Remove all items from the list?",
    "cancel": "Cancel",
    "clearConfirmLabel": "Clear",
    "copyAria": "Copy list",
    "copiedAria": "Copied!",
    "clearAria": "Clear list"
  },
  "itemRow": {
    "dragAria": "Drag to reorder",
    "cancelEditAria": "Cancel edit",
    "deleteTitle": "Delete",
    "unknownRecipe": "Unknown recipe",
    "saveFailed": "Failed to save",
    "retry": "Retry"
  },
  "review": {
    "plannerLink": "Planner",
    "emptyHeading": "Nothing to review.",
    "backToPlanner": "Go back to the planner",
    "emptyTrailing": "and generate a list.",
    "heading": "Review shopping list",
    "body": "Edit or cross off items, then add to your list.",
    "itemCount": "{count, plural, one {# item} other {# items}}",
    "otherCategory": "Other",
    "addToList": "{count, plural, one {Add # item to shopping list} other {Add # items to shopping list}}"
  }
}
```

`messages/sk/shopping.json`:
```json
{
  "generate": {
    "plannerLink": "Plánovač",
    "heading": "Vytvoriť nákupný zoznam",
    "emptyPlan": "V pláne na tento týždeň nie sú žiadne jedlá.",
    "backToPlanner": "Späť na plánovač",
    "noServingsWarning": "Počet porcií nie je určený — používa sa 1",
    "portions": "Porcie",
    "genericError": "Niečo sa pokazilo. Skúste to znova.",
    "networkError": "Chyba siete. Skúste to znova.",
    "generating": "Vytváram…",
    "generate": "Vytvoriť nákupný zoznam"
  },
  "client": {
    "headingS": "N",
    "headingRest": "ákupný zoznam",
    "copied": "Skopírované!",
    "copy": "Kopírovať",
    "copyListSuffix": " zoznam",
    "clear": "Vymazať",
    "clearListSuffix": " zoznam",
    "itemCount": "{count, plural, one {# položka} few {# položky} other {# položiek}}",
    "empty": "Váš nákupný zoznam je prázdny. Pridajte položky ručne alebo ho vytvorte z plánovača.",
    "addItem": "Pridať položku",
    "otherCategory": "Ostatné",
    "clearConfirm": "Odstrániť všetky položky zo zoznamu?",
    "cancel": "Zrušiť",
    "clearConfirmLabel": "Vymazať",
    "copyAria": "Kopírovať zoznam",
    "copiedAria": "Skopírované!",
    "clearAria": "Vymazať zoznam"
  },
  "itemRow": {
    "dragAria": "Presunúť ťahaním",
    "cancelEditAria": "Zrušiť úpravu",
    "deleteTitle": "Odstrániť",
    "unknownRecipe": "Neznámy recept",
    "saveFailed": "Uloženie zlyhalo",
    "retry": "Skúsiť znova"
  },
  "review": {
    "plannerLink": "Plánovač",
    "emptyHeading": "Nie je čo skontrolovať.",
    "backToPlanner": "Späť na plánovač",
    "emptyTrailing": "a vytvorte zoznam.",
    "heading": "Skontrolovať nákupný zoznam",
    "body": "Upravte alebo odškrtnite položky a potom ich pridajte do zoznamu.",
    "itemCount": "{count, plural, one {# položka} few {# položky} other {# položiek}}",
    "otherCategory": "Ostatné",
    "addToList": "{count, plural, one {Pridať # položku do zoznamu} few {Pridať # položky do zoznamu} other {Pridať # položiek do zoznamu}}"
  }
}
```

- [ ] **Step 2: Migrate each component**

Add `useTranslations('shopping')` to each (all Client Components):
- `GenerateShoppingPage.tsx` → `generate.*`
- `ShoppingClient.tsx` → `client.*` — the `itemCount` replaces `` `${visibleItems.length} item${visibleItems.length !== 1 ? 's' : ''}` `` with `t('client.itemCount', { count: visibleItems.length })`
- `ShoppingItemRow.tsx` → `itemRow.*`
- `ShoppingReviewClient.tsx` → `review.*` — both the item-count and add-to-list buttons use `t(..., { count: uncheckedItems.length })`

- [ ] **Step 3: Manually verify**

Generate a shopping list from the planner, review it, add/edit/delete/reorder items, copy and clear the list — in both languages, checking singular vs. plural counts (e.g. exactly 1 item vs. several).

- [ ] **Step 4: Commit**

```bash
git add messages/en/shopping.json messages/sk/shopping.json src/components/shopping
git commit -m "feat(i18n): translate shopping list and review flows"
```

---

### Task 14: `settings` namespace — remaining components

**Files:**
- Modify: `messages/en/settings.json`, `messages/sk/settings.json` (extend — already has `account.*` from Task 5)
- Modify: `src/components/settings/BulkTransformModal.tsx`
- Modify: `src/components/settings/ConfirmTransformModal.tsx`
- Modify: `src/components/settings/GroupModal.tsx`
- Modify: `src/components/settings/InviteLink.tsx`
- Modify: `src/components/settings/PlannerRulesEditor.tsx`
- Modify: `src/components/settings/ShoppingCategoriesEditor.tsx`
- Modify: `src/components/settings/ShoppingRulesEditor.tsx`
- Modify: `src/components/settings/TagEditModal.tsx`
- Modify: `src/components/settings/TagOrganizer.tsx`
- Modify: `src/components/settings/TranslationSettings.tsx`
- Modify: `src/components/settings/UnitPreferenceSelector.tsx`
- Modify: `src/app/(app)/settings/page.tsx` (remaining Household/Tags/Shopping/Members section copy)

**Do not modify** `src/components/settings/LanguageSelector.tsx` — see the "Deviation from spec" note at the top of this plan; it's unused dead code.

- [ ] **Step 1: Extend the message files**

Add to `messages/en/settings.json` (alongside the existing `account` key from Task 5):
```json
{
  "bulkTransform": {
    "translateAndConvert": "Translating and converting",
    "translate": "Translating",
    "convertUnits": "Converting units",
    "done": "Done",
    "closeAria": "Close",
    "progress": "{label} recipes…",
    "completedUpdated": "{count} updated.",
    "completedWithFailures": "{count} updated, {failed} failed."
  },
  "confirmTransform": {
    "message": "{count, plural, one {# recipe will be updated.} other {# recipes will be updated.}} This may take a moment.",
    "notNow": "Not now"
  },
  "groupModal": {
    "nameLabel": "Group name",
    "namePlaceholder": "e.g. Course",
    "emptyNameError": "Name cannot be empty.",
    "saveError": "Couldn't save. Try again.",
    "deleteError": "Couldn't delete. Try again.",
    "deleteTitle": "Delete group",
    "cancel": "Cancel",
    "create": "Create",
    "save": "Save",
    "deleteConfirm": "Delete the group \"{name}\"? Its tags stay on your recipes and simply become uncategorized.",
    "deleteConfirmLabel": "Delete"
  },
  "inviteLink": {
    "copied": "Copied",
    "copy": "Copy"
  },
  "plannerRules": {
    "disableTitle": "Disable rule",
    "enableTitle": "Enable rule",
    "notice": "Adding rules will be available once AI planning ships."
  },
  "shoppingCategories": {
    "empty": "No categories defined. AI will generate them automatically when you first use \"Make smarter\".",
    "dragAria": "Drag to reorder",
    "changeColorTitle": "Change color",
    "removeColorTitle": "Remove color",
    "renameTitle": "Rename",
    "deleteTitle": "Delete",
    "namePlaceholder": "Category name",
    "add": "Add",
    "addCategory": "Add category",
    "deleteConfirm": "Delete category \"{name}\"? Items with this category will remain but become uncategorized.",
    "deleteConfirmLabel": "Delete"
  },
  "shoppingRules": {
    "removeAria": "Remove rule",
    "placeholder": "e.g. Do not include water",
    "add": "Add rule"
  },
  "tagEditModal": {
    "nameLabel": "Name",
    "colorLabel": "Color",
    "emptyNameError": "Name cannot be empty.",
    "saveError": "Couldn't save. Try again.",
    "deleteError": "Couldn't delete. Try again.",
    "noColorTitle": "No color",
    "deleteTitle": "Delete tag",
    "cancel": "Cancel",
    "save": "Save",
    "removeFromRecipesConfirm": "Remove tag \"{name}\" from all recipes? This cannot be undone.",
    "deleteUnusedConfirm": "Delete unused tag \"{name}\"?",
    "deleteConfirmLabel": "Delete"
  },
  "tagOrganizer": {
    "noTags": "No tags yet. Add some to your recipes.",
    "dragGroupAria": "Drag to reorder {groupName}",
    "uncategorized": "Uncategorized",
    "newGroup": "New group",
    "reorderFailed": "Couldn't reorder groups. Reverted.",
    "moveFailed": "Couldn't move \"{tagName}\". Reverted."
  },
  "translation": {
    "toggleLabel": "Translate imported recipes",
    "confirmMessage": "Translate your recipes to {language}?",
    "confirmLabel": "Translate all"
  },
  "units": {
    "metric": "metric",
    "imperial": "imperial",
    "confirmMessage": "Convert your recipes to {units} units?",
    "confirmLabel": "Convert all"
  },
  "page": {
    "headingS": "S",
    "headingRest": "ettings",
    "household": "Household",
    "name": "Name",
    "translationHelp": "When enabled, recipes are translated to your chosen language on import. Existing recipes can be updated via bulk translate.",
    "unitsLabel": "Preferred units",
    "unitsHelp": "Applied when importing new recipes.",
    "inviteLinkLabel": "Invite link",
    "inviteLinkHelp": "Share this link with anyone you want to join this household.",
    "tags": "Tags",
    "tagsHelp": "Assign colors, rename, or remove tags. Renaming or deleting updates all recipes.",
    "shoppingCategories": "Shopping categories",
    "shoppingCategoriesHelp": "Categories group items on your shopping list. Order them to match your supermarket layout. If none are defined, the AI will generate them automatically.",
    "shoppingRules": "Shopping rules",
    "shoppingRulesHelp": "These rules are passed to the AI when generating a shopping list. Use them to exclude ingredients or adjust how items are merged.",
    "plannerRules": "Planner rules",
    "plannerRulesHelp": "Planner rules will guide the AI when it generates weekly plans — coming soon.",
    "members": "Members ({count})",
    "memberFallbackAlt": "Member",
    "memberFallbackName": "Unknown",
    "you": "you",
    "signOut": "Sign out"
  }
}
```

Add the matching Slovak block to `messages/sk/settings.json`:
```json
{
  "bulkTransform": {
    "translateAndConvert": "Prekladám a prevádzam",
    "translate": "Prekladám",
    "convertUnits": "Prevádzam jednotky",
    "done": "Hotovo",
    "closeAria": "Zavrieť",
    "progress": "{label} recepty…",
    "completedUpdated": "Aktualizovaných: {count}.",
    "completedWithFailures": "Aktualizovaných: {count}, zlyhalo: {failed}."
  },
  "confirmTransform": {
    "message": "{count, plural, one {Aktualizuje sa # recept.} few {Aktualizujú sa # recepty.} other {Aktualizuje sa # receptov.}} Môže to chvíľu trvať.",
    "notNow": "Teraz nie"
  },
  "groupModal": {
    "nameLabel": "Názov skupiny",
    "namePlaceholder": "napr. Chod",
    "emptyNameError": "Názov nesmie byť prázdny.",
    "saveError": "Uloženie zlyhalo. Skúste to znova.",
    "deleteError": "Odstránenie zlyhalo. Skúste to znova.",
    "deleteTitle": "Odstrániť skupinu",
    "cancel": "Zrušiť",
    "create": "Vytvoriť",
    "save": "Uložiť",
    "deleteConfirm": "Odstrániť skupinu „{name}“? Štítky zostanú na receptoch a stanú sa nezaradenými.",
    "deleteConfirmLabel": "Odstrániť"
  },
  "inviteLink": {
    "copied": "Skopírované",
    "copy": "Kopírovať"
  },
  "plannerRules": {
    "disableTitle": "Vypnúť pravidlo",
    "enableTitle": "Zapnúť pravidlo",
    "notice": "Pridávanie pravidiel bude dostupné po spustení plánovania s AI."
  },
  "shoppingCategories": {
    "empty": "Nie sú definované žiadne kategórie. AI ich vygeneruje automaticky pri prvom použití funkcie „Zjednodušiť“.",
    "dragAria": "Presunúť ťahaním",
    "changeColorTitle": "Zmeniť farbu",
    "removeColorTitle": "Odstrániť farbu",
    "renameTitle": "Premenovať",
    "deleteTitle": "Odstrániť",
    "namePlaceholder": "Názov kategórie",
    "add": "Pridať",
    "addCategory": "Pridať kategóriu",
    "deleteConfirm": "Odstrániť kategóriu „{name}“? Položky s touto kategóriou zostanú, ale stanú sa nezaradenými.",
    "deleteConfirmLabel": "Odstrániť"
  },
  "shoppingRules": {
    "removeAria": "Odstrániť pravidlo",
    "placeholder": "napr. Nezahŕňať vodu",
    "add": "Pridať pravidlo"
  },
  "tagEditModal": {
    "nameLabel": "Názov",
    "colorLabel": "Farba",
    "emptyNameError": "Názov nesmie byť prázdny.",
    "saveError": "Uloženie zlyhalo. Skúste to znova.",
    "deleteError": "Odstránenie zlyhalo. Skúste to znova.",
    "noColorTitle": "Bez farby",
    "deleteTitle": "Odstrániť štítok",
    "cancel": "Zrušiť",
    "save": "Uložiť",
    "removeFromRecipesConfirm": "Odstrániť štítok „{name}“ zo všetkých receptov? Túto akciu nemožno vrátiť späť.",
    "deleteUnusedConfirm": "Odstrániť nepoužívaný štítok „{name}“?",
    "deleteConfirmLabel": "Odstrániť"
  },
  "tagOrganizer": {
    "noTags": "Zatiaľ žiadne štítky. Pridajte nejaké k svojim receptom.",
    "dragGroupAria": "Presunúť ťahaním {groupName}",
    "uncategorized": "Nezaradené",
    "newGroup": "Nová skupina",
    "reorderFailed": "Zmenu poradia skupín sa nepodarilo uložiť. Vrátené späť.",
    "moveFailed": "Presun „{tagName}“ zlyhal. Vrátené späť."
  },
  "translation": {
    "toggleLabel": "Prekladať importované recepty",
    "confirmMessage": "Preložiť vaše recepty do jazyka {language}?",
    "confirmLabel": "Preložiť všetko"
  },
  "units": {
    "metric": "metrické",
    "imperial": "imperiálne",
    "confirmMessage": "Previesť vaše recepty na jednotky {units}?",
    "confirmLabel": "Previesť všetko"
  },
  "page": {
    "headingS": "N",
    "headingRest": "astavenia",
    "household": "Domácnosť",
    "name": "Názov",
    "translationHelp": "Ak je zapnuté, recepty sa pri importe preložia do zvoleného jazyka. Existujúce recepty možno aktualizovať hromadným prekladom.",
    "unitsLabel": "Preferované jednotky",
    "unitsHelp": "Použije sa pri importe nových receptov.",
    "inviteLinkLabel": "Pozývací odkaz",
    "inviteLinkHelp": "Zdieľajte tento odkaz s kýmkoľvek, koho chcete pozvať do tejto domácnosti.",
    "tags": "Štítky",
    "tagsHelp": "Priraďte farby, premenujte alebo odstráňte štítky. Premenovanie alebo odstránenie sa prejaví na všetkých receptoch.",
    "shoppingCategories": "Nákupné kategórie",
    "shoppingCategoriesHelp": "Kategórie zoskupujú položky v nákupnom zozname. Usporiadajte ich podľa rozloženia vášho obchodu. Ak žiadne nie sú definované, AI ich vygeneruje automaticky.",
    "shoppingRules": "Nákupné pravidlá",
    "shoppingRulesHelp": "Tieto pravidlá sa odovzdávajú AI pri vytváraní nákupného zoznamu. Použite ich na vylúčenie surovín alebo úpravu zlučovania položiek.",
    "plannerRules": "Pravidlá plánovania",
    "plannerRulesHelp": "Pravidlá plánovania budú AI usmerňovať pri generovaní týždenných plánov — už čoskoro.",
    "members": "Členovia ({count})",
    "memberFallbackAlt": "Člen",
    "memberFallbackName": "Neznámy",
    "you": "vy",
    "signOut": "Odhlásiť sa"
  }
}
```

- [ ] **Step 2: Migrate each component**

Add `useTranslations('settings')` to each (all Client Components except `settings/page.tsx`, which is already a Server Component using `getTranslations` from Task 5) and replace literals per the key tables above. Interpolated calls of note:
- `BulkTransformModal.tsx`: `t('bulkTransform.progress', { label: t(`bulkTransform.${labelKey}`) })` — pick the right `labelKey` (`translateAndConvert`/`translate`/`convertUnits`) based on existing logic; completion text uses `t('bulkTransform.completedUpdated', { count })` or `t('bulkTransform.completedWithFailures', { count, failed })`.
- `ConfirmTransformModal.tsx`: `t('confirmTransform.message', { count: recipeCount })`.
- `GroupModal.tsx`, `TagEditModal.tsx`, `ShoppingCategoriesEditor.tsx`: interpolate `{ name }` into the delete-confirm messages.
- `TagOrganizer.tsx`: interpolate `{ groupName }` and `{ tagName }`.
- `TranslationSettings.tsx`: interpolate `{ language: targetLangLabel }`.
- `UnitPreferenceSelector.tsx`: the `'metric'`/`'imperial'` option labels become `t('units.metric')`/`t('units.imperial')` (note: these were previously used as raw data values for the `capitalize` CSS class display — confirm the underlying stored value stays `'metric'`/`'imperial'` in English; only the *displayed* label is translated); interpolate `{ units: pendingUnits }` in the confirm message — but note `pendingUnits` itself must map through `t('units.metric')`/`t('units.imperial')` before interpolating, not the raw English database value.

- [ ] **Step 3: Migrate `settings/page.tsx`**

Using the `t` already established in Task 5, add the remaining `page.*` keys to the Household heading/labels/helper text, Tags/Shopping-categories/Shopping-rules/Planner-rules section headings and helper text, the interpolated `Members ({count})` heading, member fallback alt/name, the `you` badge, and the `Sign out` button.

- [ ] **Step 4: Manually verify**

Walk every settings section in both languages: household name/translation/units/invite link, tags (add/edit/delete/group/reorder), shopping categories and rules, planner rules notice, members list, sign out.

- [ ] **Step 5: Commit**

```bash
git add messages/en/settings.json messages/sk/settings.json src/components/settings src/app/\(app\)/settings/page.tsx
git commit -m "feat(i18n): translate remaining settings components"
```

---

### Task 15: `auth` namespace (login, onboarding, join, join-invalid)

**Files:**
- Modify: `messages/en/auth.json`, `messages/sk/auth.json`
- Modify: `src/app/(auth)/login/page.tsx`
- Modify: `src/app/onboarding/page.tsx`
- Modify: `src/app/join/[token]/page.tsx`
- Modify: `src/app/join-invalid/page.tsx`

- [ ] **Step 1: Populate the message files**

`messages/en/auth.json`:
```json
{
  "login": {
    "heading": "dapcook",
    "subtitle": "Your shared cookbook & meal planner",
    "signInGoogle": "Sign in with Google"
  },
  "onboarding": {
    "heading": "Welcome to dapcook",
    "subtitle": "Set up your household to get started",
    "createHeading": "Create household",
    "createHelp": "Start fresh and invite others later",
    "householdNameLabel": "Household name",
    "householdNamePlaceholder": "e.g. Peter & Kim",
    "createButton": "Create household",
    "joinHeading": "Join household",
    "joinHelp": "Enter the invite code from someone in the household",
    "inviteCodeLabel": "Invite code",
    "inviteCodePlaceholder": "32-character code",
    "joinButton": "Join household"
  },
  "join": {
    "heading": "Join dapcook",
    "invitedBy": "You've been invited to join",
    "memberFallbackAlt": "Member",
    "noHouseholdBody": "You've been invited to a household. Sign in with Google to accept.",
    "signInAccept": "Sign in with Google to accept",
    "expiredError": "This invite link is invalid or has expired."
  },
  "joinInvalid": {
    "heading": "Invalid invite link",
    "body": "This invite link is invalid or has already been used.",
    "backToOnboarding": "Back to onboarding"
  }
}
```

`messages/sk/auth.json`:
```json
{
  "login": {
    "heading": "dapcook",
    "subtitle": "Vaša spoločná kuchárka a plánovač jedál",
    "signInGoogle": "Prihlásiť sa cez Google"
  },
  "onboarding": {
    "heading": "Vitajte v dapcook",
    "subtitle": "Nastavte si domácnosť a začnite",
    "createHeading": "Vytvoriť domácnosť",
    "createHelp": "Začnite odznova a ostatných pozvite neskôr",
    "householdNameLabel": "Názov domácnosti",
    "householdNamePlaceholder": "napr. Peter a Kika",
    "createButton": "Vytvoriť domácnosť",
    "joinHeading": "Pripojiť sa k domácnosti",
    "joinHelp": "Zadajte pozývací kód od niekoho z domácnosti",
    "inviteCodeLabel": "Pozývací kód",
    "inviteCodePlaceholder": "32-znakový kód",
    "joinButton": "Pripojiť sa k domácnosti"
  },
  "join": {
    "heading": "Pripojiť sa k dapcook",
    "invitedBy": "Boli ste pozvaní pripojiť sa k",
    "memberFallbackAlt": "Člen",
    "noHouseholdBody": "Boli ste pozvaní do domácnosti. Prihláste sa cez Google, aby ste pozvanie prijali.",
    "signInAccept": "Prihlásiť sa cez Google a prijať pozvanie",
    "expiredError": "Tento pozývací odkaz je neplatný alebo mu vypršala platnosť."
  },
  "joinInvalid": {
    "heading": "Neplatný pozývací odkaz",
    "body": "Tento pozývací odkaz je neplatný alebo už bol použitý.",
    "backToOnboarding": "Späť na úvodné nastavenie"
  }
}
```

- [ ] **Step 2: Migrate each page**

These pages run **before** a `profiles` row necessarily has a meaningful `ui_language` (pre-onboarding, or the invitee isn't the current profile's owner) — read each file to confirm whether it already has access to a resolved user/profile. Where no profile exists yet (e.g. `login/page.tsx`, `join-invalid/page.tsx`), resolve locale via `getLocale()` from `next-intl/server`, which falls back to `defaultLocale` (`'en'`) when no provider wraps the route — these pages are outside the `(app)` layout's `NextIntlClientProvider`, so add a lightweight per-page `getTranslations({ locale: 'en', namespace: 'auth' })` call **unless** the page already has the user's profile loaded (e.g. `onboarding/page.tsx` and `join/[token]/page.tsx` may already fetch the profile — check each file and use its `ui_language` if present instead of hardcoding `'en'`).

- Add `getTranslations('auth.login')`/etc. to each file (all four are Server Components based on the earlier inventory — no `'use client'` noted) and replace literals per the key tables.
- `join/[token]/page.tsx`: interpolate the member fallback alt text; the `You've been invited to join` / `You've been invited to a household...` sentences render as-is (no interpolation needed unless the inviting household's name is inserted — check the current JSX to confirm before replacing verbatim).

- [ ] **Step 3: Manually verify**

Since these are pre-authentication pages without an interface-language setting yet, verify they render correctly in English (the only reachable default) — Slovak rendering here can only be spot-checked by temporarily forcing the locale in `getTranslations` during a local test, since there's no UI to switch language before login.

- [ ] **Step 4: Commit**

```bash
git add messages/en/auth.json messages/sk/auth.json src/app/\(auth\)/login/page.tsx src/app/onboarding/page.tsx src/app/join src/app/join-invalid
git commit -m "feat(i18n): translate auth, onboarding, and invite pages"
```

---

### Task 16: `admin` namespace

**Files:**
- Modify: `messages/en/admin.json`, `messages/sk/admin.json`
- Modify: `src/app/(app)/admin/page.tsx`

- [ ] **Step 1: Populate the message files**

`messages/en/admin.json`:
```json
{
  "heading": "Admin — Households",
  "table": {
    "household": "Household",
    "members": "Members",
    "recipes": "Recipes",
    "lastSignIn": "Last sign-in",
    "aiTokens": "AI tokens",
    "estCost": "Est. cost"
  },
  "empty": "No households yet."
}
```

`messages/sk/admin.json`:
```json
{
  "heading": "Administrácia — Domácnosti",
  "table": {
    "household": "Domácnosť",
    "members": "Členovia",
    "recipes": "Recepty",
    "lastSignIn": "Posledné prihlásenie",
    "aiTokens": "AI tokeny",
    "estCost": "Odhad. náklady"
  },
  "empty": "Zatiaľ žiadne domácnosti."
}
```

- [ ] **Step 2: Migrate the page**

`admin/page.tsx` is a Server Component (already established in Task 7 for `formatRelativeTime`/`formatDuration`). Add `getTranslations('admin')` and replace the heading, six table headers, and the empty-state cell.

- [ ] **Step 3: Manually verify**

As an admin user, view `/admin` in both languages.

- [ ] **Step 4: Commit**

```bash
git add messages/en/admin.json messages/sk/admin.json src/app/\(app\)/admin/page.tsx
git commit -m "feat(i18n): translate admin page"
```

---

### Task 17: Translate API-originated error strings

**Files:**
- Modify: `messages/en/errors.json`, `messages/sk/errors.json`
- Modify: `src/app/api/recipes/route.ts`
- Modify: `src/app/api/recipes/[id]/route.ts`
- Modify: `src/app/api/recipes/import/route.ts`
- Modify: `src/app/api/recipes/translate-draft/route.ts`
- Modify: `src/lib/scraper/scrape-error.ts`
- Modify: `src/lib/auth/actions.ts`

These are the API/server-side strings identified as rendering directly into already-migrated components (`RecipeForm.tsx` in Task 10, `recipes/import/page.tsx` in Task 11, `onboarding/page.tsx` in Task 15).

- [ ] **Step 1: Populate the message file**

`messages/en/errors.json`:
```json
{
  "unauthorized": "Unauthorized",
  "noHousehold": "No household",
  "titleRequired": "Title is required",
  "notFound": "Not found",
  "urlRequired": "URL is required",
  "invalidUrl": "Invalid URL",
  "contentRequired": "content is required",
  "scrapeBlocked": "This site is blocking automated imports. Try adding the recipe manually instead.",
  "scrapeNotFound": "That page couldn't be found. Double-check the URL.",
  "scrapeTimeout": "That page took too long to respond. Try again, or add the recipe manually.",
  "scrapeUnreachable": "Couldn't reach that page. Check the URL, or add the recipe manually.",
  "scrapeGeneric": "Could not import this recipe automatically. Try adding it manually instead.",
  "createHouseholdFailed": "Could not create household. Please try again.",
  "joinHouseholdFailed": "Could not join household. Check the invite code and try again."
}
```

`messages/sk/errors.json`:
```json
{
  "unauthorized": "Neautorizovaný prístup",
  "noHousehold": "Žiadna domácnosť",
  "titleRequired": "Názov je povinný",
  "notFound": "Nenájdené",
  "urlRequired": "URL je povinná",
  "invalidUrl": "Neplatná URL",
  "contentRequired": "Obsah je povinný",
  "scrapeBlocked": "Táto stránka blokuje automatický import. Skúste recept pridať ručne.",
  "scrapeNotFound": "Túto stránku sa nepodarilo nájsť. Skontrolujte URL.",
  "scrapeTimeout": "Stránka odpovedala príliš dlho. Skúste to znova, alebo recept pridajte ručne.",
  "scrapeUnreachable": "Stránku sa nepodarilo načítať. Skontrolujte URL, alebo recept pridajte ručne.",
  "scrapeGeneric": "Recept sa nepodarilo automaticky importovať. Skúste ho pridať ručne.",
  "createHouseholdFailed": "Domácnosť sa nepodarilo vytvoriť. Skúste to znova.",
  "joinHouseholdFailed": "Nepodarilo sa pripojiť k domácnosti. Skontrolujte pozývací kód a skúste to znova."
}
```

Note on the existing `TRANSLATION_ERROR_TITLES`/`categorizeTranslationError()` strings (rate limit / unavailable / timed out / failed): these belong to the separate recipe-translation pipeline under `src/lib/ai/**`, explicitly out of scope per the spec. Do **not** duplicate them here — they were already keyed under `recipes.import.*` in Task 11 for the *titles*; their message bodies (from `translation-error.ts`) are left as English server strings for now, matching the spec's "AI-generated content translation is out of scope" boundary. Flag this as a known gap in the final verification pass (Task 18) rather than silently fixing it — it's a deliberate scope boundary, not an oversight.

- [ ] **Step 2: Resolve locale in each route handler**

Each of these route handlers already authenticates the user via `supabase.auth.getUser()`. Add, immediately after that call, a fetch of the user's `ui_language` and a `getTranslations` call:
```ts
const { data: profile } = await supabase.from('profiles').select('ui_language').eq('id', user.id).single()
const locale = isLocale(profile?.ui_language) ? profile.ui_language : defaultLocale
const t = await getTranslations({ locale, namespace: 'errors' })
```
(import `getTranslations` from `'next-intl/server'`, and `isLocale`/`defaultLocale` from `'@/i18n/config'`). Replace each hardcoded error string with the matching `t('key')` call:
- `recipes/route.ts`: `'Unauthorized'` → `t('unauthorized')`, `'No household'` → `t('noHousehold')`, `'Title is required'` → `t('titleRequired')`
- `recipes/[id]/route.ts`: `'Unauthorized'` → `t('unauthorized')`, `'Not found'` → `t('notFound')`
- `recipes/import/route.ts`: `'Unauthorized'` → `t('unauthorized')`, `'URL is required'` → `t('urlRequired')`, `'Invalid URL'` → `t('invalidUrl')`
- `recipes/translate-draft/route.ts`: `'Unauthorized'` → `t('unauthorized')`, `'No household'` → `t('noHousehold')`, `'content is required'` → `t('contentRequired')`

- [ ] **Step 3: Migrate `scrape-error.ts`**

`categorizeScrapeError()` returns `{ message, ... }` objects built from hardcoded strings. Since this function doesn't have direct access to the request's Supabase client, change its signature to accept a `t` function (already-resolved translations) as a parameter, e.g. `categorizeScrapeError(err: unknown, t: (key: string) => string)`, and have its single caller (`recipes/import/route.ts`, which already resolves `t` in Step 2) pass its `errors`-namespace `t` through. Replace each of the five hardcoded messages with the matching key from the table above.

- [ ] **Step 4: Migrate `src/lib/auth/actions.ts`**

Read the file to find the exact error strings returned by the household create/join server actions (referenced by `onboarding/page.tsx` as `createError`/`joinError` but not fully inventoried above). Resolve locale the same way as Step 2 (these are server actions with their own Supabase client + authenticated user), and replace the literal error strings with `t('createHouseholdFailed')`/`t('joinHouseholdFailed')` (or add more specific keys to `errors.json` if the actual file has more distinct error cases than these two placeholders assume — read the real file first).

- [ ] **Step 5: Run full test suite and type-check**

Run: `npm run type-check && npx vitest run`
Expected: PASS

- [ ] **Step 6: Manually verify**

Trigger each error path (e.g. import an invalid URL, submit a recipe with no title) in both languages and confirm the displayed message is translated.

- [ ] **Step 7: Commit**

```bash
git add messages/en/errors.json messages/sk/errors.json src/app/api/recipes src/lib/scraper/scrape-error.ts src/lib/auth/actions.ts
git commit -m "feat(i18n): translate API and server-action error messages"
```

---

### Task 18: Final full-app verification and push

**Files:** none (verification only)

- [ ] **Step 1: Run the full automated test suite**

Run: `npm run type-check && npm run lint && npx vitest run`
Expected: all PASS

- [ ] **Step 2: Run a production build**

Run: `npm run build`
Expected: succeeds with no missing-message warnings in the build output (next-intl logs a warning for any message file that fails to parse or any namespace that's imported but missing).

- [ ] **Step 3: Manual sweep in English**

Using `npm run dev`, click through every top-level surface as a baseline: Recipes (list/search/filter/detail/edit/new/import), Planner (desktop grid, mobile agenda, mobile edit list, rules), Shopping (generate/review/list), Settings (all sections), onboarding/login/join flows, Admin. Confirm nothing regressed from before the migration.

- [ ] **Step 4: Switch to Slovak via the Interface language setting and repeat the sweep**

Repeat Step 3 entirely in Slovak. Watch specifically for:
- Any raw translation key printed as literal text (e.g. `recipes.list.heading`) — means a missing/mistyped key
- Any leftover English string — means a missed literal
- Broken pluralization (check counts of exactly 1 vs. 2 vs. 5 for shopping items, recipe counts, day spans)
- Broken interpolation (e.g. `{name}` printed literally instead of substituted)
- Date/duration formatting rendering in Slovak conventions (planner week nav, recipe prep/cook times, admin last-sign-in)

- [ ] **Step 5: Push to trigger the Vercel preview deployment**

Per this repo's [CLAUDE.md](../../../CLAUDE.md) ("Vercel is the testing ground"), push the branch:
```bash
git push
```

- [ ] **Step 6: Repeat the Slovak sweep on the Vercel preview URL**

Confirms the migration works under production build conditions (message files are statically imported per-locale, so a build-time issue could differ from `next dev`).

- [ ] **Step 7: Final commit if any fixes were needed**

If Steps 3-6 surfaced any missed strings or bugs, fix them, re-run Step 1, and commit:
```bash
git add -A
git commit -m "fix: address issues found in i18n verification sweep"
git push
```
