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
 *   // A second member of the same household, in their own browser:
 *   const partner = await createUser({ joinHousehold: user })
 *   const partnerPage = await openAs(browser, partner)
 */
import { randomUUID } from 'node:crypto'
import { test as base, type Browser, type BrowserContext, type Page } from '@playwright/test'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'
import type { Database } from '@/types/database'
import { DEFAULT_SHOPPING_CATEGORIES } from '@/lib/onboarding/defaults'
import { TOUR_IDS } from '@/lib/tours/ids'
import { SPLASH_SESSION_KEY } from '@/components/ui/SplashScreen'
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
  /** Put the user in this user's household instead of creating one. */
  joinHousehold?: TestUser
  /** Mark every product tour as seen, so no tour overlay covers the page. Default true. */
  skipTours?: boolean
  /** A fixed address (e.g. the e2e ADMIN_EMAIL). Reuses the account if it already exists. */
  email?: string
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
export function must<R extends { data: unknown; error: { message: string } | null }>(
  result: R,
  what: string
): Extract<R, { error: null }>['data'] {
  if (result.error) throw new Error(`e2e setup: ${what} failed: ${result.error.message}`)
  return result.data
}

async function authUserId(email: string, displayName: string): Promise<string> {
  const db = admin()
  const created = await db.auth.admin.createUser({ email, email_confirm: true, user_metadata: { full_name: displayName } })
  if (!created.error) return created.data.user.id
  if (created.error.code !== 'email_exists') throw new Error(`e2e setup: createUser failed: ${created.error.message}`)
  // Looked up by email: minting a link returns the account, however many users the database holds.
  const link = must(await db.auth.admin.generateLink({ type: 'magiclink', email }), 'find existing user')
  return link.user.id
}

