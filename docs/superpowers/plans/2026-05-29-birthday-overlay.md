# Birthday Overlay Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show a confetti + message overlay to a specific user (configured via env vars) when they open the app within ±5 days of their birthday — once per year, tracked in localStorage.

**Architecture:** A pure utility function (`getBirthdayWindowISO`) handles the date math and is fully unit-tested. A client component (`BirthdayOverlay`) checks localStorage on mount and fires confetti + renders the overlay if eligible. The server layout (`AppLayout`) does the email match server-side, passing `birthdayConfig` props only when the logged-in user is the birthday user — so the client component never needs to see the raw env var values.

**Tech Stack:** Next.js 14 App Router, React 18, TypeScript, Tailwind CSS, `canvas-confetti`

---

### Task 1: Install canvas-confetti

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install the package**

```bash
npm install canvas-confetti
npm install --save-dev @types/canvas-confetti
```

- [ ] **Step 2: Verify installation**

```bash
grep -E "canvas-confetti" package.json
```

Expected output contains both `"canvas-confetti"` in `dependencies` and `"@types/canvas-confetti"` in `devDependencies`.

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add canvas-confetti dependency"
```

---

### Task 2: Birthday window utility + tests

**Files:**
- Create: `src/lib/utils/birthday.ts`
- Create: `src/lib/utils/birthday.test.ts`

- [ ] **Step 1: Write failing tests**

Create `src/lib/utils/birthday.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { getBirthdayWindowISO } from './birthday'

function daysFromToday(today: Date, offset: number): Date {
  const d = new Date(today)
  d.setDate(d.getDate() + offset)
  return d
}

