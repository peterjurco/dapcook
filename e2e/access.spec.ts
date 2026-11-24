/**
 * Who can reach what. These go through the app's own API with a real session,
 * the way a curious or malicious user could, rather than through the UI.
 *
 * What matters is that the other household's data is untouched and unseen, so
 * that is what's asserted. Status codes are only checked where the API has a
 * clear contract: a DELETE of someone else's row answers 204 because RLS turns
 * it into a no-op, and that is fine.
 */
import { test, expect, admin, addShoppingItems, createRecipe, createUser, openAs, planRecipe, today } from './support/fixtures'

test.describe('Access control', () => {
  test("can't read, change, share or delete another household's recipe", async ({ page }) => {
    const stranger = await createUser()
    const theirs = await createRecipe(stranger, { title: 'Not yours', steps: ['Secret step.'] })

    const read = await page.request.get(`/api/recipes/${theirs.id}`)
    expect(read.status()).toBe(404)
    expect(await read.text()).not.toContain('Secret step.')

    await page.request.put(`/api/recipes/${theirs.id}`, { data: { title: 'Hijacked', ingredients: [], steps: [], tags: [] } })
    const share = await page.request.post(`/api/recipes/${theirs.id}/share`)
    expect(share.ok()).toBe(false)
    await page.request.delete(`/api/recipes/${theirs.id}`)

    const { data } = await admin().from('recipes').select('title, share_token, is_archived').eq('id', theirs.id).single()
    expect(data).toEqual({ title: 'Not yours', share_token: null, is_archived: false })
  })

  test("can't change or delete another household's meal plan", async ({ page }) => {
    const stranger = await createUser()
    const recipe = await createRecipe(stranger, { title: 'Their lunch' })
    const slot = await planRecipe(stranger, recipe.id, today())

    const update = await page.request.put(`/api/planner/slots/${slot.id}`, { data: { custom_label: 'Hijacked' } })
    expect(update.ok()).toBe(false)
    await page.request.delete(`/api/planner/slots/${slot.id}`)

    const { data } = await admin().from('meal_slots').select('recipe_id, custom_label').eq('id', slot.id).single()
    expect(data).toEqual({ recipe_id: recipe.id, custom_label: null })
  })

  test("can't plan another household's recipe", async ({ page, user }) => {
    const stranger = await createUser()
    const theirRecipe = await createRecipe(stranger, { title: 'Borrowed bake' })
    const mine = await createRecipe(user, { title: 'My bake' })
    const slot = await planRecipe(user, mine.id, today())

    const create = await page.request.post('/api/planner/slots', { data: { recipe_id: theirRecipe.id, date: today() } })
    expect(create.status()).toBe(404)
    const repoint = await page.request.put(`/api/planner/slots/${slot.id}`, { data: { recipe_id: theirRecipe.id } })
    expect(repoint.status()).toBe(404)

    const { data } = await admin().from('meal_slots').select('recipe_id').eq('household_id', user.householdId!)
    expect(data).toEqual([{ recipe_id: mine.id }])
  })

  test("can't touch another household's shopping list", async ({ page }) => {
    const stranger = await createUser()
    await addShoppingItems(stranger, [{ name: 'their milk' }])
    const { data: list } = await admin().from('shopping_lists').select('id').eq('household_id', stranger.householdId!).single()
    const { data: item } = await admin().from('shopping_items').select('id').eq('shopping_list_id', list!.id).single()

    await page.request.patch(`/api/shopping/items/${item!.id}`, { data: { is_checked: true, name: 'mine now' } })
    await page.request.delete(`/api/shopping/items/${item!.id}`)
    await page.request.delete(`/api/shopping/list/${list!.id}/items`)

    const { data } = await admin().from('shopping_items').select('name, is_checked').eq('id', item!.id).single()
    expect(data).toEqual({ name: 'their milk', is_checked: false })
  })

  test("the recipe list API only returns the caller's household", async ({ page, user }) => {
    const stranger = await createUser()
    await createRecipe(stranger, { title: 'Stranger salad' })
    await createRecipe(user, { title: 'Own omelette' })

    const res = await page.request.get('/api/recipes')
    expect(res.ok()).toBe(true)
    const body = JSON.stringify(await res.json())
    expect(body).toContain('Own omelette')
    expect(body).not.toContain('Stranger salad')
  })

  test('the API gives signed-out requests nothing but a way to sign in', async ({ browser }) => {
    const anonymous = await openAs(browser, null)
    for (const [method, url] of [
      ['GET', '/api/recipes'],
      ['POST', '/api/recipes'],
      ['GET', '/api/shopping/list'],
      ['POST', '/api/shopping/items'],
      ['GET', '/api/planner/week'],
      ['PATCH', '/api/household'],
      ['PATCH', '/api/profile'],
    ] as const) {
      const res = await anonymous.request.fetch(url, { method, data: method === 'GET' ? undefined : {}, maxRedirects: 0 })
      const signIn = res.status() === 401 || (res.status() === 307 && (res.headers()['location'] ?? '').startsWith('/login'))
      expect.soft(signIn, `${method} ${url} → ${res.status()}`).toBe(true)
    }
    await anonymous.context().close()
  })

  test('the admin page is only for the admin', async ({ page, browser }) => {
    await page.goto('/admin')
    await expect(page).toHaveURL(/\/recipes/)
    await expect(page.getByText('Admin — Households')).toHaveCount(0)

    const adminUser = await createUser({ email: 'e2e-admin@test.local' })
    const adminPage = await openAs(browser, adminUser)
    await adminPage.goto('/admin')
    await expect(adminPage.getByText('Admin — Households')).toBeVisible()
    await adminPage.context().close()
  })
})
