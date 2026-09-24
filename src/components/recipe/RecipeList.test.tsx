import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
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

// The list reads its initial filters from the URL. Tests set `url.params`
// before rendering; it defaults to an empty query (plain /recipes).
const url = vi.hoisted(() => ({ params: new URLSearchParams() }))
vi.mock('next/navigation', () => ({
  useSearchParams: () => url.params,
  usePathname: () => '/recipes',
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

describe('RecipeList time, portions and ingredient filters', () => {
  const timed = [
    { ...makeRecipe('r1', 'Lasagne', ['main']), prep_time_min: 30, cook_time_min: 60, servings: 6 },
    { ...makeRecipe('r2', 'Garlic Bread', ['side']), prep_time_min: 5, cook_time_min: 10, servings: 2 },
    makeRecipe('r3', 'Ramen', ['main']),
  ]

  afterEach(() => vi.unstubAllGlobals())

  it('filters by a total time preset, hiding recipes without a time', async () => {
    const user = userEvent.setup()
    render(<RecipeList recipes={timed} taxonomy={EMPTY_TAXONOMY} defaultFilter={[]} />)

    await user.click(screen.getByTestId('filters-button-desktop'))
    const time = within(screen.getByRole('group', { name: 'Total time (min)' }))
    await user.click(time.getByRole('button', { name: '≤ 15' }))

    expect(screen.getByRole('button', { name: /show 1 recipe$/i })).toBeInTheDocument()
    expect(screen.getByTestId('filters-button-desktop')).toHaveTextContent('1')
  })

  it('filters by a portions preset', async () => {
    const user = userEvent.setup()
    render(<RecipeList recipes={timed} taxonomy={EMPTY_TAXONOMY} defaultFilter={[]} />)

    await user.click(screen.getByTestId('filters-button-desktop'))
    const portions = within(screen.getByRole('group', { name: 'Portions' }))
    await user.click(portions.getByRole('button', { name: '5+' }))

    expect(screen.getByRole('button', { name: /show 1 recipe$/i })).toBeInTheDocument()
  })

  it('filters by ingredient using the ids the server returns', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ids: ['r2'] }) })
    vi.stubGlobal('fetch', fetchMock)
    const user = userEvent.setup()
    render(<RecipeList recipes={timed} taxonomy={EMPTY_TAXONOMY} defaultFilter={[]} />)

    await user.click(screen.getByTestId('filters-button-desktop'))
    await user.type(screen.getByRole('textbox', { name: 'Ingredient' }), 'garlic')

    expect(await screen.findByRole('button', { name: /show 1 recipe$/i })).toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledWith('/api/recipes/ingredient-search?q=garlic', expect.anything())
    expect(screen.getByTestId('filters-button-desktop')).toHaveTextContent('1')
  })

  it('shows an error and keeps every recipe when the ingredient search fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, json: async () => ({}) }))
    const user = userEvent.setup()
    render(<RecipeList recipes={timed} taxonomy={EMPTY_TAXONOMY} defaultFilter={[]} />)

    await user.click(screen.getByTestId('filters-button-desktop'))
    await user.type(screen.getByRole('textbox', { name: 'Ingredient' }), 'garlic')

    expect(await screen.findByText('Ingredient search failed. Try again.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /show 3 recipes/i })).toBeInTheDocument()
    expect(screen.getByTestId('filters-button-desktop')).not.toHaveTextContent(/\d/)
  })

  it('resets tags, ranges and ingredient on Clear all', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ids: ['r2'] }) }))
    const user = userEvent.setup()
    render(<RecipeList recipes={timed} taxonomy={EMPTY_TAXONOMY} defaultFilter={[]} />)

    await user.click(screen.getByTestId('filters-button-desktop'))
    const dialog = within(screen.getByRole('dialog'))
    await user.click(dialog.getByRole('button', { name: 'side' }))
    await user.click(within(screen.getByRole('group', { name: 'Portions' })).getByRole('button', { name: '1–2' }))
    await user.type(dialog.getByRole('textbox', { name: 'Ingredient' }), 'garlic')
    expect(await screen.findByTestId('filters-button-desktop')).toHaveTextContent('3')

    await user.click(dialog.getByRole('button', { name: /clear all/i }))

    expect(dialog.getByRole('textbox', { name: 'Ingredient' })).toHaveValue('')
    expect(screen.getByRole('button', { name: /show 3 recipes/i })).toBeInTheDocument()
    expect(screen.getByTestId('filters-button-desktop')).not.toHaveTextContent(/\d/)
  })
})

describe('RecipeList with no tagged recipes', () => {
  it('still reaches the filters on desktop when no recipe has a tag', async () => {
    const untagged = [makeRecipe('r1', 'Lasagne', []), makeRecipe('r2', 'Ramen', [])]
    const user = userEvent.setup()
    render(<RecipeList recipes={untagged} taxonomy={EMPTY_TAXONOMY} defaultFilter={[]} />)

    const button = screen.getByTestId('filters-button-desktop')
    expect(button).toBeInTheDocument()

    await user.click(button)
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })
})

