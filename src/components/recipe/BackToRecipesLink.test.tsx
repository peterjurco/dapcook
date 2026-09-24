import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { BackToRecipesLink } from './BackToRecipesLink'
import { rememberListUrl } from '@/lib/recipes/list-url-memory'

vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}))

afterEach(() => sessionStorage.clear())

describe('BackToRecipesLink', () => {
  it('goes to plain /recipes when no list view was remembered', () => {
    render(<BackToRecipesLink ariaLabel="All recipes">back</BackToRecipesLink>)
    expect(screen.getByRole('link', { name: 'All recipes' })).toHaveAttribute('href', '/recipes')
  })

  it('returns to the filtered list the user came from', () => {
    rememberListUrl('/recipes?time=-30&tag=main')
    render(<BackToRecipesLink ariaLabel="All recipes">back</BackToRecipesLink>)
    expect(screen.getByRole('link', { name: 'All recipes' })).toHaveAttribute('href', '/recipes?time=-30&tag=main')
  })
})
