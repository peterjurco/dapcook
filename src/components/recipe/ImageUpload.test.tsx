import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ImageUpload } from './ImageUpload'
import { mockTranslate } from '@/test/mockMessages'
import type { TranslationValues } from 'use-intl'

vi.mock('next-intl', () => ({
  useTranslations: (namespace: string) => (key: string, values?: TranslationValues) =>
    mockTranslate(namespace, key, values),
}))

vi.mock('@/lib/supabase/client', () => ({
  createClient: vi.fn(),
}))

describe('ImageUpload', () => {
  it('shows the max size in MB when a file exceeds the limit', async () => {
    render(<ImageUpload value="" onChange={vi.fn()} />)

    const input = document.querySelector('input[type="file"]') as HTMLInputElement
    const tooBigFile = new File([new Uint8Array(6 * 1024 * 1024)], 'big.jpg', { type: 'image/jpeg' })

    await userEvent.upload(input, tooBigFile)

    expect(await screen.findByText('Image must be under 5MB')).toBeInTheDocument()
  })
})
