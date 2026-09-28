# Onboarding Wizard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the single create/join onboarding screen with a resumable multi-step wizard, add a dev-only login for local browser testing, fix invite edge cases, and make the household name editable in settings.

**Architecture:** `/onboarding` is a server page that picks the starting step (no household → `language`; otherwise `households.onboarding_step`) and renders a client `OnboardingWizard`. Pre-household steps live in client state; from `translation` on, each Next/Skip persists the next step in `households.onboarding_step` (`NULL` = finished) via the existing `PATCH /api/household`. The `(app)` layout sends unfinished households back to `/onboarding`, reading the step through an `unstable_cache` entry that is revalidated on every step change.

**Tech Stack:** Next.js 14 App Router, React 18, Supabase (`@supabase/ssr`, `supabase-js` admin client), next-intl 4, posthog-js, Tailwind, Vitest + Testing Library.

**Spec:** `docs/superpowers/specs/2026-09-25-onboarding-wizard-design.md`

**Ground rules for the implementer**
- Branch: `feat/onboarding-wizard` (already created, contains the spec).
- Run a single test file with `npx vitest run <path>`; the full suite with `npm test`.
- Never trigger Anthropic API calls while testing. Every test mocks network/Supabase.
- Every commit message ends with the trailer line `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` (use a second `-m`).
- Component tests mock `next-intl` with `mockTranslate` from `@/test/mockMessages`, which **throws on missing keys** — so the message task (Task 10) must land before any component task.

---

## File map

| File | Status | Responsibility |
|---|---|---|
| `src/app/dev/login/route.ts` | create | Dev-only sign-in as `dev@dapcook.local` |
| `src/middleware.ts` | modify | `/dev` public path |
| `CLAUDE.md` | modify | "Local development" section |
| `supabase/migrations/020_onboarding_step.sql` | create | `households.onboarding_step` |
| `src/types/database.ts` | modify | `onboarding_step` column type |
| `src/lib/onboarding/steps.ts` | create | Step order + helpers |
| `src/lib/onboarding/status.ts` | create | Cached `onboarding_step` read + invalidation |
| `src/app/api/household/route.ts` | modify | Accept `name`, `onboarding_step` |
| `src/lib/utils/invite.ts` | modify | `extractInviteToken` |
| `src/lib/auth/actions.ts` | modify | `createHousehold` seeds + redirects to wizard; `joinHousehold` accepts links |
| `src/app/auth/callback/route.ts` | modify | Invalid pending invite → `/join-invalid`; invitees get `ob=1&obm=join` |
| `src/components/providers/PostHogIdentifier.tsx` | modify | `onboarding_completed { method }` |
| `src/lib/onboarding/tag-catalog.ts` | create | Localized tag catalog + payload builder |
| `src/lib/onboarding/defaults.ts` | create | Localized default shopping categories + rule examples |
| `src/app/api/onboarding/tags/route.ts` | create | Create groups + tags from the wizard |
| `src/app/(app)/layout.tsx` | modify | Redirect unfinished onboarding |
| `src/i18n/config.ts` | modify | Export `LOCALE_LABELS` |
| `messages/{en,sk}/auth.json`, `errors.json`, `settings.json` | modify | Copy |
| `src/app/onboarding/layout.tsx` | modify | Real locale + PostHog identify |
| `src/app/onboarding/page.tsx` | rewrite | Server page choosing the step |
| `src/components/onboarding/send-json.ts` | create | Tiny fetch helper returning `ok` |
| `src/components/onboarding/StepFrame.tsx` | create | Shared step layout + footer |
| `src/components/onboarding/OnboardingWizard.tsx` | create | Step state, persistence, analytics |
| `src/components/onboarding/steps/*.tsx` | create | Language, Household, Translation, Units, Tags steps |
| `src/components/settings/ShoppingRulesEditor.tsx` | modify | Optional suggestion chips |
| `src/components/settings/InterfaceLanguageSelector.tsx` | modify | Use shared `LOCALE_LABELS` |
| `src/components/settings/HouseholdNameEditor.tsx` | create | Inline rename |
| `src/app/(app)/settings/page.tsx` | modify | Use `HouseholdNameEditor` |

---

### Task 1: Dev login route

**Files:**
- Create: `src/app/dev/login/route.ts`
- Create: `src/app/dev/login/route.test.ts`
- Modify: `src/middleware.ts` (`PUBLIC_PATHS`)
- Modify: `src/middleware.test.ts`
- Modify: `CLAUDE.md`

- [ ] **Step 1: Write the failing route test**

`src/app/dev/login/route.test.ts`:

