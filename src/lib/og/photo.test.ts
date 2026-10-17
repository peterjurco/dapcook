// @vitest-environment node
import sharp from 'sharp'
import { describe, expect, it } from 'vitest'
import { isTrustedAvatar, jpegDataUri } from './photo'

const respond = (body: BodyInit | null, status = 200) => (async () => new Response(body, { status })) as unknown as typeof fetch

describe('isTrustedAvatar', () => {
  it.each([
    ['https://lh3.googleusercontent.com/a/abc=s96-c', true],
    ['http://lh3.googleusercontent.com/a/abc', false],
    ['https://googleusercontent.com.evil.test/a', false],
    ['https://169.254.169.254/latest', false],
    ['not a url', false],
    [null, false],
  ])('%s → %s', (url, expected) => {
    expect(isTrustedAvatar(url)).toBe(expected)
  })
})

describe('jpegDataUri', () => {
  it('converts a WebP cover into a cropped JPEG', async () => {
    const webp = await sharp({ create: { width: 800, height: 800, channels: 3, background: '#c2410c' } }).webp().toBuffer()

    const uri = await jpegDataUri('https://example.test/cover.webp', { width: 1200, height: 630, fetchImpl: respond(new Uint8Array(webp)) })

    expect(uri).toMatch(/^data:image\/jpeg;base64,/)
    const meta = await sharp(Buffer.from(uri!.split(',')[1], 'base64')).metadata()
    expect(meta).toMatchObject({ format: 'jpeg', width: 1200, height: 630 })
  })

  it('returns null for a failed fetch', async () => {
    expect(await jpegDataUri('https://example.test/x', { width: 10, height: 10, fetchImpl: respond('', 404) })).toBeNull()
  })

  it('returns null for something that is not an image', async () => {
    expect(await jpegDataUri('https://example.test/x', { width: 10, height: 10, fetchImpl: respond('<html>') })).toBeNull()
  })
})
