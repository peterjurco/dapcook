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
