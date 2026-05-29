const WINDOW_MS = 5 * 24 * 60 * 60 * 1000

export function getBirthdayWindowISO(birthdayMMDD: string, today: Date = new Date()): string | null {
  const [month, day] = birthdayMMDD.split('-').map(Number)
  const year = today.getFullYear()

  const candidates = [
    new Date(year - 1, month - 1, day),
    new Date(year, month - 1, day),
    new Date(year + 1, month - 1, day),
  ]

  for (const candidate of candidates) {
    if (Math.abs(candidate.getTime() - today.getTime()) <= WINDOW_MS) {
      return `${candidate.getFullYear()}-${String(candidate.getMonth() + 1).padStart(2, '0')}-${String(candidate.getDate()).padStart(2, '0')}`
    }
  }

  return null
}
