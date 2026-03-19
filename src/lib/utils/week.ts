/** Returns the Monday of the week containing the given date */
export function getWeekStart(date: Date = new Date()): Date {
  const d = new Date(date)
  const day = d.getDay() // 0=Sun, 1=Mon, ..., 6=Sat
  const diff = day === 0 ? -6 : 1 - day // adjust to Monday
  d.setDate(d.getDate() + diff)
  d.setHours(0, 0, 0, 0)
  return d
}

/** Returns an array of 7 Date objects Mon–Sun for the given week start */
export function getWeekDays(weekStart: Date): Date[] {
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart)
    d.setDate(d.getDate() + i)
    return d
  })
}

/** Returns Monday of the next week */
export function nextWeekStart(weekStart: Date): Date {
  const d = new Date(weekStart)
  d.setDate(d.getDate() + 7)
  return d
}

/** Returns Monday of the previous week */
export function prevWeekStart(weekStart: Date): Date {
  const d = new Date(weekStart)
  d.setDate(d.getDate() - 7)
  return d
}

/** Formats a week as "17 – 23 March 2025" */
export function formatWeekLabel(weekStart: Date): string {
  const weekEnd = new Date(weekStart)
  weekEnd.setDate(weekEnd.getDate() + 6)

  const startDay = weekStart.getDate()
  const endDay = weekEnd.getDate()
  const month = weekEnd.toLocaleDateString('en-GB', { month: 'long' })
  const year = weekEnd.getFullYear()

  if (weekStart.getMonth() === weekEnd.getMonth()) {
    return `${startDay} – ${endDay} ${month} ${year}`
  }
  const startMonth = weekStart.toLocaleDateString('en-GB', { month: 'long' })
  return `${startDay} ${startMonth} – ${endDay} ${month} ${year}`
}

/** Short label for a day: "Mon 17" */
export function formatDayLabel(date: Date): { weekday: string; day: number } {
  return {
    weekday: date.toLocaleDateString('en-GB', { weekday: 'short' }),
    day: date.getDate(),
  }
}

/** Formats a Date as YYYY-MM-DD */
export function toDateString(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/** Parses a YYYY-MM-DD string into the Monday of that week.
 *  Falls back to current week if invalid. */
export function parseWeekParam(param: string | undefined): Date {
  if (param && /^\d{4}-\d{2}-\d{2}$/.test(param)) {
    const d = new Date(param + 'T00:00:00')
    if (!isNaN(d.getTime())) return getWeekStart(d)
  }
  return getWeekStart()
}

/** True if weekStart is the current week's Monday */
export function isCurrentWeek(weekStart: Date): boolean {
  return toDateString(weekStart) === toDateString(getWeekStart())
}

/** True if weekStart is next week's Monday */
export function isNextWeek(weekStart: Date): boolean {
  return toDateString(weekStart) === toDateString(nextWeekStart(getWeekStart()))
}

/** day_of_week number (1=Mon … 7=Sun) from a Date */
export function dayOfWeekNumber(date: Date): number {
  const js = date.getDay() // 0=Sun
  return js === 0 ? 7 : js
}
