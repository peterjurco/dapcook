import {
  test,
  expect,
  admin,
  addShoppingItems,
  createRecipe,
  createUser,
  dayLabel,
  openAs,
  openPlanner,
  planRecipe,
  thisMonday,
  today,
  weekDay,
} from './support/fixtures'

async function listItems(householdId: string) {
  const { data: list } = await admin().from('shopping_lists').select('id').eq('household_id', householdId).single()
  const { data } = await admin()
    .from('shopping_items')
    .select('name, is_checked, quantity, unit')
    .eq('shopping_list_id', list!.id)
    .order('sort_order')
  return data ?? []
}

test.describe('Shopping list', () => {
  test("turns this week's plan into a shopping list", async ({ page, user }) => {
    const recipe = await createRecipe(user, {
      title: 'Pancakes',
      servings: 2,
      ingredients: [
        { quantity: 200, unit: 'g', name: 'flour' },
        { quantity: 2, unit: '', name: 'eggs' },
      ],
    })
    await planRecipe(user, recipe.id, today())

    await page.goto(`/shopping/generate?week=${today()}`)
    await expect(page.getByText('Pancakes')).toBeVisible()
    await page.getByRole('button', { name: 'Add 2 items to shopping list' }).click()

    await expect(page).toHaveURL(/\/shopping$/)
    await expect(page.getByText('flour')).toBeVisible()
    await expect(page.getByText('eggs')).toBeVisible()
  })

  test('scales ingredients with portions and lets you drop one', async ({ page, user }) => {
    const recipe = await createRecipe(user, {
      title: 'Porridge',
      servings: 1,
      ingredients: [
        { quantity: 50, unit: 'g', name: 'oats' },
        { quantity: 1, unit: '', name: 'banana' },
      ],
    })
    await planRecipe(user, recipe.id, today())

    await page.goto(`/shopping/generate?week=${today()}`)
    await page.getByRole('button', { name: 'More portions' }).click()
    await page.getByRole('button', { name: 'Delete' }).last().click()
    await page.getByRole('button', { name: 'Add 1 item to shopping list' }).click()

    await expect(page).toHaveURL(/\/shopping$/)
    expect(await listItems(user.householdId!)).toEqual([{ name: 'oats', is_checked: false, quantity: 100, unit: 'g' }])
  })

  test('asks before adding the same week twice', async ({ page, user }) => {
    const recipe = await createRecipe(user, { title: 'Toast', ingredients: [{ quantity: 2, unit: '', name: 'bread slices' }] })
    await planRecipe(user, recipe.id, today())

    await page.goto(`/shopping/generate?week=${today()}`)
    await page.getByRole('button', { name: 'Add 1 item to shopping list' }).click()
    await expect(page).toHaveURL(/\/shopping$/)

    await page.goto(`/shopping/generate?week=${today()}`)
    await page.getByRole('button', { name: 'Add 1 item to shopping list' }).click()
    await expect(page.getByText("This week's meals are already on your shopping list. Add them again?")).toBeVisible()
    await page.getByRole('button', { name: 'Add again' }).click()

    await expect(page).toHaveURL(/\/shopping$/)
    expect((await listItems(user.householdId!)).length).toBe(2)
  })

  test('adds items from the keyboard', async ({ page, user }) => {
    await page.goto('/shopping')
    await expect(page.getByText('Your shopping list is empty.', { exact: false })).toBeVisible()

    // Enter saves the item and opens a new one below; Escape drops the empty last one.
    await page.getByRole('button', { name: 'Add item' }).click()
    await page.keyboard.type('milk')
    await page.keyboard.press('Enter')
    await page.keyboard.type('bread')
    await page.keyboard.press('Enter')
    await page.keyboard.press('Escape')

    await expect(page.getByText('2 items')).toBeVisible()
    await expect.poll(async () => (await listItems(user.householdId!)).map((i) => i.name)).toEqual(['milk', 'bread'])
  })

  test('renames, checks off and deletes items', async ({ page, user }) => {
    await addShoppingItems(user, [{ name: 'bred' }, { name: 'milk' }, { name: 'soap' }])
    await page.goto('/shopping')

    // Clicking the text edits it; leaving the field saves (Escape would cancel).
    await page.getByText('bred', { exact: true }).click()
    await page.getByRole('textbox').fill('bread')
    await page.getByRole('textbox').press('Tab')
    await expect(page.getByText('bread', { exact: true })).toBeVisible()

    // Checking an item off hides it.
    await page.getByRole('checkbox').nth(1).check()
    await expect(page.getByText('milk', { exact: true })).toHaveCount(0)

    await page.getByRole('button', { name: 'Delete' }).last().click()
    await expect(page.getByText('soap', { exact: true })).toHaveCount(0)

    await expect
      .poll(async () => (await listItems(user.householdId!)).map(({ name, is_checked }) => `${name}:${is_checked}`))
      .toEqual(['bread:false', 'milk:true'])
  })

  test('clears the whole list after confirming', async ({ page, user }) => {
    await addShoppingItems(user, [{ name: 'apples' }, { name: 'pears' }])

    await page.goto('/shopping')
    await expect(page.getByText('apples')).toBeVisible()
    await page.getByRole('button', { name: 'Clear list' }).click()
    await expect(page.getByText('Remove all items from the list?')).toBeVisible()
    await page.getByRole('button', { name: 'Clear', exact: true }).click()

    await expect(page.getByText('Your shopping list is empty.', { exact: false })).toBeVisible()
    await expect.poll(async () => (await listItems(user.householdId!)).length).toBe(0)
  })

  test('groups items under their shopping category', async ({ page, user }) => {
    await addShoppingItems(user, [
      { name: 'carrots', category: 'Veggies & Fruits' },
      { name: 'baguette', category: 'Bakery' },
    ])

    await page.goto('/shopping')
    await expect(page.getByText('Veggies & Fruits', { exact: true })).toBeVisible()
    await expect(page.getByText('Bakery', { exact: true })).toBeVisible()
  })

  test('lists a recipe planned twice once, and turns typed meals into items', async ({ page, user }) => {
    const recipe = await createRecipe(user, {
      title: 'Twice-weekly pancakes',
      ingredients: [
        { quantity: 200, unit: 'g', name: 'flour' },
        { quantity: 2, unit: '', name: 'eggs' },
      ],
    })
    await planRecipe(user, recipe.id, weekDay(0))
    await planRecipe(user, recipe.id, weekDay(2))
    await planRecipe(user, null, weekDay(1), { customLabel: 'Birthday cake' })
    // Status labels are not things to buy.
    await planRecipe(user, null, weekDay(3), { customLabel: 'Leftovers' })
    await planRecipe(user, null, weekDay(4), { customLabel: 'Eating out' })
    // Next week's meals stay out of this week's list.
    await planRecipe(user, null, weekDay(0, 1), { customLabel: 'Next-week nibbles' })

    await page.goto(`/shopping/generate?week=${thisMonday()}`)
    const pancakes = page.getByRole('region', { name: 'Twice-weekly pancakes' })
    await expect(pancakes.getByText(`${dayLabel(weekDay(0))}, ${dayLabel(weekDay(2))}`)).toBeVisible()
    await expect(page.getByRole('region', { name: 'Birthday cake' })).toBeVisible()
    await expect(page.getByRole('region', { name: 'Leftovers' })).toHaveCount(0)
    await expect(page.getByRole('region', { name: 'Eating out' })).toHaveCount(0)
    await expect(page.getByRole('region', { name: 'Next-week nibbles' })).toHaveCount(0)

    await page.getByRole('button', { name: 'Add 3 items to shopping list' }).click()
    await expect(page).toHaveURL(/\/shopping$/)
    await expect.poll(async () => (await listItems(user.householdId!)).map((i) => i.name).sort()).toEqual(['Birthday cake', 'eggs', 'flour'])
  })

  test('leaves out what you already have and recipes you remove', async ({ page, user }) => {
    const cake = await createRecipe(user, {
      title: 'Sponge cake',
      ingredients: [
        { quantity: 200, unit: 'g', name: 'flour' },
        { quantity: 100, unit: 'g', name: 'sugar' },
      ],
    })
    const soup = await createRecipe(user, { title: 'Skipped soup', ingredients: [{ quantity: 1, unit: '', name: 'leek' }] })
    await planRecipe(user, cake.id, weekDay(0))
    await planRecipe(user, soup.id, weekDay(1))

    await page.goto(`/shopping/generate?week=${thisMonday()}`)
    await expect(page.getByRole('button', { name: 'Add 3 items to shopping list' })).toBeVisible()

    // Ticking an ingredient off means "I already have it".
    await page.getByRole('region', { name: 'Sponge cake' }).getByRole('checkbox').first().check()
    await expect(page.getByRole('button', { name: 'Add 2 items to shopping list' })).toBeVisible()

    const soupBox = page.getByRole('region', { name: 'Skipped soup' })
    await soupBox.getByRole('button', { name: 'Remove from shopping list' }).click()
    await expect(page.getByRole('button', { name: 'Add 1 item to shopping list' })).toBeVisible()
    await soupBox.getByRole('button', { name: 'Undo' }).click()
    await expect(page.getByRole('button', { name: 'Add 2 items to shopping list' })).toBeVisible()
    await soupBox.getByRole('button', { name: 'Remove from shopping list' }).click()

    await page.getByRole('button', { name: 'Add 1 item to shopping list' }).click()
    await expect(page).toHaveURL(/\/shopping$/)
    await expect.poll(async () => (await listItems(user.householdId!)).map((i) => i.name)).toEqual(['sugar'])
  })

  test('an empty week has nothing to add', async ({ page }) => {
    await page.goto(`/shopping/generate?week=${thisMonday()}`)
    await expect(page.getByText("No meals in this week's plan.")).toBeVisible()
    await expect(page.getByRole('button', { name: 'Add 0 items to shopping list' })).toBeDisabled()
    await page.getByRole('button', { name: 'Go back to the planner' }).click()
    await expect(page).toHaveURL(/\/planner/)
  })

  test('the planner shows the portions you shopped for', async ({ page, user }) => {
    const recipe = await createRecipe(user, { title: 'Portioned paella', servings: 2, ingredients: [{ quantity: 300, unit: 'g', name: 'rice' }] })
    await planRecipe(user, recipe.id, weekDay(0))

    await page.goto(`/shopping/generate?week=${thisMonday()}`)
    await page.getByRole('button', { name: 'More portions' }).click()
    await page.getByRole('button', { name: 'Add 1 item to shopping list' }).click()
    await expect(page).toHaveURL(/\/shopping$/)
    await expect.poll(async () => (await listItems(user.householdId!)).map((i) => i.quantity)).toEqual([450])

    await openPlanner(page, thisMonday())
    await expect(page.getByTestId('planner-grid').getByText('(3 portions)')).toBeVisible()
  })

  test('copies the list as text', async ({ page, user, context, browserName }) => {
    // Only Chromium lets a test grant clipboard access; elsewhere the confirmation is all we can see.
    const canReadClipboard = browserName === 'chromium'
    if (canReadClipboard) await context.grantPermissions(['clipboard-read', 'clipboard-write'])
    await addShoppingItems(user, [{ name: 'milk' }, { name: 'flour', quantity: 500, unit: 'g' }])

    await page.goto('/shopping')
    await page.getByRole('button', { name: 'Copy list' }).click()
    await expect(page.getByRole('button', { name: 'Copied!' })).toBeVisible()
    if (!canReadClipboard) return
    const copied = await page.evaluate(() => navigator.clipboard.readText())
    expect(copied.split('\n')).toEqual(['milk', expect.stringMatching(/^500\s?g flour$/)])
  })

  test('a check-off that fails to save is undone and explained', async ({ page, user }) => {
    await addShoppingItems(user, [{ name: 'olive oil' }])
    await page.route('**/api/shopping/items/*', (route) => (route.request().method() === 'PATCH' ? route.abort() : route.continue()))

    await page.goto('/shopping')
    await page.getByRole('checkbox').first().check()
    await expect(page.getByText("Couldn't save the change. Check your connection and try again.")).toBeVisible()
    await expect(page.getByText('olive oil')).toBeVisible()
    expect((await listItems(user.householdId!))[0].is_checked).toBe(false)
  })

  test('Enter on an item adds a new one below it, in the same category', async ({ page, user }) => {
    await addShoppingItems(user, [
      { name: 'carrots', category: 'Veggies & Fruits' },
      { name: 'baguette', category: 'Bakery' },
    ])

    await page.goto('/shopping')
    await page.getByText('carrots', { exact: true }).click()
    await page.getByRole('textbox').press('Enter')
    await page.keyboard.type('leeks')
    await page.keyboard.press('Enter')
    await page.keyboard.press('Escape')

    await expect
      .poll(async () => {
        const { data } = await admin()
          .from('shopping_items')
          .select('name, category')
          .eq('name', 'leeks')
          .in('shopping_list_id', ((await admin().from('shopping_lists').select('id').eq('household_id', user.householdId!)).data ?? []).map((l) => l.id))
        return data
      })
      .toEqual([{ name: 'leeks', category: 'Veggies & Fruits' }])
  })

  test("a household member sees items checked off live", async ({ page, user, browser }) => {
    await addShoppingItems(user, [{ name: 'coffee' }, { name: 'tea' }])
    const partner = await createUser({ joinHousehold: user })
    const partnerPage = await openAs(browser, partner)
    await partnerPage.goto('/shopping')
    await expect(partnerPage.getByText('coffee')).toBeVisible()

    await page.goto('/shopping')
    await page.getByRole('checkbox').first().check()

    // No reload: the partner's list follows through Supabase realtime.
    await expect(partnerPage.getByText('coffee')).toHaveCount(0)
    await expect(partnerPage.getByText('tea')).toBeVisible()

    // New items arrive too.
    await page.getByRole('button', { name: 'Add item' }).click()
    await page.keyboard.type('biscuits')
    await page.keyboard.press('Enter')
    await page.keyboard.press('Escape')
    await expect(partnerPage.getByText('biscuits')).toBeVisible()
    await partnerPage.context().close()
  })
})
