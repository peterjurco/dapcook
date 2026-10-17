import { unstable_noStore as noStore } from 'next/cache'
import { ImageResponse } from 'next/og'
import { AppCard, OG_SIZE, RecipePhotoCard, RecipeTitleCard } from '@/lib/og/cards'
import { loadOgFonts } from '@/lib/og/fonts'
import { jpegDataUri } from '@/lib/og/photo'
import { isStoredCover } from '@/lib/recipes/cover-image'
import { getSharedRecipe } from '@/lib/recipes/shared-recipe'

export const alt = 'A recipe shared from dapcook'
export const size = OG_SIZE
export const contentType = 'image/png'

export default async function Image({ params }: { params: { token: string } }) {
  noStore()
  const [recipe, fonts] = await Promise.all([getSharedRecipe(params.token).catch(() => null), loadOgFonts()])

  // Only covers in our own bucket are fetched, mirroring next.config's image
  // policy: this route must not become a proxy for arbitrary URLs.
  const photo = isStoredCover(recipe?.image_url) ? await jpegDataUri(recipe!.image_url!, OG_SIZE) : null

  const card = !recipe ? (
    <AppCard />
  ) : photo ? (
    <RecipePhotoCard photo={photo} />
  ) : (
    <RecipeTitleCard title={recipe.title} />
  )
  return new ImageResponse(card, { ...OG_SIZE, fonts })
}
