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

/** Roughly visually lossless for photos while still far smaller than the original. */
const ENCODE_QUALITY = 0.82

/**
 * Formats to re-encode into, best first. WebP is much smaller, but a browser
 * that cannot encode it answers `toBlob` with something else entirely, so JPEG
 * — which every canvas implementation must support — has to be there to catch
 * that. Falling all the way back to the untouched original over a missing codec
 * would upload the very megabytes this exists to avoid.
 */
export const ENCODE_FORMATS = ['image/webp', 'image/jpeg'] as const

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

/**
 * Whether a blob from `canvas.toBlob` is worth uploading instead of the original.
 *
 * The type has to be the one we asked for: a browser that cannot encode the
 * requested format substitutes another (Safari has historically returned PNG for
 * WebP), and a PNG of a photograph is typically larger than the JPEG it came
 * from. Size is checked too, so a re-encode that saves nothing is discarded.
 */
export function isUsableEncoding(
  requestedType: string,
  encoded: { type: string; size: number } | null,
  originalBytes: number
): boolean {
  if (!encoded) return false
  const actualType = encoded.type.split(';')[0].trim().toLowerCase()
  if (actualType !== requestedType) return false
  return encoded.size > 0 && encoded.size < originalBytes
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

function encode(canvas: HTMLCanvasElement, type: string): Promise<Blob | null> {
  return new Promise((resolve) => {
    canvas.toBlob(resolve, type, ENCODE_QUALITY)
  })
}

/**
 * Returns the body to upload for `file`: a re-encode capped at
 * {@link MAX_IMAGE_EDGE} in the first of {@link ENCODE_FORMATS} the browser can
 * actually produce, or the original file when none of them work or none saves
 * anything.
 *
 * Re-encoding also drops the EXIF block, so the GPS coordinates a phone writes
 * into a photo do not travel to a public bucket with it.
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

      for (const type of ENCODE_FORMATS) {
        const encoded = await encode(canvas, type)
        if (isUsableEncoding(type, encoded, file.size)) {
          return {
            body: encoded as Blob,
            contentType: type,
            extension: uploadExtension(type, file.name),
          }
        }
      }

      return original
    } finally {
      bitmap.close()
    }
  } catch {
    return original
  }
}
