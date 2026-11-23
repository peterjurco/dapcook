'use client'

import Link from 'next/link'
import { recallListUrl } from '@/lib/recipes/list-url-memory'
import { useClientValue } from '@/lib/utils/use-client-value'

interface BackToRecipesLinkProps {
  ariaLabel: string
  className?: string
  children: React.ReactNode
}

/**
 * "All recipes" link back to the list view the user was browsing, filters
 * included. The server render points at plain /recipes; the remembered URL
 * lives in sessionStorage, so it's swapped in after hydration.
 */
export function BackToRecipesLink({ ariaLabel, className, children }: BackToRecipesLinkProps) {
  const href = useClientValue(recallListUrl, '/recipes')

  return (
    <Link href={href} aria-label={ariaLabel} className={className}>
      {children}
    </Link>
  )
}
