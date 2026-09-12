import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { RecipeList } from './RecipeList'
import { EMPTY_TAXONOMY, type Taxonomy } from '@/lib/tags/taxonomy'
import { mockTranslate } from '@/test/mockMessages'
import type { TranslationValues } from 'use-intl'
import type { Recipe } from '@/types/database'

vi.mock('next/link', () => ({
  default: ({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) => (
    <a href={href} className={className}>
      {children}
    </a>
  ),
}))

vi.mock('next-intl', () => ({
  useTranslations: (namespace: string) => (key: string, values?: TranslationValues) =>
    mockTranslate(namespace, key, values),
  useLocale: () => 'en',
}))

function makeRecipe(id: string, title: string, tags: string[]): Recipe {
  return {
    id,
    household_id: 'hh-1',
    created_by: 'user-1',
    title,
    description: null,
    source_url: null,
    image_url: null,
    prep_time_min: null,
    cook_time_min: null,
    servings: null,
    tags,
    ingredients: [],
    steps: [],
    notes: null,
    is_archived: false,
    last_used_at: null,
    share_token: null,
    title_normalized: title.toLowerCase(),
    created_at: '2026-08-07T00:00:00.000Z',
    updated_at: '2026-08-07T00:00:00.000Z',
  } as Recipe
}

const recipes = [
  makeRecipe('r1', 'Lasagne', ['main', 'italian']),
  makeRecipe('r2', 'Garlic Bread', ['side', 'italian']),
  makeRecipe('r3', 'Ramen', ['main', 'asian']),
]

const grouped: Taxonomy = {
  groups: [{ id: 'g-course', name: 'Course', position: 0 }],
  tags: {
    main: { color: null, groupId: 'g-course' },
    side: { color: null, groupId: 'g-course' },
    italian: { color: null, groupId: null },
    asian: { color: null, groupId: null },
  },
}

const originalClientWidth = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientWidth')

afterEach(() => {
  if (originalClientWidth) {
    Object.defineProperty(HTMLElement.prototype, 'clientWidth', originalClientWidth)
  }
})

describe('RecipeList filtering', () => {
  it('shows every recipe when nothing is selected', () => {
    render(<RecipeList recipes={recipes} taxonomy={EMPTY_TAXONOMY} defaultFilter={[]} />)
    expect(screen.getByText('Lasagne')).toBeInTheDocument()
    expect(screen.getByText('Garlic Bread')).toBeInTheDocument()
    expect(screen.getByText('Ramen')).toBeInTheDocument()
  })

  it('ORs tags within one group and ANDs across groups', async () => {
    const user = userEvent.setup()
    render(<RecipeList recipes={recipes} taxonomy={grouped} defaultFilter={[]} />)

    await user.click(screen.getByRole('button', { name: 'main' }))
    await user.click(screen.getByRole('button', { name: 'side' }))
    expect(screen.getByText('Lasagne')).toBeInTheDocument()
    expect(screen.getByText('Garlic Bread')).toBeInTheDocument()
    expect(screen.getByText('Ramen')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'italian' }))
    expect(screen.getByText('Lasagne')).toBeInTheDocument()
    expect(screen.getByText('Garlic Bread')).toBeInTheDocument()
    expect(screen.queryByText('Ramen')).not.toBeInTheDocument()
  })

  it('deselects a tag when it is clicked again', async () => {
    const user = userEvent.setup()
    render(<RecipeList recipes={recipes} taxonomy={grouped} defaultFilter={[]} />)

    await user.click(screen.getByRole('button', { name: 'asian' }))
    expect(screen.queryByText('Lasagne')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'asian' }))
    expect(screen.getByText('Lasagne')).toBeInTheDocument()
  })

  it('keeps a visible tag in place when selected inline, instead of reordering', async () => {
    const user = userEvent.setup()
    render(<RecipeList recipes={recipes} taxonomy={grouped} defaultFilter={[]} />)

    // Usage order is main, italian, side, asian.
    const strip = screen.getByTestId('tag-strip-visible')
    const namesBefore = within(strip).getAllByRole('button').map((el) => el.textContent)
    expect(namesBefore).toEqual(['main', 'italian', 'side', 'asian'])

    await user.click(within(strip).getByRole('button', { name: 'asian' }))

    const namesAfter = within(strip).getAllByRole('button').map((el) => el.textContent)
    expect(namesAfter).toEqual(['main', 'italian', 'side', 'asian'])
  })

  it('brings a tag selected from the modal to the front when it was not currently visible', async () => {
    // Pills are stubbed at 60px wide with an 8px gap (src/test/setup.ts).
    // A 90px strip only fits one pill, so "asian" (last by usage) starts
    // off-screen, reachable only through the modal.
    Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, value: 90 })

    const user = userEvent.setup()
    render(<RecipeList recipes={recipes} taxonomy={grouped} defaultFilter={[]} />)

    const strip = screen.getByTestId('tag-strip-visible')
    expect(strip).toHaveTextContent('main')
    expect(strip).not.toHaveTextContent('asian')

    await user.click(screen.getByTestId('filters-button-desktop'))
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'asian' }))
    await user.click(screen.getByRole('button', { name: /close filters/i }))

    expect(strip).toHaveTextContent('asian')
    expect(strip).not.toHaveTextContent('main')
  })

  it('resets the tag row back to plain usage order on Clear all', async () => {
    Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, value: 90 })

    const user = userEvent.setup()
    render(<RecipeList recipes={recipes} taxonomy={grouped} defaultFilter={[]} />)

    await user.click(screen.getByTestId('filters-button-desktop'))
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'asian' }))
    await user.click(screen.getByRole('button', { name: /clear all/i }))
    await user.click(screen.getByRole('button', { name: /close filters/i }))

    expect(screen.getByTestId('tag-strip-visible')).toHaveTextContent('main')
  })
})

