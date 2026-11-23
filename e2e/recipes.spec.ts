import { test, expect, createRecipe, createUser } from './support/fixtures'

test.describe('Recipes', () => {
  test('creates a recipe by hand and shows it', async ({ page }) => {
    await page.goto('/recipes/new')

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
})
