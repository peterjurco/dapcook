import { test, expect, admin, addShoppingItems, createRecipe, createUser, openAs, planRecipe, today } from './support/fixtures'

test.describe('Settings', () => {
  test('renames the household', async ({ page, user }) => {
    await page.goto('/settings')
    // The household's own rename button (tags and categories have title-only "Rename" buttons too).
    await page.getByLabel('Rename', { exact: true }).click()
    await page.getByRole('textbox').first().fill('Casa Testa')
    await page.getByRole('button', { name: 'Save', exact: true }).click()
    await expect(page.getByText('Casa Testa')).toBeVisible()

    const { data } = await admin().from('households').select('name').eq('id', user.householdId!).single()
    expect(data?.name).toBe('Casa Testa')
  })

  test('changing the week start changes the planner', async ({ page, user }) => {
    // Something planned, so the planner shows its day grid rather than the empty state.
    await planRecipe(user, null, today(), { customLabel: 'Fasting' })
    await page.goto('/settings')
    await page.getByRole('button', { name: 'Sunday', exact: true }).click()
    await expect
      .poll(async () => (await admin().from('households').select('week_start_day').eq('id', user.householdId!).single()).data?.week_start_day)
      .toBe('sunday')

    await page.goto('/planner')
    await expect(page.getByRole('button', { name: 'Add meal to Sun' })).toBeVisible()
    const firstDay = await page.getByRole('button', { name: /^Add meal to / }).first().getAttribute('aria-label')
    expect(firstDay).toBe('Add meal to Sun')
  })

  test('switches the interface to Slovak just for this person', async ({ page, user }) => {
    await page.goto('/settings')
    await page.getByRole('combobox').filter({ has: page.getByRole('option', { name: 'Slovenčina' }) }).first().selectOption('sk')

    await expect(page.getByRole('link', { name: 'Recepty' })).toBeVisible()
    const { data } = await admin().from('profiles').select('ui_language').eq('id', user.id).single()
    expect(data?.ui_language).toBe('sk')
  })

  test('changing units can skip converting existing recipes', async ({ page, user }) => {
    await createRecipe(user, { title: 'Metric muffins', ingredients: [{ quantity: 100, unit: 'g', name: 'sugar' }] })

    await page.goto('/settings')
    await page.getByRole('button', { name: 'imperial', exact: true }).click()
    await expect(page.getByText('Convert your recipes to imperial units?')).toBeVisible()
    await page.getByRole('button', { name: 'Not now' }).click()

    await expect
      .poll(async () => (await admin().from('households').select('preferred_units').eq('id', user.householdId!).single()).data?.preferred_units)
      .toBe('imperial')
    const { data: recipe } = await admin().from('recipes').select('ingredients').eq('household_id', user.householdId!).single()
    expect(JSON.stringify(recipe?.ingredients)).toContain('"unit":"g"')
  })

  test('reports recipes that fail to convert', async ({ page, user }) => {
    // The fake AI rejects conversion requests, so every recipe fails, visibly.
    await createRecipe(user, { title: 'Metric scones', ingredients: [{ quantity: 100, unit: 'g', name: 'flour' }] })

    await page.goto('/settings')
    await page.getByRole('button', { name: 'imperial', exact: true }).click()
    await page.getByRole('button', { name: 'Convert all' }).click()
    await expect(page.getByText('0 updated, 1 failed.')).toBeVisible()
  })

  test('adds and deletes a shopping category', async ({ page, user }) => {
    await page.goto('/settings')
    await page.getByRole('button', { name: 'Add category' }).click()
    await page.getByPlaceholder('Category name').fill('Pet food')
    await page.getByRole('button', { name: 'Add', exact: true }).click()
    await expect(page.getByText('Pet food')).toBeVisible()

    const categories = async () =>
      ((await admin().from('shopping_categories').select('name').eq('household_id', user.householdId!)).data ?? []).map((c) => c.name)
    await expect.poll(categories).toContain('Pet food')

    await page.getByText('Pet food').hover()
    await page.locator('li, div').filter({ hasText: /^Pet food$/ }).getByRole('button', { name: 'Delete' }).last().click()
    await page.getByRole('button', { name: 'Delete', exact: true }).last().click()
    await expect.poll(categories).not.toContain('Pet food')
  })

  test('adds and removes a shopping rule', async ({ page, user }) => {
    await page.goto('/settings')
    await page.getByRole('button', { name: 'Add rule' }).click()
    await page.getByPlaceholder('e.g. Do not include water').fill('Never buy salt')
    await page.getByPlaceholder('e.g. Do not include water').press('Enter')
    await expect(page.getByText('Never buy salt')).toBeVisible()

    const rules = async () =>
      ((await admin().from('shopping_rules').select('rule').eq('household_id', user.householdId!)).data ?? []).map((r) => r.rule)
    await expect.poll(rules).toEqual(['Never buy salt'])

    await page.getByRole('button', { name: 'Remove rule' }).click()
    await expect(page.getByText('Never buy salt')).toHaveCount(0)
    await expect.poll(rules).toEqual([])
  })

  test('lists every household member and shows the invite link', async ({ page, user }) => {
    const partner = await createUser({ joinHousehold: user })

    await page.goto('/settings')
    await expect(page.getByText('Members (2)')).toBeVisible()
    await expect(page.getByText(user.displayName, { exact: true })).toBeVisible()
    await expect(page.getByText(partner.displayName, { exact: true })).toBeVisible()
    await expect(page.locator(`input[value$="/join/${user.inviteToken}"]`)).toBeVisible()
  })

  test('renames a tag on every recipe that uses it', async ({ page, user }) => {
    const recipe = await createRecipe(user, { title: 'Tagged tacos', tags: ['mexcian'] })

    await page.goto('/settings')
    await page.getByRole('button', { name: 'mexcian', exact: true }).click()
    // The tag editor's name field (its label isn't tied to the input).
    await page.locator('input[value="mexcian"]').fill('mexican')
    await page.getByRole('button', { name: 'Save', exact: true }).click()

    await expect
      .poll(async () => (await admin().from('recipes').select('tags').eq('id', recipe.id).single()).data?.tags)
      .toEqual(['mexican'])
  })

  test('signs out', async ({ page }) => {
    await page.goto('/settings')
    await page.getByRole('button', { name: 'Sign out' }).last().click()
    await expect(page).toHaveURL(/\/login/)

    await page.goto('/recipes')
    await expect(page).toHaveURL(/\/login/)
  })

  test("one member's interface language doesn't change the other's", async ({ page, user, browser }) => {
    const partner = await createUser({ joinHousehold: user })
    await page.goto('/settings')
    await page.getByRole('combobox').filter({ has: page.getByRole('option', { name: 'Slovenčina' }) }).first().selectOption('sk')
    await expect(page.getByRole('link', { name: 'Recepty' })).toBeVisible()

    const partnerPage = await openAs(browser, partner)
    await partnerPage.goto('/recipes')
    await expect(partnerPage.getByRole('link', { name: 'Recipes' })).toBeVisible()
    await partnerPage.context().close()
  })
  test('creates and deletes a tag group', async ({ page, user }) => {
    await createRecipe(user, { title: 'Grouped gnocchi', tags: ['comfort'] })
    const groups = async () =>
      ((await admin().from('tag_groups').select('name').eq('household_id', user.householdId!)).data ?? []).map((g) => g.name)

    await page.goto('/settings')
    await page.getByRole('button', { name: 'New group' }).click()
    await page.getByPlaceholder('e.g. Course').fill('Mood')
    await page.getByRole('button', { name: 'Create', exact: true }).click()
    await expect(page.getByText('Mood', { exact: true })).toBeVisible()
    await expect.poll(groups).toEqual(['Mood'])

    await page.getByText('Mood', { exact: true }).click()
    await page.getByTitle('Delete group').click()
    // The confirmation's own button, not a category's hidden "Delete".
    await page.getByText('Delete the group "Mood"?').locator('xpath=..').getByRole('button', { name: 'Delete', exact: true }).click()
    await expect.poll(groups).toEqual([])
    // Its tags stay.
    const { data } = await admin().from('recipes').select('tags').eq('household_id', user.householdId!).single()
    expect(data?.tags).toEqual(['comfort'])
  })

  test('deleting a tag takes it off every recipe', async ({ page, user }) => {
    const hot = await createRecipe(user, { title: 'Hot wings', tags: ['spicy', 'meat'] })
    const mild = await createRecipe(user, { title: 'Mild korma', tags: ['spicy'] })

    await page.goto('/settings')
    await page.getByRole('button', { name: 'spicy', exact: true }).click()
    await page.getByTitle('Delete tag').click()
    await page
      .getByText('Remove tag "spicy" from all recipes? This cannot be undone.')
      .locator('xpath=..')
      .getByRole('button', { name: 'Delete', exact: true })
      .click()

    const tagsOf = async (id: string) => (await admin().from('recipes').select('tags').eq('id', id).single()).data?.tags
    await expect.poll(() => tagsOf(hot.id)).toEqual(['meat'])
    expect(await tagsOf(mild.id)).toEqual([])
    await expect(page.getByRole('button', { name: 'spicy', exact: true })).toHaveCount(0)
  })

  test('renaming a shopping category keeps its items under it', async ({ page, user }) => {
    // Items store their category's name, so the rename has to move them too.
    await addShoppingItems(user, [{ name: 'sourdough', category: 'Bakery' }])

    await page.goto('/settings')
    const row = page.getByText('Bakery', { exact: true }).locator('xpath=..')
    await row.hover()
    await row.getByTitle('Rename').click()
    await page.locator('input[value="Bakery"]').fill('Bread')
    await page.locator('input[value="Bread"]').press('Enter')
    await expect(page.getByText('Bread', { exact: true })).toBeVisible()

    await page.goto('/shopping')
    await expect(page.getByText('sourdough')).toBeVisible()
    await expect(page.getByText('Bread', { exact: true })).toBeVisible()
    await expect(page.getByText('Bakery', { exact: true })).toHaveCount(0)
  })

  test('week start can be Saturday too', async ({ page, user }) => {
    await planRecipe(user, null, today(), { customLabel: 'Fasting' })
    await page.goto('/settings')
    await page.getByRole('button', { name: 'Saturday', exact: true }).click()
    await expect(page.getByRole('button', { name: 'Saturday', exact: true })).toHaveAttribute('aria-pressed', 'true')
    await expect
      .poll(async () => (await admin().from('households').select('week_start_day').eq('id', user.householdId!).single()).data?.week_start_day)
      .toBe('saturday')

    await page.goto('/planner')
    const days = page.getByRole('button', { name: /^Add meal to / })
    await expect(days.first()).toHaveAttribute('aria-label', 'Add meal to Sat')
    await expect(days.last()).toHaveAttribute('aria-label', 'Add meal to Fri')
  })
})
