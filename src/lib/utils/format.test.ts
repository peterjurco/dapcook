import { describe, it, expect } from 'vitest'
import { formatDuration, formatRelativeTime } from './format'

describe('formatDuration', () => {
  it('formats minutes only', () => {
    expect(formatDuration(45, 'en')).toBe('45m')
    expect(formatDuration(45, 'sk')).toBe('45 min')
  })

  it('formats hours and minutes', () => {
    expect(formatDuration(90, 'en')).toBe('1h 30m')
    expect(formatDuration(90, 'sk')).toBe('1 h 30 min')
  })

  it('formats whole hours', () => {
    expect(formatDuration(120, 'en')).toBe('2h')
    expect(formatDuration(120, 'sk')).toBe('2 h')
  })
})

describe('formatRelativeTime', () => {
  it('formats minutes ago', () => {
    expect(formatRelativeTime(5, 'en')).toBe('5m ago')
    expect(formatRelativeTime(5, 'sk')).toBe('pred 5 min')
  })

  it('formats hours ago', () => {
    expect(formatRelativeTime(90, 'en')).toBe('1h ago')
    expect(formatRelativeTime(90, 'sk')).toBe('pred 1 h')
  })

  it('formats days ago', () => {
    expect(formatRelativeTime(3000, 'en')).toBe('2d ago')
    expect(formatRelativeTime(3000, 'sk')).toBe('pred 2 d')
  })

  it('formats never', () => {
    expect(formatRelativeTime(null, 'en')).toBe('never')
    expect(formatRelativeTime(null, 'sk')).toBe('nikdy')
  })
})
