import sharp from 'sharp'

const FETCH_TIMEOUT_MS = 5_000
const MAX_BYTES = 15 * 1024 * 1024

/**
 * Avatars come from Google sign-in. Only that host is fetched, so a profile
 * field can't turn the card renderer into a request proxy.
 */
export function isTrustedAvatar(url: string | null | undefined): url is string {
  if (!url) return false
  try {
    const { protocol, hostname } = new URL(url)
    return protocol === 'https:' && hostname.endsWith('.googleusercontent.com')
  } catch {
    return false
  }
}

/**
 * Fetches an image and returns it as a JPEG data URI cropped to the given box.
 *
 * `next/og` cannot draw WebP, which is what our covers are stored as, so every
 * photo goes through sharp first. A card without its photo still works, so
 * nothing here throws: any failure returns null and the caller falls back.
 */
export async function jpegDataUri(
  url: string,
  { width, height, fetchImpl = fetch }: { width: number; height: number; fetchImpl?: typeof fetch }
): Promise<string | null> {
  try {
    const response = await fetchImpl(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) })
    if (!response.ok) return null

    const body = Buffer.from(await response.arrayBuffer())
    if (body.byteLength === 0 || body.byteLength > MAX_BYTES) return null

    const jpeg = await sharp(body)
      .rotate()
      .resize(width, height, { fit: 'cover' })
      .jpeg({ quality: 80 })
      .toBuffer()
    return `data:image/jpeg;base64,${jpeg.toString('base64')}`
  } catch {
    return null
  }
}
