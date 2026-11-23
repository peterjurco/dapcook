import { test, expect, admin, createRecipe, createUser, signIn } from './support/fixtures'

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
    await page.getByLabel('Invite link').fill(`http://localhost:3001/join/${owner.inviteToken}`)
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
