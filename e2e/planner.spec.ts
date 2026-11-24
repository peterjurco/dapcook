import type { Locator, Page } from '@playwright/test'
import {
  test,
  expect,
  admin,
  createRecipe,
  createUser,
  dayLabel,
  openAs,
  openPlanner,
  planRecipe,
  thisMonday,
  weekDay,
  type TestUser,
} from './support/fixtures'

/** The desktop grid's gap between day columns (Tailwind gap-3). */
const GAP = 12

async function slotsOf(user: TestUser) {
  const { data } = await admin()
    .from('meal_slots')
    .select('date, span_days, recipe_id, custom_label')
    .eq('household_id', user.householdId!)
    .order('date')
  return data ?? []
}

/** A meal's card on the desktop grid. */
function gridCard(page: Page, text: string): Locator {
  return page.getByTestId('planner-grid').locator('[data-tour="grid-slot"]').filter({ hasText: text })
}

/** Where a card sits on the grid: first column (1 = first day of the week), columns covered, lane (1 = top). */
async function expectPlaced(card: Locator, { day, span, lane }: { day: number; span: number; lane: number }) {
  await expect(card).toHaveCSS('grid-column-start', String(day))
  await expect(card).toHaveCSS('grid-column-end', String(day + span))
  await expect(card).toHaveCSS('grid-row-start', String(lane))
}

async function columnWidth(page: Page): Promise<number> {
  const grid = (await page.getByTestId('planner-grid').boundingBox())!
  return (grid.width - 6 * GAP) / 7
}

/**
 * Moves a held mouse to (x, y) and releases it once a day there lights up as the drop target.
 * dnd-kit measures its drop targets only after a drag starts, so letting go straight away can
 * drop on nothing when the machine is busy.
 */
async function dropAt(page: Page, x: number, y: number) {
  await page.mouse.move(x, y, { steps: 12 })
  await expect(async () => {
    await page.mouse.move(x + 2, y)
    await page.mouse.move(x, y)
    await expect(page.locator('.ring-blue-300')).toHaveCount(1, { timeout: 250 })
  }).toPass({ timeout: 5000 })
  await page.mouse.up()
}

/** Drags a card by its grip and drops it on day `day` (1–7) of the grid. */
async function dragToDay(page: Page, card: Locator, day: number) {
  const grid = (await page.getByTestId('planner-grid').boundingBox())!
  const col = await columnWidth(page)
  await card.hover()
  const grip = (await card.getByRole('button', { name: /^Drag to (move|reorder)$/ }).boundingBox())!
  await page.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2)
  await page.mouse.down()
  await dropAt(page, grid.x + (day - 1) * (col + GAP) + col / 2, grip.y + 60)
}

