import { describe, it, expect } from 'vitest'
import { formatWeekLabel, formatDayLabel } from './week'

describe('formatDayLabel — locale', () => {
  it('formats weekday abbreviation in English', () => {
    const monday = new Date('2026-09-14T00:00:00Z')
    expect(formatDayLabel(monday, 'en').weekday).toBe('Mon')
  })
  it('formats weekday abbreviation in Slovak', () => {
    const monday = new Date('2026-09-14T00:00:00Z')
    expect(formatDayLabel(monday, 'sk').weekday.toLowerCase()).toContain('po') // Slovak "pondelok" abbreviates to "po"
  })
})

describe('formatWeekLabel — locale', () => {
  it('formats month name in English', () => {
    const monday = new Date('2026-09-14T00:00:00Z')
    expect(formatWeekLabel(monday, 'en')).toContain('September')
  })
  it('formats month name in Slovak', () => {
    const monday = new Date('2026-09-14T00:00:00Z')
    expect(formatWeekLabel(monday, 'sk').toLowerCase()).toContain('septemb') // "september" in Slovak
  })
})