```ts
// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { NextRequest } from 'next/server'

const mocks = vi.hoisted(() => ({
  createUser: vi.fn(),
  generateLink: vi.fn(),
  verifyOtp: vi.fn(),
  profileUpsert: vi.fn(),
  adminUpdateEq: vi.fn(),
  adminUpdate: vi.fn(),
  forgetHouseholdId: vi.fn(),
}))

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    auth: { admin: { createUser: mocks.createUser, generateLink: mocks.generateLink } },
    from: () => ({ update: mocks.adminUpdate }),
  }),
}))
vi.mock('@/lib/supabase/server', () => ({
  createClient: () => ({
    auth: { verifyOtp: mocks.verifyOtp },
    from: () => ({ upsert: mocks.profileUpsert }),
  }),
}))
vi.mock('@/lib/auth/household', () => ({ forgetHouseholdId: mocks.forgetHouseholdId }))

import { GET } from './route'

function request(query = '') {
  return new NextRequest(`http://localhost:3000/dev/login${query}`)
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubEnv('NODE_ENV', 'development')
  mocks.createUser.mockResolvedValue({ data: {}, error: null })
  mocks.generateLink.mockResolvedValue({ data: { properties: { hashed_token: 'hash-1' } }, error: null })
  mocks.verifyOtp.mockResolvedValue({ data: { user: { id: 'dev-user' } }, error: null })
  mocks.profileUpsert.mockResolvedValue({ error: null })
  mocks.adminUpdateEq.mockResolvedValue({ error: null })
  mocks.adminUpdate.mockReturnValue({ eq: mocks.adminUpdateEq })
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('GET /dev/login', () => {
  it('is not available outside development', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    const res = await GET(request())
    expect(res.status).toBe(404)
    expect(mocks.generateLink).not.toHaveBeenCalled()
  })

  it('signs the dev user in with a server-verified magic link and redirects to recipes', async () => {
    const res = await GET(request())
    expect(mocks.generateLink).toHaveBeenCalledWith({ type: 'magiclink', email: 'dev@dapcook.local' })
    expect(mocks.verifyOtp).toHaveBeenCalledWith({ type: 'magiclink', token_hash: 'hash-1' })
    expect(res.status).toBe(307)
    expect(res.headers.get('location')).toBe('http://localhost:3000/recipes')
  })

  it('carries on when the dev user already exists', async () => {
    mocks.createUser.mockResolvedValue({ data: {}, error: { code: 'email_exists', message: 'exists' } })
    const res = await GET(request())
    expect(res.status).toBe(307)
  })

  it('honours a relative next path and ignores absolute ones', async () => {
    expect((await GET(request('?next=/shopping'))).headers.get('location')).toBe('http://localhost:3000/shopping')
    expect((await GET(request('?next=//evil.com'))).headers.get('location')).toBe('http://localhost:3000/recipes')
  })

  it('detaches the dev user from its household with fresh=1 and opens onboarding', async () => {
    const res = await GET(request('?fresh=1'))
    expect(mocks.adminUpdate).toHaveBeenCalledWith({ household_id: null, ui_language: 'en' })
    expect(mocks.adminUpdateEq).toHaveBeenCalledWith('id', 'dev-user')
    expect(mocks.forgetHouseholdId).toHaveBeenCalledWith('dev-user')
    expect(res.headers.get('location')).toBe('http://localhost:3000/onboarding')
  })

  it('fails loudly when the magic link cannot be verified', async () => {
    mocks.verifyOtp.mockResolvedValue({ data: { user: null }, error: { message: 'bad token' } })
    const res = await GET(request())
    expect(res.status).toBe(500)
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/app/dev/login/route.test.ts`
Expected: FAIL — `Failed to resolve import "./route"`.

- [ ] **Step 3: Implement the route**

`src/app/dev/login/route.ts`:

```ts
import { NextResponse, type NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { forgetHouseholdId } from '@/lib/auth/household'

const DEV_EMAIL = 'dev@dapcook.local'

/**
 * Local-only sign-in so agents (and people) can use the app without Google
 * OAuth. It mints a magic link with the service-role key and verifies it
 * server-side, so the browser ends up with a genuine Supabase session and RLS
 * behaves exactly as in production. See "Local development" in CLAUDE.md.
 */
export async function GET(request: NextRequest) {
  if (process.env.NODE_ENV !== 'development') {
    return new NextResponse('Not found', { status: 404 })
  }

  const { searchParams, origin } = new URL(request.url)
  const fresh = searchParams.get('fresh') === '1'
  const requested = searchParams.get('next')
  const next =
    requested?.startsWith('/') && !requested.startsWith('//')
      ? requested
      : fresh ? '/onboarding' : '/recipes'

  const admin = createAdminClient()

  const { error: createError } = await admin.auth.admin.createUser({
    email: DEV_EMAIL,
    email_confirm: true,
    user_metadata: { full_name: 'Dev User' },
  })
  if (createError && createError.code !== 'email_exists') {
    return NextResponse.json({ error: createError.message }, { status: 500 })
  }

  const { data: link, error: linkError } = await admin.auth.admin.generateLink({
    type: 'magiclink',
    email: DEV_EMAIL,
  })
  const tokenHash = link?.properties?.hashed_token
  if (linkError || !tokenHash) {
    return NextResponse.json({ error: linkError?.message ?? 'No token' }, { status: 500 })
  }

  const supabase = createClient()
  const { data: session, error: verifyError } = await supabase.auth.verifyOtp({
    type: 'magiclink',
    token_hash: tokenHash,
  })
  const userId = session?.user?.id
  if (verifyError || !userId) {
    return NextResponse.json({ error: verifyError?.message ?? 'Verification failed' }, { status: 500 })
  }

  await supabase.from('profiles').upsert(
    { id: userId, display_name: 'Dev User', avatar_url: null, updated_at: new Date().toISOString() },
    { onConflict: 'id', ignoreDuplicates: false }
  )

  if (fresh) {
    await admin.from('profiles').update({ household_id: null, ui_language: 'en' }).eq('id', userId)
    forgetHouseholdId(userId)
  }

  return NextResponse.redirect(`${origin}${next}`)
}
```

- [ ] **Step 4: Run the route test**

Run: `npx vitest run src/app/dev/login/route.test.ts`
Expected: PASS (6 tests). If TypeScript complains about the `verifyOtp` type literal, `'magiclink'` is a valid `EmailOtpType` in supabase-js 2.x — keep it.

- [ ] **Step 5: Make `/dev` reachable while signed out**

In `src/middleware.ts` add `'/dev'` to `PUBLIC_PATHS` (the route itself 404s outside development):

```ts
const PUBLIC_PATHS = [
  '/login',
  '/auth/callback',
  '/join',
  '/onboarding',
  '/robots.txt',
  '/s',
  '/dev',
]
```

In `src/middleware.test.ts`, inside `describe('isPublicPath', …)` add:

```ts
  it('lets the dev login through without a session', () => {
    expect(isPublicPath('/dev/login')).toBe(true)
  })
```

Run: `npx vitest run src/middleware.test.ts`
Expected: PASS.

- [ ] **Step 6: Document it in `CLAUDE.md`**

Append to `/Users/vacuumlabs/Developer/dapcook/CLAUDE.md`:

```markdown

## Local development

- **Dev login:** with `npm run dev` running, open http://localhost:3000/dev/login to sign in as
  `dev@dapcook.local` without Google. `.env.local` points at the **staging** Supabase project.
  - `?next=/shopping` — land on a specific page.
  - `?fresh=1` — detach the dev user from its household (and reset its language to English) and
    open `/onboarding`, to walk through the wizard again. Old dev households stay in staging.
  - The route returns 404 unless `NODE_ENV === 'development'`.
- **No paid AI calls while testing:** do not trigger anything that calls the Anthropic API
  (AI recipe import, translation, shopping-list generation, "make smarter") unless the user
  explicitly asks. Tests must mock the SDK.
```

- [ ] **Step 7: Commit**

```bash
git add src/app/dev src/middleware.ts src/middleware.test.ts CLAUDE.md
git commit -m "feat: dev-only login for local browser testing" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: `onboarding_step` column

**Files:**
- Create: `supabase/migrations/020_onboarding_step.sql`
- Modify: `src/types/database.ts` (households `Row`/`Insert`/`Update`)

- [ ] **Step 1: Write the migration**

`supabase/migrations/020_onboarding_step.sql`:

```sql
-- Where a household is in the onboarding wizard. NULL means finished, which is
-- what every household created before the wizard existed gets.
ALTER TABLE households
  ADD COLUMN onboarding_step TEXT
  CHECK (onboarding_step IN ('translation', 'units', 'tags', 'shopping_categories', 'shopping_rules'));
```

- [ ] **Step 2: Update the types**

In `src/types/database.ts`, households:
- `Row`: after `last_sign_in_at: string | null` add
  `onboarding_step: 'translation' | 'units' | 'tags' | 'shopping_categories' | 'shopping_rules' | null`
- `Insert` and `Update`: add
  `onboarding_step?: 'translation' | 'units' | 'tags' | 'shopping_categories' | 'shopping_rules' | null`

- [ ] **Step 3: Type-check**

Run: `npm run type-check`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/020_onboarding_step.sql src/types/database.ts
git commit -m "feat: households.onboarding_step column" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Step model and cached status

**Files:**
- Create: `src/lib/onboarding/steps.ts`
- Create: `src/lib/onboarding/steps.test.ts`
- Create: `src/lib/onboarding/status.ts`

- [ ] **Step 1: Write the failing test**

`src/lib/onboarding/steps.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { isPersistedStep, nextStep, persistedStepAfter, stepNumber, TOTAL_STEPS } from './steps'

describe('onboarding steps', () => {
  it('walks the steps in order and stays on done', () => {
    expect(nextStep('language')).toBe('intro')
    expect(nextStep('intro')).toBe('household')
    expect(nextStep('household')).toBe('translation')
    expect(nextStep('shopping_rules')).toBe('done')
    expect(nextStep('done')).toBe('done')
  })

  it('stores the following persisted step, and null after the last one', () => {
    expect(persistedStepAfter('translation')).toBe('units')
    expect(persistedStepAfter('shopping_categories')).toBe('shopping_rules')
    expect(persistedStepAfter('shopping_rules')).toBeNull()
  })

  it('recognises only the steps stored in the database', () => {
    expect(isPersistedStep('tags')).toBe(true)
    expect(isPersistedStep('household')).toBe(false)
    expect(isPersistedStep('done')).toBe(false)
    expect(isPersistedStep(42)).toBe(false)
  })

  it('numbers steps from intro, leaving the language step uncounted', () => {
    expect(stepNumber('language')).toBe(0)
    expect(stepNumber('intro')).toBe(1)
    expect(stepNumber('done')).toBe(TOTAL_STEPS)
    expect(TOTAL_STEPS).toBe(8)
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/lib/onboarding/steps.test.ts`
Expected: FAIL — cannot resolve `./steps`.

- [ ] **Step 3: Implement `steps.ts`**

```ts
export const ONBOARDING_STEPS = [
  'language',
  'intro',
  'household',
  'translation',
  'units',
  'tags',
  'shopping_categories',
  'shopping_rules',
  'done',
] as const

export type OnboardingStep = (typeof ONBOARDING_STEPS)[number]

/** Steps that exist once the household does, stored in `households.onboarding_step`. */
export const PERSISTED_STEPS = ['translation', 'units', 'tags', 'shopping_categories', 'shopping_rules'] as const

export type PersistedStep = (typeof PERSISTED_STEPS)[number]

/** Shown as "Step n of TOTAL_STEPS"; the language step comes before counting starts. */
export const TOTAL_STEPS = ONBOARDING_STEPS.length - 1

export function isPersistedStep(value: unknown): value is PersistedStep {
  return PERSISTED_STEPS.includes(value as PersistedStep)
}

export function nextStep(step: OnboardingStep): OnboardingStep {
  const index = ONBOARDING_STEPS.indexOf(step)
  return ONBOARDING_STEPS[Math.min(index + 1, ONBOARDING_STEPS.length - 1)]
}

/** What `onboarding_step` becomes once `step` is done — null means onboarding is finished. */
export function persistedStepAfter(step: PersistedStep): PersistedStep | null {
  return PERSISTED_STEPS[PERSISTED_STEPS.indexOf(step) + 1] ?? null
}

export function stepNumber(step: OnboardingStep): number {
  return ONBOARDING_STEPS.indexOf(step)
}
```

- [ ] **Step 4: Run the test**

Run: `npx vitest run src/lib/onboarding/steps.test.ts`
Expected: PASS.

- [ ] **Step 5: Implement `status.ts`**

No unit test: it is a thin `unstable_cache` wrapper mirroring `src/lib/auth/household.ts`, exercised through the layout test in Task 9.

```ts
import { unstable_cache, revalidateTag } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import type { PersistedStep } from './steps'

function onboardingCacheTag(householdId: string): string {
  return `onboarding-of:${householdId}`
}

/**
 * The household's current onboarding step, or null once it is finished.
 *
 * The `(app)` layout asks on every navigation, so — like `getCurrentHouseholdId`
 * — the answer is cached across requests and invalidated whenever the step
 * changes. Service-role client because cache callbacks cannot read cookies;
 * callers pass a household id that came from a verified session.
 */
export function readOnboardingStep(householdId: string): Promise<PersistedStep | null> {
  return unstable_cache(
    async () => {
      const supabase = createAdminClient()
      const { data } = await supabase
        .from('households')
        .select('onboarding_step')
        .eq('id', householdId)
        .single()
      return data?.onboarding_step ?? null
    },
    ['onboarding-of', householdId],
    { tags: [onboardingCacheTag(householdId)], revalidate: 3600 }
  )()
}

export function forgetOnboardingStep(householdId: string): void {
  revalidateTag(onboardingCacheTag(householdId))
}
```

- [ ] **Step 6: Commit**

```bash
git add src/lib/onboarding
git commit -m "feat: onboarding step model and cached status" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: `PATCH /api/household` accepts `name` and `onboarding_step`

**Files:**
- Modify: `src/app/api/household/route.ts`
- Create: `src/app/api/household/route.test.ts`

- [ ] **Step 1: Write the failing test**

`src/app/api/household/route.test.ts`:

```ts
// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const mocks = vi.hoisted(() => ({
  update: vi.fn(),
  single: vi.fn(),
  forgetOnboardingStep: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: () => ({
    from: () => ({
      update: (values: unknown) => {
        mocks.update(values)
        return { eq: () => ({ select: () => ({ single: mocks.single }) }) }
      },
    }),
  }),
}))
vi.mock('@/lib/auth/current-user', () => ({ getCurrentUser: vi.fn(async () => ({ id: 'user-1', email: null })) }))
vi.mock('@/lib/auth/household', async () => ({
  getCurrentHouseholdId: (await import('@/test/householdMock')).householdIdMock,
}))
vi.mock('@/lib/onboarding/status', () => ({ forgetOnboardingStep: mocks.forgetOnboardingStep }))

import { PATCH } from './route'
import { householdIdMock } from '@/test/householdMock'

function patch(body: unknown) {
  return PATCH(new NextRequest('http://localhost/api/household', { method: 'PATCH', body: JSON.stringify(body) }))
}

beforeEach(() => {
  vi.clearAllMocks()
  householdIdMock.mockResolvedValue('hh-1')
  mocks.single.mockResolvedValue({ data: { id: 'hh-1' }, error: null })
})

describe('PATCH /api/household', () => {
  it('renames the household, trimming whitespace', async () => {
    const res = await patch({ name: '  Our kitchen ' })
    expect(res.status).toBe(200)
    expect(mocks.update).toHaveBeenCalledWith({ name: 'Our kitchen' })
  })

  it('rejects an empty or overlong name', async () => {
    expect((await patch({ name: '   ' })).status).toBe(400)
    expect((await patch({ name: 'x'.repeat(81) })).status).toBe(400)
    expect(mocks.update).not.toHaveBeenCalled()
  })

  it('stores the onboarding step and invalidates the cached status', async () => {
    const res = await patch({ onboarding_step: 'tags' })
    expect(res.status).toBe(200)
    expect(mocks.update).toHaveBeenCalledWith({ onboarding_step: 'tags' })
    expect(mocks.forgetOnboardingStep).toHaveBeenCalledWith('hh-1')
  })

  it('accepts null to finish onboarding', async () => {
    await patch({ onboarding_step: null })
    expect(mocks.update).toHaveBeenCalledWith({ onboarding_step: null })
  })

  it('rejects steps that are not stored in the database', async () => {
    expect((await patch({ onboarding_step: 'household' })).status).toBe(400)
  })

  it('does not touch the onboarding cache for other updates', async () => {
    await patch({ preferred_units: 'imperial' })
    expect(mocks.forgetOnboardingStep).not.toHaveBeenCalled()
  })

  it('rejects an empty update', async () => {
    expect((await patch({})).status).toBe(400)
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/app/api/household/route.test.ts`
Expected: FAIL — rename/onboarding tests fail (fields ignored), empty update returns 200.

- [ ] **Step 3: Implement**

In `src/app/api/household/route.ts`:

Add imports:

```ts
import { isPersistedStep } from '@/lib/onboarding/steps'
import { forgetOnboardingStep } from '@/lib/onboarding/status'
```

Replace the body type line with:

```ts
  const body = await request.json() as {
    preferred_units?: 'metric' | 'imperial'
    preferred_language?: string
    translation_enabled?: boolean
    name?: unknown
    onboarding_step?: unknown
  }
```

After the `translation_enabled` block and before the Supabase update, add:

```ts
  if (body.name !== undefined) {
    const name = typeof body.name === 'string' ? body.name.trim() : ''
    if (!name || name.length > 80) {
      return NextResponse.json({ error: 'Invalid name' }, { status: 400 })
    }
    updates.name = name
  }

  if (body.onboarding_step !== undefined) {
    if (body.onboarding_step !== null && !isPersistedStep(body.onboarding_step)) {
      return NextResponse.json({ error: 'Invalid onboarding_step' }, { status: 400 })
    }
    updates.onboarding_step = body.onboarding_step
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'Nothing to update' }, { status: 400 })
  }
```

After the `if (error || !data)` line, before the final return, add:

```ts
  if ('onboarding_step' in updates) forgetOnboardingStep(householdId)
```

- [ ] **Step 4: Run the test**

Run: `npx vitest run src/app/api/household/route.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add src/app/api/household
git commit -m "feat: household API accepts name and onboarding step" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Invite links are accepted where a code was expected

**Files:**
- Modify: `src/lib/utils/invite.ts`
- Modify: `src/lib/utils/invite.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `src/lib/utils/invite.test.ts` (add `extractInviteToken` to the existing import from `./invite`):

```ts
describe('extractInviteToken', () => {
  const token = 'a'.repeat(32)

  it('accepts a bare token, ignoring surrounding whitespace', () => {
    expect(extractInviteToken(`  ${token} `)).toBe(token)
  })

  it('pulls the token out of an invite link', () => {
    expect(extractInviteToken(`https://dapcook.vercel.app/join/${token}`)).toBe(token)
    expect(extractInviteToken(`https://dapcook.vercel.app/join/${token}/complete`)).toBe(token)
    expect(extractInviteToken(`https://dapcook.vercel.app/join/${token}?utm=x`)).toBe(token)
  })

  it('returns null for anything else', () => {
    expect(extractInviteToken('')).toBeNull()
    expect(extractInviteToken('hello')).toBeNull()
    expect(extractInviteToken(`https://dapcook.vercel.app/recipes/${token}`)).toBeNull()
    expect(extractInviteToken(`https://dapcook.vercel.app/join/${token}abc`)).toBeNull()
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/lib/utils/invite.test.ts`
Expected: FAIL — `extractInviteToken` is not exported.

- [ ] **Step 3: Implement**

Append to `src/lib/utils/invite.ts`:

```ts
/** Accepts what people actually paste — the whole invite link — as well as a bare token. */
export function extractInviteToken(input: string): string | null {
  const trimmed = input.trim()
  if (isValidInviteToken(trimmed)) return trimmed
  const match = trimmed.match(/\/join\/([a-f0-9]{32})(?:[/?#]|$)/)
  return match ? match[1] : null
}
```

- [ ] **Step 4: Run the test**

Run: `npx vitest run src/lib/utils/invite.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/utils/invite.ts src/lib/utils/invite.test.ts
git commit -m "feat: parse invite tokens out of invite links" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Onboarding catalogs (tags, default categories, rule examples)

**Files:**
- Create: `src/lib/onboarding/tag-catalog.ts`
- Create: `src/lib/onboarding/tag-catalog.test.ts`
- Create: `src/lib/onboarding/defaults.ts`

- [ ] **Step 1: Write the failing test**

`src/lib/onboarding/tag-catalog.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { TAG_CATALOG, buildTagGroupsPayload } from './tag-catalog'
import { DEFAULT_SHOPPING_CATEGORIES, SHOPPING_RULE_EXAMPLES } from './defaults'
import { locales } from '@/i18n/config'

describe('TAG_CATALOG', () => {
  it('offers the agreed groups in order', () => {
    expect(TAG_CATALOG.map((g) => g.id)).toEqual(['course', 'cuisine', 'diet', 'ingredient', 'effort'])
  })

  it.each(locales)('has every label in %s, and no tag name twice (tag names are unique per household)', (locale) => {
    const names = TAG_CATALOG.flatMap((g) => g.tags.map((t) => t[locale]))
    expect(names.every((n) => n.trim().length > 0)).toBe(true)
    expect(new Set(names).size).toBe(names.length)
    expect(TAG_CATALOG.every((g) => g.name[locale].trim().length > 0)).toBe(true)
  })
})

describe('buildTagGroupsPayload', () => {
  it('keeps only groups with a selection, names them in the UI language, in catalog order', () => {
    const payload = buildTagGroupsPayload({ diet: ['Vegánske'], course: ['Polievka', 'Dezert'] }, 'sk')
    expect(payload).toEqual([
      { name: 'Chod', tags: ['Polievka', 'Dezert'] },
      { name: 'Stravovanie', tags: ['Vegánske'] },
    ])
  })

  it('trims, drops blanks and removes duplicates', () => {
    expect(buildTagGroupsPayload({ cuisine: [' Italian ', 'Italian', ''] }, 'en')).toEqual([
      { name: 'Cuisine', tags: ['Italian'] },
    ])
  })

  it('returns nothing when nothing was picked', () => {
    expect(buildTagGroupsPayload({}, 'en')).toEqual([])
  })
})

describe('onboarding defaults', () => {
  it.each(locales)('has the 9 default shopping categories and rule examples in %s', (locale) => {
    expect(DEFAULT_SHOPPING_CATEGORIES).toHaveLength(9)
    expect(DEFAULT_SHOPPING_CATEGORIES[0][locale]).toBeTruthy()
    expect(SHOPPING_RULE_EXAMPLES.every((r) => r[locale].trim().length > 0)).toBe(true)
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/lib/onboarding/tag-catalog.test.ts`
Expected: FAIL — cannot resolve `./tag-catalog`.

- [ ] **Step 3: Implement `tag-catalog.ts`**

```ts
import type { Locale } from '@/i18n/config'

export type Localized = Record<Locale, string>

export interface TagCatalogGroup {
  id: string
  name: Localized
  tags: Localized[]
}

/**
 * Tags offered during onboarding. They are stored as plain names in the UI
 * language the user picked, so labels live here (not in message files) — they
 * become data, not interface copy.
 */
export const TAG_CATALOG: TagCatalogGroup[] = [
  {
    id: 'course',
    name: { en: 'Course', sk: 'Chod' },
    tags: [
      { en: 'Breakfast', sk: 'Raňajky' },
      { en: 'Brunch', sk: 'Brunch' },
      { en: 'Lunch', sk: 'Obed' },
      { en: 'Dinner', sk: 'Večera' },
      { en: 'Main dish', sk: 'Hlavné jedlo' },
      { en: 'Side dish', sk: 'Príloha' },
      { en: 'Soup', sk: 'Polievka' },
      { en: 'Salad', sk: 'Šalát' },
      { en: 'Appetizer', sk: 'Predjedlo' },
      { en: 'Snack', sk: 'Desiata' },
      { en: 'Dessert', sk: 'Dezert' },
      { en: 'Baking', sk: 'Pečenie' },
      { en: 'Sauce & dip', sk: 'Omáčka a dip' },
      { en: 'Drink', sk: 'Nápoj' },
      { en: 'Cocktail', sk: 'Koktail' },
    ],
  },
  {
    id: 'cuisine',
    name: { en: 'Cuisine', sk: 'Kuchyňa' },
    tags: [
      { en: 'Slovak', sk: 'Slovenská' },
      { en: 'Czech', sk: 'Česká' },
      { en: 'Traditional', sk: 'Tradičná' },
      { en: 'Italian', sk: 'Talianska' },
      { en: 'French', sk: 'Francúzska' },
      { en: 'Spanish', sk: 'Španielska' },
      { en: 'Greek', sk: 'Grécka' },
      { en: 'Mediterranean', sk: 'Stredomorská' },
      { en: 'Mexican', sk: 'Mexická' },
      { en: 'American', sk: 'Americká' },
      { en: 'Asian', sk: 'Ázijská' },
      { en: 'Chinese', sk: 'Čínska' },
      { en: 'Japanese', sk: 'Japonská' },
      { en: 'Thai', sk: 'Thajská' },
      { en: 'Vietnamese', sk: 'Vietnamská' },
      { en: 'Korean', sk: 'Kórejská' },
      { en: 'Indian', sk: 'Indická' },
      { en: 'Middle Eastern', sk: 'Blízkovýchodná' },
    ],
  },
  {
    id: 'diet',
    name: { en: 'Diet', sk: 'Stravovanie' },
    tags: [
      { en: 'Vegetarian', sk: 'Vegetariánske' },
      { en: 'Vegan', sk: 'Vegánske' },
      { en: 'Gluten-free', sk: 'Bezlepkové' },
      { en: 'Dairy-free', sk: 'Bez mliečnych výrobkov' },
      { en: 'Low-carb', sk: 'Nízkosacharidové' },
      { en: 'High-protein', sk: 'Vysokobielkovinové' },
      { en: 'Keto', sk: 'Keto' },
      { en: 'Light', sk: 'Ľahké' },
    ],
  },
  {
    id: 'ingredient',
    name: { en: 'Main ingredient', sk: 'Hlavná surovina' },
    tags: [
      { en: 'Chicken', sk: 'Kuracie' },
      { en: 'Beef', sk: 'Hovädzie' },
      { en: 'Pork', sk: 'Bravčové' },
      { en: 'Fish', sk: 'Ryby' },
      { en: 'Seafood', sk: 'Morské plody' },
      { en: 'Pasta', sk: 'Cestoviny' },
      { en: 'Rice', sk: 'Ryža' },
      { en: 'Legumes', sk: 'Strukoviny' },
      { en: 'Potatoes', sk: 'Zemiaky' },
      { en: 'Vegetables', sk: 'Zelenina' },
      { en: 'Eggs', sk: 'Vajcia' },
      { en: 'Mushrooms', sk: 'Huby' },
    ],
  },
  {
    id: 'effort',
    name: { en: 'Effort & time', sk: 'Náročnosť a čas' },
    tags: [
      { en: 'Quick (under 30 min)', sk: 'Rýchle (do 30 min)' },
      { en: 'Easy', sk: 'Jednoduché' },
      { en: 'Weekend project', sk: 'Víkendový projekt' },
      { en: 'One-pot', sk: 'Z jedného hrnca' },
      { en: 'Meal prep', sk: 'Varenie dopredu' },
      { en: 'Freezer-friendly', sk: 'Vhodné na zmrazenie' },
      { en: 'Slow cooker', sk: 'Pomalý hrniec' },
      { en: 'Air fryer', sk: 'Teplovzdušná fritéza' },
    ],
  },
]

export interface TagGroupPayload {
  name: string
  tags: string[]
}

/**
 * Turns the wizard's selection (tag names per catalog group id, custom ones
 * included) into what `POST /api/onboarding/tags` expects. Groups without a
 * selected tag are left out, so they are never created.
 */
export function buildTagGroupsPayload(selected: Record<string, string[]>, locale: Locale): TagGroupPayload[] {
  return TAG_CATALOG.map((group) => ({
    name: group.name[locale],
    tags: [...new Set((selected[group.id] ?? []).map((t) => t.trim()).filter(Boolean))],
  })).filter((group) => group.tags.length > 0)
}
```

- [ ] **Step 4: Implement `defaults.ts`**

```ts
import type { Localized } from './tag-catalog'

/** Seeded for every new household, in the creator's UI language, in this order. */
export const DEFAULT_SHOPPING_CATEGORIES: Localized[] = [
  { en: 'Veggies & Fruits', sk: 'Ovocie a zelenina' },
  { en: 'Bakery', sk: 'Pečivo' },
  { en: 'Pantry', sk: 'Trvanlivé potraviny' },
  { en: 'Herbs & Spices', sk: 'Bylinky a koreniny' },
  { en: 'Dairy & Eggs', sk: 'Mliečne výrobky a vajcia' },
  { en: 'Frozen', sk: 'Mrazené' },
  { en: 'Meat', sk: 'Mäso' },
  { en: 'Household', sk: 'Domácnosť' },
  { en: 'Drinks', sk: 'Nápoje' },
]

/** One-tap shopping rule suggestions shown in the onboarding wizard. */
export const SHOPPING_RULE_EXAMPLES: Localized[] = [
  { en: 'Merge all kinds of onions into one item', sk: 'Všetky druhy cibule zlúč do jednej položky' },
  { en: 'Skip salt, pepper, oil and water — we always have them', sk: 'Vynechaj soľ, korenie, olej a vodu — tie máme vždy doma' },
  { en: 'Round up to whole packages (1 pack of butter, not 125 g)', sk: 'Zaokrúhli na celé balenia (1 maslo, nie 125 g)' },
  { en: 'Count eggs in pieces, not grams', sk: 'Vajcia počítaj na kusy, nie na gramy' },
  { en: 'Merge the same cheese from different recipes', sk: 'Rovnaký syr z rôznych receptov zlúč do jednej položky' },
]
```

- [ ] **Step 5: Run the test**

Run: `npx vitest run src/lib/onboarding/tag-catalog.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/onboarding/tag-catalog.ts src/lib/onboarding/tag-catalog.test.ts src/lib/onboarding/defaults.ts
git commit -m "feat: onboarding tag catalog and localized defaults" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: `createHousehold` / `joinHousehold` / auth callback

**Files:**
- Modify: `src/lib/auth/actions.ts` (`createHousehold`, `joinHousehold`)
- Create: `src/lib/auth/actions.test.ts`
- Modify: `src/app/auth/callback/route.ts`
- Create: `src/app/auth/callback/route.test.ts`

- [ ] **Step 1: Write the failing actions test**

`src/lib/auth/actions.test.ts`:

```ts
// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'

const mocks = vi.hoisted(() => ({
  inserts: {} as Record<string, unknown[]>,
  rpc: vi.fn(),
  uiLanguage: 'sk' as string,
}))

vi.mock('next/navigation', () => ({
  redirect: vi.fn((url: string) => { throw new Error(`REDIRECT:${url}`) }),
}))
vi.mock('next/headers', () => ({ cookies: vi.fn(), headers: vi.fn() }))
vi.mock('@/lib/auth/getOrigin', () => ({ getOrigin: () => 'http://localhost:3000' }))
vi.mock('@/lib/auth/current-user', () => ({ getCurrentUser: vi.fn(async () => ({ id: 'user-1', email: null })) }))
vi.mock('@/lib/auth/household', () => ({ forgetHouseholdId: vi.fn() }))
vi.mock('@/i18n/server-utils', () => ({ getUserTranslations: vi.fn(async () => (key: string) => key) }))
vi.mock('@/lib/supabase/server', () => ({
  createClient: () => ({
    from: (table: string) => ({
      select: () => ({ eq: () => ({ single: async () => ({ data: { ui_language: mocks.uiLanguage }, error: null }) }) }),
      insert: async (rows: unknown) => {
        (mocks.inserts[table] ??= []).push(rows)
        return { error: null }
      },
      update: () => ({ eq: async () => ({ error: null }) }),
    }),
    rpc: mocks.rpc,
  }),
}))

import { createHousehold, joinHousehold } from './actions'

const token = 'b'.repeat(32)

beforeEach(() => {
  vi.clearAllMocks()
  mocks.inserts = {}
  mocks.uiLanguage = 'sk'
  mocks.rpc.mockResolvedValue({ data: [{ id: 'hh-9', name: 'Home' }], error: null })
})

describe('createHousehold', () => {
  it('starts the wizard at the translation step and sends the user back to it', async () => {
    await expect(createHousehold('  Home  ')).rejects.toThrow('REDIRECT:/onboarding')
    expect(mocks.inserts.households[0]).toMatchObject({ name: 'Home', onboarding_step: 'translation' })
  })

  it('seeds the default shopping categories in the UI language, in order', async () => {
    await expect(createHousehold('Home')).rejects.toThrow()
    const categories = mocks.inserts.shopping_categories[0] as Array<{ name: string; sort_order: number }>
    expect(categories).toHaveLength(9)
    expect(categories[0]).toMatchObject({ name: 'Ovocie a zelenina', sort_order: 0 })
    expect(categories[8]).toMatchObject({ name: 'Nápoje', sort_order: 8 })
  })

  it('rejects a blank name', async () => {
    expect(await createHousehold('   ')).toEqual({ error: 'createHouseholdFailed' })
    expect(mocks.inserts.households).toBeUndefined()
  })
})

describe('joinHousehold', () => {
  it('accepts a pasted invite link and reports a join to analytics', async () => {
    await expect(joinHousehold(`https://dapcook.vercel.app/join/${token}`)).rejects.toThrow(
      'REDIRECT:/recipes?ob=1&obm=join'
    )
    expect(mocks.rpc).toHaveBeenCalledWith('get_household_by_invite_token', { token })
  })

  it('rejects input that is not an invite without looking anything up', async () => {
    expect(await joinHousehold('not a link')).toEqual({ error: 'invalidInviteCode' })
    expect(mocks.rpc).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/lib/auth/actions.test.ts`
Expected: FAIL — redirects go to `/recipes?ob=1`, no `onboarding_step`, no categories, URL input not parsed.

- [ ] **Step 3: Update `createHousehold`**

In `src/lib/auth/actions.ts`:

Add imports:

```ts
import { extractInviteToken } from '@/lib/utils/invite'
import { DEFAULT_SHOPPING_CATEGORIES } from '@/lib/onboarding/defaults'
import { defaultLocale, isLocale } from '@/i18n/config'
```

(Merge `extractInviteToken` into the existing `@/lib/utils/invite` import line.)

Replace the body of `createHousehold` from the `const inviteToken = generateInviteToken()` line to the end of the function with:

```ts
  const trimmedName = name.trim()
  if (!trimmedName) return { error: t('createHouseholdFailed') }

  const inviteToken = generateInviteToken()
  const householdId = crypto.randomUUID()

  const { error: householdError } = await supabase
    .from('households')
    .insert({ id: householdId, name: trimmedName, invite_token: inviteToken, onboarding_step: 'translation' })

  if (householdError) {
    return { error: t('createHouseholdFailed') }
  }

  const { error: profileError } = await supabase
    .from('profiles')
    .update({ household_id: householdId })
    .eq('id', user.id)

  if (profileError) {
    return { error: t('linkHouseholdFailed') }
  }

  forgetHouseholdId(user.id)

  const locale = isLocale(profile?.ui_language) ? profile.ui_language : defaultLocale
  await Promise.all([
    supabase.from('shopping_lists').insert({ household_id: householdId, name: 'Shopping list' }),
    supabase.from('shopping_categories').insert(
      DEFAULT_SHOPPING_CATEGORIES.map((category, index) => ({
        household_id: householdId,
        name: category[locale],
        sort_order: index,
      }))
    ),
  ])

  redirect('/onboarding')
}
```

- [ ] **Step 4: Update `joinHousehold`**

Replace the whole `joinHousehold` function with:

```ts
export async function joinHousehold(invite: string) {
  const supabase = createClient()

  const user = await getCurrentUser()

  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles').select('ui_language').eq('id', user.id).single()
  const t = await getUserTranslations(profile, 'errors')

  const inviteToken = extractInviteToken(invite)
  if (!inviteToken) return { error: t('invalidInviteCode') }

  const { data: householdRows, error: lookupError } = await supabase
    .rpc('get_household_by_invite_token', { token: inviteToken })
  const household = (householdRows as Array<{ id: string; name: string }> | null)?.[0] ?? null

  if (lookupError || !household) {
    return { error: t('invalidInviteCode') }
  }

  const { error: profileError } = await supabase
    .from('profiles')
    .update({ household_id: household.id })
    .eq('id', user.id)

  if (profileError) {
    return { error: t('joinHouseholdFailed') }
  }

  forgetHouseholdId(user.id)

  redirect('/recipes?ob=1&obm=join')
}
```

- [ ] **Step 5: Run the actions test**

Run: `npx vitest run src/lib/auth/actions.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 6: Write the failing callback test**

`src/app/auth/callback/route.test.ts`:

```ts
// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const mocks = vi.hoisted(() => ({
  householdId: null as string | null,
  rpc: vi.fn(),
  profileUpdate: vi.fn(),
}))

vi.mock('@/lib/auth/household', () => ({ forgetHouseholdId: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({
  createClient: () => ({
    auth: {
      exchangeCodeForSession: vi.fn(async () => ({
        data: { user: { id: 'user-1', email: 'a@b.c', user_metadata: {} } },
        error: null,
      })),
    },
    from: () => ({
      upsert: async () => ({ error: null }),
      select: () => ({ eq: () => ({ single: async () => ({ data: { household_id: mocks.householdId }, error: null }) }) }),
      update: (values: unknown) => {
        mocks.profileUpdate(values)
        return { eq: async () => ({ error: null }) }
      },
    }),
    rpc: mocks.rpc,
  }),
}))

import { GET } from './route'

function callback(cookie?: string) {
  return GET(
    new NextRequest('https://dapcook.test/auth/callback?code=abc', {
      headers: cookie ? { cookie } : {},
    })
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.householdId = null
})

describe('GET /auth/callback', () => {
  it('puts an invitee into the household and reports a join', async () => {
    mocks.rpc.mockResolvedValue({ data: [{ id: 'hh-1', name: 'Home' }], error: null })
    const res = await callback('pending_invite_token=tok')
    expect(mocks.profileUpdate).toHaveBeenCalledWith({ household_id: 'hh-1' })
    expect(res.headers.get('location')).toBe('https://dapcook.test/recipes?ob=1&obm=join')
    expect(res.cookies.get('pending_invite_token')?.value).toBe('')
  })

  it('sends an invitee with a dead invite to the invalid-invite page instead of onboarding', async () => {
    mocks.rpc.mockResolvedValue({ data: [], error: null })
    const res = await callback('pending_invite_token=stale')
    expect(res.headers.get('location')).toBe('https://dapcook.test/join-invalid')
    expect(res.cookies.get('pending_invite_token')?.value).toBe('')
    expect(mocks.profileUpdate).not.toHaveBeenCalled()
  })

  it('sends a new user without an invite to onboarding', async () => {
    const res = await callback()
    expect(res.headers.get('location')).toBe('https://dapcook.test/onboarding')
  })
})
```

- [ ] **Step 7: Run it to verify it fails**

Run: `npx vitest run src/app/auth/callback/route.test.ts`
Expected: FAIL — first test gets `/recipes`, second gets `/onboarding`.

- [ ] **Step 8: Update the callback**

In `src/app/auth/callback/route.ts`, replace the whole `if (!profile?.household_id) { … }` block with:

```ts
  if (!profile?.household_id) {
    // Pending invite stored in a cookie before OAuth, to survive the round-trip.
    const pendingToken = request.cookies.get('pending_invite_token')?.value

    if (pendingToken) {
      const { data: householdRows } = await supabase.rpc('get_household_by_invite_token', {
        token: pendingToken,
      })
      const household = (householdRows as Array<{ id: string; name: string }> | null)?.[0] ?? null

      // A dead invite (regenerated or mistyped) must not drop the invitee into
      // onboarding, where they would unknowingly create a second household.
      const target = household ? '/recipes?ob=1&obm=join' : '/join-invalid'

      if (household) {
        await supabase
          .from('profiles')
          .update({ household_id: household.id })
          .eq('id', data.user.id)

        forgetHouseholdId(data.user.id)
      }

      const response = NextResponse.redirect(`${origin}${target}`)
      response.cookies.delete('pending_invite_token')
      return response
    }

    if (!next.startsWith('/join/')) {
      return NextResponse.redirect(`${origin}/onboarding`)
    }
  }
```

(This also removes the three debug `console.log` calls.)

- [ ] **Step 9: Run the callback test**

Run: `npx vitest run src/app/auth/callback/route.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 10: Commit**

```bash
git add src/lib/auth/actions.ts src/lib/auth/actions.test.ts src/app/auth/callback
git commit -m "feat: seed households for the wizard and harden invite handling" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: PostHog `onboarding_completed { method }`

**Files:**
- Modify: `src/components/providers/PostHogIdentifier.tsx`
- Modify: `src/components/providers/PostHogIdentifier.test.tsx`

- [ ] **Step 1: Update the tests**

In `src/components/providers/PostHogIdentifier.test.tsx`:

Replace the assertion in `'does not fire onboarding_completed without ?ob=1'`:

```ts
    expect(mockCapture).not.toHaveBeenCalled()
```

Replace the assertion in `'fires onboarding_completed when ?ob=1 is present'`:

```ts
    expect(mockCapture).toHaveBeenCalledWith('onboarding_completed', { method: 'create' })
```

Add after the cleanup test:

```ts
  it('reports a join when ?obm=join accompanies ?ob=1, and strips both params', () => {
    mockSearchParams.set('ob', '1')
    mockSearchParams.set('obm', 'join')
    render(<PostHogIdentifier userId="user-123" email="test@example.com" />)
    expect(mockCapture).toHaveBeenCalledWith('onboarding_completed', { method: 'join' })
    expect(mockReplace).toHaveBeenCalledWith('/recipes')
  })
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/components/providers/PostHogIdentifier.test.tsx`
Expected: FAIL — capture called without properties; `obm` left in URL.

- [ ] **Step 3: Implement**

In `src/components/providers/PostHogIdentifier.tsx`, replace the second `useEffect` body with:

```ts
  useEffect(() => {
    if (searchParams.get('ob') !== '1') return
    posthog.capture('onboarding_completed', {
      method: searchParams.get('obm') === 'join' ? 'join' : 'create',
    })
    const params = new URLSearchParams(searchParams.toString())
    params.delete('ob')
    params.delete('obm')
    router.replace(pathname + (params.toString() ? `?${params.toString()}` : ''))
  }, [posthog, searchParams, pathname, router])
```

- [ ] **Step 4: Run the test**

Run: `npx vitest run src/components/providers/PostHogIdentifier.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/providers
git commit -m "feat: tag onboarding_completed with create/join method" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Tags API and the `(app)` layout guard

**Files:**
- Create: `src/app/api/onboarding/tags/route.ts`
- Create: `src/app/api/onboarding/tags/route.test.ts`
- Modify: `src/app/(app)/layout.tsx`
- Create: `src/app/(app)/layout.test.tsx`

- [ ] **Step 1: Write the failing tags API test**

`src/app/api/onboarding/tags/route.test.ts`:

```ts
// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const mocks = vi.hoisted(() => ({
  groupUpserts: [] as unknown[],
  tagUpserts: [] as unknown[],
  user: { id: 'user-1', email: null } as { id: string; email: null } | null,
}))

vi.mock('@/lib/auth/current-user', () => ({ getCurrentUser: vi.fn(async () => mocks.user) }))
vi.mock('@/lib/auth/household', async () => ({
  getCurrentHouseholdId: (await import('@/test/householdMock')).householdIdMock,
}))
vi.mock('@/lib/supabase/server', () => ({
  createClient: () => ({
    from: (table: string) => ({
      upsert: (rows: { name?: string }) => {
        if (table === 'tag_groups') {
          mocks.groupUpserts.push(rows)
          return { select: () => ({ single: async () => ({ data: { id: `g-${rows.name}` }, error: null }) }) }
        }
        mocks.tagUpserts.push(rows)
        return Promise.resolve({ error: null })
      },
    }),
  }),
}))

import { POST } from './route'
import { householdIdMock } from '@/test/householdMock'

function post(body: unknown) {
  return POST(new NextRequest('http://localhost/api/onboarding/tags', { method: 'POST', body: JSON.stringify(body) }))
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.groupUpserts = []
  mocks.tagUpserts = []
  mocks.user = { id: 'user-1', email: null }
  householdIdMock.mockResolvedValue('hh-1')
})

describe('POST /api/onboarding/tags', () => {
  it('creates each group with its tags, positioned in the order given', async () => {
    const res = await post({ groups: [
      { name: 'Course', tags: ['Soup', 'Dessert'] },
      { name: 'Diet', tags: ['Vegan'] },
    ] })
    expect(res.status).toBe(201)
    expect(mocks.groupUpserts).toEqual([
      { household_id: 'hh-1', name: 'Course', position: 0 },
      { household_id: 'hh-1', name: 'Diet', position: 1 },
    ])
    expect(mocks.tagUpserts).toEqual([
      [
        { household_id: 'hh-1', name: 'Soup', group_id: 'g-Course' },
        { household_id: 'hh-1', name: 'Dessert', group_id: 'g-Course' },
      ],
      [{ household_id: 'hh-1', name: 'Vegan', group_id: 'g-Diet' }],
    ])
  })

  it('skips groups left empty and keeps a tag in the first group that claims it', async () => {
    await post({ groups: [
      { name: 'Course', tags: ['Soup'] },
      { name: 'Diet', tags: [] },
      { name: 'Custom', tags: ['Soup', ' '] },
    ] })
    expect(mocks.groupUpserts).toHaveLength(1)
  })

  it('rejects a malformed body', async () => {
    expect((await post({ groups: 'nope' })).status).toBe(400)
    expect((await post({ groups: [{ name: '', tags: ['x'] }] })).status).toBe(400)
  })

  it('requires a signed-in user with a household', async () => {
    mocks.user = null
    expect((await post({ groups: [] })).status).toBe(401)
    mocks.user = { id: 'user-1', email: null }
    householdIdMock.mockResolvedValue(null)
    expect((await post({ groups: [] })).status).toBe(403)
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/app/api/onboarding/tags/route.test.ts`
Expected: FAIL — cannot resolve `./route`.

- [ ] **Step 3: Implement the route**

`src/app/api/onboarding/tags/route.ts`:

```ts
import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getCurrentUser } from '@/lib/auth/current-user'
import { getCurrentHouseholdId } from '@/lib/auth/household'
import type { TagGroupPayload } from '@/lib/onboarding/tag-catalog'

/**
 * Validates the wizard's payload. Empty groups are dropped, and since tag names
 * are unique per household a name claimed by an earlier group is not repeated.
 */
function parseGroups(value: unknown): TagGroupPayload[] | null {
  if (!Array.isArray(value)) return null
  const seen = new Set<string>()
  const groups: TagGroupPayload[] = []
  for (const raw of value) {
    const group = raw as { name?: unknown; tags?: unknown }
    if (typeof group?.name !== 'string' || !group.name.trim() || !Array.isArray(group.tags)) return null
    const tags: string[] = []
    for (const tag of group.tags) {
      const name = typeof tag === 'string' ? tag.trim() : ''
      if (!name || seen.has(name)) continue
      seen.add(name)
      tags.push(name)
    }
    if (tags.length > 0) groups.push({ name: group.name.trim(), tags })
  }
  return groups
}

export async function POST(request: NextRequest) {
  const supabase = createClient()
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const householdId = await getCurrentHouseholdId()
  if (!householdId) return NextResponse.json({ error: 'No household' }, { status: 403 })

  const body = await request.json() as { groups?: unknown }
  const groups = parseGroups(body.groups)
  if (!groups) return NextResponse.json({ error: 'Invalid groups' }, { status: 400 })

  // Upserts keep a retried step (e.g. after a dropped connection) from failing on unique names.
  for (const [position, group] of groups.entries()) {
    const { data: row, error: groupError } = await supabase
      .from('tag_groups')
      .upsert({ household_id: householdId, name: group.name, position }, { onConflict: 'household_id,name' })
      .select('id')
      .single()
    if (groupError || !row) return NextResponse.json({ error: groupError?.message ?? 'Failed' }, { status: 500 })

    const { error: tagsError } = await supabase
      .from('tags')
      .upsert(
        group.tags.map((name) => ({ household_id: householdId, name, group_id: row.id })),
        { onConflict: 'household_id,name' }
      )
    if (tagsError) return NextResponse.json({ error: tagsError.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true }, { status: 201 })
}
```

- [ ] **Step 4: Run the tags API test**

Run: `npx vitest run src/app/api/onboarding/tags/route.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Write the failing layout test**

`src/app/(app)/layout.test.tsx`:

```tsx
// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  getCurrentProfile: vi.fn(),
  readOnboardingStep: vi.fn(),
}))

vi.mock('next/navigation', () => ({
  redirect: vi.fn((url: string) => { throw new Error(`REDIRECT:${url}`) }),
}))
vi.mock('@/lib/auth/current-user', () => ({
  getCurrentUser: mocks.getCurrentUser,
  getCurrentProfile: mocks.getCurrentProfile,
}))
vi.mock('@/lib/onboarding/status', () => ({ readOnboardingStep: mocks.readOnboardingStep }))
vi.mock('next-intl/server', () => ({ getMessages: vi.fn(async () => ({})), setRequestLocale: vi.fn() }))
vi.mock('next-intl', () => ({ NextIntlClientProvider: ({ children }: { children: unknown }) => children }))
vi.mock('@/components/layout/AppShell', () => ({ AppShell: ({ children }: { children: unknown }) => children }))
vi.mock('@/components/providers/PostHogIdentifier', () => ({ PostHogIdentifier: () => null }))

import AppLayout from './layout'

beforeEach(() => {
  vi.clearAllMocks()
  mocks.getCurrentUser.mockResolvedValue({ id: 'user-1', email: 'a@b.c' })
  mocks.getCurrentProfile.mockResolvedValue({ household_id: 'hh-1', ui_language: 'en' })
})

describe('(app) layout', () => {
  it('sends a user without a household to onboarding', async () => {
    mocks.getCurrentProfile.mockResolvedValue({ household_id: null, ui_language: 'en' })
    await expect(AppLayout({ children: null })).rejects.toThrow('REDIRECT:/onboarding')
  })

  it('sends a household that has not finished the wizard back to it', async () => {
    mocks.readOnboardingStep.mockResolvedValue('tags')
    await expect(AppLayout({ children: null })).rejects.toThrow('REDIRECT:/onboarding')
    expect(mocks.readOnboardingStep).toHaveBeenCalledWith('hh-1')
  })

  it('renders the app once onboarding is finished', async () => {
    mocks.readOnboardingStep.mockResolvedValue(null)
    await expect(AppLayout({ children: null })).resolves.toBeDefined()
  })
})
```

- [ ] **Step 6: Run it to verify it fails**

Run: `npx vitest run "src/app/(app)/layout.test.tsx"`
Expected: FAIL — the second test resolves instead of redirecting.

- [ ] **Step 7: Add the guard**

In `src/app/(app)/layout.tsx` add the import:

```ts
import { readOnboardingStep } from '@/lib/onboarding/status'
```

and right after `if (!profile?.household_id) redirect('/onboarding')` add:

```ts
  if (await readOnboardingStep(profile.household_id)) redirect('/onboarding')
```

- [ ] **Step 8: Run the layout test**

Run: `npx vitest run "src/app/(app)/layout.test.tsx"`
Expected: PASS (3 tests).

- [ ] **Step 9: Commit**

```bash
git add src/app/api/onboarding "src/app/(app)/layout.tsx" "src/app/(app)/layout.test.tsx"
git commit -m "feat: onboarding tags API and guard for unfinished onboarding" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: Copy (en + sk) and shared locale labels

**Files:**
- Modify: `messages/en/auth.json`, `messages/sk/auth.json` (replace the `onboarding` object)
- Modify: `messages/en/errors.json`, `messages/sk/errors.json` (`invalidInviteCode`)
- Modify: `messages/en/settings.json`, `messages/sk/settings.json` (`page` keys)
- Modify: `src/i18n/config.ts`
- Modify: `src/components/settings/InterfaceLanguageSelector.tsx`

- [ ] **Step 1: Replace `onboarding` in `messages/en/auth.json`**

```json
  "onboarding": {
    "headingW": "W",
    "headingRest": "elcome to dapcook",
    "progress": "Step {current} of {total}",
    "next": "Next",
    "skip": "Skip",
    "saveError": "Couldn't save. Please try again.",
    "settingsNote": "You can change this anytime in Settings.",
    "language": {
      "greeting": "Hi! · Ahoj!",
      "title": "Choose your language · Vyberte si jazyk"
    },
    "intro": {
      "title": "Let's set up your kitchen",
      "body": "We'll ask a few quick questions about how you cook and shop. It takes a couple of minutes, but it makes dapcook fit your household much better.",
      "settingsNote": "Everything you choose here can be changed later in Settings.",
      "start": "Let's start"
    },
    "household": {
      "title": "Name your household",
      "help": "This is the shared space for your recipes, meal plans and shopping lists.",
      "nameLabel": "Household name",
      "namePlaceholder": "e.g. Peter & Kim",
      "create": "Create household",
      "haveInvite": "Got an invite link?",
      "inviteLabel": "Invite link",
      "invitePlaceholder": "Paste the link you received",
      "join": "Join household",
      "createInstead": "Create my own household instead"
    },
    "translation": {
      "title": "Translate recipes?",
      "help": "When you import a recipe written in another language, dapcook can translate it for you.",
      "toggle": "Translate imported recipes",
      "languageLabel": "Translate to"
    },
    "units": {
      "title": "Which units do you use?",
      "help": "Imported recipes are converted to your units.",
      "metric": "Metric",
      "imperial": "Imperial",
      "metricExamples": "500 g flour · 250 ml milk · 180 °C",
      "imperialExamples": "1 lb flour · 1 cup milk · 350 °F",
      "spoons": "Spoon measures stay spoons either way: 1 tbsp / 1 PL oil, 1 tsp / 1 ČL salt."
    },
    "tags": {
      "title": "What kind of recipes will you add?",
      "help": "Pick the tags you want to organize your recipes with. Only groups with at least one tag are created.",
      "add": "Add",
      "addPlaceholder": "New tag",
      "addAria": "Add a tag to {group}"
    },
    "shoppingCategories": {
      "title": "Shopping categories",
      "help": "Your shopping list is grouped and ordered by these categories. Arrange them like the aisles of your usual supermarket — drag to reorder, use the pencil to rename."
    },
    "shoppingRules": {
      "title": "Shopping rules",
      "help": "When dapcook builds your shopping list with AI, it follows these rules. Use them to merge similar items or leave out things you always have at home.",
      "examplesLabel": "Tap an example to add it:"
    },
    "done": {
      "title": "You're all set!",
      "body": "Start by adding your first recipe.",
      "cta": "Go to recipes"
    }
  },
```

- [ ] **Step 2: Replace `onboarding` in `messages/sk/auth.json`**

```json
  "onboarding": {
    "headingW": "V",
    "headingRest": "itajte v dapcook",
    "progress": "Krok {current} z {total}",
    "next": "Ďalej",
    "skip": "Preskočiť",
    "saveError": "Nepodarilo sa uložiť. Skúste to znova.",
    "settingsNote": "Toto môžete kedykoľvek zmeniť v Nastaveniach.",
    "language": {
      "greeting": "Hi! · Ahoj!",
      "title": "Choose your language · Vyberte si jazyk"
    },
    "intro": {
      "title": "Poďme nastaviť vašu kuchyňu",
      "body": "Opýtame sa vás pár rýchlych otázok o tom, ako varíte a nakupujete. Zaberie to pár minút, ale dapcook potom bude oveľa lepšie sedieť vašej domácnosti.",
      "settingsNote": "Všetko, čo tu nastavíte, môžete neskôr zmeniť v Nastaveniach.",
      "start": "Poďme na to"
    },
    "household": {
      "title": "Pomenujte svoju domácnosť",
      "help": "Je to spoločný priestor pre vaše recepty, jedálničky a nákupné zoznamy.",
      "nameLabel": "Názov domácnosti",
      "namePlaceholder": "napr. Peter a Kika",
      "create": "Vytvoriť domácnosť",
      "haveInvite": "Máte pozývací odkaz?",
      "inviteLabel": "Pozývací odkaz",
      "invitePlaceholder": "Vložte odkaz, ktorý ste dostali",
      "join": "Pripojiť sa k domácnosti",
      "createInstead": "Radšej vytvorím vlastnú domácnosť"
    },
    "translation": {
      "title": "Prekladať recepty?",
      "help": "Keď importujete recept v inom jazyku, dapcook vám ho môže preložiť.",
      "toggle": "Prekladať importované recepty",
      "languageLabel": "Prekladať do"
    },
    "units": {
      "title": "Aké jednotky používate?",
      "help": "Importované recepty sa prevedú na vaše jednotky.",
      "metric": "Metrické",
      "imperial": "Imperiálne",
      "metricExamples": "500 g múky · 250 ml mlieka · 180 °C",
      "imperialExamples": "1 lb múky · 1 cup mlieka · 350 °F",
      "spoons": "Lyžice ostávajú v oboch prípadoch lyžicami: 1 PL / 1 tbsp oleja, 1 ČL / 1 tsp soli."
    },
    "tags": {
      "title": "Aké recepty budete pridávať?",
      "help": "Vyberte štítky, ktorými budete triediť recepty. Vytvoria sa len skupiny s aspoň jedným štítkom.",
      "add": "Pridať",
      "addPlaceholder": "Nový štítok",
      "addAria": "Pridať štítok do skupiny {group}"
    },
    "shoppingCategories": {
      "title": "Kategórie nákupu",
      "help": "Nákupný zoznam je zoskupený a zoradený podľa týchto kategórií. Usporiadajte ich ako uličky vo vašom obvyklom supermarkete — poradie zmeníte potiahnutím, názov ceruzkou."
    },
    "shoppingRules": {
      "title": "Pravidlá nákupu",
      "help": "Keď dapcook zostavuje nákupný zoznam pomocou AI, riadi sa týmito pravidlami. Môžete nimi zlúčiť podobné položky alebo vynechať veci, ktoré máte doma vždy.",
      "examplesLabel": "Ťuknutím pridáte príklad:"
    },
    "done": {
      "title": "Všetko je pripravené!",
      "body": "Začnite pridaním prvého receptu.",
      "cta": "Prejsť na recepty"
    }
  },
```

- [ ] **Step 3: Errors and settings copy**

- `messages/en/errors.json`: `"invalidInviteCode": "Invalid invite link"`
- `messages/sk/errors.json`: `"invalidInviteCode": "Neplatný pozývací odkaz"`
- `messages/en/settings.json`, inside `"page"` after `"name": "Name",` add:
  `"rename": "Rename", "save": "Save", "cancel": "Cancel", "nameSaveError": "Couldn't save the name.",`
- `messages/sk/settings.json`, inside `"page"` after `"name"` add:
  `"rename": "Premenovať", "save": "Uložiť", "cancel": "Zrušiť", "nameSaveError": "Názov sa nepodarilo uložiť.",`

- [ ] **Step 4: Share locale labels**

Append to `src/i18n/config.ts`:

```ts
/** Each interface language named in itself, for language pickers. */
export const LOCALE_LABELS: Record<Locale, string> = {
  en: 'English',
  sk: 'Slovenčina',
}
```

In `src/components/settings/InterfaceLanguageSelector.tsx` delete the local `LOCALE_LABELS` constant and import it: `import { locales, LOCALE_LABELS, type Locale } from '@/i18n/config'`.

- [ ] **Step 5: Verify nothing still reads the removed keys**

Run: `grep -rn "onboarding\.\(createHeading\|joinHeading\|subtitle\|inviteCode\|householdName\|createButton\|joinButton\|createHelp\|joinHelp\|heading'\)" src`
Expected: only hits in `src/app/onboarding/page.tsx` / `page.test.tsx` (both replaced in Task 12).

Run: `npx vitest run src/components/settings/InterfaceLanguageSelector.test.tsx`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add messages src/i18n/config.ts src/components/settings/InterfaceLanguageSelector.tsx
git commit -m "feat: onboarding wizard copy in English and Slovak" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11: Wizard building blocks and the first three steps

**Files:**
- Create: `src/components/onboarding/send-json.ts`
- Create: `src/components/onboarding/StepFrame.tsx`
- Create: `src/components/onboarding/steps/LanguageStep.tsx`
- Create: `src/components/onboarding/steps/HouseholdStep.tsx`
- Create: `src/components/onboarding/steps/steps.test.tsx`

- [ ] **Step 1: Write the failing tests**

`src/components/onboarding/steps/steps.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import type { TranslationValues } from 'use-intl'
import { mockTranslate } from '@/test/mockMessages'
import { LanguageStep } from './LanguageStep'
import { HouseholdStep } from './HouseholdStep'

const refreshMock = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: refreshMock, push: vi.fn() }) }))
vi.mock('next-intl', () => ({
  useTranslations: (namespace: string) => (key: string, values?: TranslationValues) =>
    mockTranslate(namespace, key, values),
}))
const actions = vi.hoisted(() => ({ createHousehold: vi.fn(), joinHousehold: vi.fn() }))
vi.mock('@/lib/auth/actions', () => actions)

global.fetch = vi.fn()

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(fetch).mockResolvedValue({ ok: true } as Response)
})

describe('LanguageStep', () => {
  it('saves the chosen language, re-renders the app in it and moves on', async () => {
    const onNext = vi.fn(async () => {})
    render(<LanguageStep onNext={onNext} />)
    fireEvent.click(screen.getByRole('button', { name: 'Slovenčina' }))
    await waitFor(() => expect(onNext).toHaveBeenCalled())
    expect(fetch).toHaveBeenCalledWith('/api/profile', expect.objectContaining({
      method: 'PATCH',
      body: JSON.stringify({ ui_language: 'sk' }),
    }))
    expect(refreshMock).toHaveBeenCalled()
  })

  it('stays put and says so when saving fails', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: false } as Response)
    const onNext = vi.fn(async () => {})
    render(<LanguageStep onNext={onNext} />)
    fireEvent.click(screen.getByRole('button', { name: 'English' }))
    expect(await screen.findByText("Couldn't save. Please try again.")).toBeInTheDocument()
    expect(onNext).not.toHaveBeenCalled()
  })
})

describe('HouseholdStep', () => {
  it('creates a household with the typed name', async () => {
    const onSubmit = vi.fn()
    render(<HouseholdStep onSubmit={onSubmit} />)
    fireEvent.change(screen.getByLabelText('Household name'), { target: { value: 'Home' } })
    fireEvent.click(screen.getByRole('button', { name: 'Create household' }))
    await waitFor(() => expect(actions.createHousehold).toHaveBeenCalledWith('Home'))
    expect(onSubmit).toHaveBeenCalledWith('create')
  })

  it('offers joining by invite link only on request', async () => {
    render(<HouseholdStep onSubmit={vi.fn()} />)
    expect(screen.queryByLabelText('Invite link')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Got an invite link?' }))
    fireEvent.change(screen.getByLabelText('Invite link'), { target: { value: 'https://x/join/abc' } })
    fireEvent.click(screen.getByRole('button', { name: 'Join household' }))
    await waitFor(() => expect(actions.joinHousehold).toHaveBeenCalledWith('https://x/join/abc'))
  })

  it('shows the error returned by the action', async () => {
    actions.joinHousehold.mockResolvedValue({ error: 'Invalid invite link' })
    render(<HouseholdStep onSubmit={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Got an invite link?' }))
    fireEvent.change(screen.getByLabelText('Invite link'), { target: { value: 'nope' } })
    fireEvent.click(screen.getByRole('button', { name: 'Join household' }))
    expect(await screen.findByText('Invalid invite link')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run src/components/onboarding/steps/steps.test.tsx`
Expected: FAIL — cannot resolve `./LanguageStep`.

- [ ] **Step 3: `send-json.ts`**

```ts
/** Sends a JSON request and reports only whether it succeeded. */
export async function sendJson(method: 'PATCH' | 'POST', url: string, body: unknown): Promise<boolean> {
  try {
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    return res.ok
  } catch {
    return false
  }
}
```

- [ ] **Step 4: `StepFrame.tsx`**

```tsx
'use client'

import { useState, type ReactNode } from 'react'
import { useTranslations } from 'next-intl'

interface StepFrameProps {
  title: string
  help?: string
  children?: ReactNode
  error?: string | null
  onNext: () => Promise<void> | void
  nextLabel?: string
  onSkip?: () => Promise<void> | void
  /** Shows "You can change this anytime in Settings." under the buttons. */
  settingsNote?: boolean
}

export function StepFrame({ title, help, children, error, onNext, nextLabel, onSkip, settingsNote }: StepFrameProps) {
  const t = useTranslations('auth')
  const [busy, setBusy] = useState(false)

  async function run(action: () => Promise<void> | void) {
    setBusy(true)
    try {
      await action()
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="bg-white rounded-xl border border-gray-200 p-6 space-y-5">
      <div>
        <h2 className="font-semibold text-gray-900">{title}</h2>
        {help && <p className="mt-1 text-sm text-gray-500">{help}</p>}
      </div>

      {children}

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex items-center justify-end gap-3 pt-1">
        {onSkip && (
          <button
            type="button"
            disabled={busy}
            onClick={() => run(onSkip)}
            className="px-4 py-2 text-sm font-medium text-gray-500 hover:text-gray-900 disabled:opacity-50"
          >
            {t('onboarding.skip')}
          </button>
        )}
        <button
          type="button"
          disabled={busy}
          onClick={() => run(onNext)}
          className="px-4 py-2 bg-gray-900 text-white text-sm font-medium rounded-md hover:bg-gray-700 transition-colors disabled:opacity-50"
        >
          {nextLabel ?? t('onboarding.next')}
        </button>
      </div>

      {settingsNote && <p className="text-xs text-gray-400 text-right">{t('onboarding.settingsNote')}</p>}
    </section>
  )
}
```

- [ ] **Step 5: `LanguageStep.tsx`**

```tsx
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { locales, LOCALE_LABELS, type Locale } from '@/i18n/config'
import { sendJson } from '../send-json'

export function LanguageStep({ onNext }: { onNext: () => Promise<void> }) {
  const t = useTranslations('auth')
  const router = useRouter()
  const [saving, setSaving] = useState<Locale | null>(null)
  const [failed, setFailed] = useState(false)

  async function choose(locale: Locale) {
    setSaving(locale)
    setFailed(false)
    const ok = await sendJson('PATCH', '/api/profile', { ui_language: locale })
    if (!ok) {
      setSaving(null)
      setFailed(true)
      return
    }
    // Re-renders the server layout so every later step is already in this language.
    router.refresh()
    await onNext()
  }

  return (
    <section className="bg-white rounded-xl border border-gray-200 p-6 space-y-5 text-center">
      <div>
        <p className="text-2xl">{t('onboarding.language.greeting')}</p>
        <h2 className="mt-2 font-semibold text-gray-900">{t('onboarding.language.title')}</h2>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {locales.map((locale) => (
          <button
            key={locale}
            type="button"
            disabled={saving !== null}
            onClick={() => choose(locale)}
            className="px-4 py-4 border border-gray-300 rounded-xl text-base font-medium text-gray-900 hover:border-emerald-600 hover:bg-emerald-50 transition-colors disabled:opacity-50"
          >
            {LOCALE_LABELS[locale]}
          </button>
        ))}
      </div>
      {failed && <p className="text-sm text-red-600">{t('onboarding.saveError')}</p>}
    </section>
  )
}
```

- [ ] **Step 6: `HouseholdStep.tsx`**

```tsx
'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { createHousehold, joinHousehold } from '@/lib/auth/actions'

interface Props {
  /** Called right before the server action runs — the action redirects, so nothing runs after it. */
  onSubmit: (method: 'create' | 'join') => void
}

export function HouseholdStep({ onSubmit }: Props) {
  const t = useTranslations('auth')
  const [mode, setMode] = useState<'create' | 'join'>('create')
  const [name, setName] = useState('')
  const [invite, setInvite] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setPending(true)
    onSubmit(mode)
    const result = mode === 'create' ? await createHousehold(name) : await joinHousehold(invite)
    setPending(false)
    if (result?.error) setError(result.error)
  }

  const inputClass =
    'w-full px-3 py-2 border border-gray-300 rounded-md text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-gray-400'

  return (
    <section className="bg-white rounded-xl border border-gray-200 p-6 space-y-5">
      <div>
        <h2 className="font-semibold text-gray-900">{t('onboarding.household.title')}</h2>
        <p className="mt-1 text-sm text-gray-500">{t('onboarding.household.help')}</p>
      </div>

      <form onSubmit={submit} className="space-y-3">
        {mode === 'create' ? (
          <div>
            <label htmlFor="household-name" className="block text-sm font-medium text-gray-700 mb-1">
              {t('onboarding.household.nameLabel')}
            </label>
            <input
              id="household-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('onboarding.household.namePlaceholder')}
              required
              maxLength={80}
              className={inputClass}
            />
          </div>
        ) : (
          <div>
            <label htmlFor="invite-link" className="block text-sm font-medium text-gray-700 mb-1">
              {t('onboarding.household.inviteLabel')}
            </label>
            <input
              id="invite-link"
              value={invite}
              onChange={(e) => setInvite(e.target.value)}
              placeholder={t('onboarding.household.invitePlaceholder')}
              required
              className={inputClass}
            />
          </div>
        )}

        {error && <p className="text-sm text-red-600">{error}</p>}

        <button
          type="submit"
          disabled={pending}
          className="w-full px-4 py-2 bg-gray-900 text-white text-sm font-medium rounded-md hover:bg-gray-700 transition-colors disabled:opacity-50"
        >
          {mode === 'create' ? t('onboarding.household.create') : t('onboarding.household.join')}
        </button>
      </form>

      <button
        type="button"
        onClick={() => { setMode(mode === 'create' ? 'join' : 'create'); setError(null) }}
        className="block mx-auto text-sm text-gray-500 underline hover:text-gray-900"
      >
        {mode === 'create' ? t('onboarding.household.haveInvite') : t('onboarding.household.createInstead')}
      </button>
    </section>
  )
}
```

- [ ] **Step 7: Run the tests**

Run: `npx vitest run src/components/onboarding/steps/steps.test.tsx`
Expected: PASS (5 tests).

- [ ] **Step 8: Commit**

```bash
git add src/components/onboarding
git commit -m "feat: onboarding frame, language and household steps" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 12: Translation, units and tags steps

**Files:**
- Create: `src/components/onboarding/steps/TranslationStep.tsx`
- Create: `src/components/onboarding/steps/UnitsStep.tsx`
- Create: `src/components/onboarding/steps/TagsStep.tsx`
- Modify: `src/components/onboarding/steps/steps.test.tsx`

All three share this props shape; each saves, then calls `onNext`. Skip bypasses the save.

- [ ] **Step 1: Add the failing tests**

Add to the imports of `steps.test.tsx`:

```tsx
import { TranslationStep } from './TranslationStep'
import { UnitsStep } from './UnitsStep'
import { TagsStep } from './TagsStep'
```

Append:

```tsx
describe('TranslationStep', () => {
  it('saves the toggle and target language, defaulting to the interface language', async () => {
    const onNext = vi.fn(async () => {})
    render(<TranslationStep onNext={onNext} onSkip={vi.fn()} initialEnabled={false} initialLanguage="en" defaultLanguage="sk" />)
    expect(screen.queryByRole('button', { name: 'Slovak' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('switch', { name: 'Translate imported recipes' }))
    expect(screen.getByRole('button', { name: 'Slovak' })).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    await waitFor(() => expect(onNext).toHaveBeenCalled())
    expect(fetch).toHaveBeenCalledWith('/api/household', expect.objectContaining({
      body: JSON.stringify({ translation_enabled: true, preferred_language: 'sk' }),
    }))
  })
})

describe('UnitsStep', () => {
  it('shows examples for both systems, including spoons, and saves the choice', async () => {
    const onNext = vi.fn(async () => {})
    render(<UnitsStep onNext={onNext} onSkip={vi.fn()} initialUnits="metric" />)
    expect(screen.getByText('500 g flour · 250 ml milk · 180 °C')).toBeInTheDocument()
    expect(screen.getByText(/1 tbsp \/ 1 PL oil/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Imperial/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    await waitFor(() => expect(onNext).toHaveBeenCalled())
    expect(fetch).toHaveBeenCalledWith('/api/household', expect.objectContaining({
      body: JSON.stringify({ preferred_units: 'imperial' }),
    }))
  })
})

describe('TagsStep', () => {
  it('sends only the picked groups, custom tags included', async () => {
    const onNext = vi.fn(async () => {})
    render(<TagsStep onNext={onNext} onSkip={vi.fn()} locale="en" />)
    fireEvent.click(screen.getByRole('button', { name: 'Soup' }))
    fireEvent.click(screen.getByRole('button', { name: 'Add a tag to Diet' }))
    fireEvent.change(screen.getByPlaceholderText('New tag'), { target: { value: 'Paleo' } })
    fireEvent.keyDown(screen.getByPlaceholderText('New tag'), { key: 'Enter' })
    expect(screen.getByRole('button', { name: 'Paleo' })).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    await waitFor(() => expect(onNext).toHaveBeenCalled())
    expect(fetch).toHaveBeenCalledWith('/api/onboarding/tags', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ groups: [
        { name: 'Course', tags: ['Soup'] },
        { name: 'Diet', tags: ['Paleo'] },
      ] }),
    }))
  })

  it('moves on without a request when nothing is picked', async () => {
    const onNext = vi.fn(async () => {})
    render(<TagsStep onNext={onNext} onSkip={vi.fn()} locale="en" />)
    fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    await waitFor(() => expect(onNext).toHaveBeenCalled())
    expect(fetch).not.toHaveBeenCalled()
  })

  it('stays on the step when saving fails', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: false } as Response)
    const onNext = vi.fn(async () => {})
    render(<TagsStep onNext={onNext} onSkip={vi.fn()} locale="en" />)
    fireEvent.click(screen.getByRole('button', { name: 'Soup' }))
    fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    expect(await screen.findByText("Couldn't save. Please try again.")).toBeInTheDocument()
    expect(onNext).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run src/components/onboarding/steps/steps.test.tsx`
Expected: FAIL — cannot resolve `./TranslationStep`.

- [ ] **Step 3: `TranslationStep.tsx`**

```tsx
'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { SUPPORTED_LANGUAGES } from '@/lib/constants/languages'
import { StepFrame } from '../StepFrame'
import { sendJson } from '../send-json'

interface Props {
  onNext: () => Promise<void>
  onSkip: () => Promise<void>
  initialEnabled: boolean
  initialLanguage: string
  /** Suggested target when translation was off — the interface language. */
  defaultLanguage: string
}

export function TranslationStep({ onNext, onSkip, initialEnabled, initialLanguage, defaultLanguage }: Props) {
  const t = useTranslations('auth')
  const [enabled, setEnabled] = useState(initialEnabled)
  const [language, setLanguage] = useState(initialEnabled ? initialLanguage : defaultLanguage)
  const [failed, setFailed] = useState(false)

  async function save() {
    setFailed(false)
    const ok = await sendJson('PATCH', '/api/household', { translation_enabled: enabled, preferred_language: language })
    if (!ok) return setFailed(true)
    await onNext()
  }

  return (
    <StepFrame
      title={t('onboarding.translation.title')}
      help={t('onboarding.translation.help')}
      error={failed ? t('onboarding.saveError') : null}
      onNext={save}
      onSkip={onSkip}
      settingsNote
    >
      <button
        type="button"
        role="switch"
        aria-checked={enabled}
        onClick={() => setEnabled(!enabled)}
        className="flex items-center gap-3 text-sm text-gray-900"
      >
        <span className={`relative inline-flex h-6 w-11 rounded-full transition-colors ${enabled ? 'bg-emerald-600' : 'bg-gray-300'}`}>
          <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform ${enabled ? 'translate-x-5' : 'translate-x-0.5'}`} />
        </span>
        {t('onboarding.translation.toggle')}
      </button>

      {enabled && (
        <div>
          <p className="text-xs text-gray-500 mb-2">{t('onboarding.translation.languageLabel')}</p>
          <div className="flex flex-wrap gap-2">
            {SUPPORTED_LANGUAGES.map((lang) => (
              <button
                key={lang.code}
                type="button"
                aria-pressed={language === lang.code}
                onClick={() => setLanguage(lang.code)}
                className={`px-3 py-1.5 text-sm rounded-full border transition-colors ${
                  language === lang.code
                    ? 'bg-gray-900 text-white border-gray-900'
                    : 'bg-white text-gray-700 border-gray-300 hover:border-gray-500'
                }`}
              >
                {lang.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </StepFrame>
  )
}
```

- [ ] **Step 4: `UnitsStep.tsx`**

```tsx
'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { StepFrame } from '../StepFrame'
import { sendJson } from '../send-json'

type Units = 'metric' | 'imperial'

interface Props {
  onNext: () => Promise<void>
  onSkip: () => Promise<void>
  initialUnits: Units
}

export function UnitsStep({ onNext, onSkip, initialUnits }: Props) {
  const t = useTranslations('auth')
  const [units, setUnits] = useState<Units>(initialUnits)
  const [failed, setFailed] = useState(false)

  async function save() {
    setFailed(false)
    const ok = await sendJson('PATCH', '/api/household', { preferred_units: units })
    if (!ok) return setFailed(true)
    await onNext()
  }

  const options: Array<{ value: Units; label: string; examples: string }> = [
    { value: 'metric', label: t('onboarding.units.metric'), examples: t('onboarding.units.metricExamples') },
    { value: 'imperial', label: t('onboarding.units.imperial'), examples: t('onboarding.units.imperialExamples') },
  ]

  return (
    <StepFrame
      title={t('onboarding.units.title')}
      help={t('onboarding.units.help')}
      error={failed ? t('onboarding.saveError') : null}
      onNext={save}
      onSkip={onSkip}
      settingsNote
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            aria-pressed={units === option.value}
            onClick={() => setUnits(option.value)}
            className={`text-left p-4 rounded-xl border transition-colors ${
              units === option.value ? 'border-emerald-600 bg-emerald-50' : 'border-gray-300 hover:border-gray-500'
            }`}
          >
            <span className="block text-sm font-semibold text-gray-900">{option.label}</span>
            <span className="block mt-1 text-sm text-gray-600">{option.examples}</span>
          </button>
        ))}
      </div>
      <p className="text-xs text-gray-500">{t('onboarding.units.spoons')}</p>
    </StepFrame>
  )
}
```

- [ ] **Step 5: `TagsStep.tsx`**

```tsx
'use client'

import { useState } from 'react'
import { Plus } from 'lucide-react'
import { useTranslations } from 'next-intl'
import type { Locale } from '@/i18n/config'
import { TAG_CATALOG, buildTagGroupsPayload } from '@/lib/onboarding/tag-catalog'
import { StepFrame } from '../StepFrame'
import { sendJson } from '../send-json'

interface Props {
  onNext: () => Promise<void>
  onSkip: () => Promise<void>
  locale: Locale
}

export function TagsStep({ onNext, onSkip, locale }: Props) {
  const t = useTranslations('auth')
  const [selected, setSelected] = useState<Record<string, string[]>>({})
  const [custom, setCustom] = useState<Record<string, string[]>>({})
  const [addingTo, setAddingTo] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [failed, setFailed] = useState(false)

  function toggle(groupId: string, name: string) {
    setSelected((prev) => {
      const current = prev[groupId] ?? []
      return {
        ...prev,
        [groupId]: current.includes(name) ? current.filter((n) => n !== name) : [...current, name],
      }
    })
  }

  function addCustom(groupId: string) {
    const name = draft.trim()
    setDraft('')
    setAddingTo(null)
    if (!name) return
    setCustom((prev) => ({ ...prev, [groupId]: [...new Set([...(prev[groupId] ?? []), name])] }))
    setSelected((prev) => ({ ...prev, [groupId]: [...new Set([...(prev[groupId] ?? []), name])] }))
  }

  async function save() {
    setFailed(false)
    const groups = buildTagGroupsPayload(selected, locale)
    if (groups.length > 0 && !(await sendJson('POST', '/api/onboarding/tags', { groups }))) {
      return setFailed(true)
    }
    await onNext()
  }

  return (
    <StepFrame
      title={t('onboarding.tags.title')}
      help={t('onboarding.tags.help')}
      error={failed ? t('onboarding.saveError') : null}
      onNext={save}
      onSkip={onSkip}
      settingsNote
    >
      <div className="space-y-5">
        {TAG_CATALOG.map((group) => {
          const names = [...group.tags.map((tag) => tag[locale]), ...(custom[group.id] ?? [])]
          const picked = selected[group.id] ?? []
          return (
            <div key={group.id}>
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">{group.name[locale]}</p>
              <div className="flex flex-wrap gap-1.5">
                {names.map((name) => (
                  <button
                    key={name}
                    type="button"
                    aria-pressed={picked.includes(name)}
                    onClick={() => toggle(group.id, name)}
                    className={`px-2.5 py-1 text-xs rounded-full border transition-colors ${
                      picked.includes(name)
                        ? 'bg-emerald-600 text-white border-emerald-600'
                        : 'bg-white text-gray-700 border-gray-300 hover:border-gray-500'
                    }`}
                  >
                    {name}
                  </button>
                ))}
                {addingTo === group.id ? (
                  <input
                    autoFocus
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') addCustom(group.id)
                      if (e.key === 'Escape') { setAddingTo(null); setDraft('') }
                    }}
                    onBlur={() => addCustom(group.id)}
                    placeholder={t('onboarding.tags.addPlaceholder')}
                    className="px-2.5 py-1 text-xs rounded-full border border-gray-300 focus:outline-none focus:ring-2 focus:ring-gray-300 w-28"
                  />
                ) : (
                  <button
                    type="button"
                    aria-label={t('onboarding.tags.addAria', { group: group.name[locale] })}
                    onClick={() => setAddingTo(group.id)}
                    className="inline-flex items-center gap-1 px-2.5 py-1 text-xs rounded-full border border-dashed border-gray-300 text-gray-500 hover:text-gray-900"
                  >
                    <Plus size={12} />
                    {t('onboarding.tags.add')}
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </StepFrame>
  )
}
```

- [ ] **Step 6: Run the tests**

Run: `npx vitest run src/components/onboarding/steps/steps.test.tsx`
Expected: PASS (10 tests).

- [ ] **Step 7: Commit**

```bash
git add src/components/onboarding/steps
git commit -m "feat: translation, units and tags onboarding steps" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 13: Shopping rule suggestions

**Files:**
- Modify: `src/components/settings/ShoppingRulesEditor.tsx`
- Create: `src/components/settings/ShoppingRulesEditor.test.tsx`

- [ ] **Step 1: Write the failing test**

`src/components/settings/ShoppingRulesEditor.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { mockTranslate } from '@/test/mockMessages'
import { ShoppingRulesEditor } from './ShoppingRulesEditor'
import type { ShoppingRule } from '@/types/database'

vi.mock('next-intl', () => ({
  useTranslations: (namespace: string) => (key: string) => mockTranslate(namespace, key),
}))

global.fetch = vi.fn()

const existing = { id: 'r1', household_id: 'hh-1', rule: 'Merge onions', created_at: '' } as ShoppingRule

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(fetch).mockResolvedValue({
    ok: true,
    json: async () => ({ id: 'r2', household_id: 'hh-1', rule: 'Count eggs', created_at: '' }),
  } as Response)
})

describe('ShoppingRulesEditor suggestions', () => {
  it('adds a suggestion as a rule with one tap and stops offering it', async () => {
    render(<ShoppingRulesEditor initialRules={[]} suggestions={['Count eggs']} suggestionsLabel="Tap an example" />)
    fireEvent.click(screen.getByRole('button', { name: '+ Count eggs' }))
    await waitFor(() => expect(screen.queryByRole('button', { name: '+ Count eggs' })).not.toBeInTheDocument())
    expect(fetch).toHaveBeenCalledWith('/api/shopping/rules', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ rule: 'Count eggs' }),
    }))
    expect(screen.getByText('Count eggs')).toBeInTheDocument()
  })

  it('does not offer suggestions that are already rules', () => {
    render(<ShoppingRulesEditor initialRules={[existing]} suggestions={['Merge onions']} suggestionsLabel="Tap an example" />)
    expect(screen.queryByText('Tap an example')).not.toBeInTheDocument()
  })

  it('renders no suggestions by default (settings page)', () => {
    render(<ShoppingRulesEditor initialRules={[existing]} />)
    expect(screen.queryByRole('button', { name: /^\+ / })).not.toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/components/settings/ShoppingRulesEditor.test.tsx`
Expected: FAIL — no `+ Count eggs` button.

- [ ] **Step 3: Implement**

In `src/components/settings/ShoppingRulesEditor.tsx`:

Replace the `Props` interface and the start of the component through `handleAddRule` with:

```tsx
interface Props {
  initialRules: ShoppingRule[]
  /** One-tap rules offered below the list (used by onboarding). */
  suggestions?: string[]
  suggestionsLabel?: string
}

export function ShoppingRulesEditor({ initialRules, suggestions = [], suggestionsLabel }: Props) {
  const t = useTranslations('settings')
  const [rules, setRules] = useState<ShoppingRule[]>(initialRules)
  const [addingRule, setAddingRule] = useState(false)
  const [newRule, setNewRule] = useState('')

  async function addRule(text: string) {
    const rule = text.trim()
    if (!rule) return
    const res = await fetch('/api/shopping/rules', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rule }),
    })
    if (res.ok) {
      const created = await res.json() as ShoppingRule
      setRules((prev) => [...prev, created])
    }
  }

  async function handleAddRule() {
    await addRule(newRule)
    setNewRule('')
    setAddingRule(false)
  }

  const remainingSuggestions = suggestions.filter((s) => !rules.some((r) => r.rule === s))
```

Then, just before the final closing `</div>` of the returned JSX (after the add-rule `)}`), add:

```tsx
      {remainingSuggestions.length > 0 && (
        <div className="mt-4">
          {suggestionsLabel && <p className="text-xs text-gray-500 mb-2">{suggestionsLabel}</p>}
          <div className="flex flex-wrap gap-1.5">
            {remainingSuggestions.map((suggestion) => (
              <button
                key={suggestion}
                type="button"
                onClick={() => addRule(suggestion)}
                className="px-2.5 py-1 text-xs rounded-full border border-dashed border-gray-300 text-gray-600 hover:border-gray-500 hover:text-gray-900"
              >
                {`+ ${suggestion}`}
              </button>
            ))}
          </div>
        </div>
      )}
```

- [ ] **Step 4: Run the test**

Run: `npx vitest run src/components/settings/ShoppingRulesEditor.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/settings/ShoppingRulesEditor.tsx src/components/settings/ShoppingRulesEditor.test.tsx
git commit -m "feat: one-tap suggestions in the shopping rules editor" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 14: `OnboardingWizard`, onboarding layout and page

**Files:**
- Create: `src/components/onboarding/OnboardingWizard.tsx`
- Create: `src/components/onboarding/OnboardingWizard.test.tsx`
- Modify: `src/app/onboarding/layout.tsx`
- Rewrite: `src/app/onboarding/page.tsx`
- Delete: `src/app/onboarding/page.test.tsx` (covered by the wizard + step tests)

- [ ] **Step 1: Write the failing wizard test**

`src/components/onboarding/OnboardingWizard.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import type { TranslationValues } from 'use-intl'
import { mockTranslate } from '@/test/mockMessages'
import { OnboardingWizard } from './OnboardingWizard'

const capture = vi.fn()
const push = vi.fn()
vi.mock('posthog-js/react', () => ({ usePostHog: () => ({ capture }) }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn(), push }) }))
vi.mock('next-intl', () => ({
  useTranslations: (namespace: string) => (key: string, values?: TranslationValues) =>
    mockTranslate(namespace, key, values),
}))
vi.mock('@/lib/auth/actions', () => ({ createHousehold: vi.fn(), joinHousehold: vi.fn() }))

global.fetch = vi.fn()

const household = { translationEnabled: false, preferredLanguage: 'en', preferredUnits: 'metric' as const }

function bodies() {
  return vi.mocked(fetch).mock.calls.map(([url, init]) => [url, (init as RequestInit).body])
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(fetch).mockResolvedValue({ ok: true } as Response)
})

describe('OnboardingWizard', () => {
  it('uses the page heading style with a green first letter', () => {
    render(<OnboardingWizard initialStep="language" locale="en" />)
    const heading = screen.getByRole('heading', { level: 1 })
    expect(heading).toHaveTextContent('Welcome to dapcook')
    expect(heading.querySelector('span')).toHaveClass('text-emerald-700')
  })

  it('goes from language to intro to household, tracking each step', async () => {
    render(<OnboardingWizard initialStep="language" locale="en" />)
    fireEvent.click(screen.getByRole('button', { name: 'English' }))
    fireEvent.click(await screen.findByRole('button', { name: "Let's start" }))
    expect(await screen.findByLabelText('Household name')).toBeInTheDocument()
    expect(screen.getByText('Step 2 of 8')).toBeInTheDocument()
    expect(capture).toHaveBeenCalledWith('onboarding_step_completed', { step: 'language', skipped: false })
    expect(capture).toHaveBeenCalledWith('onboarding_step_completed', { step: 'intro', skipped: false })
  })

  it('skipping a step stores the next one without saving anything else', async () => {
    render(<OnboardingWizard initialStep="translation" locale="en" household={household} />)
    fireEvent.click(screen.getByRole('button', { name: 'Skip' }))
    expect(await screen.findByText('Which units do you use?')).toBeInTheDocument()
    expect(bodies()).toEqual([['/api/household', JSON.stringify({ onboarding_step: 'units' })]])
    expect(capture).toHaveBeenCalledWith('onboarding_step_completed', { step: 'translation', skipped: true })
  })

  it('saves the step, then stores the next one', async () => {
    render(<OnboardingWizard initialStep="units" locale="en" household={household} />)
    fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    expect(await screen.findByText('What kind of recipes will you add?')).toBeInTheDocument()
    expect(bodies()).toEqual([
      ['/api/household', JSON.stringify({ preferred_units: 'metric' })],
      ['/api/household', JSON.stringify({ onboarding_step: 'tags' })],
    ])
  })

  it('stays on the step when the progress cannot be stored', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: false } as Response)
    render(<OnboardingWizard initialStep="translation" locale="en" household={household} />)
    fireEvent.click(screen.getByRole('button', { name: 'Skip' }))
    expect(await screen.findByText("Couldn't save. Please try again.")).toBeInTheDocument()
    expect(screen.getByText('Translate recipes?')).toBeInTheDocument()
  })

  it('offers rule examples, finishes onboarding and lands on recipes', async () => {
    render(<OnboardingWizard initialStep="shopping_rules" locale="en" household={household} rules={[]} />)
    expect(screen.getByRole('button', { name: '+ Count eggs in pieces, not grams' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Go to recipes' }))
    expect(bodies()).toEqual([['/api/household', JSON.stringify({ onboarding_step: null })]])
    expect(push).toHaveBeenCalledWith('/recipes?ob=1')
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/components/onboarding/OnboardingWizard.test.tsx`
Expected: FAIL — cannot resolve `./OnboardingWizard`.

- [ ] **Step 3: Implement `OnboardingWizard.tsx`**

```tsx
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { usePostHog } from 'posthog-js/react'
import type { Locale } from '@/i18n/config'
import type { ShoppingCategory, ShoppingRule } from '@/types/database'
import {
  isPersistedStep,
  nextStep,
  persistedStepAfter,
  stepNumber,
  TOTAL_STEPS,
  type OnboardingStep,
} from '@/lib/onboarding/steps'
import { SHOPPING_RULE_EXAMPLES } from '@/lib/onboarding/defaults'
import { ShoppingCategoriesEditor } from '@/components/settings/ShoppingCategoriesEditor'
import { ShoppingRulesEditor } from '@/components/settings/ShoppingRulesEditor'
import { StepFrame } from './StepFrame'
import { sendJson } from './send-json'
import { LanguageStep } from './steps/LanguageStep'
import { HouseholdStep } from './steps/HouseholdStep'
import { TranslationStep } from './steps/TranslationStep'
import { UnitsStep } from './steps/UnitsStep'
import { TagsStep } from './steps/TagsStep'

export interface OnboardingHousehold {
  translationEnabled: boolean
  preferredLanguage: string
  preferredUnits: 'metric' | 'imperial'
}

interface Props {
  initialStep: OnboardingStep
  locale: Locale
  /** Present once the household exists (steps from `translation` on). */
  household?: OnboardingHousehold
  categories?: ShoppingCategory[]
  rules?: ShoppingRule[]
}

export function OnboardingWizard({ initialStep, locale, household, categories = [], rules = [] }: Props) {
  const t = useTranslations('auth')
  const router = useRouter()
  const posthog = usePostHog()
  const [step, setStep] = useState<OnboardingStep>(initialStep)
  const [error, setError] = useState<string | null>(null)

  function track(completed: OnboardingStep, skipped: boolean) {
    posthog?.capture('onboarding_step_completed', { step: completed, skipped })
  }

  /** Leaves `current`. Persisted steps record where to resume before moving on. */
  async function advance(current: OnboardingStep, skipped = false) {
    setError(null)
    if (isPersistedStep(current)) {
      const ok = await sendJson('PATCH', '/api/household', { onboarding_step: persistedStepAfter(current) })
      if (!ok) {
        setError(t('onboarding.saveError'))
        return
      }
    }
    track(current, skipped)
    setStep(nextStep(current))
  }

  const next = () => advance(step)
  const skip = () => advance(step, true)
  const number = stepNumber(step)

  return (
    <div className="min-h-screen bg-gray-50 px-4 py-10">
      <div className="max-w-lg mx-auto space-y-6">
        <div className="text-center space-y-3">
          <h1 className="text-2xl font-semibold text-gray-900 font-fraunces">
            <span className="text-emerald-700">{t('onboarding.headingW')}</span>
            {t('onboarding.headingRest')}
          </h1>
          {number > 0 && (
            <div className="space-y-1.5">
              <p className="text-xs text-gray-500">{t('onboarding.progress', { current: number, total: TOTAL_STEPS })}</p>
              <div className="h-1 bg-gray-200 rounded-full overflow-hidden">
                <div className="h-full bg-emerald-600 transition-all" style={{ width: `${(number / TOTAL_STEPS) * 100}%` }} />
              </div>
            </div>
          )}
        </div>

        {step === 'language' && <LanguageStep onNext={next} />}

        {step === 'intro' && (
          <StepFrame title={t('onboarding.intro.title')} onNext={next} nextLabel={t('onboarding.intro.start')}>
            <p className="text-sm text-gray-600">{t('onboarding.intro.body')}</p>
            <p className="text-sm text-gray-500">{t('onboarding.intro.settingsNote')}</p>
          </StepFrame>
        )}

        {step === 'household' && <HouseholdStep onSubmit={() => track('household', false)} />}

        {step === 'translation' && household && (
          <TranslationStep
            onNext={next}
            onSkip={skip}
            initialEnabled={household.translationEnabled}
            initialLanguage={household.preferredLanguage}
            defaultLanguage={locale}
          />
        )}

        {step === 'units' && household && (
          <UnitsStep onNext={next} onSkip={skip} initialUnits={household.preferredUnits} />
        )}

        {step === 'tags' && <TagsStep onNext={next} onSkip={skip} locale={locale} />}

        {step === 'shopping_categories' && (
          <StepFrame
            title={t('onboarding.shoppingCategories.title')}
            help={t('onboarding.shoppingCategories.help')}
            onNext={next}
            onSkip={skip}
            settingsNote
          >
            <ShoppingCategoriesEditor initialCategories={categories} />
          </StepFrame>
        )}

        {step === 'shopping_rules' && (
          <StepFrame
            title={t('onboarding.shoppingRules.title')}
            help={t('onboarding.shoppingRules.help')}
            onNext={next}
            onSkip={skip}
            settingsNote
          >
            <ShoppingRulesEditor
              initialRules={rules}
              suggestions={SHOPPING_RULE_EXAMPLES.map((rule) => rule[locale])}
              suggestionsLabel={t('onboarding.shoppingRules.examplesLabel')}
            />
          </StepFrame>
        )}

        {step === 'done' && (
          <StepFrame
            title={t('onboarding.done.title')}
            onNext={() => router.push('/recipes?ob=1')}
            nextLabel={t('onboarding.done.cta')}
          >
            <p className="text-sm text-gray-600">{t('onboarding.done.body')}</p>
          </StepFrame>
        )}

        {error && <p className="text-sm text-red-600 text-center">{error}</p>}
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Run the wizard test**

Run: `npx vitest run src/components/onboarding/OnboardingWizard.test.tsx`
Expected: PASS (6 tests). If `ShoppingCategoriesEditor` needs a DnD polyfill in jsdom, none is required for this test since it never renders the categories step.

- [ ] **Step 5: Onboarding layout renders in the user's language**

Replace `src/app/onboarding/layout.tsx` with:

```tsx
import { redirect } from 'next/navigation'
import { NextIntlClientProvider } from 'next-intl'
import { getMessages, setRequestLocale } from 'next-intl/server'
import { defaultLocale, isLocale } from '@/i18n/config'
import { getCurrentProfile, getCurrentUser } from '@/lib/auth/current-user'
import { PostHogIdentifier } from '@/components/providers/PostHogIdentifier'

export default async function OnboardingLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser()
  if (!user) redirect('/login')

  // The profile row exists by now (upserted in auth/callback); the language step
  // writes `ui_language` and refreshes, so later steps render in that language.
  const profile = await getCurrentProfile()
  const locale = isLocale(profile?.ui_language) ? profile.ui_language : defaultLocale
  setRequestLocale(locale)
  const messages = await getMessages({ locale })

  return (
    <NextIntlClientProvider locale={locale} messages={messages}>
      {user.email && (
        <PostHogIdentifier userId={user.id} email={user.email} optOut={user.email === process.env.ADMIN_EMAIL} />
      )}
      {children}
    </NextIntlClientProvider>
  )
}
```

- [ ] **Step 6: Rewrite the page**

Replace `src/app/onboarding/page.tsx` with:

```tsx
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getCurrentProfile } from '@/lib/auth/current-user'
import { defaultLocale, isLocale } from '@/i18n/config'
import { OnboardingWizard } from '@/components/onboarding/OnboardingWizard'

export default async function OnboardingPage() {
  const profile = await getCurrentProfile()
  const locale = isLocale(profile?.ui_language) ? profile.ui_language : defaultLocale

  if (!profile?.household_id) {
    return <OnboardingWizard key="new" initialStep="language" locale={locale} />
  }

  const supabase = createClient()
  const [{ data: household }, { data: categories }, { data: rules }] = await Promise.all([
    supabase
      .from('households')
      .select('onboarding_step, translation_enabled, preferred_language, preferred_units')
      .eq('id', profile.household_id)
      .single(),
    supabase.from('shopping_categories').select('*').eq('household_id', profile.household_id).order('sort_order'),
    supabase.from('shopping_rules').select('*').eq('household_id', profile.household_id).order('created_at'),
  ])

  if (!household?.onboarding_step) redirect('/recipes')

  // Keyed by household so the wizard remounts (and picks up `initialStep`)
  // when createHousehold redirects back here.
  return (
    <OnboardingWizard
      key={profile.household_id}
      initialStep={household.onboarding_step}
      locale={locale}
      household={{
        translationEnabled: household.translation_enabled,
        preferredLanguage: household.preferred_language,
        preferredUnits: household.preferred_units,
      }}
      categories={categories ?? []}
      rules={rules ?? []}
    />
  )
}
```

- [ ] **Step 7: Remove the obsolete page test and run everything**

```bash
git rm src/app/onboarding/page.test.tsx
```

Run: `npm test`
Expected: all tests PASS.

Run: `npm run type-check && npm run lint`
Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add src/components/onboarding src/app/onboarding
git commit -m "feat: multi-step onboarding wizard" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 15: Rename the household in settings

**Files:**
- Create: `src/components/settings/HouseholdNameEditor.tsx`
- Create: `src/components/settings/HouseholdNameEditor.test.tsx`
- Modify: `src/app/(app)/settings/page.tsx` (Household card, name block)

- [ ] **Step 1: Write the failing test**

`src/components/settings/HouseholdNameEditor.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { mockTranslate } from '@/test/mockMessages'
import { HouseholdNameEditor } from './HouseholdNameEditor'

const refresh = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }))
vi.mock('next-intl', () => ({
  useTranslations: (namespace: string) => (key: string) => mockTranslate(namespace, key),
}))

global.fetch = vi.fn()

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(fetch).mockResolvedValue({ ok: true } as Response)
})

describe('HouseholdNameEditor', () => {
  it('renames the household and refreshes the page', async () => {
    render(<HouseholdNameEditor initialName="Home" />)
    fireEvent.click(screen.getByRole('button', { name: 'Rename' }))
    fireEvent.change(screen.getByRole('textbox'), { target: { value: ' Our kitchen ' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(await screen.findByText('Our kitchen')).toBeInTheDocument()
    expect(fetch).toHaveBeenCalledWith('/api/household', expect.objectContaining({
      method: 'PATCH',
      body: JSON.stringify({ name: 'Our kitchen' }),
    }))
    expect(refresh).toHaveBeenCalled()
  })

  it('cancels without saving', () => {
    render(<HouseholdNameEditor initialName="Home" />)
    fireEvent.click(screen.getByRole('button', { name: 'Rename' }))
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.getByText('Home')).toBeInTheDocument()
    expect(fetch).not.toHaveBeenCalled()
  })

  it('keeps editing and shows an error when saving fails', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: false } as Response)
    render(<HouseholdNameEditor initialName="Home" />)
    fireEvent.click(screen.getByRole('button', { name: 'Rename' }))
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'New' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(await screen.findByText("Couldn't save the name.")).toBeInTheDocument()
    await waitFor(() => expect(screen.getByRole('textbox')).toBeInTheDocument())
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/components/settings/HouseholdNameEditor.test.tsx`
Expected: FAIL — cannot resolve `./HouseholdNameEditor`.

- [ ] **Step 3: Implement**

`src/components/settings/HouseholdNameEditor.tsx`:

```tsx
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Pencil } from 'lucide-react'

export function HouseholdNameEditor({ initialName }: { initialName: string }) {
  const t = useTranslations('settings')
  const router = useRouter()
  const [name, setName] = useState(initialName)
  const [draft, setDraft] = useState(initialName)
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [failed, setFailed] = useState(false)

  function startEditing() {
    setDraft(name)
    setFailed(false)
    setEditing(true)
  }

  async function save() {
    const trimmed = draft.trim()
    if (!trimmed || trimmed === name) {
      setEditing(false)
      return
    }
    setSaving(true)
    setFailed(false)
    const res = await fetch('/api/household', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: trimmed }),
    }).catch(() => null)
    setSaving(false)
    if (!res?.ok) {
      setFailed(true)
      return
    }
    setName(trimmed)
    setEditing(false)
    router.refresh()
  }

  if (!editing) {
    return (
      <div className="flex items-center gap-2">
        <p className="text-sm font-medium text-gray-900">{name}</p>
        <button
          type="button"
          onClick={startEditing}
          aria-label={t('page.rename')}
          className="text-gray-400 hover:text-gray-700"
        >
          <Pencil size={13} />
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2">
        <input
          autoFocus
          value={draft}
          maxLength={80}
          disabled={saving}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') save()
            if (e.key === 'Escape') setEditing(false)
          }}
          className="flex-1 text-sm px-2.5 py-1 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-300 disabled:opacity-50"
        />
        <button type="button" onClick={save} disabled={saving} className="text-xs font-medium text-gray-900 hover:text-gray-600">
          {t('page.save')}
        </button>
        <button type="button" onClick={() => setEditing(false)} disabled={saving} className="text-xs text-gray-500 hover:text-gray-900">
          {t('page.cancel')}
        </button>
      </div>
      {failed && <p className="text-xs text-red-600">{t('page.nameSaveError')}</p>}
    </div>
  )
}
```

- [ ] **Step 4: Use it on the settings page**

In `src/app/(app)/settings/page.tsx` add the import:

```ts
import { HouseholdNameEditor } from '@/components/settings/HouseholdNameEditor'
```

and replace

```tsx
            <p className="text-sm font-medium text-gray-900">{household?.name}</p>
```

with

```tsx
            <HouseholdNameEditor initialName={household?.name ?? ''} />
```

- [ ] **Step 5: Run the test**

Run: `npx vitest run src/components/settings/HouseholdNameEditor.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add src/components/settings/HouseholdNameEditor.tsx src/components/settings/HouseholdNameEditor.test.tsx "src/app/(app)/settings/page.tsx"
git commit -m "feat: rename the household from settings" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 16: Verify end to end, then deploy to staging

- [ ] **Step 1: Full checks**

Run: `npm test && npm run type-check && npm run lint`
Expected: all green.

- [ ] **Step 2: Apply the migration to the local target (staging)**

`.env.local` points at staging, which applies migrations only once the branch reaches `staging`. For local browser testing before that, ask the user to run `supabase/migrations/020_onboarding_step.sql` in the **staging** SQL editor (or wait until Step 5 and test on the staging deploy). Do not apply it yourself without the user's go-ahead.

- [ ] **Step 3: Browser walkthrough (no AI calls)**

Start the dev server with `preview_start` (add a `dev` entry to `.claude/launch.json` running `npm run dev` on port 3000 if missing), then:
1. `http://localhost:3000/dev/login?fresh=1` → wizard at the language step, heading "**W**elcome to dapcook" with a green W.
2. Pick Slovenčina → intro renders in Slovak; Next → household name; toggle "Máte pozývací odkaz?" and back.
3. Create a household → translation step. Walk translation (Skip), units (pick Imperial, Next), tags (pick a few + one custom), shopping categories (reorder one), rules (tap one example), Done → `/recipes`.
4. `/settings`: new tag groups exist with tags; categories in Slovak in the chosen order; units imperial; rule present; rename the household.
5. Refresh mid-wizard (run `?fresh=1` again, stop at the tags step, reload) → resumes at tags; visiting `/recipes` redirects back to `/onboarding`.
Do not click recipe import, translation, or shopping-list generation.

- [ ] **Step 4: Push the branch**

```bash
git push -u origin feat/onboarding-wizard
```

- [ ] **Step 5: Merge into `staging` (ask the user first)**

After the user confirms:

```bash
git checkout staging && git pull && git merge --no-ff feat/onboarding-wizard && git push && git checkout feat/onboarding-wizard
```

Staging applies migration 020 automatically. Test on https://dapcook-staging.vercel.app. Before merging the same branch into `main`, the user applies migration 020 by hand in the production SQL editor.
