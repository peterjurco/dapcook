import createNextIntlPlugin from 'next-intl/plugin'

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts')

/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    staleTimes: {
      dynamic: 0,
    },
    instrumentationHook: true,
  },
  images: {
    // New and edited recipes mirror their cover into our own bucket, so over
    // time every cover is served from the Supabase host below. Recipes saved
    // before that are still pointing at the site they were imported from —
    // keep the wildcard until the backfill has moved them all across, then
    // drop it so this deployment stops being a general-purpose image proxy.
    remotePatterns: [
      { protocol: 'https', hostname: new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'https://localhost').hostname },
      { protocol: 'https', hostname: '**' },
    ],
    formats: ['image/avif', 'image/webp'],
    // Stored covers are written under a fresh UUID and never overwritten, so a
    // long optimiser cache costs nothing and avoids re-fetching the original.
    minimumCacheTTL: 60 * 60 * 24 * 31,
  },
  async headers() {
    return [
      {
        source: '/s/:path*',
        headers: [
          {
            key: 'X-Robots-Tag',
            value: 'noindex, nofollow',
          },
          {
            key: 'Referrer-Policy',
            value: 'no-referrer',
          },
        ],
      },
    ]
  },
}

export default withNextIntl(nextConfig)
