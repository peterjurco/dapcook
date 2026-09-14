export const RECIPE_IMAGE_BUCKET = 'recipe-images'

/** Covers above this are left where they are rather than copied into our bucket. */
const MAX_COVER_BYTES = 15 * 1024 * 1024

/** How long we are willing to wait on someone else's CDN before giving up. */
const FETCH_TIMEOUT_MS = 10_000

const EXTENSION_BY_TYPE: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/avif': 'avif',
  'image/gif': 'gif',
}

/** Minimal shape of the Supabase storage API this module needs. */
interface StorageClient {
  storage: {
    from(bucket: string): {
      upload(
        path: string,
        body: ArrayBuffer | Blob,
        options?: { contentType?: string; upsert?: boolean }
      ): Promise<{ error: unknown }>
      getPublicUrl(path: string): { data: { publicUrl: string } }
    }
  }
}

function storagePrefix(): string {
  return `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${RECIPE_IMAGE_BUCKET}`
}

/** True when this cover already lives in our own storage bucket. */
export function isStoredCover(url: string | null | undefined): boolean {
  if (!url) return false
  return url.startsWith(storagePrefix())
}

/**
 * Copies a recipe cover into our own storage bucket and returns the public URL
 * to save instead.
 *
 * Recipes are imported from arbitrary sites, so covers used to be hotlinked
 * straight from them: dozens of third-party origins per page, at whatever
 * resolution the source happened to publish. Mirroring them here puts every
 * cover on one origin that `next/image` is allowed to optimise.
 *
 * A cover is a nice-to-have, so nothing in here throws: if the source is
 * unreachable, is not an image, or the upload fails, the original URL is
 * returned and the recipe saves exactly as before.
 */
export async function storeCoverImage(
  sourceUrl: string | null | undefined,
  { supabase, fetchImpl = fetch }: { supabase: StorageClient; fetchImpl?: typeof fetch }
): Promise<string> {
  const url = sourceUrl ?? ''
  if (!url || isStoredCover(url)) return url

  try {
    const response = await fetchImpl(url, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      redirect: 'follow',
    })
    if (!response.ok) return url

    const contentType = (response.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase()
    const extension = EXTENSION_BY_TYPE[contentType]
    if (!extension) return url

    const declaredLength = Number(response.headers.get('content-length'))
    if (Number.isFinite(declaredLength) && declaredLength > MAX_COVER_BYTES) return url

    const body = await response.arrayBuffer()
    if (body.byteLength === 0 || body.byteLength > MAX_COVER_BYTES) return url

    const path = `${crypto.randomUUID()}.${extension}`
    const bucket = supabase.storage.from(RECIPE_IMAGE_BUCKET)
    const { error } = await bucket.upload(path, body, { contentType, upsert: false })
    if (error) return url

    return bucket.getPublicUrl(path).data.publicUrl
  } catch {
    return url
  }
}
