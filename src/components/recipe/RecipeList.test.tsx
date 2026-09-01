import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { RecipeList } from './RecipeList'
import { EMPTY_TAXONOMY, type Taxonomy } from '@/lib/tags/taxonomy'
import type { Recipe } from '@/types/database'

vi.mock('next/link', () => ({
  default: ({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) => (
    <a href={href} className={className}>
      {children}
    </a>
  ),
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
  groups: [{ id: 'g-course', name: 'Course', position: 0, is_pinned: true }],
  tags: {
    main: { color: null, groupId: 'g-course' },
    side: { color: null, groupId: 'g-course' },
    italian: { color: null, groupId: null },
    asian: { color: null, groupId: null },
  },
}

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
})

describe('RecipeList tag area clamp', () => {
  it('clamps the tag area to two rows and expands on demand', async () => {
    const user = userEvent.setup()
    render(<RecipeList recipes={recipes} taxonomy={EMPTY_TAXONOMY} defaultFilter={[]} />)

    const area = screen.getByTestId('tag-area-rest')
    expect(area).toHaveClass('max-h-[68px]')
    expect(area).toHaveClass('overflow-hidden')

    await user.click(screen.getByRole('button', { name: /show all tags/i }))
    expect(screen.getByTestId('tag-area-rest')).not.toHaveClass('max-h-[68px]')

    await user.click(screen.getByRole('button', { name: /show fewer tags/i }))
    expect(screen.getByTestId('tag-area-rest')).toHaveClass('max-h-[68px]')
  })
})

describe('RecipeList pinned group sections', () => {
  const twoGroups: Taxonomy = {
    groups: [
      { id: 'g-course', name: 'Course', position: 0, is_pinned: true },
      { id: 'g-cuisine', name: 'Cuisine', position: 1, is_pinned: true },
      { id: 'g-mood', name: 'Mood', position: 2, is_pinned: false },
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

  it('renders a labelled section per pinned group in position order', () => {
    render(<RecipeList recipes={withExtras} taxonomy={twoGroups} defaultFilter={[]} />)

    const labels = screen.getAllByText(/^(Course|Cuisine|Mood)$/).map((el) => el.textContent)
    expect(labels).toEqual(['Course', 'Cuisine'])
  })

  it('renders every tag of a pinned group without clamping', () => {
    render(<RecipeList recipes={withExtras} taxonomy={twoGroups} defaultFilter={[]} />)

    expect(screen.getByRole('button', { name: 'main' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'side' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'italian' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'asian' })).toBeInTheDocument()
  })

  it('puts unpinned-group tags and ungrouped tags in the clamped remainder', () => {
    render(<RecipeList recipes={withExtras} taxonomy={twoGroups} defaultFilter={[]} />)

    const rest = screen.getByTestId('tag-area-rest')
    expect(rest).toHaveTextContent('comfort')
    expect(rest).toHaveTextContent('quick')
    expect(rest).not.toHaveTextContent('main')
  })

  it('renders no pinned sections when no group is pinned', () => {
    const unpinned: Taxonomy = {
      groups: [{ id: 'g-mood', name: 'Mood', position: 0, is_pinned: false }],
      tags: { comfort: { color: null, groupId: 'g-mood' } },
    }
    render(<RecipeList recipes={withExtras} taxonomy={unpinned} defaultFilter={[]} />)

    expect(screen.queryByText('Mood')).not.toBeInTheDocument()
    expect(screen.getByTestId('tag-area-rest')).toHaveTextContent('comfort')
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

  it('hides the default action until something is selected', async () => {
    const user = userEvent.setup()
    render(<RecipeList recipes={recipes} taxonomy={grouped} defaultFilter={[]} />)

    expect(screen.queryByRole('button', { name: /set as default/i })).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'main' }))
    expect(screen.getByRole('button', { name: /set as default/i })).toBeInTheDocument()
  })

  it('shows "Clear default" when the selection already is the default', () => {
    render(<RecipeList recipes={recipes} taxonomy={grouped} defaultFilter={['main']} />)

    expect(screen.getByRole('button', { name: /clear default/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /set as default/i })).not.toBeInTheDocument()
  })

  it('still offers the default action when every tag sits in a pinned group', async () => {
    const allPinned: Taxonomy = {
      groups: [{ id: 'g-course', name: 'Course', position: 0, is_pinned: true }],
      tags: {
        main: { color: null, groupId: 'g-course' },
        side: { color: null, groupId: 'g-course' },
        italian: { color: null, groupId: 'g-course' },
        asian: { color: null, groupId: 'g-course' },
      },
    }
    const user = userEvent.setup()
    render(<RecipeList recipes={recipes} taxonomy={allPinned} defaultFilter={[]} />)

    expect(screen.queryByTestId('tag-area-rest')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'main' }))
    expect(screen.getByRole('button', { name: /set as default/i })).toBeInTheDocument()
  })

  it('saves the selection as the default', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true })
    vi.stubGlobal('fetch', fetchMock)
    const user = userEvent.setup()

    render(<RecipeList recipes={recipes} taxonomy={grouped} defaultFilter={[]} />)
    await user.click(screen.getByRole('button', { name: 'main' }))
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
    await user.click(screen.getByRole('button', { name: /set as default/i }))

    expect(fetchMock).toHaveBeenCalledWith('/api/profile', expect.objectContaining({
      method: 'PATCH',
      body: JSON.stringify({ default_recipe_filter: ['main'] }),
    }))

    const button = await screen.findByRole('button', { name: /set as default/i })
    expect(button).not.toBeDisabled()

    vi.unstubAllGlobals()
  })
})
