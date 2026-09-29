import { toIntlLocale, type Locale } from '@/i18n/config'

export const WEEK_START_DAYS = ['monday', 'saturday', 'sunday'] as const
export type WeekStartDay = (typeof WEEK_START_DAYS)[number]

export function isWeekStartDay(value: unknown): value is WeekStartDay {
  return WEEK_START_DAYS.includes(value as WeekStartDay)
}

/** `Date.getDay()` value of each start day. */
const JS_DAY: Record<WeekStartDay, number> = { sunday: 0, monday: 1, saturday: 6 }

/** Returns the first day (local midnight) of the week containing `date`. */
export function getWeekStart(date: Date, startDay: WeekStartDay): Date {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() - ((d.getDay() - JS_DAY[startDay] + 7) % 7))
  return d
}

/** Returns a new Date `days` calendar days after `date`. */
export function addDays(date: Date, days: number): Date {
  const d = new Date(date)
  d.setDate(d.getDate() + days)
  return d
}

/** Whole calendar days from `a` to `b` (negative when `b` is earlier). DST-safe. */
export function daysBetween(a: Date, b: Date): number {
  const utc = (d: Date) => Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())
  return Math.round((utc(b) - utc(a)) / 86_400_000)
}

/** Parses YYYY-MM-DD as local midnight; null when malformed or not a real date. */
export function parseDateString(value: string | undefined | null): Date | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null
  const [y, m, d] = value.split('-').map(Number)
  const date = new Date(y, m - 1, d)
  return date.getMonth() === m - 1 && date.getDate() === d ? date : null
}

/** Returns an array of the 7 dates of the week starting at `weekStart` */
export function getWeekDays(weekStart: Date): Date[] {
  return Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))
}

/** Returns the start of the next week */
export function nextWeekStart(weekStart: Date): Date {
  return addDays(weekStart, 7)
}

/** Returns the start of the previous week */
export function prevWeekStart(weekStart: Date): Date {
  return addDays(weekStart, -7)
}

/** Formats a week as "17 – 23 March 2025" */
export function formatWeekLabel(weekStart: Date, locale: Locale, short = false): string {
  const weekEnd = new Date(weekStart)
  weekEnd.setDate(weekEnd.getDate() + 6)

  const startDay = weekStart.getDate()
  const endDay = weekEnd.getDate()
  const monthStyle = short ? 'short' : 'long'
  const intlLocale = toIntlLocale(locale)
  const month = weekEnd.toLocaleDateString(intlLocale, { month: monthStyle })
  const year = weekEnd.getFullYear()

  if (weekStart.getMonth() === weekEnd.getMonth()) {
    return `${startDay} – ${endDay} ${month} ${year}`
  }
  const startMonth = weekStart.toLocaleDateString(intlLocale, { month: monthStyle })
  return `${startDay} ${startMonth} – ${endDay} ${month} ${year}`
}

/** Short label for a day: "Mon 17" */
export function formatDayLabel(date: Date, locale: Locale): { weekday: string; day: number } {
  return {
    weekday: date.toLocaleDateString(toIntlLocale(locale), { weekday: 'short' }),
    day: date.getDate(),
  }
}

/**
 * Spelled-out label for a day: "Tuesday 15 Sept", or "utorok 15.9." in Slovak,
 * where dates are conventionally written day-first with trailing dots.
 */
export function formatDayLabelLong(date: Date, locale: Locale): { weekday: string; day: string } {
  const intlLocale = toIntlLocale(locale)
  return {
    weekday: date.toLocaleDateString(intlLocale, { weekday: 'long' }),
    day:
      locale === 'sk'
        ? `${date.getDate()}.${date.getMonth() + 1}.`
        : date.toLocaleDateString(intlLocale, { day: 'numeric', month: 'short' }),
  }
}

/** Formats a Date as YYYY-MM-DD */
export function toDateString(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/** Parses a YYYY-MM-DD string into the start of its week; falls back to the current week. */
export function parseWeekParam(param: string | undefined, startDay: WeekStartDay): Date {
  return getWeekStart(parseDateString(param) ?? new Date(), startDay)
}

function todayMidnight(): Date {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d
}

/** True if today falls inside the week starting at `weekStart` */
export function isCurrentWeek(weekStart: Date): boolean {
  const offset = daysBetween(weekStart, todayMidnight())
  return offset >= 0 && offset < 7
}

/** True if today + 7 days falls inside the week starting at `weekStart` */
export function isNextWeek(weekStart: Date): boolean {
  return isCurrentWeek(prevWeekStart(weekStart))
}

/** 1-based position (1–7) of `date` in the week starting at `weekStart` */
export function dayIndexInWeek(date: Date, weekStart: Date): number {
  return daysBetween(weekStart, date) + 1
}

/** True if a meal starting on `date` and lasting `span` days ends inside the week it starts in. */
export function spanFitsWeek(date: string, span: number, startDay: WeekStartDay): boolean {
  const d = parseDateString(date)
  if (!d) return false
  return dayIndexInWeek(d, getWeekStart(d, startDay)) - 1 + span <= 7
}
