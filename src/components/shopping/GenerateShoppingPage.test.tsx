import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createTranslator } from 'use-intl'
import { GenerateShoppingPage } from './GenerateShoppingPage'
import { mockTranslate } from '@/test/mockMessages'
import skMessages from '../../../messages/sk/shopping.json'
import type { TranslationValues } from 'use-intl'
import type { PlanSlot } from '@/lib/shopping/plan-entries'
import type { Ingredient } from '@/types/recipe'

const mockPush = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: mockPush }) }))
vi.mock('next-intl', () => ({
  useLocale: () => 'en',
  useTranslations: (namespace: string) => (key: string, values?: TranslationValues) =>
    mockTranslate(namespace, key, values),
}))

beforeEach(() => {
  vi.clearAllMocks()
  global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ count: 1 }) } as Response)
})

const ing = (p: Partial<Ingredient>): Ingredient => ({ id: 'x', quantity: null, unit: '', name: '', notes: '', ...p })

function recipeSlot(p: { id: string; day_of_week: number; title: string; servings: number | null; ingredients?: Ingredient[] }): PlanSlot {
  return {
    id: `slot-${p.id}`,
    week_plan_id: 'w',
    day_of_week: p.day_of_week,
    meal_type: 'lunch',
    recipe_id: p.id,
    custom_label: null,
    servings_scale: 1,
    span_days: 1,
    created_at: '2026-01-01T00:00:00.000Z',
    recipe: {
      id: p.id,
      title: p.title,
      image_url: null,
      cook_time_min: null,
      prep_time_min: null,
      servings: p.servings,
      ingredients: p.ingredients ?? [],
    },
  }
}

function customSlot(p: { id: string; day_of_week: number; label: string }): PlanSlot {
  return {
    id: `slot-${p.id}`,
    week_plan_id: 'w',
    day_of_week: p.day_of_week,
    meal_type: 'lunch',
    recipe_id: null,
    custom_label: p.label,
    servings_scale: 1,
    span_days: 1,
    created_at: '2026-01-01T00:00:00.000Z',
    recipe: null,
  }
}

const weekStart = new Date('2026-06-08T00:00:00.000Z')

const carbonara = recipeSlot({
  id: 'r1',
  day_of_week: 1,
  title: 'Carbonara',
  servings: 2,
  ingredients: [ing({ quantity: 200, unit: 'g', name: 'spaghetti' }), ing({ quantity: 1, name: 'onion' })],
})

function renderPage(slots: PlanSlot[] = [carbonara, customSlot({ id: 'c1', day_of_week: 2, label: 'rice' })]) {
  render(<GenerateShoppingPage weekStart={weekStart} slots={slots} />)
}

const box = (name: string) => within(screen.getByRole('region', { name }))

async function setPortions(boxName: string, value: string) {
  const input = box(boxName).getByRole('spinbutton', { name: 'Portions' })
  await userEvent.clear(input)
  await userEvent.type(input, value)
}

function lastFetchBody() {
  const calls = vi.mocked(global.fetch).mock.calls
  return JSON.parse(calls[calls.length - 1][1]!.body as string)
}

