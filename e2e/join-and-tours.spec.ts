import { test, expect, admin, createRecipe, createUser, openAs } from './support/fixtures'

test.describe('Invite links', () => {
  test('an invite link names the household to someone signed out', async ({ browser, user }) => {
    const visitor = await openAs(browser, null)
    await visitor.goto(`/join/${user.inviteToken}`)
    const { data } = await admin().from('households').select('name').eq('id', user.householdId!).single()
    await expect(visitor.getByText(data!.name)).toBeVisible()
    await expect(visitor.getByRole('button', { name: /Google/ })).toBeVisible()
    await visitor.context().close()
  })

  test("a dead invite link doesn't reveal any household", async ({ browser }) => {
    const visitor = await openAs(browser, null)
    await visitor.goto(`/join/${'0'.repeat(32)}`)
    await expect(visitor.getByText("You've been invited to a household. Sign in with Google to accept.")).toBeVisible()
    await expect(visitor.getByText("You've been invited to join")).toHaveCount(0)
    await visitor.context().close()
  })

  test('someone signed in with a dead invite is told so', async ({ page }) => {
    // Where the OAuth callback sends a signed-in user whose invite token matched no household.
    await page.goto('/join-invalid')
    await expect(page.getByText('This invite link is invalid or has already been used.')).toBeVisible()
  })

  test('a member who joins sees the household recipes', async ({ browser, user }) => {
    await createRecipe(user, { title: 'Family flan' })
    const partner = await createUser({ joinHousehold: user })
    const partnerPage = await openAs(browser, partner)
    await partnerPage.goto('/recipes')
    await expect(partnerPage.getByText('Family flan')).toBeVisible()
    await partnerPage.context().close()
  })
})

test.describe('Product tours', () => {
  test.use({ skipTours: false })

  test('a first-time user gets the planning tour once', async ({ page, user }) => {
    const recipe = await createRecipe(user, { title: 'Touring tagine' })

    await page.goto(`/recipes/${recipe.id}`)
    await expect(page.getByText('Plan this recipe')).toBeVisible()
    await page.getByRole('button', { name: /Got it|Skip tour|Done/ }).first().click()
    await expect(page.getByText('Plan this recipe')).toHaveCount(0)

    await expect
      .poll(async () => (await admin().from('profiles').select('tours_seen').eq('id', user.id).single()).data?.tours_seen)
      .toContain('plan-recipe')
    await page.reload()
    await expect(page.getByRole('heading', { name: 'Touring tagine' })).toBeVisible()
    await expect(page.getByText('Plan this recipe')).toHaveCount(0)
  })
})