describe('RecipeList URL state', () => {
  const timed = [
    { ...makeRecipe('r1', 'Lasagne', ['main']), prep_time_min: 30, cook_time_min: 60, servings: 6 },
    { ...makeRecipe('r2', 'Garlic Bread', ['side']), prep_time_min: 5, cook_time_min: 10, servings: 2 },
    makeRecipe('r3', 'Ramen', ['main']),
  ]

  afterEach(() => {
    url.params = new URLSearchParams()
    window.history.replaceState(null, '', '/')
    sessionStorage.clear()
    vi.restoreAllMocks()
  })

  it('restores the filters from the URL', () => {
    url.params = new URLSearchParams('time=-15&q=bread')
    render(<RecipeList recipes={timed} taxonomy={grouped} defaultFilter={[]} />)

    expect(screen.getByText('Garlic Bread')).toBeInTheDocument()
    expect(screen.queryByText('Lasagne')).not.toBeInTheDocument()
    expect(screen.getByPlaceholderText('Search recipes...')).toHaveValue('bread')
    expect(screen.getByTestId('filters-button-desktop')).toHaveTextContent('1')
  })

  it('lets tags in the URL override the default view, dropping unknown ones', () => {
    url.params = new URLSearchParams('tag=side&tag=gone')
    render(<RecipeList recipes={timed} taxonomy={grouped} defaultFilter={['main']} />)

    expect(screen.getByText('Garlic Bread')).toBeInTheDocument()
    expect(screen.queryByText('Lasagne')).not.toBeInTheDocument()
  })

  it('keeps an explicitly cleared selection instead of re-applying the default', () => {
    url.params = new URLSearchParams('all=1')
    render(<RecipeList recipes={timed} taxonomy={grouped} defaultFilter={['main']} />)

    expect(screen.getByText('Garlic Bread')).toBeInTheDocument()
    expect(screen.getByText('Lasagne')).toBeInTheDocument()
  })

  it('replaces the current history entry with the filtered URL and remembers it', async () => {
    const replaceState = vi.spyOn(window.history, 'replaceState')
    const pushState = vi.spyOn(window.history, 'pushState')
    const user = userEvent.setup()
    render(<RecipeList recipes={timed} taxonomy={grouped} defaultFilter={[]} />)

    await user.click(screen.getByTestId('filters-button-desktop'))
    await user.click(within(screen.getByRole('group', { name: 'Total time (min)' })).getByRole('button', { name: '≤ 15' }))
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'side' }))

    await waitFor(() => expect(replaceState).toHaveBeenLastCalledWith(null, '', '/recipes?tag=side&time=-15'))
    expect(pushState).not.toHaveBeenCalled()
    expect(sessionStorage.getItem('dapcook:recipe-list-url')).toBe('/recipes?tag=side&time=-15')
  })

  it('resets to the default view when navigated to plain /recipes while already on the list', () => {
    // The bottom-nav "Recipes" tab: same page, so the list stays mounted and
    // only the search params change underneath it.
    url.params = new URLSearchParams('time=-15&tag=side')
    const { rerender } = render(<RecipeList recipes={timed} taxonomy={grouped} defaultFilter={['main']} />)
    expect(screen.queryByText('Lasagne')).not.toBeInTheDocument()

    url.params = new URLSearchParams()
    rerender(<RecipeList recipes={timed} taxonomy={grouped} defaultFilter={['main']} />)

    expect(screen.getByText('Lasagne')).toBeInTheDocument()
    expect(screen.getByText('Ramen')).toBeInTheDocument()
    expect(screen.queryByText('Garlic Bread')).not.toBeInTheDocument()
    expect(screen.getByTestId('filters-button-desktop')).toHaveTextContent('1')
  })

  it('does not reset when the params change because the list wrote them itself', async () => {
    const replaceState = vi.spyOn(window.history, 'replaceState')
    const user = userEvent.setup()
    const { rerender } = render(<RecipeList recipes={timed} taxonomy={grouped} defaultFilter={[]} />)

    await user.click(screen.getByTestId('filters-button-desktop'))
    await user.click(within(screen.getByRole('group', { name: 'Total time (min)' })).getByRole('button', { name: '≤ 15' }))
    await waitFor(() => expect(replaceState).toHaveBeenLastCalledWith(null, '', '/recipes?time=-15'))

    // Next keeps useSearchParams in sync with replaceState.
    url.params = new URLSearchParams('time=-15')
    rerender(<RecipeList recipes={timed} taxonomy={grouped} defaultFilter={[]} />)

    expect(screen.getByRole('button', { name: /show 1 recipe$/i })).toBeInTheDocument()
  })

  it('leaves the URL alone on first render when it already matches', async () => {
    window.history.replaceState(null, '', '/recipes?time=-15')
    url.params = new URLSearchParams('time=-15')
    const replaceState = vi.spyOn(window.history, 'replaceState')
    render(<RecipeList recipes={timed} taxonomy={grouped} defaultFilter={[]} />)

    await waitFor(() => expect(sessionStorage.getItem('dapcook:recipe-list-url')).toBe('/recipes?time=-15'))
    expect(replaceState).not.toHaveBeenCalled()
  })
})
