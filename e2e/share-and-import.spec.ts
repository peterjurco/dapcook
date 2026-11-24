import { test, expect, createRecipe, openAs } from './support/fixtures'
import { FAKE_RECIPE_SITE } from './support/env'

test.describe('Sharing a recipe', () => {
  test('a share link shows the recipe to anyone until sharing is disabled', async ({ page, user, browser }) => {
    const recipe = await createRecipe(user, {
      title: 'Shared shortbread',
      ingredients: [{ quantity: 250, unit: 'g', name: 'butter' }],
      steps: ['Cream the butter.'],
    })

    await page.goto(`/recipes/${recipe.id}`)
    await page.getByRole('button', { name: 'Share' }).click()
    const dialog = page.getByRole('dialog', { name: 'Share recipe' })
    await dialog.getByRole('button', { name: 'Create share link' }).click()
    const link = await dialog.getByRole('textbox', { name: 'Share link' }).inputValue()
    expect(link).toMatch(/\/s\/[\w-]+$/)

    const stranger = await openAs(browser, null)
    await stranger.goto(link)
    await expect(stranger.getByRole('heading', { name: 'Shared shortbread' })).toBeVisible()
    await expect(stranger.getByText('butter', { exact: true })).toBeVisible()
    await expect(stranger.getByText('Cream the butter.')).toBeVisible()

    await dialog.getByRole('button', { name: 'Disable sharing' }).click()
    await expect(dialog.getByRole('button', { name: 'Create share link' })).toBeVisible()

    await stranger.goto(link)
    await expect(stranger.getByRole('heading', { name: 'Shared shortbread' })).toHaveCount(0)
    await stranger.context().close()
  })
})

test.describe('Importing a recipe', () => {
  test('imports a recipe from a web page and saves it after review', async ({ page }) => {
    await page.goto('/recipes/import')
    await page.getByPlaceholder('https://www.bbcgoodfood.com/recipes/...').fill(`${FAKE_RECIPE_SITE}/shakshuka`)
    await page.getByRole('button', { name: 'Import', exact: true }).click()

    await expect(page.getByText('Review imported recipe')).toBeVisible()
    await expect(page.getByLabel('Title *')).toHaveValue('Fake-site shakshuka')
    await page.getByRole('button', { name: 'Save recipe' }).click()

    await expect(page).toHaveURL(/\/recipes\/[0-9a-f-]{36}$/)
    await expect(page.getByRole('heading', { name: 'Fake-site shakshuka' })).toBeVisible()
    await expect(page.getByText('Crack in the eggs and cover until set.')).toBeVisible()
  })

  test('explains when a page cannot be imported', async ({ page }) => {
    await page.goto('/recipes/import')
    await page.getByPlaceholder('https://www.bbcgoodfood.com/recipes/...').fill(`${FAKE_RECIPE_SITE}/no-such-recipe`)
    await page.getByRole('button', { name: 'Import', exact: true }).click()

    await expect(page.getByText("That page couldn't be found. Double-check the URL.")).toBeVisible()
  })
})
