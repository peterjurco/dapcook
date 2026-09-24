'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { recallListUrl } from '@/lib/recipes/list-url-memory'

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
  const [href, setHref] = useState('/recipes')

  useEffect(() => {
    setHref(recallListUrl())
  }, [])

  return (
    <Link href={href} aria-label={ariaLabel} className={className}>
      {children}
    </Link>
  )
}
