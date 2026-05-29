import { describe, it, expect } from 'vitest'
import { getBirthdayWindowISO } from './birthday'

function daysFromToday(today: Date, offset: number): Date {
  const d = new Date(today)
  d.setDate(d.getDate() + offset)
  return d
}

describe('getBirthdayWindowISO', () => {
  const TODAY = new Date('2026-05-29')

  it('returns the ISO date when birthday is today', () => {
    expect(getBirthdayWindowISO('05-29', TODAY)).toBe('2026-05-29')
  })

  it('returns the ISO date when birthday was 5 days ago', () => {
    expect(getBirthdayWindowISO('05-24', TODAY)).toBe('2026-05-24')
  })

  it('returns null when birthday was 6 days ago', () => {
    expect(getBirthdayWindowISO('05-23', TODAY)).toBeNull()
  })

  it('returns the ISO date when birthday is in 5 days', () => {
    expect(getBirthdayWindowISO('06-03', TODAY)).toBe('2026-06-03')
  })

  it('returns null when birthday is in 6 days', () => {
    expect(getBirthdayWindowISO('06-04', TODAY)).toBeNull()
  })

  it('handles year boundary: birthday Jan 2, today Dec 29 → next year', () => {
    const dec29 = new Date('2025-12-29')
    expect(getBirthdayWindowISO('01-02', dec29)).toBe('2026-01-02')
  })

  it('handles year boundary: birthday Dec 30, today Jan 2 → prev year', () => {
    const jan2 = new Date('2026-01-02')
    expect(getBirthdayWindowISO('12-30', jan2)).toBe('2025-12-30')
  })

  it('returns null when no year candidate is within 5 days', () => {
    expect(getBirthdayWindowISO('12-01', TODAY)).toBeNull()
  })
})