/** Drags a card's right edge by `columns` day columns (negative shrinks it). */
async function dragEdge(page: Page, card: Locator, columns: number) {
  const col = await columnWidth(page)
  await card.hover()
  const handle = (await card.getByTitle('Drag to extend or shrink across days').boundingBox())!
  const x = handle.x + handle.width / 2
  const y = handle.y + handle.height / 2
  await page.mouse.move(x, y)
  await page.mouse.down()
  await page.mouse.move(x + columns * (col + GAP), y, { steps: 12 })
  await page.mouse.up()
}

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

  test('"Change" in the add-to-plan picker moves the meal instead of adding it twice', async ({ page, user }) => {
    const recipe = await createRecipe(user, { title: 'Indecisive lasagne' })

    await page.goto(`/recipes/${recipe.id}`)
    await page.getByRole('button', { name: 'Add to Plan' }).click()
    await page.getByRole('button', { name: 'Next week' }).click()
    await page.getByRole('button', { name: new RegExp(`^Wed\\s*${new Date(`${weekDay(2, 1)}T00:00:00`).getDate()}$`) }).click()
    await page.getByRole('button', { name: /^Add to Wednesday/ }).click()
    await expect(page.getByText(`Added to ${dayLabel(weekDay(2, 1))} · next week`)).toBeVisible()

    await page.getByRole('button', { name: 'Change' }).click()
    await page.getByRole('button', { name: new RegExp(`^Fri\\s*${new Date(`${weekDay(4, 1)}T00:00:00`).getDate()}$`) }).click()
    await page.getByRole('button', { name: /^Add to Friday/ }).click()
    await expect(page.getByText(`Added to ${dayLabel(weekDay(4, 1))} · next week`)).toBeVisible()

    await expect.poll(async () => (await slotsOf(user)).map((s) => s.date)).toEqual([weekDay(4, 1)])

    await page.getByRole('button', { name: 'View plan' }).click()
    await expect(page).toHaveURL(new RegExp(`/planner\\?week=${thisMonday(1)}`))
    await expectPlaced(gridCard(page, 'Indecisive lasagne'), { day: 5, span: 1, lane: 1 })

    // The picker remembers the week it last added to.
    await page.goto(`/recipes/${recipe.id}`)
    await page.getByRole('button', { name: 'Add to Plan' }).click()
    await expect(page.getByRole('button', { name: 'Next week' })).toHaveAttribute('aria-pressed', 'true')
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

    await expectPlaced(gridCard(page, 'Weeknight dal'), { day: 3, span: 1, lane: 1 })
    expect((await slotsOf(user)).map((slot) => slot.date)).toEqual([thisMonday(), weekDay(2)])
  })

  test('the grid search says when nothing matches and closes on Escape', async ({ page, user }) => {
    await planRecipe(user, null, thisMonday(), { customLabel: 'Fasting' })
    await openPlanner(page)

    await page.getByRole('button', { name: 'Add meal to Tue' }).click()
    const search = page.getByPlaceholder('Search recipes…')
    await search.fill('no such dish')
    await expect(page.getByText('No recipes found')).toBeVisible()

    await page.keyboard.press('Escape')
    await expect(search).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Add meal to Tue' })).toBeVisible()
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

    expect((await slotsOf(user)).map((slot) => slot.custom_label).sort()).toEqual(['Fasting', 'Leftovers', 'Pizza night'])
  })

  test('stacks several meals on one day and adds another under them', async ({ page, user }) => {
    const soup = await createRecipe(user, { title: 'Lunch soup' })
    const curry = await createRecipe(user, { title: 'Dinner curry' })
    await createRecipe(user, { title: 'Midnight toast' })
    await planRecipe(user, soup.id, weekDay(2))
    await planRecipe(user, curry.id, weekDay(2))

    await openPlanner(page)
    await expectPlaced(gridCard(page, 'Lunch soup'), { day: 3, span: 1, lane: 1 })
    await expectPlaced(gridCard(page, 'Dinner curry'), { day: 3, span: 1, lane: 2 })

    // A day that has meals offers a small "+" under its last one.
    await page.getByRole('button', { name: 'Add meal to Wed' }).click()
    await page.getByPlaceholder('Search recipes…').fill('toast')
    await page.getByRole('button', { name: /Midnight toast/ }).click()

    await expectPlaced(gridCard(page, 'Midnight toast'), { day: 3, span: 1, lane: 3 })
    expect((await slotsOf(user)).map((s) => s.date)).toEqual([weekDay(2), weekDay(2), weekDay(2)])
  })

  test('a multi-day meal spans its days and pushes overlapping meals to the next lane', async ({ page, user }) => {
    const chili = await createRecipe(user, { title: 'Batch chili' })
    const salad = await createRecipe(user, { title: 'Side salad' })
    await planRecipe(user, chili.id, weekDay(0), { spanDays: 3 })
    await planRecipe(user, salad.id, weekDay(1))
    await planRecipe(user, null, weekDay(3), { customLabel: 'Eating out' })

    await openPlanner(page)
    await expectPlaced(gridCard(page, 'Batch chili'), { day: 1, span: 3, lane: 1 })
    await expectPlaced(gridCard(page, 'Side salad'), { day: 2, span: 1, lane: 2 })
    // Thursday is free again, so its meal goes back to the top lane.
    await expectPlaced(gridCard(page, 'Eating out'), { day: 4, span: 1, lane: 1 })
  })

  test('drags a meal to another day', async ({ page, user }) => {
    const recipe = await createRecipe(user, { title: 'Movable moussaka' })
    await planRecipe(user, recipe.id, weekDay(0))

    await openPlanner(page)
    const card = gridCard(page, 'Movable moussaka')
    await dragToDay(page, card, 4)

    await expectPlaced(card, { day: 4, span: 1, lane: 1 })
    await expect.poll(async () => (await slotsOf(user)).map((s) => s.date)).toEqual([weekDay(3)])

    await openPlanner(page, thisMonday())
    await expectPlaced(gridCard(page, 'Movable moussaka'), { day: 4, span: 1, lane: 1 })
  })

  test('drags a custom meal onto a day that already has one', async ({ page, user }) => {
    const recipe = await createRecipe(user, { title: 'Thursday tagine' })
    await planRecipe(user, recipe.id, weekDay(3))
    await planRecipe(user, null, weekDay(0), { customLabel: 'Takeaway' })

    await openPlanner(page)
    await dragToDay(page, gridCard(page, 'Takeaway'), 4)

    await expect.poll(async () => (await slotsOf(user)).map((s) => s.date)).toEqual([weekDay(3), weekDay(3)])
    await expectPlaced(gridCard(page, 'Thursday tagine'), { day: 4, span: 1, lane: 1 })
    await expectPlaced(gridCard(page, 'Takeaway'), { day: 4, span: 1, lane: 2 })
  })

  test('a multi-day meal moved to the end of the week stays inside it', async ({ page, user }) => {
    const recipe = await createRecipe(user, { title: 'Long weekend stew' })
    await planRecipe(user, recipe.id, weekDay(0), { spanDays: 3 })

    await openPlanner(page)
    await dragToDay(page, gridCard(page, 'Long weekend stew'), 7)

    // Dropped on Sunday, a three-day meal starts on Friday instead.
    await expect.poll(async () => (await slotsOf(user)).map((s) => [s.date, s.span_days])).toEqual([[weekDay(4), 3]])
    await expectPlaced(gridCard(page, 'Long weekend stew'), { day: 5, span: 3, lane: 1 })
  })

  test('stretches and shrinks a meal by dragging its edge', async ({ page, user }) => {
    const recipe = await createRecipe(user, { title: 'Stretchy ragu' })
    await planRecipe(user, recipe.id, weekDay(0))

    await openPlanner(page)
    const card = gridCard(page, 'Stretchy ragu')
    await dragEdge(page, card, 2)
    await expectPlaced(card, { day: 1, span: 3, lane: 1 })
    await expect.poll(async () => (await slotsOf(user)).map((s) => s.span_days)).toEqual([3])

    await dragEdge(page, card, -1)
    await expectPlaced(card, { day: 1, span: 2, lane: 1 })
    await expect.poll(async () => (await slotsOf(user)).map((s) => s.span_days)).toEqual([2])
  })

  test("can't stretch a meal past the end of the week", async ({ page, user }) => {
    await planRecipe(user, null, weekDay(4), { customLabel: 'Eating out' })

    await openPlanner(page)
    const card = gridCard(page, 'Eating out')
    await dragEdge(page, card, 5)

    await expectPlaced(card, { day: 5, span: 3, lane: 1 })
    await expect.poll(async () => (await slotsOf(user)).map((s) => s.span_days)).toEqual([3])
  })

  test('a meal that starts last week continues into this one', async ({ page, user }) => {
    const recipe = await createRecipe(user, { title: 'Weekend-spanning paella' })
    // Sunday of last week, for three days: Sunday, then Monday and Tuesday of this week.
    await planRecipe(user, recipe.id, weekDay(-1), { spanDays: 3 })

    await openPlanner(page, thisMonday())
    const card = gridCard(page, 'Weekend-spanning paella')
    await expectPlaced(card, { day: 1, span: 2, lane: 1 })
    await expect(card.getByRole('img', { name: 'Continues from last week' })).toBeVisible()
    // Its length can only be changed from the week it starts in.
    await expect(card.getByTitle('Drag to extend or shrink across days')).toHaveCount(0)

    await page.getByRole('button', { name: 'Previous week' }).click()
    await expect(page).toHaveURL(new RegExp(`week=${thisMonday(-1)}`))
    const lastWeek = gridCard(page, 'Weekend-spanning paella')
    await expectPlaced(lastWeek, { day: 7, span: 1, lane: 1 })
    await expect(lastWeek.getByRole('img', { name: 'Continues from last week' })).toHaveCount(0)
  })

  test('removes a meal after confirming', async ({ page, user }) => {
    const recipe = await createRecipe(user, { title: 'Unwanted udon' })
    await planRecipe(user, recipe.id, thisMonday())

    await openPlanner(page)
    await page.getByRole('button', { name: 'Remove from plan' }).first().click()
    await expect(page.getByText('Remove "Unwanted udon" from the plan?')).toBeVisible()
    await page.getByRole('button', { name: 'Remove', exact: true }).click()

    await expect(page.getByText('Nothing planned for this week')).toBeVisible()
    await expect.poll(async () => (await slotsOf(user)).length).toBe(0)
  })

  test('cancelling the removal keeps a custom meal', async ({ page, user }) => {
    await planRecipe(user, null, weekDay(0), { customLabel: 'Leftovers' })
    await planRecipe(user, null, weekDay(1), { customLabel: 'Fasting' })

    await openPlanner(page)
    const leftovers = gridCard(page, 'Leftovers')
    await leftovers.hover()
    await leftovers.getByRole('button', { name: 'Remove', exact: true }).click()
    await expect(page.getByText('Remove "Leftovers" from the plan?')).toBeVisible()
    await page.getByRole('button', { name: 'Cancel' }).click()
    await expect(leftovers).toBeVisible()

    await leftovers.hover()
    await leftovers.getByRole('button', { name: 'Remove', exact: true }).click()
    // The dialog's button, not another card's "Remove".
    await page.getByText('Remove "Leftovers" from the plan?').locator('xpath=..').getByRole('button', { name: 'Remove' }).click()
    await expect(leftovers).toHaveCount(0)
    await expect.poll(async () => (await slotsOf(user)).map((s) => s.custom_label)).toEqual(['Fasting'])
  })

  test('a planned recipe links to its page', async ({ page, user }) => {
    const recipe = await createRecipe(user, { title: 'Clickable carbonara' })
    await planRecipe(user, recipe.id, weekDay(1))

    await openPlanner(page)
    await gridCard(page, 'Clickable carbonara').getByRole('link', { name: 'Clickable carbonara' }).click()
    await expect(page).toHaveURL(new RegExp(`/recipes/${recipe.id}$`))
    await expect(page.getByRole('heading', { name: 'Clickable carbonara' })).toBeVisible()
  })

  test('generates the shopping list for the week on screen', async ({ page, user }) => {
    const recipe = await createRecipe(user, { title: 'Next-week nachos', ingredients: [{ quantity: 1, unit: '', name: 'tortilla chips' }] })
    await planRecipe(user, recipe.id, weekDay(2, 1))

    await openPlanner(page, thisMonday(1))
    await page.getByRole('button', { name: 'Generate shopping list' }).filter({ visible: true }).click()
    await expect(page).toHaveURL(new RegExp(`/shopping/generate\\?week=${thisMonday(1)}`))
    await expect(page.getByRole('region', { name: 'Next-week nachos' })).toBeVisible()
  })

  test('a week of only custom meals offers no shopping list', async ({ page, user }) => {
    await planRecipe(user, null, weekDay(0), { customLabel: 'Eating out' })

    await openPlanner(page)
    await expect(gridCard(page, 'Eating out')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Generate shopping list' })).toHaveCount(0)
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

/** A day's section in the phone agenda or edit list, found by its "Wed 25" heading. */
function daySection(page: Page, date: string): Locator {
  return page
    .locator('section')
    .filter({ visible: true })
    .filter({ has: page.getByText(dayLabel(date), { exact: true }) })
}

/** A meal's row in the phone edit list. */
function editRow(page: Page, title: string): Locator {
  return page
    .getByRole('button', { name: 'Drag to move to another day' })
    .locator('xpath=..')
    .filter({ hasText: title })
}

test.describe('Planner on a phone', () => {
  test('shows the week as an agenda @mobile', async ({ page, user }) => {
    const recipe = await createRecipe(user, { title: 'Pocket pierogi' })
    await planRecipe(user, recipe.id, thisMonday())

    await openPlanner(page)
    // Both layouts are in the page; only the phone agenda is visible.
    await expect(page.getByText('Pocket pierogi').filter({ visible: true }).first()).toBeVisible()
    await expect(page.getByText('Nothing planned', { exact: true }).filter({ visible: true }).first()).toBeVisible()
  })

  test('repeats a multi-day meal on each of its days @mobile', async ({ page, user }) => {
    const recipe = await createRecipe(user, { title: 'Three-day goulash' })
    await planRecipe(user, recipe.id, weekDay(1), { spanDays: 3 })
    await planRecipe(user, null, weekDay(2), { customLabel: 'Takeaway' })

    await openPlanner(page)
    await expect(daySection(page, weekDay(0)).getByText('Nothing planned')).toBeVisible()
    for (const [offset, badge] of [[1, 'day 1/3'], [2, 'day 2/3'], [3, 'day 3/3']] as const) {
      const day = daySection(page, weekDay(offset))
      await expect(day.getByRole('link', { name: `Three-day goulash ${badge}` })).toBeVisible()
    }
    // Wednesday also has its own meal, under the one carried over.
    await expect(daySection(page, weekDay(2)).getByText('Takeaway')).toBeVisible()
    await expect(daySection(page, weekDay(4)).getByText('Nothing planned')).toBeVisible()
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

  test('shrinks a meal, and a Sunday meal cannot grow @mobile', async ({ page, user }) => {
    const roast = await createRecipe(user, { title: 'Shrinking roast' })
    await planRecipe(user, roast.id, weekDay(0), { spanDays: 3 })
    await planRecipe(user, null, weekDay(6), { customLabel: 'Eating out' })

    await openPlanner(page)
    await page.getByRole('button', { name: 'Edit', exact: true }).click()

    const roastRow = editRow(page, 'Shrinking roast')
    await expect(roastRow.getByText(`${dayLabel(weekDay(0))} → ${dayLabel(weekDay(2))} · 3 days`)).toBeVisible()
    await roastRow.getByRole('button', { name: 'Shrink by one day' }).click()
    await expect(roastRow.getByText(`${dayLabel(weekDay(0))} → ${dayLabel(weekDay(1))} · 2 days`)).toBeVisible()

    const sundayRow = editRow(page, 'Eating out')
    await expect(sundayRow.getByText(`${dayLabel(weekDay(6))} · 1 day`)).toBeVisible()
    await expect(sundayRow.getByRole('button', { name: 'Extend by one day' })).toBeDisabled()
    await expect(sundayRow.getByRole('button', { name: 'Shrink by one day' })).toBeDisabled()

    await expect
      .poll(async () => (await slotsOf(user)).map((s) => s.span_days))
      .toEqual([2, 1])
  })

  test('adds and removes meals in edit mode @mobile', async ({ page, user }) => {
    await createRecipe(user, { title: 'Phone-picked pho' })
    await planRecipe(user, null, weekDay(0), { customLabel: 'Fasting' })

    await openPlanner(page)
    await page.getByRole('button', { name: 'Edit', exact: true }).click()

    await page.getByRole('button', { name: `Add meal to ${dayLabel(weekDay(3))}` }).click()
    await page.getByPlaceholder('Search recipes…').filter({ visible: true }).fill('pho')
    await page.getByRole('button', { name: /Phone-picked pho/ }).filter({ visible: true }).click()
    await expect(daySection(page, weekDay(3)).getByText('Phone-picked pho')).toBeVisible()

    // On the phone a meal is removed straight away, without a confirmation.
    await editRow(page, 'Fasting').getByRole('button', { name: 'Remove from plan' }).click()
    await expect(editRow(page, 'Fasting')).toHaveCount(0)

    await expect
      .poll(async () => (await slotsOf(user)).map((s) => [s.date, s.custom_label ?? 'recipe']))
      .toEqual([[weekDay(3), 'recipe']])

    // Back in the agenda the change shows too.
    await page.getByRole('button', { name: 'Done', exact: true }).click()
    await expect(daySection(page, weekDay(3)).getByRole('link', { name: 'Phone-picked pho' })).toBeVisible()
    await expect(daySection(page, weekDay(0)).getByText('Nothing planned')).toBeVisible()
  })

  test('drags a meal to another day in edit mode @mobile', async ({ page, user }) => {
    const recipe = await createRecipe(user, { title: 'Draggable dumplings' })
    await planRecipe(user, recipe.id, weekDay(0))

    await openPlanner(page)
    await page.getByRole('button', { name: 'Edit', exact: true }).click()

    const from = (await editRow(page, 'Draggable dumplings').getByRole('button', { name: 'Drag to move to another day' }).boundingBox())!
    const drop = (await daySection(page, weekDay(2)).getByText(dayLabel(weekDay(2)), { exact: true }).boundingBox())!
    await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2)
    await page.mouse.down()
    await dropAt(page, drop.x + 20, drop.y + drop.height / 2)

    await expect(daySection(page, weekDay(2)).getByText('Draggable dumplings')).toBeVisible()
    await expect.poll(async () => (await slotsOf(user)).map((s) => s.date)).toEqual([weekDay(2)])
  })

  test('a meal continued from last week is marked and locked in edit mode @mobile', async ({ page, user }) => {
    const recipe = await createRecipe(user, { title: 'Carried-over curry' })
    await planRecipe(user, recipe.id, weekDay(-1), { spanDays: 2 })

    await openPlanner(page, thisMonday())
    await expect(daySection(page, weekDay(0)).getByRole('link', { name: 'Carried-over curry day 2/2' })).toBeVisible()

    await page.getByRole('button', { name: 'Edit', exact: true }).click()
    const row = editRow(page, 'Carried-over curry')
    await expect(row.getByText(`From last week · ${dayLabel(weekDay(0))} · 1 day`)).toBeVisible()
    await expect(row.getByRole('button', { name: 'Extend by one day' })).toBeDisabled()
    await expect(row.getByRole('button', { name: 'Shrink by one day' })).toBeDisabled()
  })

  test('generates the shopping list from the phone @mobile', async ({ page, user }) => {
    const recipe = await createRecipe(user, { title: 'Pocket pasta', ingredients: [{ quantity: 100, unit: 'g', name: 'penne' }] })
    await planRecipe(user, recipe.id, weekDay(1))

    await openPlanner(page)
    await page.getByRole('button', { name: 'Generate shopping list' }).filter({ visible: true }).click()
    await expect(page).toHaveURL(new RegExp(`/shopping/generate\\?week=${thisMonday()}`))
    await expect(page.getByRole('region', { name: 'Pocket pasta' })).toBeVisible()
  })
})
