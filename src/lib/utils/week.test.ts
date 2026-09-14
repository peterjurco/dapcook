import { describe, it, expect } from 'vitest'
import { formatWeekLabel, formatDayLabel, formatDayLabelLong } from './week'

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

describe('formatDayLabelLong — locale', () => {
  const tuesday = new Date('2026-09-15T00:00:00Z')

  it('spells out the weekday and writes the date day-first in Slovak', () => {
    expect(formatDayLabelLong(tuesday, 'sk')).toEqual({ weekday: 'utorok', day: '15.9.' })
  })

  it('spells out the weekday and uses a short month in English', () => {
    const { weekday, day } = formatDayLabelLong(tuesday, 'en')
    expect(weekday).toBe('Tuesday')
    expect(day).toBe('15 Sept') // en-GB abbreviates September as "Sept"
  })

  it('does not zero-pad single-digit months in Slovak', () => {
    expect(formatDayLabelLong(new Date('2026-03-02T00:00:00Z'), 'sk').day).toBe('2.3.')
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
