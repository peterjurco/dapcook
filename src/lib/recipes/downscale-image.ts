/**
 * Shrinks a picked image in the browser before it is uploaded.
 *
 * Phone cameras hand us 4000px, multi-megabyte JPEGs; a recipe cover is never
 * shown larger than a card or a hero, so uploading the original wastes the
 * user's data on the way up and ours on the way back down. Everything here is
 * best-effort: any browser that cannot decode, draw or encode the file keeps
 * the original, and the upload proceeds exactly as it did before.
 */

/** Recipe covers are never rendered wider than this, so nothing larger is worth storing. */
export const MAX_IMAGE_EDGE = 1600

/** Roughly visually lossless for photos while still far smaller than the JPEG original. */
const WEBP_QUALITY = 0.82

const EXTENSION_BY_TYPE: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/avif': 'avif',
  'image/gif': 'gif',
}

export interface Dimensions {
  width: number
  height: number
}

export interface PreparedImage {
  body: Blob
  contentType: string
  extension: string
}

/**
 * Scales `width` x `height` down so the longest edge is exactly `maxEdge`,
 * preserving the aspect ratio. Images that already fit are returned unchanged —
 * we never upscale — and so are unusable dimensions, which lets callers bail
 * out on a decode that produced nothing.
 */
export function fitWithinLongestEdge(width: number, height: number, maxEdge: number): Dimensions {
  const usable = Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0
  if (!usable) return { width, height }

  const longest = Math.max(width, height)
  if (longest <= maxEdge) return { width, height }

  const shortest = Math.max(1, Math.round((Math.min(width, height) * maxEdge) / longest))
  return width >= height
    ? { width: maxEdge, height: shortest }
    : { width: shortest, height: maxEdge }
}

/** True when the re-encoded image actually saves bytes over the file the user picked. */
export function isWorthReplacing(originalBytes: number, encodedBytes: number): boolean {
  return encodedBytes > 0 && encodedBytes < originalBytes
}

/** The extension to store an upload under, preferring the mime type over the file name. */
export function uploadExtension(mimeType: string, fileName: string): string {
  const fromType = EXTENSION_BY_TYPE[mimeType.split(';')[0].trim().toLowerCase()]
  if (fromType) return fromType

  const fromName = fileName.split('.').pop()?.toLowerCase() ?? ''
  if (fromName && fromName !== fileName.toLowerCase() && /^[a-z0-9]{2,4}$/.test(fromName)) {
    return fromName
  }

  return 'jpg'
}

/** GIFs are the one accepted type where re-encoding would drop the animation. */
function canReencode(file: File): boolean {
  return (
    file.type !== 'image/gif' &&
    typeof createImageBitmap === 'function' &&
    typeof document !== 'undefined'
  )
}

function toWebp(canvas: HTMLCanvasElement): Promise<Blob | null> {
  return new Promise((resolve) => {
    // Browsers without WebP encoding hand back a PNG (or null); either way the
    // size check downstream decides whether it was worth it.
    canvas.toBlob((blob) => resolve(blob?.type === 'image/webp' ? blob : null), 'image/webp', WEBP_QUALITY)
  })
}

/**
 * Returns the body to upload for `file`: a WebP re-encode capped at
 * {@link MAX_IMAGE_EDGE}, or the original file when that is not possible or
 * would not save anything.
 *
 * `imageOrientation: 'from-image'` matters — canvas drawing ignores the EXIF
 * orientation tag phones write, so without it a portrait photo would upload
 * sideways.
 */
export async function prepareImageForUpload(file: File): Promise<PreparedImage> {
  const original: PreparedImage = {
    body: file,
    contentType: file.type || 'application/octet-stream',
    extension: uploadExtension(file.type, file.name),
  }
  if (!canReencode(file)) return original

  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
    try {
      const { width, height } = fitWithinLongestEdge(bitmap.width, bitmap.height, MAX_IMAGE_EDGE)
      if (!(width > 0) || !(height > 0)) return original

      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      const context = canvas.getContext('2d')
      if (!context) return original
      context.drawImage(bitmap, 0, 0, width, height)

      const encoded = await toWebp(canvas)
      if (!encoded || !isWorthReplacing(file.size, encoded.size)) return original

      return { body: encoded, contentType: 'image/webp', extension: 'webp' }
    } finally {
      bitmap.close()
    }
  } catch {
    return original
  }
}
