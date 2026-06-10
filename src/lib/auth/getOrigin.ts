import { headers } from 'next/headers'

function isLocal(host: string): boolean {
  return host.startsWith('localhost') || host.startsWith('127.0.0.1')
}

/**
 * Origin (scheme + host) of the current request, so OAuth redirects land back on
 * whatever deployment the user is actually on — production, a Vercel preview, or
 * localhost — instead of a single build-time URL. Falls back to NEXT_PUBLIC_SITE_URL
 * when there are no request headers (e.g. outside a request context).
 */
export function getOrigin(): string {
  const h = headers()
  const host = h.get('x-forwarded-host') ?? h.get('host')
  if (host) {
    const proto = h.get('x-forwarded-proto') ?? (isLocal(host) ? 'http' : 'https')
    return `${proto}://${host}`
  }
  return process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'
}
