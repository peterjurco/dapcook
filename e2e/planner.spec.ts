import { test, expect, admin, createRecipe, createUser, isoDate, openAs, openPlanner, planRecipe, thisMonday } from './support/fixtures'

test.describe('Planner', () => {
  test('adds a recipe to this week from the recipe page', async ({ page, user }) => {
    const recipe = await createRecipe(user, { title: 'Sunday roast' })

    await page.goto(`/recipes/${recipe.id}`)
    await page.getByRole('button', { name: 'Add to Plan' }).click()
    await page.getByRole('button', { name: 'This week' }).click()
    // The picker's confirm button, e.g. "Add to Monday 23 Nov".
    await page.getByRole('button', { name: /^Add to \w+day \d+/ }).click()
    await expect(page.getByText(/^Added to /)).toBeVisible()

    await page.getByRole('button', { name: 'View plan' }).click()
    await expect(page).toHaveURL(/\/planner/)
    await expect(page.getByText('Sunday roast').first()).toBeVisible()
  })

  test('shows an empty week with a way back to the cookbook', async ({ page }) => {
    await openPlanner(page)
    await expect(page.getByText('Nothing planned for this week')).toBeVisible()
    await page.getByRole('button', { name: 'Browse recipes' }).click()
    await expect(page).toHaveURL(/\/recipes/)
  })

  test('adds a recipe to a day by searching from the grid', async ({ page, user }) => {
    await createRecipe(user, { title: 'Weeknight dal' })
    // An empty week shows only the empty state; the grid appears once something is planned.
    await planRecipe(user, null, thisMonday(), { customLabel: 'Fasting' })

    await openPlanner(page)
    await page.getByRole('button', { name: 'Add meal to Wed' }).click()
    await page.getByPlaceholder('Search recipes…').fill('dal')
    await page.getByRole('button', { name: /Weeknight dal/ }).click()

    await expect(page.getByText('Weeknight dal').first()).toBeVisible()
    const { data } = await admin().from('meal_slots').select('date').eq('household_id', user.householdId!)
    const wednesday = new Date(`${thisMonday()}T00:00:00`)
    wednesday.setDate(wednesday.getDate() + 2)
    expect(data?.map((slot) => slot.date).sort()).toEqual([thisMonday(), isoDate(wednesday)])
  })

  test('adds a quick label and a typed custom meal', async ({ page, user }) => {
    await planRecipe(user, null, thisMonday(), { customLabel: 'Fasting' })
    await openPlanner(page)
    await page.getByRole('button', { name: 'Add meal to Mon' }).click()
    await page.getByRole('button', { name: 'Leftovers' }).click()
    await expect(page.getByText('Leftovers').first()).toBeVisible()

    await page.getByRole('button', { name: 'Add meal to Fri' }).click()
    await page.getByPlaceholder('Search recipes…').fill('Pizza night')
    await page.getByRole('button', { name: 'Use “Pizza night” as a custom meal' }).click()
    await expect(page.getByText('Pizza night').first()).toBeVisible()

    const { data } = await admin().from('meal_slots').select('custom_label').eq('household_id', user.householdId!)
    expect(data?.map((slot) => slot.custom_label).sort()).toEqual(['Fasting', 'Leftovers', 'Pizza night'])
  })

  test('removes a meal after confirming', async ({ page, user }) => {
    const recipe = await createRecipe(user, { title: 'Unwanted udon' })
    await planRecipe(user, recipe.id, thisMonday())

    await openPlanner(page)
    await page.getByRole('button', { name: 'Remove from plan' }).first().click()
    await page.getByRole('button', { name: 'Remove', exact: true }).click()

    await expect(page.getByText('Nothing planned for this week')).toBeVisible()
    await expect
      .poll(async () => (await admin().from('meal_slots').select('id', { count: 'exact', head: true }).eq('household_id', user.householdId!)).count)
      .toBe(0)
  })

  test('opens on the furthest planned week and moves between weeks', async ({ page, user }) => {
    const now = await createRecipe(user, { title: 'This-week tacos' })
    const later = await createRecipe(user, { title: 'Next-week noodles' })
    await planRecipe(user, now.id, thisMonday())
    await planRecipe(user, later.id, thisMonday(1))

    // With no ?week=, the planner shows the week of the latest planned meal.
    await openPlanner(page)
    await expect(page.getByText('Next-week noodles').first()).toBeVisible()
    await expect(page.getByText('This-week tacos')).toHaveCount(0)

    await page.getByRole('button', { name: 'Previous week' }).click()
    await expect(page).toHaveURL(new RegExp(`week=${thisMonday()}`))
    await expect(page.getByText('This-week tacos').first()).toBeVisible()
    await expect(page.getByText('Next-week noodles')).toHaveCount(0)

    await page.getByRole('button', { name: 'Next week' }).first().click()
    await expect(page).toHaveURL(new RegExp(`week=${thisMonday(1)}`))
    await expect(page.getByText('Next-week noodles').first()).toBeVisible()
  })

  test('a household member sees meals the other planned', async ({ browser, user }) => {
    const partner = await createUser({ joinHousehold: user })
    const recipe = await createRecipe(user, { title: 'Shared shepherd’s pie' })
    await planRecipe(user, recipe.id, thisMonday())

    const partnerPage = await openAs(browser, partner)
    await partnerPage.goto('/planner')
    await expect(partnerPage.getByText('Shared shepherd’s pie').first()).toBeVisible()
    await partnerPage.context().close()
  })
})

test.describe('Planner on a phone', () => {
  test('shows the week as an agenda @mobile', async ({ page, user }) => {
    const recipe = await createRecipe(user, { title: 'Pocket pierogi' })
    await planRecipe(user, recipe.id, thisMonday())

    await openPlanner(page)
    // Both layouts are in the page; only the phone agenda is visible.
    await expect(page.getByText('Pocket pierogi').filter({ visible: true }).first()).toBeVisible()
    await expect(page.getByText('Nothing planned', { exact: true }).filter({ visible: true }).first()).toBeVisible()
  })

  test('stretches a meal over two days in edit mode @mobile', async ({ page, user }) => {
    const recipe = await createRecipe(user, { title: 'Big batch chili' })
    const slot = await planRecipe(user, recipe.id, thisMonday())

    await openPlanner(page)
    await page.getByRole('button', { name: 'Edit', exact: true }).click()
    await page.getByRole('button', { name: 'Extend by one day' }).first().click()
    await expect(page.getByText(/· 2 days/)).toBeVisible()
    await page.getByRole('button', { name: 'Done', exact: true }).click()

    await expect
      .poll(async () => (await admin().from('meal_slots').select('span_days').eq('id', slot.id).single()).data?.span_days)
      .toBe(2)
  })
})