describe('GenerateShoppingPage', () => {
  it('shows a box per recipe with its scaled ingredients and a box per typed custom meal', () => {
    renderPage([carbonara, customSlot({ id: 'c1', day_of_week: 2, label: 'rice' }), customSlot({ id: 'c2', day_of_week: 3, label: 'Eating out' })])

    expect(box('Carbonara').getByText('spaghetti')).toBeInTheDocument()
    expect(box('Carbonara').getByText('200g')).toBeInTheDocument()
    expect(box('Carbonara').getByText('onion')).toBeInTheDocument()
    expect(box('rice').queryAllByRole('checkbox')).toHaveLength(0)
    expect(screen.queryByText('Eating out')).toBeNull()
  })

  it('notes a recipe without ingredients', () => {
    renderPage([recipeSlot({ id: 'r2', day_of_week: 1, title: 'Toast', servings: 1 })])
    expect(box('Toast').getByText('This recipe has no ingredients.')).toBeInTheDocument()
  })

  it('collapses the same custom meal across days into one box', () => {
    renderPage([customSlot({ id: 'c1', day_of_week: 1, label: 'rice' }), customSlot({ id: 'c2', day_of_week: 3, label: 'rice' })])
    expect(screen.getAllByText('rice')).toHaveLength(1)
  })

  it('rescales ingredients when portions change', async () => {
    renderPage()
    await setPortions('Carbonara', '3')
    expect(box('Carbonara').getByText('300g')).toBeInTheDocument()
  })

  it('rescales an edited ingredient when portions change', async () => {
    renderPage()
    await userEvent.click(box('Carbonara').getByText('spaghetti'))
    const editor = box('Carbonara').getByDisplayValue('200g spaghetti')
    await userEvent.clear(editor)
    await userEvent.type(editor, '150g spaghetti{Enter}')
    expect(box('Carbonara').getByText('150g')).toBeInTheDocument()

    await setPortions('Carbonara', '4')
    expect(box('Carbonara').getByText('300g')).toBeInTheDocument()
  })

  it('leaves checked ingredients out and adds the rest to the list', async () => {
    renderPage()
    expect(screen.getByRole('button', { name: 'Add 3 items to shopping list' })).toBeInTheDocument()

    await userEvent.click(box('Carbonara').getAllByRole('checkbox')[1])
    const addButton = await screen.findByRole('button', { name: 'Add 2 items to shopping list' })
    await userEvent.click(addButton)

    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/shopping'))
    expect(global.fetch).toHaveBeenCalledWith('/api/shopping/items/add-from-plan', expect.objectContaining({ method: 'POST' }))
    expect(lastFetchBody()).toEqual({
      ingredients: [{ name: 'spaghetti', quantity: 200, unit: 'g', recipe_id: 'r1' }],
      customItems: [{ name: 'rice', portions: 1 }],
    })
  })

  it('removes a whole recipe and can undo it', async () => {
    renderPage()
    await userEvent.click(box('Carbonara').getByRole('button', { name: 'Remove from shopping list' }))
    expect(screen.getByRole('button', { name: 'Add 1 item to shopping list' })).toBeInTheDocument()
    expect(box('Carbonara').queryByText('spaghetti')).toBeNull()

    await userEvent.click(box('Carbonara').getByRole('button', { name: 'Undo' }))
    expect(screen.getByRole('button', { name: 'Add 3 items to shopping list' })).toBeInTheDocument()
  })

  it('shows an error and stays on the page when adding fails', async () => {
    vi.mocked(global.fetch).mockResolvedValue({ ok: false, json: async () => ({}) } as Response)
    renderPage()
    await userEvent.click(screen.getByRole('button', { name: 'Add 3 items to shopping list' }))
    expect(await screen.findByText('Something went wrong. Please try again.')).toBeInTheDocument()
    expect(mockPush).not.toHaveBeenCalled()
    expect(box('Carbonara').getByText('spaghetti')).toBeInTheDocument()
  })

  it('keeps the quantity when the editor is cleared and blurred', async () => {
    renderPage()
    await userEvent.click(box('Carbonara').getByText('spaghetti'))
    await userEvent.clear(box('Carbonara').getByDisplayValue('200g spaghetti'))
    await userEvent.tab()
    expect(box('Carbonara').getByText('200g')).toBeInTheDocument()

    await setPortions('Carbonara', '3')
    expect(box('Carbonara').getByText('300g')).toBeInTheDocument()
  })

  it('drops the quantity when an ingredient is edited to its bare name', async () => {
    renderPage()
    await userEvent.click(box('Carbonara').getByText('spaghetti'))
    const editor = box('Carbonara').getByDisplayValue('200g spaghetti')
    await userEvent.clear(editor)
    await userEvent.type(editor, 'spaghetti{Enter}')
    expect(box('Carbonara').queryByText('200g')).toBeNull()

    await userEvent.click(screen.getByRole('button', { name: 'Add 3 items to shopping list' }))
    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/shopping'))
    expect(lastFetchBody().ingredients[0]).toEqual({ name: 'spaghetti', quantity: null, unit: null, recipe_id: 'r1' })
  })

  it('sends only custom items when the recipe is removed', async () => {
    renderPage()
    await userEvent.click(box('Carbonara').getByRole('button', { name: 'Remove from shopping list' }))
    await userEvent.click(screen.getByRole('button', { name: 'Add 1 item to shopping list' }))
    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/shopping'))
    expect(lastFetchBody()).toEqual({ ingredients: [], customItems: [{ name: 'rice', portions: 1 }] })
  })

  it('shows a network error and stays on the page when the request fails', async () => {
    vi.mocked(global.fetch).mockRejectedValue(new Error('offline'))
    renderPage()
    await userEvent.click(screen.getByRole('button', { name: 'Add 3 items to shopping list' }))
    expect(await screen.findByText('Network error. Please try again.')).toBeInTheDocument()
    expect(mockPush).not.toHaveBeenCalled()
  })

  it('leaves a deleted ingredient out of the count and the request', async () => {
    renderPage()
    await userEvent.click(box('Carbonara').getAllByRole('button', { name: 'Delete' })[1])
    expect(box('Carbonara').queryByText('onion')).toBeNull()
    await userEvent.click(screen.getByRole('button', { name: 'Add 2 items to shopping list' }))
    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/shopping'))
    expect(lastFetchBody()).toEqual({
      ingredients: [{ name: 'spaghetti', quantity: 200, unit: 'g', recipe_id: 'r1' }],
      customItems: [{ name: 'rice', portions: 1 }],
    })
  })

  it('remembers recipe portions after a successful add', async () => {
    localStorage.removeItem('recipe_portions')
    renderPage()
    await userEvent.click(screen.getByRole('button', { name: 'Add 3 items to shopping list' }))
    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/shopping'))
    expect(JSON.parse(localStorage.getItem('recipe_portions')!)).toEqual({ r1: 2 })
  })

  it('disables adding and explains why when there are too many ingredients', () => {
    const ingredients = Array.from({ length: 301 }, (_, i) => ing({ name: `item ${i}` }))
    renderPage([recipeSlot({ id: 'r1', day_of_week: 1, title: 'Feast', servings: 1, ingredients })])
    expect(screen.getByRole('button', { name: 'Add 301 items to shopping list' })).toBeDisabled()
    expect(
      screen.getByText('Too many ingredients (300 max). Remove some recipes or tick off what you already have.'),
    ).toBeInTheDocument()
  })

  // Slovak has a distinct "few" plural category (2-4) that English doesn't —
  // check it against the real catalog so the one/few/other forms aren't collapsed.
  it('uses the Slovak "few" plural category for counts 2-4', () => {
    const t = createTranslator({ locale: 'sk', namespace: 'shopping', messages: { shopping: skMessages } })
    expect(t('generate.addToList', { count: 1 })).toBe('Pridať 1 položku do zoznamu')
    expect(t('generate.addToList', { count: 3 })).toBe('Pridať 3 položky do zoznamu')
    expect(t('generate.addToList', { count: 5 })).toBe('Pridať 5 položiek do zoznamu')
  })
})
