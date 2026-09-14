import { describe, expect, it } from 'vitest'
import {
  fitWithinLongestEdge,
  isWorthReplacing,
  uploadExtension,
  MAX_IMAGE_EDGE,
} from './downscale-image'

describe('fitWithinLongestEdge', () => {
  it('leaves an image that already fits untouched', () => {
    expect(fitWithinLongestEdge(1200, 800, 1600)).toEqual({ width: 1200, height: 800 })
  })

  it('never upscales an image smaller than the cap', () => {
    expect(fitWithinLongestEdge(320, 240, 1600)).toEqual({ width: 320, height: 240 })
  })

  it('scales a landscape photo so its width lands exactly on the cap', () => {
    expect(fitWithinLongestEdge(4032, 3024, 1600)).toEqual({ width: 1600, height: 1200 })
  })

  it('scales a portrait photo so its height lands exactly on the cap', () => {
    expect(fitWithinLongestEdge(3024, 4032, 1600)).toEqual({ width: 1200, height: 1600 })
  })

  it('keeps a square image square', () => {
    expect(fitWithinLongestEdge(3000, 3000, 1600)).toEqual({ width: 1600, height: 1600 })
  })

  it('rounds the short edge to whole pixels', () => {
    expect(fitWithinLongestEdge(1000, 333, 800)).toEqual({ width: 800, height: 266 })
  })

  it('keeps at least one pixel on the short edge of an extreme panorama', () => {
    expect(fitWithinLongestEdge(8000, 2, 1600)).toEqual({ width: 1600, height: 1 })
  })

  it('treats an image exactly at the cap as already fitting', () => {
    expect(fitWithinLongestEdge(1600, 900, 1600)).toEqual({ width: 1600, height: 900 })
  })

  it('returns unusable dimensions unchanged so callers can bail out', () => {
    expect(fitWithinLongestEdge(0, 0, 1600)).toEqual({ width: 0, height: 0 })
    expect(fitWithinLongestEdge(Number.NaN, 100, 1600)).toEqual({ width: Number.NaN, height: 100 })
  })

  it('caps the longest edge at 1600px by default', () => {
    expect(MAX_IMAGE_EDGE).toBe(1600)
  })
})

describe('isWorthReplacing', () => {
  it('replaces the original when the re-encode is smaller', () => {
    expect(isWorthReplacing(4_300_000, 280_000)).toBe(true)
  })

  it('keeps the original when the re-encode came out bigger', () => {
    expect(isWorthReplacing(20_000, 25_000)).toBe(false)
  })

  it('keeps the original when the re-encode is the same size', () => {
    expect(isWorthReplacing(20_000, 20_000)).toBe(false)
  })

  it('keeps the original when the re-encode is empty', () => {
    expect(isWorthReplacing(4_300_000, 0)).toBe(false)
  })
})

describe('uploadExtension', () => {
  it('derives the extension from the mime type', () => {
    expect(uploadExtension('image/jpeg', 'photo.heic')).toBe('jpg')
    expect(uploadExtension('image/webp', 'photo.jpg')).toBe('webp')
    expect(uploadExtension('image/png', 'photo.jpg')).toBe('png')
  })

  it('falls back to the file extension when the mime type is unknown', () => {
    expect(uploadExtension('', 'photo.PNG')).toBe('png')
    expect(uploadExtension('application/octet-stream', 'photo.avif')).toBe('avif')
  })

  it('falls back to jpg when the name carries no extension', () => {
    expect(uploadExtension('', 'photo')).toBe('jpg')
    expect(uploadExtension('', '')).toBe('jpg')
  })

  it('ignores a dot that is not an extension', () => {
    expect(uploadExtension('', 'my.holiday photo')).toBe('jpg')
  })
})
