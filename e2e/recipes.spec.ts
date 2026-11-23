import { test, expect, admin, createRecipe, createUser, openRecipeForm } from './support/fixtures'

test.describe('Recipes', () => {
  test('creates a recipe by hand and shows it', async ({ page }) => {
    await openRecipeForm(page, '/recipes/new')

    await page.getByLabel('Title *').fill('Lemon pasta')
    await page.getByLabel('Servings').fill('2')

    await page.getByRole('button', { name: 'Add ingredient' }).click()
    await page.getByPlaceholder('200', { exact: true }).last().fill('250')
    await page.getByPlaceholder('g', { exact: true }).last().fill('g')
    await page.getByPlaceholder('chicken breast').last().fill('spaghetti')

    await page.getByRole('button', { name: 'Add step' }).click()
    await page.getByPlaceholder('Describe this step...').last().fill('Boil the pasta.')

    await page.getByRole('button', { name: 'Save recipe' }).click()

    await expect(page).toHaveURL(/\/recipes\/[0-9a-f-]{36}$/)
    await expect(page.getByRole('heading', { name: 'Lemon pasta' })).toBeVisible()
    await expect(page.getByText('spaghetti')).toBeVisible()
    await expect(page.getByText('Boil the pasta.')).toBeVisible()

    await page.goto('/recipes')
    await expect(page.getByText('Lemon pasta')).toBeVisible()
  })

  test('a recipe needs a title', async ({ page, user }) => {
    await openRecipeForm(page, '/recipes/new')
    await page.getByRole('button', { name: 'Save recipe' }).click()
    await expect(page).toHaveURL(/\/recipes\/new$/)
    const { count } = await admin().from('recipes').select('id', { count: 'exact', head: true }).eq('household_id', user.householdId!)
    expect(count).toBe(0)
  })

  test('pastes a block of ingredients and steps', async ({ page }) => {
    await openRecipeForm(page, '/recipes/new')
    await page.getByLabel('Title *').fill('Pasted bread')

    // With AI parsing off (as in e2e) each pasted line becomes one ingredient / step as written.
    await page.getByRole('button', { name: 'Paste text' }).first().click()
    const ingredientsBox = page.getByPlaceholder(/^200g chicken breast/)
    await ingredientsBox.fill('500 g flour\n1 tsp salt')
    await page.getByRole('button', { name: 'Parse' }).click()
    await expect(ingredientsBox).toHaveCount(0) // closes once parsed

    await page.getByRole('button', { name: 'Paste text' }).last().click()
    const stepsBox = page.getByPlaceholder(/^1\. Preheat the oven/)
    await stepsBox.fill('1. Mix everything.\n2. Bake for an hour.')
    await page.getByRole('button', { name: 'Parse' }).click()
    await expect(stepsBox).toHaveCount(0)

    await page.getByRole('button', { name: 'Save recipe' }).click()
    await expect(page.getByRole('heading', { name: 'Pasted bread' })).toBeVisible()
    await expect(page.getByText('500 g flour')).toBeVisible()
    await expect(page.getByText('Bake for an hour.')).toBeVisible()
  })

  test('edits a recipe', async ({ page, user }) => {
    const recipe = await createRecipe(user, {
      title: 'Plain rice',
      ingredients: [{ quantity: 200, unit: 'g', name: 'rice' }],
    })

    await page.goto(`/recipes/${recipe.id}`)
    await page.getByRole('link', { name: 'Edit' }).click()
    await expect(page).toHaveURL(new RegExp(`/recipes/${recipe.id}/edit$`))

    await page.getByLabel('Title *').fill('Fried rice')
    await page.getByLabel('Notes').fill('Use day-old rice.')
    await page.getByRole('button', { name: 'Save', exact: true }).click()

    await expect(page).toHaveURL(new RegExp(`/recipes/${recipe.id}$`))
    await expect(page.getByRole('heading', { name: 'Fried rice' })).toBeVisible()
    await expect(page.getByText('Use day-old rice.')).toBeVisible()
  })

  test('deletes a recipe after confirming', async ({ page, user }) => {
    const recipe = await createRecipe(user, { title: 'Doomed dumplings' })
    await createRecipe(user, { title: 'Surviving soup' })

    await openRecipeForm(page, `/recipes/${recipe.id}/edit`)
    await page.getByRole('button', { name: 'Delete', exact: true }).click()
    await expect(page.getByText('Delete this recipe?')).toBeVisible()
    await page.getByRole('button', { name: 'Yes, delete' }).click()

    await expect(page).toHaveURL(/\/recipes$/)
    await expect(page.getByText('Surviving soup')).toBeVisible()
    await expect(page.getByText('Doomed dumplings')).toHaveCount(0)
  })

  test('uploads a cover photo to storage', async ({ page, user }) => {
    const recipe = await createRecipe(user, { title: 'Photogenic pie' })
    // A 1×1 PNG.
    const png = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
      'base64'
    )

    await openRecipeForm(page, `/recipes/${recipe.id}/edit`)
    // The browser uploads straight to Supabase Storage with the user's own session.
    const uploaded = page.waitForResponse((r) => r.url().includes('/storage/v1/object/recipe-images/') && r.request().method() === 'POST')
    await page.locator('input[type="file"]').setInputFiles({ name: 'pie.png', mimeType: 'image/png', buffer: png })
    expect((await uploaded).ok()).toBe(true)
    await page.getByRole('button', { name: 'Save', exact: true }).click()

    await expect
      .poll(async () => (await admin().from('recipes').select('image_url').eq('id', recipe.id).single()).data?.image_url ?? '')
      .toMatch(/\/storage\/v1\/object\/public\/recipe-images\/[\w-]+\.\w+$/)
    const { data } = await admin().from('recipes').select('image_url').eq('id', recipe.id).single()
    const stored = await page.request.get(data!.image_url!)
    expect(stored.ok()).toBe(true)
  })

  test('searches recipes by title', async ({ page, user }) => {
    await createRecipe(user, { title: 'Mushroom risotto' })
    await createRecipe(user, { title: 'Banana bread' })

    await page.goto('/recipes')
    await page.getByPlaceholder('Search recipes...').fill('risotto')
    await expect(page.getByText('Mushroom risotto')).toBeVisible()
    await expect(page.getByText('Banana bread')).toHaveCount(0)

    await page.getByPlaceholder('Search recipes...').fill('nothing like this')
    await expect(page.getByText('No recipes match your search')).toBeVisible()
  })

  test('filters recipes by tag', async ({ page, user }) => {
    await createRecipe(user, { title: 'Tofu curry', tags: ['vegan'] })
    await createRecipe(user, { title: 'Beef stew', tags: ['meat'] })

    await page.goto('/recipes')
    await page.getByRole('button', { name: 'Filters' }).click()
    const filters = page.getByRole('dialog', { name: 'Filters' })
    await filters.getByRole('button', { name: 'vegan' }).click()
    await filters.getByRole('button', { name: /^Show \d+ recipes?$/ }).click()

    await expect(page.getByText('Tofu curry')).toBeVisible()
    await expect(page.getByText('Beef stew')).toHaveCount(0)
  })

  test('adds tags while editing a recipe', async ({ page, user }) => {
    const recipe = await createRecipe(user, { title: 'Tagless tart' })

    await openRecipeForm(page, `/recipes/${recipe.id}/edit`)
    const tagInput = page.getByPlaceholder('Type a tag and press Enter')
    await tagInput.fill('dessert')
    await tagInput.press('Enter')
    await page.getByRole('button', { name: 'Save', exact: true }).click()

    await expect(page.getByRole('heading', { name: 'Tagless tart' })).toBeVisible()
    await expect(page.getByText('dessert')).toBeVisible()
    const { data } = await admin().from('recipes').select('tags').eq('id', recipe.id).single()
    expect(data?.tags).toEqual(['dessert'])
  })

  test("another household's recipes are invisible", async ({ page, user }) => {
    const stranger = await createUser()
    const theirs = await createRecipe(stranger, { title: 'Secret stranger stew' })
    await createRecipe(user, { title: 'My own soup' })

    await page.goto('/recipes')
    await expect(page.getByText('My own soup')).toBeVisible()
    await expect(page.getByText(theirs.title)).toHaveCount(0)

    // Opening it directly must not leak it either.
    await page.goto(`/recipes/${theirs.id}`)
    await expect(page.getByText(theirs.title)).toHaveCount(0)
  })

  test('an empty cookbook offers import and manual entry', async ({ page }) => {
    await page.goto('/recipes')
    await expect(page.getByText('No recipes yet')).toBeVisible()
    await page.getByRole('link', { name: 'Add manually' }).click()
    await expect(page).toHaveURL(/\/recipes\/new$/)
  })
})
