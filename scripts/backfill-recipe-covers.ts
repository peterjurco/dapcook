/**
 * One-off backfill: copy recipe covers that still live on third-party sites
 * into our own `recipe-images` bucket.
 *
 * New and edited recipes already mirror their cover on save. This walks the
 * recipes saved before that shipped, so `next/image` can optimise every cover
 * and `images.remotePatterns` can be narrowed to the Supabase host alone.
 *
 * Reads nothing it does not write back, and is safe to re-run: covers already
 * in the bucket are skipped, and a cover that cannot be fetched is left
 * pointing where it does today.
 *
 *   node --env-file=.env.local scripts/backfill-recipe-covers.ts          # dry run
 *   node --env-file=.env.local scripts/backfill-recipe-covers.ts --apply  # write
 */
import { createClient } from '@supabase/supabase-js'
import { isStoredCover, storeCoverImage } from '../src/lib/recipes/cover-image.ts'

async function main() {
  const apply = process.argv.includes('--apply')

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !serviceRoleKey) {
    console.error(
      'Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.\n' +
        'Copy the service role key from the Supabase dashboard (Settings → API) into .env.local,\n' +
        'then run with: node --env-file=.env.local scripts/backfill-recipe-covers.ts'
    )
    process.exit(1)
  }

  const supabase = createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const { data: recipes, error } = await supabase
    .from('recipes')
    .select('id, title, image_url')
    .not('image_url', 'is', null)

  if (error) {
    console.error('Could not read recipes:', error.message)
    if (/api key/i.test(error.message)) {
      console.error(
        'SUPABASE_SERVICE_ROLE_KEY in .env.local still looks like the placeholder.\n' +
          'Copy the real one from the Supabase dashboard: Settings → API → service_role.'
      )
    }
    process.exit(1)
  }

  const external = (recipes ?? []).filter((r) => r.image_url && !isStoredCover(r.image_url))

  console.log(
    `${recipes?.length ?? 0} recipes with a cover · ${external.length} still hosted elsewhere` +
      (apply ? '' : ' · dry run, pass --apply to write')
  )

  let moved = 0
  let failed = 0

  for (const [index, recipe] of external.entries()) {
    const position = `[${index + 1}/${external.length}]`
    const source = recipe.image_url as string

    if (!apply) {
      console.log(`${position} would move  ${recipe.title} — ${new URL(source).hostname}`)
      continue
    }

    const stored = await storeCoverImage(source, { supabase })

    if (stored === source) {
      failed++
      console.warn(`${position} SKIPPED    ${recipe.title} — could not fetch ${new URL(source).hostname}`)
      continue
    }

    const { error: updateError } = await supabase
      .from('recipes')
      .update({ image_url: stored })
      .eq('id', recipe.id)

    if (updateError) {
      failed++
      console.warn(`${position} SKIPPED    ${recipe.title} — ${updateError.message}`)
      continue
    }

    moved++
    console.log(`${position} moved      ${recipe.title}`)
  }

  if (apply) {
    console.log(`\nDone. ${moved} moved, ${failed} left in place.`)
    if (failed > 0) {
      console.log(
        'Re-run to retry the skipped ones. Keep the wildcard in images.remotePatterns\n' +
          'until this reports 0 left in place.'
      )
    }
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
