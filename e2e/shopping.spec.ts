import { test, expect, admin, addShoppingItems, createRecipe, createUser, openAs, planRecipe, today } from './support/fixtures'

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

  // Known issue, found by this test: no change ever reaches the other member's
  // browser. Its realtime channel joins without the user's access token, so RLS
  // filters every row out — even though the same browser client does have the
  // session (cover uploads send it). Also, no migration adds shopping_items to
  // the supabase_realtime publication. Remove `fixme` once live sync is fixed.
  test.fixme("a household member sees items checked off live", async ({ page, user, browser }) => {
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
    await partnerPage.context().close()
  })
})
