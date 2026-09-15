import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useState } from 'react'
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
const remove = vi.fn()

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    storage: {
      from: () => ({
        upload,
        remove,
        getPublicUrl: (path: string) => ({ data: { publicUrl: `${STORED_PREFIX}/${path}` } }),
      }),
    },
  }),
}))

const SUPABASE_URL = 'https://project.supabase.co'
const STORED_PREFIX = `${SUPABASE_URL}/storage/v1/object/public/recipe-images`

const prepareImageForUpload = vi.fn()

vi.mock('@/lib/recipes/downscale-image', () => ({
  prepareImageForUpload: (file: File) => prepareImageForUpload(file),
}))

beforeEach(() => {
  upload.mockReset()
  upload.mockResolvedValue({ error: null })
  remove.mockReset()
  remove.mockResolvedValue({ error: null })
  prepareImageForUpload.mockReset()
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', SUPABASE_URL)
})

/** Uploads a file through the picker and returns the public URL it landed on. */
async function uploadPhoto(name = 'IMG_0042.jpeg') {
  prepareImageForUpload.mockResolvedValue({
    body: new Blob([new Uint8Array(200_000)], { type: 'image/webp' }),
    contentType: 'image/webp',
    extension: 'webp',
  })
  const file = new File([new Uint8Array(4 * 1024 * 1024)], name, { type: 'image/jpeg' })
  await userEvent.upload(document.querySelector('input[type="file"]') as HTMLInputElement, file)
  await waitFor(() => expect(upload).toHaveBeenCalled())
  return `${STORED_PREFIX}/${upload.mock.calls.at(-1)![0]}`
}

function pickedFile() {
  return new File([new Uint8Array(4 * 1024 * 1024)], 'IMG_0042.jpeg', { type: 'image/jpeg' })
}

describe('ImageUpload', () => {
  it('rejects a file too large to be worth decoding at all', async () => {
    render(<ImageUpload value="" onChange={vi.fn()} />)

    const input = document.querySelector('input[type="file"]') as HTMLInputElement
    const huge = new File([new Uint8Array(26 * 1024 * 1024)], 'huge.jpg', { type: 'image/jpeg' })

    await userEvent.upload(input, huge)

    expect(await screen.findByText('Image must be under 25MB')).toBeInTheDocument()
    expect(upload).not.toHaveBeenCalled()
  })

  it('accepts a photo over the upload ceiling and uploads the downscaled version', async () => {
    // A 12MP phone photo is routinely over 5MB and compresses to a few hundred
    // KB — rejecting it before resizing defeats the point of resizing.
    const downscaled = new Blob([new Uint8Array(700_000)], { type: 'image/webp' })
    prepareImageForUpload.mockResolvedValue({
      body: downscaled,
      contentType: 'image/webp',
      extension: 'webp',
    })
    render(<ImageUpload value="" onChange={vi.fn()} />)

    const big = new File([new Uint8Array(8 * 1024 * 1024)], 'IMG_0042.jpeg', { type: 'image/jpeg' })
    await userEvent.upload(document.querySelector('input[type="file"]') as HTMLInputElement, big)

    await waitFor(() => expect(upload).toHaveBeenCalled())
    expect(upload.mock.calls[0][1]).toBe(downscaled)
  })

  it('reports when the image is still too big after resizing', async () => {
    // The browser could not re-encode, so the original comes back unchanged.
    const original = new File([new Uint8Array(8 * 1024 * 1024)], 'huge.jpg', { type: 'image/jpeg' })
    prepareImageForUpload.mockResolvedValue({
      body: original,
      contentType: 'image/jpeg',
      extension: 'jpg',
    })
    render(<ImageUpload value="" onChange={vi.fn()} />)

    await userEvent.upload(document.querySelector('input[type="file"]') as HTMLInputElement, original)

    expect(await screen.findByText('Image is still over 5MB after resizing')).toBeInTheDocument()
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
    await waitFor(() => expect(onChange).toHaveBeenCalledWith(`${STORED_PREFIX}/${path}`))
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

  it('deletes an image uploaded in this session when it is cleared', async () => {
    // Nothing has been saved yet, so the object is referenced by no recipe.
    function Harness() {
      const [url, setUrl] = useState('')
      return <ImageUpload value={url} onChange={setUrl} />
    }
    render(<Harness />)

    const uploaded = await uploadPhoto()
    await userEvent.click(await screen.findByLabelText('Remove image'))

    await waitFor(() => expect(remove).toHaveBeenCalledWith([uploaded.split('/').pop()]))
  })

  it('never deletes a cover that was already saved on the recipe', async () => {
    // This URL came from the database, so clearing it only stages a change the
    // save has to confirm — deleting now would break the recipe as it stands.
    function Harness() {
      const [url, setUrl] = useState(`${STORED_PREFIX}/already-saved.jpg`)
      return <ImageUpload value={url} onChange={setUrl} />
    }
    render(<Harness />)

    await userEvent.click(await screen.findByLabelText('Remove image'))

    await waitFor(() => expect(screen.getByText('Add photo')).toBeInTheDocument())
    expect(remove).not.toHaveBeenCalled()
  })

  it('deletes the previous upload when it is replaced in the same session', async () => {
    function Harness() {
      const [url, setUrl] = useState('')
      return <ImageUpload value={url} onChange={setUrl} />
    }
    render(<Harness />)

    const first = await uploadPhoto('first.jpeg')
    await userEvent.click(await screen.findByLabelText('Remove image'))
    await waitFor(() => expect(remove).toHaveBeenCalledWith([first.split('/').pop()]))
    remove.mockClear()

    const second = await uploadPhoto('second.jpeg')
    expect(second).not.toBe(first)
    expect(remove).not.toHaveBeenCalled()
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
