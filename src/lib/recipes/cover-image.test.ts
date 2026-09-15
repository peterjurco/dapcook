import { describe, expect, it, vi, beforeEach } from 'vitest'
import {
  isStoredCover,
  storeCoverImage,
  coverToRemove,
  removeStoredCover,
  RECIPE_IMAGE_BUCKET,
} from './cover-image'

const SUPABASE_URL = 'https://project.supabase.co'
const STORED_PREFIX = `${SUPABASE_URL}/storage/v1/object/public/${RECIPE_IMAGE_BUCKET}`

const upload = vi.fn()

function fakeSupabase() {
  return {
    storage: {
      from: vi.fn(() => ({
        upload,
        getPublicUrl: (path: string) => ({ data: { publicUrl: `${STORED_PREFIX}/${path}` } }),
      })),
    },
  } as never
}

function imageResponse(contentType = 'image/jpeg', bytes = 1024) {
  return {
    ok: true,
    headers: new Headers({ 'content-type': contentType, 'content-length': String(bytes) }),
    arrayBuffer: async () => new ArrayBuffer(bytes),
  } as unknown as Response
}

beforeEach(() => {
  upload.mockReset()
  upload.mockResolvedValue({ error: null })
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', SUPABASE_URL)
})

describe('isStoredCover', () => {
  it('recognises an image already held in our storage bucket', () => {
    expect(isStoredCover(`${STORED_PREFIX}/abc.jpg`)).toBe(true)
  })

  it('treats a third-party URL as not stored', () => {
    expect(isStoredCover('https://static01.nyt.com/images/cover.jpg')).toBe(false)
  })

  it('treats an empty value as not stored', () => {
    expect(isStoredCover('')).toBe(false)
  })
})

describe('storeCoverImage', () => {
  it('mirrors a remote image into the bucket and returns its public URL', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(imageResponse())

    const result = await storeCoverImage('https://static01.nyt.com/cover.jpg', {
      supabase: fakeSupabase(),
      fetchImpl,
    })

    expect(fetchImpl).toHaveBeenCalledWith('https://static01.nyt.com/cover.jpg', expect.anything())
    expect(result).toMatch(new RegExp(`^${STORED_PREFIX}/[0-9a-f-]+\\.jpg$`))
  })

  it('picks the stored file extension from the response content type', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(imageResponse('image/webp'))

    const result = await storeCoverImage('https://example.test/cover', {
      supabase: fakeSupabase(),
      fetchImpl,
    })

    expect(result.endsWith('.webp')).toBe(true)
  })

  it('leaves an image that is already in the bucket untouched', async () => {
    const fetchImpl = vi.fn()
    const stored = `${STORED_PREFIX}/existing.jpg`

    expect(await storeCoverImage(stored, { supabase: fakeSupabase(), fetchImpl })).toBe(stored)
    expect(fetchImpl).not.toHaveBeenCalled()
    expect(upload).not.toHaveBeenCalled()
  })

  it('leaves an empty cover alone', async () => {
    const fetchImpl = vi.fn()

    expect(await storeCoverImage('', { supabase: fakeSupabase(), fetchImpl })).toBe('')
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('keeps the original URL when the source does not respond', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'))
    const source = 'https://offline.test/cover.jpg'

    expect(await storeCoverImage(source, { supabase: fakeSupabase(), fetchImpl })).toBe(source)
  })

  it('keeps the original URL when the source returns an error status', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: false, status: 403, headers: new Headers() } as Response)
    const source = 'https://forbidden.test/cover.jpg'

    expect(await storeCoverImage(source, { supabase: fakeSupabase(), fetchImpl })).toBe(source)
    expect(upload).not.toHaveBeenCalled()
  })

  it('refuses to store something that is not an image', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(imageResponse('text/html'))
    const source = 'https://example.test/not-an-image'

    expect(await storeCoverImage(source, { supabase: fakeSupabase(), fetchImpl })).toBe(source)
    expect(upload).not.toHaveBeenCalled()
  })

  it('refuses to store an image beyond the size cap', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(imageResponse('image/jpeg', 40 * 1024 * 1024))
    const source = 'https://example.test/huge.jpg'

    expect(await storeCoverImage(source, { supabase: fakeSupabase(), fetchImpl })).toBe(source)
    expect(upload).not.toHaveBeenCalled()
  })

  it('keeps the original URL when the upload fails', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(imageResponse())
    upload.mockResolvedValue({ error: new Error('bucket unavailable') })
    const source = 'https://example.test/cover.jpg'

    expect(await storeCoverImage(source, { supabase: fakeSupabase(), fetchImpl })).toBe(source)
  })

  it('never rejects, so a bad cover cannot fail a recipe save', async () => {
    const fetchImpl = vi.fn().mockImplementation(() => {
      throw new Error('boom')
    })

    await expect(
      storeCoverImage('https://example.test/cover.jpg', { supabase: fakeSupabase(), fetchImpl })
    ).resolves.toBe('https://example.test/cover.jpg')
  })
})

describe('coverToRemove', () => {
  it('returns the stored object path when a cover is removed', () => {
    expect(coverToRemove(`${STORED_PREFIX}/abc.jpg`, null)).toBe('abc.jpg')
  })

  it('returns the old object path when a cover is replaced', () => {
    expect(coverToRemove(`${STORED_PREFIX}/old.jpg`, `${STORED_PREFIX}/new.webp`)).toBe('old.jpg')
  })

  it('keeps the object when the cover did not change', () => {
    const url = `${STORED_PREFIX}/same.jpg`
    expect(coverToRemove(url, url)).toBeNull()
  })

  it('never touches a cover that was never ours', () => {
    expect(coverToRemove('https://static01.nyt.com/cover.jpg', null)).toBeNull()
  })

  it('does nothing when there was no cover to begin with', () => {
    expect(coverToRemove(null, `${STORED_PREFIX}/new.jpg`)).toBeNull()
    expect(coverToRemove('', null)).toBeNull()
  })

  it('handles a nested object path', () => {
    expect(coverToRemove(`${STORED_PREFIX}/2026/abc.jpg`, null)).toBe('2026/abc.jpg')
  })
})

describe('removeStoredCover', () => {
  it('removes the object from our bucket', async () => {
    const remove = vi.fn().mockResolvedValue({ error: null })
    const supabase = {
      storage: { from: vi.fn(() => ({ remove })) },
    } as never

    await removeStoredCover('abc.jpg', { supabase })

    expect(remove).toHaveBeenCalledWith(['abc.jpg'])
  })

  it('swallows a failed delete so cleanup never breaks the request', async () => {
    const remove = vi.fn().mockRejectedValue(new Error('storage down'))
    const supabase = { storage: { from: vi.fn(() => ({ remove })) } } as never

    await expect(removeStoredCover('abc.jpg', { supabase })).resolves.toBeUndefined()
  })
})