/** Creates a user with a profile, plus a finished household unless `household: false`. */
export async function createUser({
  household = true,
  joinHousehold,
  skipTours = true,
  email,
}: CreateUserOptions = {}): Promise<TestUser> {
  const db = admin()
  const tag = randomUUID().slice(0, 8)
  const address = email ?? `e2e-${tag}@test.local`
  const displayName = `E2E ${tag}`
  const id = await authUserId(address, displayName)

  must(
    await db.from('profiles').upsert({
      id,
      display_name: displayName,
      household_id: null,
      ui_language: 'en',
      tours_seen: skipTours ? [...TOUR_IDS] : [],
    }),
    'create profile'
  )

  if (joinHousehold) {
    if (!joinHousehold.householdId) throw new Error('e2e setup: joinHousehold needs a user with a household')
    must(await db.from('profiles').update({ household_id: joinHousehold.householdId }).eq('id', id), 'join household')
    return { id, email: address, displayName, householdId: joinHousehold.householdId, inviteToken: joinHousehold.inviteToken }
  }

  if (!household) return { id, email: address, displayName, householdId: null, inviteToken: null }

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

  return { id, email: address, displayName, householdId, inviteToken }
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

/**
 * Marks the splash screen as already shown, so the app hides it (`html[data-splash=skip]`,
 * see src/components/ui/SplashScreen.tsx). Without this its animation covers the first
 * second of every page load and replays on every step of a trace.
 */
async function skipSplash(context: BrowserContext): Promise<void> {
  await context.addInitScript((key) => {
    try {
      sessionStorage.setItem(key, '1')
    } catch {
      // No storage: the app shows the splash as it would for a real user.
    }
  }, SPLASH_SESSION_KEY)
}

/**
 * Resolves once React has hydrated every form control on the page. React tags each
 * element it hydrates (Next.js server-action hidden inputs aside, which are skipped) with a `__reactProps$…` property; until then a click does
 * nothing, and text typed into a field is wiped when hydration resets it to its
 * state. Suspense boundaries (our `loading.tsx` files) can hydrate after the rest
 * of the page, so this checks the controls themselves rather than a root marker.
 */
export async function waitForHydration(page: Page): Promise<void> {
  const allHydrated = () =>
    [...document.querySelectorAll('button, input:not([type=hidden]), select, textarea')].every((el) =>
      Object.keys(el).some((key) => key.startsWith('__reactProps$'))
    )
  for (let attempt = 0; ; attempt++) {
    try {
      await page.waitForFunction(allHydrated, undefined, { timeout: 15_000 })
      return
    } catch (err) {
      // A client-side redirect replaced the document mid-wait: check the new one.
      if (attempt < 2 && /context was destroyed|navigation/i.test(String(err))) {
        await page.waitForLoadState()
        continue
      }
      const stragglers = await page
        .evaluate(() =>
          [...document.querySelectorAll('button, input:not([type=hidden]), select, textarea')]
            .filter((el) => !Object.keys(el).some((key) => key.startsWith('__reactProps$')))
            .map((el) => el.outerHTML.slice(0, 160))
        )
        .catch(() => [])
      throw new Error(`Page never finished hydrating. Controls React hasn't taken over:\n${stragglers.join('\n')}`, { cause: err })
    }
  }
}

/**
 * Makes every `page.goto` to an app page wait for hydration (see waitForHydration),
 * so no test can type or click into a page React hasn't taken over yet. That race
 * only shows on slow machines, e.g. WebKit in CI.
 */
function gotoWaitsForHydration(context: BrowserContext) {
  context.on('page', (page) => {
    const goto = page.goto.bind(page)
    page.goto = async (url, options) => {
      const response = await goto(url, options)
      const isAppPage =
        new URL(page.url()).origin === new URL(APP_URL).origin &&
        (response?.headers()['content-type'] ?? '').includes('text/html')
      if (isAppPage) await waitForHydration(page)
      return response
    }
  })
}

/** A page in a fresh browser context signed in as `user` (or signed out when `user` is null). */
export async function openAs(browser: Browser, user: TestUser | null): Promise<Page> {
  const context = await browser.newContext({ baseURL: APP_URL })
  gotoWaitsForHydration(context)
  await skipSplash(context)
  if (user) await signIn(context, user)
  return context.newPage()
}

/**
 * Opens the recipe form (`/recipes/new` or `/recipes/<id>/edit`) and waits until
 * React has hydrated it: it loads the household's tags on mount. Clicks and
 * file uploads before that are silently lost.
 */
export async function openRecipeForm(page: Page, path: string): Promise<void> {
  const hydrated = page.waitForResponse((r) => new URL(r.url()).pathname === '/api/tags')
  await page.goto(path)
  await hydrated
}

/**
 * Opens the planner (on `week`, a YYYY-MM-DD week start, when given) and waits until
 * it has hydrated: it fetches its week from the API on mount.
 */
export async function openPlanner(page: Page, week?: string): Promise<void> {
  const hydrated = page.waitForResponse((r) => new URL(r.url()).pathname === '/api/planner/week')
  await page.goto(week ? `/planner?week=${week}` : '/planner')
  await hydrated
}

function householdOf(user: TestUser, what: string): string {
  if (!user.householdId) throw new Error(`e2e setup: ${what} needs a user with a household`)
  return user.householdId
}

export interface TestIngredient {
  quantity: number | null
  unit: string
  name: string
}

export interface TestRecipe {
  title: string
  servings?: number
  prepTime?: number
  cookTime?: number
  tags?: string[]
  ingredients?: TestIngredient[]
  steps?: string[]
}

/** Inserts a recipe straight into `user`'s household, for tests whose subject is something else. */
export async function createRecipe(user: TestUser, recipe: TestRecipe): Promise<{ id: string; title: string }> {
  const householdId = householdOf(user, 'createRecipe')
  const tags = recipe.tags ?? []
  if (tags.length) {
    must(
      await admin()
        .from('tags')
        .upsert(tags.map((name) => ({ household_id: householdId, name })), { onConflict: 'household_id,name', ignoreDuplicates: true }),
      'create tags'
    )
  }
  return must(
    await admin()
      .from('recipes')
      .insert({
        household_id: householdId,
        created_by: user.id,
        title: recipe.title,
        servings: recipe.servings ?? 2,
        prep_time_min: recipe.prepTime ?? null,
        cook_time_min: recipe.cookTime ?? null,
        tags,
        ingredients: (recipe.ingredients ?? []).map((ing) => ({ id: randomUUID(), notes: '', ...ing })),
        steps: (recipe.steps ?? []).map((text, i) => ({ id: randomUUID(), order: i + 1, text })),
      })
      .select('id, title')
      .single(),
    'create recipe'
  )
}

/** Puts a recipe (or a custom label such as "Leftovers") on `user`'s plan for `date` (YYYY-MM-DD). */
export async function planRecipe(
  user: TestUser,
  recipeId: string | null,
  date: string,
  options: { customLabel?: string; spanDays?: number } = {}
): Promise<{ id: string }> {
  return must(
    await admin()
      .from('meal_slots')
      .insert({
        household_id: householdOf(user, 'planRecipe'),
        recipe_id: recipeId,
        custom_label: options.customLabel ?? null,
        span_days: options.spanDays ?? 1,
        date,
      })
      .select('id')
      .single(),
    'plan recipe'
  )
}

/** Adds items to `user`'s household shopping list. */
export async function addShoppingItems(
  user: TestUser,
  items: { name: string; quantity?: number | null; unit?: string | null; category?: string | null }[]
): Promise<void> {
  const db = admin()
  const list = must(
    await db.from('shopping_lists').select('id').eq('household_id', householdOf(user, 'addShoppingItems')).single(),
    'find shopping list'
  )
  must(
    await db.from('shopping_items').insert(
      items.map((item, i) => ({
        shopping_list_id: list.id,
        name: item.name,
        quantity: item.quantity ?? null,
        unit: item.unit ?? null,
        category: item.category ?? null,
        sort_order: i,
      }))
    ),
    'add shopping items'
  )
}

/** YYYY-MM-DD in local time, the format the planner uses. */
export function isoDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function today(): string {
  return isoDate(new Date())
}

/** The Monday of the current week (the default week start), as YYYY-MM-DD. */
export function thisMonday(offsetWeeks = 0): string {
  const d = new Date()
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7) + offsetWeeks * 7)
  return isoDate(d)
}