describe('RecipeList Filters button and modal', () => {
  const threeGroups: Taxonomy = {
    groups: [
      { id: 'g-course', name: 'Course', position: 0 },
      { id: 'g-cuisine', name: 'Cuisine', position: 1 },
      { id: 'g-mood', name: 'Mood', position: 2 },
    ],
    tags: {
      main: { color: null, groupId: 'g-course' },
      side: { color: null, groupId: 'g-course' },
      italian: { color: null, groupId: 'g-cuisine' },
      asian: { color: null, groupId: 'g-cuisine' },
      comfort: { color: null, groupId: 'g-mood' },
      quick: { color: null, groupId: null },
    },
  }

  const withExtras = [
    ...recipes,
    makeRecipe('r4', 'Stew', ['comfort', 'quick']),
  ]

  it('shows no badge when nothing is selected, and the count once something is', async () => {
    const user = userEvent.setup()
    render(<RecipeList recipes={recipes} taxonomy={grouped} defaultFilter={[]} />)

    expect(screen.getByTestId('filters-button-desktop')).not.toHaveTextContent('1')

    await user.click(screen.getByRole('button', { name: 'main' }))
    expect(screen.getByTestId('filters-button-desktop')).toHaveTextContent('1')

    await user.click(screen.getByRole('button', { name: 'side' }))
    expect(screen.getByTestId('filters-button-desktop')).toHaveTextContent('2')
  })

  it('opens a modal with one labelled section per group, plus Other for ungrouped tags', async () => {
    const user = userEvent.setup()
    render(<RecipeList recipes={withExtras} taxonomy={threeGroups} defaultFilter={[]} />)

    await user.click(screen.getByTestId('filters-button-desktop'))

    const dialog = screen.getByRole('dialog')
    expect(dialog).toHaveTextContent('Course')
    expect(dialog).toHaveTextContent('Cuisine')
    expect(dialog).toHaveTextContent('Mood')
    expect(dialog).toHaveTextContent('Other')
    expect(dialog).toHaveTextContent('quick')
  })

  it('closes the modal via the close button', async () => {
    const user = userEvent.setup()
    render(<RecipeList recipes={recipes} taxonomy={grouped} defaultFilter={[]} />)

    await user.click(screen.getByTestId('filters-button-desktop'))
    expect(screen.getByRole('dialog')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /close filters/i }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('selecting a tag inside the modal applies immediately, live-updating the result count', async () => {
    const user = userEvent.setup()
    render(<RecipeList recipes={recipes} taxonomy={grouped} defaultFilter={[]} />)

    await user.click(screen.getByTestId('filters-button-desktop'))
    expect(screen.getByRole('button', { name: /show 3 recipes/i })).toBeInTheDocument()

    const dialog = screen.getByRole('dialog')
    const { getByRole } = within(dialog)
    await user.click(getByRole('button', { name: 'main' }))

    expect(screen.getByRole('button', { name: /show 2 recipes/i })).toBeInTheDocument()
  })

  it('uses the singular ICU plural form when exactly one recipe matches', async () => {
    const user = userEvent.setup()
    render(<RecipeList recipes={recipes} taxonomy={grouped} defaultFilter={[]} />)

    await user.click(screen.getByTestId('filters-button-desktop'))

    const dialog = screen.getByRole('dialog')
    // "side" only belongs to Garlic Bread, so this narrows the result set to 1.
    await user.click(within(dialog).getByRole('button', { name: 'side' }))

    expect(screen.getByRole('button', { name: /show 1 recipe$/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /show 1 recipes/i })).not.toBeInTheDocument()
  })

  it('clears the whole selection via Clear all', async () => {
    const user = userEvent.setup()
    render(<RecipeList recipes={recipes} taxonomy={grouped} defaultFilter={[]} />)

    await user.click(screen.getByRole('button', { name: 'main' }))
    await user.click(screen.getByTestId('filters-button-desktop'))
    await user.click(screen.getByRole('button', { name: /clear all/i }))

    expect(screen.getByRole('button', { name: /show 3 recipes/i })).toBeInTheDocument()
    expect(screen.getByTestId('filters-button-desktop')).not.toHaveTextContent('1')
  })
})

describe('RecipeList default view', () => {
  it('pre-applies the default filter on mount', () => {
    render(<RecipeList recipes={recipes} taxonomy={grouped} defaultFilter={['main']} />)

    expect(screen.getByText('Lasagne')).toBeInTheDocument()
    expect(screen.getByText('Ramen')).toBeInTheDocument()
    expect(screen.queryByText('Garlic Bread')).not.toBeInTheDocument()
  })

  it('drops stored names that no longer exist instead of emptying the list', () => {
    render(<RecipeList recipes={recipes} taxonomy={grouped} defaultFilter={['gone']} />)

    expect(screen.getByText('Lasagne')).toBeInTheDocument()
    expect(screen.getByText('Garlic Bread')).toBeInTheDocument()
    expect(screen.getByText('Ramen')).toBeInTheDocument()
  })

  it('bypasses the untouched default while searching', async () => {
    const user = userEvent.setup()
    render(<RecipeList recipes={recipes} taxonomy={grouped} defaultFilter={['main']} />)

    expect(screen.queryByText('Garlic Bread')).not.toBeInTheDocument()

    await user.type(screen.getByPlaceholderText('Search recipes...'), 'garlic')
    expect(screen.getByText('Garlic Bread')).toBeInTheDocument()
    expect(screen.getByText(/searching all recipes/i)).toBeInTheDocument()
  })

  it('respects a manually changed selection while searching', async () => {
    const user = userEvent.setup()
    render(<RecipeList recipes={recipes} taxonomy={grouped} defaultFilter={['main']} />)

    await user.click(screen.getByRole('button', { name: 'side' }))
    await user.type(screen.getByPlaceholderText('Search recipes...'), 'a')

    expect(screen.getByText('Garlic Bread')).toBeInTheDocument()
    expect(screen.queryByText(/searching all recipes/i)).not.toBeInTheDocument()
  })

  it('hides the default action in the modal until something is selected', async () => {
    const user = userEvent.setup()
    render(<RecipeList recipes={recipes} taxonomy={grouped} defaultFilter={[]} />)

    await user.click(screen.getByTestId('filters-button-desktop'))
    expect(screen.queryByRole('button', { name: /set as default/i })).not.toBeInTheDocument()

    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'main' }))
    expect(screen.getByRole('button', { name: /set as default/i })).toBeInTheDocument()
  })

  it('shows "Clear default" in the modal when the selection already is the default', async () => {
    const user = userEvent.setup()
    render(<RecipeList recipes={recipes} taxonomy={grouped} defaultFilter={['main']} />)

    await user.click(screen.getByTestId('filters-button-desktop'))
    expect(screen.getByRole('button', { name: /clear default/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /set as default/i })).not.toBeInTheDocument()
  })

  it('saves the selection as the default', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true })
    vi.stubGlobal('fetch', fetchMock)
    const user = userEvent.setup()

    render(<RecipeList recipes={recipes} taxonomy={grouped} defaultFilter={[]} />)
    await user.click(screen.getByRole('button', { name: 'main' }))
    await user.click(screen.getByTestId('filters-button-desktop'))
    await user.click(screen.getByRole('button', { name: /set as default/i }))

    expect(fetchMock).toHaveBeenCalledWith('/api/profile', expect.objectContaining({
      method: 'PATCH',
      body: JSON.stringify({ default_recipe_filter: ['main'] }),
    }))
    expect(await screen.findByRole('button', { name: /clear default/i })).toBeInTheDocument()

    vi.unstubAllGlobals()
  })

  it('keeps the prior default and re-enables the button when saving fails', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false })
    vi.stubGlobal('fetch', fetchMock)
    const user = userEvent.setup()

    render(<RecipeList recipes={recipes} taxonomy={grouped} defaultFilter={[]} />)
    await user.click(screen.getByRole('button', { name: 'main' }))
    await user.click(screen.getByTestId('filters-button-desktop'))
    await user.click(screen.getByRole('button', { name: /set as default/i }))

    expect(fetchMock).toHaveBeenCalledWith('/api/profile', expect.objectContaining({
      method: 'PATCH',
      body: JSON.stringify({ default_recipe_filter: ['main'] }),
    }))

    const button = await screen.findByRole('button', { name: /set as default/i })
    expect(button).not.toBeDisabled()

    vi.unstubAllGlobals()
  })

  it('lets you clear all tags and save that empty state as the new default', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true })
    vi.stubGlobal('fetch', fetchMock)
    const user = userEvent.setup()

    // Already has a saved default of ['main'] — the bug was that the default
    // action disappeared entirely once Clear all emptied the selection.
    render(<RecipeList recipes={recipes} taxonomy={grouped} defaultFilter={['main']} />)

    await user.click(screen.getByTestId('filters-button-desktop'))
    await user.click(screen.getByRole('button', { name: /clear all/i }))

    const button = await screen.findByRole('button', { name: /set as default/i })
    await user.click(button)

    expect(fetchMock).toHaveBeenCalledWith('/api/profile', expect.objectContaining({
      method: 'PATCH',
      body: JSON.stringify({ default_recipe_filter: [] }),
    }))

    vi.unstubAllGlobals()
  })
})
