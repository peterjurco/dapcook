import { test, expect, admin, createRecipe, createUser, signIn } from './support/fixtures'
import { APP_URL } from './support/env'

test.describe('Onboarding', () => {
  test.use({ household: false })

  test('a new user creates a household and finishes the wizard', async ({ page, user }) => {
    await page.goto('/recipes')
    await expect(page).toHaveURL(/\/onboarding/)

    await page.getByRole('button', { name: 'English' }).click()
    await page.getByRole('button', { name: "Let's start" }).click()

    await page.getByLabel('Household name').fill('The Testers')
    await page.getByRole('button', { name: 'Create household' }).click()

    // translation → units → week start → tags → shopping categories → invite
    for (let step = 0; step < 6; step++) {
      await page.getByRole('button', { name: 'Next', exact: true }).click()
    }
    await expect(page.getByText("You're all set!")).toBeVisible()
    await page.getByRole('button', { name: 'Go to recipes' }).click()
    await expect(page).toHaveURL(/\/recipes/)

    const { data: profile } = await admin().from('profiles').select('household_id').eq('id', user.id).single()
    const { data: household } = await admin()
      .from('households')
      .select('name, onboarding_step, created_by')
      .eq('id', profile!.household_id!)
      .single()
    expect(household).toEqual({ name: 'The Testers', onboarding_step: null, created_by: user.id })
  })

  test("saves the wizard's choices of units, week start and tags", async ({ page, user }) => {
    await page.goto('/onboarding')
    await page.getByRole('button', { name: 'English' }).click()
    await page.getByRole('button', { name: "Let's start" }).click()
    await page.getByLabel('Household name').fill('Choosy household')
    await page.getByRole('button', { name: 'Create household' }).click()
    const next = page.getByRole('button', { name: 'Next', exact: true })
    await next.click() // translation → units

    await expect(page.getByText('Which units do you use?')).toBeVisible()
    await page.getByRole('button', { name: /^Imperial/ }).click()
    await next.click()

    await expect(page.getByText('When does your week start?')).toBeVisible()
    await page.getByRole('button', { name: 'Sunday', exact: true }).click()
    await next.click()

    await expect(page.getByText('What kind of recipes will you add?')).toBeVisible()
    await page.getByRole('button', { name: 'Soup', exact: true }).click()
    await page.getByRole('button', { name: 'Italian', exact: true }).click()
    await page.getByRole('button', { name: 'Add a tag to Course' }).click()
    await page.getByPlaceholder('New tag').fill('Grill night')
    await page.getByPlaceholder('New tag').press('Enter')
    await expect(page.getByRole('button', { name: 'Grill night', exact: true })).toHaveAttribute('aria-pressed', 'true')
    await next.click()

    await expect(page.getByText('Shopping categories', { exact: true })).toBeVisible()
    await next.click()
    await next.click()
    await expect(page.getByText("You're all set!")).toBeVisible()

    const { data: profile } = await admin().from('profiles').select('household_id').eq('id', user.id).single()
    const householdId = profile!.household_id!
    const { data: household } = await admin()
      .from('households')
      .select('preferred_units, week_start_day')
      .eq('id', householdId)
      .single()
    expect(household).toEqual({ preferred_units: 'imperial', week_start_day: 'sunday' })

    const { data: groups } = await admin().from('tag_groups').select('id, name').eq('household_id', householdId)
    const { data: tags } = await admin().from('tags').select('name, group_id').eq('household_id', householdId)
    const groupOf = (tag: string) => groups?.find((g) => g.id === tags?.find((t) => t.name === tag)?.group_id)?.name
    expect(tags?.map((t) => t.name).sort()).toEqual(['Grill night', 'Italian', 'Soup'])
    expect([groupOf('Soup'), groupOf('Grill night'), groupOf('Italian')]).toEqual(['Course', 'Course', 'Cuisine'])

    const { data: categories } = await admin().from('shopping_categories').select('name').eq('household_id', householdId).order('sort_order')
    expect(categories?.map((c) => c.name)[0]).toBe('Veggies & Fruits')

    // The planner follows the chosen week start.
    await page.getByRole('button', { name: 'Go to recipes' }).click()
    // Finishing is saved on the way out, and the app may still be navigating to Recipes
    // when we leave: a goto racing that is cut short, so retry until Settings sticks.
    await expect(page.getByRole('heading', { name: 'Recipes' })).toBeVisible()
    await expect(async () => {
      await page.goto('/settings')
      await expect(page.getByRole('button', { name: 'Sunday', exact: true })).toHaveAttribute('aria-pressed', 'true', { timeout: 2_000 })
    }).toPass({ timeout: 20_000 })
  })

  test('picks up where it left off after leaving mid-way', async ({ page }) => {
    await page.goto('/onboarding')
    await page.getByRole('button', { name: 'English' }).click()
    await page.getByRole('button', { name: "Let's start" }).click()
    await page.getByLabel('Household name').fill('Half-done household')
    await page.getByRole('button', { name: 'Create household' }).click()
    await page.getByRole('button', { name: 'Next', exact: true }).click() // translation → units
    await page.getByRole('button', { name: 'Next', exact: true }).click() // units → week start
    await expect(page.getByText('When does your week start?')).toBeVisible()

    // Wandering off to the app sends an unfinished household back to the wizard, at the same step.
    await page.goto('/recipes')
    await expect(page).toHaveURL(/\/onboarding/)
    await expect(page.getByText('When does your week start?')).toBeVisible()
  })

  test('a new user joins an existing household with an invite link', async ({ page, user: newcomer, browser }) => {
    const owner = await createUser()
    const recipe = await createRecipe(owner, { title: 'Grandma’s goulash' })

    await page.goto('/onboarding')
    await page.getByRole('button', { name: 'English' }).click()
    await page.getByRole('button', { name: "Let's start" }).click()
    await page.getByRole('button', { name: 'Got an invite link?' }).click()
    await page.getByLabel('Invite link').fill(`${APP_URL}/join/${owner.inviteToken}`)
    await page.getByRole('button', { name: 'Join household' }).click()

    await expect(page).toHaveURL(/\/recipes/)
    await expect(page.getByText(recipe.title)).toBeVisible()
    const { data: profile } = await admin().from('profiles').select('household_id').eq('id', newcomer.id).single()
    expect(profile?.household_id).toBe(owner.householdId)

    // The owner, in their own browser, is unaffected.
    const ownerContext = await browser.newContext()
    await signIn(ownerContext, owner)
    const ownerPage = await ownerContext.newPage()
    await ownerPage.goto('/recipes')
    await expect(ownerPage.getByText(recipe.title)).toBeVisible()
    await ownerContext.close()
  })
})
