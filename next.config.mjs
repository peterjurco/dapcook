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
    // Every recipe cover lives in our own bucket: new and edited recipes mirror
    // theirs on save, and scripts/backfill-recipe-covers.ts moved the rest
    // across. Only that host is listed, so this deployment cannot be used as a
    // general-purpose image proxy. Avatars stay on plain <img> tags rather than
    // widening this list for them.
    remotePatterns: [
      { protocol: 'https', hostname: new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'https://localhost').hostname },
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
