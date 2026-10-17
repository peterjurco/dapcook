const PRODUCTION_URL = 'https://dapcook.vercel.app'
const STAGING_URL = 'https://dapcook-staging.vercel.app'

/**
 * The public origin of this deployment, used as `metadataBase` so link
 * previews point at an image a chat app's crawler can actually fetch.
 *
 * Vercel's own deployment URLs (`VERCEL_URL`) sit behind deployment
 * protection, so production and staging resolve to their stable aliases.
 */
export function siteUrl(env: NodeJS.ProcessEnv = process.env): string {
  if (env.VERCEL_ENV === 'production') return PRODUCTION_URL
  if (env.VERCEL_GIT_COMMIT_REF === 'staging') return STAGING_URL
  if (env.VERCEL_BRANCH_URL) return `https://${env.VERCEL_BRANCH_URL}`
  return `http://localhost:${env.PORT ?? 3000}`
}
