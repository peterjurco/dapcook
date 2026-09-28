import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import {
  addDays,
  dayIndexInWeek,
  daysBetween,
  formatDayLabel,
  formatDayLabelLong,
  formatWeekLabel,
  getWeekStart,
  isCurrentWeek,
  isNextWeek,
  parseDateString,
  parseWeekParam,
  spanFitsWeek,
  toDateString,
} from './week'

const local = (s: string) => parseDateString(s)!

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

describe('getWeekStart', () => {
  // 2026-09-30 is a Wednesday.
  it('finds the Monday, Saturday or Sunday on or before the date', () => {
    expect(toDateString(getWeekStart(local('2026-09-30'), 'monday'))).toBe('2026-09-28')
    expect(toDateString(getWeekStart(local('2026-09-30'), 'sunday'))).toBe('2026-09-27')
    expect(toDateString(getWeekStart(local('2026-09-30'), 'saturday'))).toBe('2026-09-26')
  })

  it('returns the date itself when it is the start day', () => {
    expect(toDateString(getWeekStart(local('2026-09-27'), 'sunday'))).toBe('2026-09-27')
    expect(toDateString(getWeekStart(local('2026-09-26'), 'saturday'))).toBe('2026-09-26')
    expect(toDateString(getWeekStart(local('2026-09-28'), 'monday'))).toBe('2026-09-28')
  })

  it('treats Sunday as the last day of a Monday week', () => {
    expect(toDateString(getWeekStart(local('2026-10-04'), 'monday'))).toBe('2026-09-28')
  })

  it('crosses month and year boundaries', () => {
    expect(toDateString(getWeekStart(local('2027-01-01'), 'saturday'))).toBe('2026-12-26')
  })
})

describe('parseWeekParam', () => {
  it('normalises any date to its week start', () => {
    expect(toDateString(parseWeekParam('2026-09-28', 'sunday'))).toBe('2026-09-27')
  })
})

describe('date helpers', () => {
  it('parses YYYY-MM-DD as local midnight and rejects junk', () => {
    const d = local('2026-03-29')
    expect([d.getFullYear(), d.getMonth(), d.getDate(), d.getHours()]).toEqual([2026, 2, 29, 0])
    expect(parseDateString('2026-13-01')).toBeNull()
    expect(parseDateString('nope')).toBeNull()
  })

  it('adds and counts days across a DST change', () => {
    // Europe switches to summer time on 2026-03-29.
    expect(toDateString(addDays(local('2026-03-28'), 2))).toBe('2026-03-30')
    expect(daysBetween(local('2026-03-28'), local('2026-04-04'))).toBe(7)
    expect(daysBetween(local('2026-04-04'), local('2026-03-28'))).toBe(-7)
  })

  it('gives the 1-based position of a date in its week', () => {
    expect(dayIndexInWeek(local('2026-09-27'), local('2026-09-27'))).toBe(1)
    expect(dayIndexInWeek(local('2026-10-03'), local('2026-09-27'))).toBe(7)
  })

  it('checks whether a meal fits inside the week it starts in', () => {
    expect(spanFitsWeek('2026-10-03', 1, 'sunday')).toBe(true) // Saturday, last day
    expect(spanFitsWeek('2026-10-03', 2, 'sunday')).toBe(false)
    expect(spanFitsWeek('2026-09-27', 7, 'sunday')).toBe(true)
    expect(spanFitsWeek('2026-10-03', 7, 'saturday')).toBe(true) // Saturday, first day
  })
})

describe('isCurrentWeek / isNextWeek', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 8, 30, 12)) // Wed 2026-09-30, local
  })
  afterEach(() => vi.useRealTimers())

  it('is true when today falls inside the week, whatever day it starts on', () => {
    expect(isCurrentWeek(local('2026-09-27'))).toBe(true) // Sunday week
    expect(isCurrentWeek(local('2026-09-26'))).toBe(true) // Saturday week
    expect(isCurrentWeek(local('2026-09-20'))).toBe(false)
    expect(isNextWeek(local('2026-10-04'))).toBe(true)
    expect(isNextWeek(local('2026-09-27'))).toBe(false)
  })
})
