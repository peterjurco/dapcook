const BASE = 'http://placeholder.invalid'

/**
 * Returns `value` only when it is a same-origin path, so it can be appended to
 * our own origin in a redirect. Anything else — `//evil.com`, `/\evil.com`,
 * `@evil.com` (which turns `https://app@evil.com` into a userinfo trick),
 * absolute URLs, or control characters the URL parser would strip — yields
 * `fallback`.
 */
export function safeNextPath(value: string | null | undefined, fallback: string): string {
  if (!value || !value.startsWith('/') || value[1] === '/' || value[1] === '\\') return fallback
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f]/.test(value)) return fallback
  try {
    if (new URL(value, BASE).origin !== BASE) return fallback
  } catch {
    return fallback
  }
  return value
}
