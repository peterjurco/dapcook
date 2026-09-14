import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ImageUpload } from './ImageUpload'
import { mockTranslate } from '@/test/mockMessages'
import type { TranslationValues } from 'use-intl'

vi.mock('next-intl', () => ({
  useTranslations: (namespace: string) => (key: string, values?: TranslationValues) =>
    mockTranslate(namespace, key, values),
}))

const upload = vi.fn()

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    storage: {
      from: () => ({
        upload,
        getPublicUrl: (path: string) => ({ data: { publicUrl: `https://cdn.test/${path}` } }),
      }),
    },
  }),
}))

const prepareImageForUpload = vi.fn()

vi.mock('@/lib/recipes/downscale-image', () => ({
  prepareImageForUpload: (file: File) => prepareImageForUpload(file),
}))

beforeEach(() => {
  upload.mockReset()
  upload.mockResolvedValue({ error: null })
  prepareImageForUpload.mockReset()
})

function pickedFile() {
  return new File([new Uint8Array(4 * 1024 * 1024)], 'IMG_0042.jpeg', { type: 'image/jpeg' })
}

describe('ImageUpload', () => {
  it('shows the max size in MB when a file exceeds the limit', async () => {
    render(<ImageUpload value="" onChange={vi.fn()} />)

    const input = document.querySelector('input[type="file"]') as HTMLInputElement
    const tooBigFile = new File([new Uint8Array(6 * 1024 * 1024)], 'big.jpg', { type: 'image/jpeg' })

    await userEvent.upload(input, tooBigFile)

    expect(await screen.findByText('Image must be under 5MB')).toBeInTheDocument()
    expect(upload).not.toHaveBeenCalled()
  })

  it('uploads the downscaled image rather than the file the user picked', async () => {
    const downscaled = new Blob([new Uint8Array(200_000)], { type: 'image/webp' })
    prepareImageForUpload.mockResolvedValue({
      body: downscaled,
      contentType: 'image/webp',
      extension: 'webp',
    })
    const onChange = vi.fn()
    render(<ImageUpload value="" onChange={onChange} />)

    const file = pickedFile()
    await userEvent.upload(document.querySelector('input[type="file"]') as HTMLInputElement, file)

    await waitFor(() => expect(upload).toHaveBeenCalled())
    expect(prepareImageForUpload).toHaveBeenCalledWith(file)
    const [path, body, options] = upload.mock.calls[0]
    expect(path).toMatch(/\.webp$/)
    expect(body).toBe(downscaled)
    expect(options).toMatchObject({ contentType: 'image/webp' })
    await waitFor(() => expect(onChange).toHaveBeenCalledWith(`https://cdn.test/${path}`))
  })

  it('uploads the original file when the browser could not re-encode it', async () => {
    const file = pickedFile()
    prepareImageForUpload.mockResolvedValue({
      body: file,
      contentType: 'image/jpeg',
      extension: 'jpg',
    })
    render(<ImageUpload value="" onChange={vi.fn()} />)

    await userEvent.upload(document.querySelector('input[type="file"]') as HTMLInputElement, file)

    await waitFor(() => expect(upload).toHaveBeenCalled())
    const [path, body, options] = upload.mock.calls[0]
    expect(path).toMatch(/\.jpg$/)
    expect(body).toBe(file)
    expect(options).toMatchObject({ contentType: 'image/jpeg' })
  })

  it('reports an upload failure and stops showing the spinner', async () => {
    prepareImageForUpload.mockResolvedValue({
      body: pickedFile(),
      contentType: 'image/jpeg',
      extension: 'jpg',
    })
    render(<ImageUpload value="" onChange={vi.fn()} />)

    upload.mockResolvedValue({ error: { message: 'bucket is full' } })
    await userEvent.upload(
      document.querySelector('input[type="file"]') as HTMLInputElement,
      pickedFile()
    )

    expect(await screen.findByText(/bucket is full/)).toBeInTheDocument()
  })
})
