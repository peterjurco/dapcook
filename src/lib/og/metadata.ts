import type { Metadata } from 'next'
import type { Recipe } from '@/types/database'

const MAX_DESCRIPTION = 200

function clip(text: string): string {
  return text.length > MAX_DESCRIPTION ? `${text.slice(0, MAX_DESCRIPTION - 1).trimEnd()}…` : text
}

/** Metadata for `/s/[token]`: the recipe's own name and description in link previews. */
export function sharedRecipeMetadata(recipe: Pick<Recipe, 'title' | 'description'> | null): Metadata {
  const robots = { index: false, follow: false }
  if (!recipe) return { title: 'Shared recipe | dapcook', robots }

  const description = clip(recipe.description?.trim() || 'A recipe shared from dapcook')
  return {
    title: `${recipe.title} | dapcook`,
    description,
    robots,
    openGraph: { siteName: 'dapcook', type: 'article', title: recipe.title, description },
  }
}

/** Metadata for `/join/[token]`: names the household the link invites to. */
export function inviteMetadata(household: { name: string } | null): Metadata {
  if (!household) return { title: 'dapcook' }

  const title = `Join ${household.name} on dapcook`
  const description = 'Share recipes, plan meals and shop together.'
  return {
    title,
    description,
    robots: { index: false, follow: false },
    openGraph: { siteName: 'dapcook', type: 'website', title, description },
  }
}
