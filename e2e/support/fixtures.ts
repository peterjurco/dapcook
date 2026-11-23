/**
 * Test isolation: every test gets its own brand-new user (and, by default,
 * its own household). Households are the app's unit of data ownership and
 * RLS enforces it, so nothing one test creates is visible to another, and
 * tests can run in parallel and in any order.
 *
 *   import { test, expect } from './support/fixtures'
 *
 *   test('…', async ({ page, user }) => { … })          // signed in (always), household ready
 *
 *   test.describe(() => {
 *     test.use({ household: false })                    // signed in, no household
 *     test('…', async ({ page, user }) => { … })        //   (lands on /onboarding)
 *   })
 *
 *   // A second person: their own browser context.
 *   const bob = await createUser({ household: false })
 *   const bobContext = await browser.newContext()
 *   await signIn(bobContext, bob)
 */
import { randomUUID } from 'node:crypto'
import { test as base, type BrowserContext } from '@playwright/test'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'
import type { Database } from '@/types/database'
import { DEFAULT_SHOPPING_CATEGORIES } from '@/lib/onboarding/defaults'
import { TOUR_IDS } from '@/lib/tours/ids'
import { generateInviteToken } from '@/lib/utils/invite'
import { APP_URL, localSupabase } from './env'

export interface TestUser {
  id: string
  email: string
  displayName: string
  /** Null when created with `household: false`. */
  householdId: string | null
  inviteToken: string | null
}

interface CreateUserOptions {
  /** Create a household (as finished onboarding would) and put the user in it. Default true. */
  household?: boolean
  /** Mark every product tour as seen, so no tour overlay covers the page. Default true. */
  skipTours?: boolean
}

let adminClient: SupabaseClient<Database> | null = null

/** Service-role client for test setup and assertions. Bypasses RLS: never use it to test access rules. */
export function admin(): SupabaseClient<Database> {
  if (!adminClient) {
    const { url, serviceRoleKey } = localSupabase()
    adminClient = createClient<Database>(url, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })
  }
  return adminClient
}

/** Unwraps a Supabase result to its success branch, or fails the test setup loudly. */
function must<R extends { data: unknown; error: { message: string } | null }>(
  result: R,
  what: string
): Extract<R, { error: null }>['data'] {
  if (result.error) throw new Error(`e2e setup: ${what} failed: ${result.error.message}`)
  return result.data
}

/** Creates a user with a profile, plus a finished household unless `household: false`. */
export async function createUser({ household = true, skipTours = true }: CreateUserOptions = {}): Promise<TestUser> {
  const db = admin()
  const tag = randomUUID().slice(0, 8)
  const email = `e2e-${tag}@test.local`
  const displayName = `E2E ${tag}`

  const created = must(
    await db.auth.admin.createUser({ email, email_confirm: true, user_metadata: { full_name: displayName } }),
    'createUser'
  )
  const id = created.user.id

  must(
    await db.from('profiles').upsert({
      id,
      display_name: displayName,
      ui_language: 'en',
      tours_seen: skipTours ? [...TOUR_IDS] : [],
    }),
    'create profile'
  )

  if (!household) return { id, email, displayName, householdId: null, inviteToken: null }

  // Mirrors createHousehold in src/lib/auth/actions.ts, with onboarding already finished.
  const householdId = randomUUID()
  const inviteToken = generateInviteToken()
  must(
    await db.from('households').insert({
      id: householdId,
      name: `Household ${tag}`,
      invite_token: inviteToken,
      onboarding_step: null,
      created_by: id,
    }),
    'create household'
  )
  must(await db.from('profiles').update({ household_id: householdId }).eq('id', id), 'join household')
  must(await db.from('shopping_lists').insert({ household_id: householdId, name: 'Shopping list' }), 'create shopping list')
  must(
    await db.from('shopping_categories').insert(
      DEFAULT_SHOPPING_CATEGORIES.map((category, index) => ({
        household_id: householdId,
        name: category.en,
        color: category.color,
        sort_order: index,
      }))
    ),
    'create shopping categories'
  )

  return { id, email, displayName, householdId, inviteToken }
}

/**
 * Gives `context` a real Supabase session for `user`, the way /dev/login does
 * (magic link minted with the service role, verified server-side), with the
 * cookies written by @supabase/ssr itself so their format matches the app's.
 */
export async function signIn(context: BrowserContext, user: TestUser): Promise<void> {
  const { url, anonKey } = localSupabase()

  const link = must(await admin().auth.admin.generateLink({ type: 'magiclink', email: user.email }), 'generateLink')

  const jar = new Map<string, string>()
  const supabase = createServerClient<Database>(url, anonKey, {
    cookies: {
      getAll: () => [...jar].map(([name, value]) => ({ name, value })),
      setAll: (cookies) => cookies.forEach(({ name, value }) => jar.set(name, value)),
    },
  })
  must(
    await supabase.auth.verifyOtp({ type: 'magiclink', token_hash: link.properties.hashed_token }),
    'verifyOtp'
  )

  await context.addCookies(
    [...jar].map(([name, value]) => ({ name, value, url: APP_URL, sameSite: 'Lax' as const }))
  )
}

export interface TestIngredient {
  quantity: number | null
  unit: string
  name: string
}

/** Inserts a recipe straight into `user`'s household, for tests whose subject is something else. */
export async function createRecipe(
  user: TestUser,
  recipe: { title: string; servings?: number; ingredients?: TestIngredient[]; steps?: string[] }
): Promise<{ id: string; title: string }> {
  if (!user.householdId) throw new Error('e2e setup: createRecipe needs a user with a household')
  const row = must(
    await admin()
      .from('recipes')
      .insert({
        household_id: user.householdId,
        created_by: user.id,
        title: recipe.title,
        servings: recipe.servings ?? 2,
        ingredients: (recipe.ingredients ?? []).map((ing) => ({ id: randomUUID(), notes: '', ...ing })),
        steps: (recipe.steps ?? []).map((text, i) => ({ id: randomUUID(), order: i + 1, text })),
      })
      .select('id, title')
      .single(),
    'create recipe'
  )
  return row
}

/** Puts a recipe on `user`'s plan for `date` (YYYY-MM-DD). */
export async function planRecipe(user: TestUser, recipeId: string, date: string): Promise<void> {
  if (!user.householdId) throw new Error('e2e setup: planRecipe needs a user with a household')
  must(
    await admin().from('meal_slots').insert({ household_id: user.householdId, recipe_id: recipeId, date }),
    'plan recipe'
  )
}

/** Today as YYYY-MM-DD in local time, the format the planner uses. */
export function today(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export const test = base.extend<{ household: boolean; user: TestUser }>({
  household: [true, { option: true }],
  // `auto`: every test is signed in, whether or not it names `user`.
  // `provide` is Playwright's `use`, renamed so the React hooks lint rule leaves it alone.
  user: [
    async ({ context, household }, provide) => {
      const user = await createUser({ household })
      await signIn(context, user)
      await provide(user)
    },
    { auto: true },
  ],
})

export { expect } from '@playwright/test'
