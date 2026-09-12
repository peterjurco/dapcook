import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { BirthdayOverlay } from './BirthdayOverlay'
import { mockTranslate } from '@/test/mockMessages'

vi.mock('next-intl', () => ({
  useTranslations: (namespace: string) => (key: string) => mockTranslate(namespace, key),
}))

vi.mock('canvas-confetti', () => ({ default: vi.fn() }))

const STORAGE_KEY = 'birthday_shown'

// Fixed "today" so getBirthdayWindowISO() always matches birthdayDate below.
const TODAY = new Date('2026-06-04T12:00:00.000Z')

afterEach(() => {
  vi.useRealTimers()
  localStorage.clear()
})

describe('BirthdayOverlay', () => {
  it('shows the translated heading and dismiss button within the birthday window', () => {
    vi.useFakeTimers()
    vi.setSystemTime(TODAY)

    render(<BirthdayOverlay birthdayDate="06-04" birthdayMessage="Hope it's a great one!" />)

    expect(screen.getByText('Happy Birthday!')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'You are awesome! 🎉' })).toBeInTheDocument()
    expect(screen.getByText("Hope it's a great one!")).toBeInTheDocument()
  })

  it('dismisses and does not reappear once the button is clicked', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    vi.setSystemTime(TODAY)
    const user = userEvent.setup()

    render(<BirthdayOverlay birthdayDate="06-04" birthdayMessage="Hope it's a great one!" />)
    await user.click(screen.getByRole('button', { name: 'You are awesome! 🎉' }))

    expect(screen.queryByText('Happy Birthday!')).not.toBeInTheDocument()
    expect(localStorage.getItem(STORAGE_KEY)).toBe('2026-06-04')
  })

  it('renders nothing outside the birthday window', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-01T12:00:00.000Z'))

    render(<BirthdayOverlay birthdayDate="06-04" birthdayMessage="Hope it's a great one!" />)

    expect(screen.queryByText('Happy Birthday!')).not.toBeInTheDocument()
  })
})