describe('getBirthdayWindowISO', () => {
  const TODAY = new Date('2026-05-29')

  it('returns the ISO date when birthday is today', () => {
    expect(getBirthdayWindowISO('05-29', TODAY)).toBe('2026-05-29')
  })

  it('returns the ISO date when birthday was 5 days ago', () => {
    expect(getBirthdayWindowISO('05-24', TODAY)).toBe('2026-05-24')
  })

  it('returns null when birthday was 6 days ago', () => {
    expect(getBirthdayWindowISO('05-23', TODAY)).toBeNull()
  })

  it('returns the ISO date when birthday is in 5 days', () => {
    expect(getBirthdayWindowISO('06-03', TODAY)).toBe('2026-06-03')
  })

  it('returns null when birthday is in 6 days', () => {
    expect(getBirthdayWindowISO('06-04', TODAY)).toBeNull()
  })

  it('handles year boundary: birthday Jan 2, today Dec 29 → next year', () => {
    const dec29 = new Date('2025-12-29')
    expect(getBirthdayWindowISO('01-02', dec29)).toBe('2026-01-02')
  })

  it('handles year boundary: birthday Dec 30, today Jan 2 → prev year', () => {
    const jan2 = new Date('2026-01-02')
    expect(getBirthdayWindowISO('12-30', jan2)).toBe('2025-12-30')
  })

  it('returns null when no year candidate is within 5 days', () => {
    expect(getBirthdayWindowISO('12-01', TODAY)).toBeNull()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run src/lib/utils/birthday.test.ts
```

Expected: FAIL — `Cannot find module './birthday'`

- [ ] **Step 3: Implement the utility**

Create `src/lib/utils/birthday.ts`:

```typescript
const WINDOW_MS = 5 * 24 * 60 * 60 * 1000

export function getBirthdayWindowISO(birthdayMMDD: string, today: Date = new Date()): string | null {
  const [month, day] = birthdayMMDD.split('-').map(Number)
  const year = today.getFullYear()

  const candidates = [
    new Date(year - 1, month - 1, day),
    new Date(year, month - 1, day),
    new Date(year + 1, month - 1, day),
  ]

  for (const candidate of candidates) {
    if (Math.abs(candidate.getTime() - today.getTime()) <= WINDOW_MS) {
      return candidate.toISOString().slice(0, 10)
    }
  }

  return null
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run src/lib/utils/birthday.test.ts
```

Expected: 8 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/utils/birthday.ts src/lib/utils/birthday.test.ts
git commit -m "feat(birthday): add getBirthdayWindowISO utility"
```

---

### Task 3: BirthdayOverlay component

**Files:**
- Create: `src/components/ui/BirthdayOverlay.tsx`

- [ ] **Step 1: Create the component**

Create `src/components/ui/BirthdayOverlay.tsx`:

```tsx
'use client'

import { useEffect, useState } from 'react'
import confetti from 'canvas-confetti'
import { getBirthdayWindowISO } from '@/lib/utils/birthday'

const STORAGE_KEY = 'birthday_shown'

interface Props {
  birthdayDate: string
  birthdayMessage: string
}

export function BirthdayOverlay({ birthdayDate, birthdayMessage }: Props) {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const iso = getBirthdayWindowISO(birthdayDate)
    if (!iso) return
    if (localStorage.getItem(STORAGE_KEY) === iso) return

    setVisible(true)
    confetti({
      particleCount: 160,
      spread: 90,
      origin: { y: 0.1 },
      zIndex: 60,
    })
  }, [birthdayDate])

  function dismiss() {
    const iso = getBirthdayWindowISO(birthdayDate)
    if (iso) localStorage.setItem(STORAGE_KEY, iso)
    setVisible(false)
  }

  if (!visible) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-8 text-center">
        <div className="text-6xl mb-4">🎂</div>
        <h1 className="text-2xl font-bold text-gray-900 mb-3">Happy Birthday!</h1>
        <p className="text-base text-gray-600 mb-6 whitespace-pre-line">{birthdayMessage}</p>
        <button
          type="button"
          onClick={dismiss}
          className="w-full sm:w-auto px-8 py-2.5 bg-gray-900 text-white font-semibold rounded-lg hover:bg-gray-700 transition-colors"
        >
          Thank you! 🎉
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/ui/BirthdayOverlay.tsx
git commit -m "feat(birthday): add BirthdayOverlay client component"
```

---

### Task 4: Wire AppLayout + AppShell

**Files:**
- Modify: `src/app/(app)/layout.tsx`
- Modify: `src/components/layout/AppShell.tsx`

- [ ] **Step 1: Update AppShell to accept and render BirthdayOverlay**

Open `src/components/layout/AppShell.tsx`. Make these changes:

Add the import at the top (after the existing imports):

```tsx
import { BirthdayOverlay } from '@/components/ui/BirthdayOverlay'
```

Add `birthdayConfig` to the `AppShellProps` interface:

```tsx
interface AppShellProps {
  user: User
  profile: Profile
  isAdmin?: boolean
  birthdayConfig?: { date: string; message: string }
  children: React.ReactNode
}
```

Update the function signature to destructure `birthdayConfig`:

```tsx
export function AppShell({ user, profile, isAdmin = false, birthdayConfig, children }: AppShellProps) {
```

Add `BirthdayOverlay` as the first child inside the outermost `<div>` (right after the opening `<div className="flex flex-col md:flex-row ...`):

```tsx
  return (
    <div className="flex flex-col md:flex-row min-h-dvh md:h-screen bg-gray-50">
      {birthdayConfig && (
        <BirthdayOverlay
          birthdayDate={birthdayConfig.date}
          birthdayMessage={birthdayConfig.message}
        />
      )}
      {/* Sidebar — desktop only */}
      <aside ...
```

- [ ] **Step 2: Update AppLayout to read env vars and pass birthdayConfig**

Open `src/app/(app)/layout.tsx`. The full updated file:

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

  const birthdayUser = process.env.BIRTHDAY_USER?.toLowerCase()
  const birthdayDate = process.env.BIRTHDAY_DATE
  const birthdayMessage = process.env.BIRTHDAY_MESSAGE
  const birthdayConfig =
    birthdayUser && birthdayDate && birthdayMessage && user.email?.toLowerCase() === birthdayUser
      ? { date: birthdayDate, message: birthdayMessage }
      : undefined

  return (
    <>
      {user.email && <PostHogIdentifier userId={user.id} email={user.email} optOut={isAdmin} />}
      <AppShell user={user} profile={profile} isAdmin={isAdmin} birthdayConfig={birthdayConfig}>
        {children}
      </AppShell>
    </>
  )
}
```

- [ ] **Step 3: Type-check**

```bash
npx tsc --noEmit
```

Expected: no errors

- [ ] **Step 4: Run all tests**

```bash
npx vitest run
```

Expected: all tests PASS (including the new birthday utility tests)

- [ ] **Step 5: Commit**

```bash
git add src/app/(app)/layout.tsx src/components/layout/AppShell.tsx
git commit -m "feat(birthday): wire BirthdayOverlay into AppLayout and AppShell"
```

---

### Task 5: Add env vars and push

**Files:**
- Modify: `.env.local`

- [ ] **Step 1: Add env vars to .env.local**

Append to `.env.local`:

```
BIRTHDAY_USER=<email-of-the-birthday-user>
BIRTHDAY_DATE=<MM-DD>
BIRTHDAY_MESSAGE=<your birthday message here>
```

Replace the placeholder values with the real ones. Do **not** commit `.env.local` — it is gitignored.

- [ ] **Step 2: Set the same vars in Vercel**

In the Vercel dashboard → Project → Settings → Environment Variables, add:
- `BIRTHDAY_USER`
- `BIRTHDAY_DATE`
- `BIRTHDAY_MESSAGE`

- [ ] **Step 3: Push to git so Vercel deploys**

```bash
git push
```

---

## Testing the feature manually

1. Set `BIRTHDAY_DATE` to today's date in `MM-DD` format and `BIRTHDAY_USER` to your logged-in email.
2. Clear localStorage: in browser DevTools → Application → Local Storage → delete `birthday_shown`.
3. Reload the app — overlay and confetti should appear.
4. Click "Thank you!" — overlay dismisses and `birthday_shown` is set.
5. Reload again — overlay should not appear.
6. Change `BIRTHDAY_DATE` to 6 days from today — overlay should not appear.