/** Day `index` of this Monday-started week (0 = Monday … 6 = Sunday; negative or ≥ 7 leave it), as YYYY-MM-DD. */
export function weekDay(index: number, offsetWeeks = 0): string {
  const d = new Date(`${thisMonday(offsetWeeks)}T00:00:00`)
  d.setDate(d.getDate() + index)
  return isoDate(d)
}

/** The short weekday and day of month the planner shows for a YYYY-MM-DD date, e.g. "Wed 25". */
export function dayLabel(date: string): string {
  const d = new Date(`${date}T00:00:00`)
  return `${d.toLocaleDateString('en-GB', { weekday: 'short' })} ${d.getDate()}`
}

export const test = base.extend<{ household: boolean; skipTours: boolean; user: TestUser }>({
  household: [true, { option: true }],
  skipTours: [true, { option: true }],
  context: async ({ context }, provide) => {
    gotoWaitsForHydration(context)
    await skipSplash(context)
    await provide(context)
  },
  // `auto`: every test is signed in, whether or not it names `user`.
  // `provide` is Playwright's `use`, renamed so the React hooks lint rule leaves it alone.
  user: [
    async ({ context, household, skipTours }, provide) => {
      const user = await createUser({ household, skipTours })
      await signIn(context, user)
      await provide(user)
    },
    { auto: true },
  ],
})

export { expect } from '@playwright/test'
