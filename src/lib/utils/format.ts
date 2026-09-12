import type { Locale } from '@/i18n/config'

export function formatDuration(totalMinutes: number, locale: Locale): string {
  const h = Math.floor(totalMinutes / 60)
  const m = totalMinutes % 60

  if (locale === 'sk') {
    if (h === 0) return `${m} min`
    if (m === 0) return `${h} h`
    return `${h} h ${m} min`
  }

  if (h === 0) return `${m}m`
  if (m === 0) return `${h}h`
  return `${h}h ${m}m`
}

export function formatRelativeTime(minutesAgo: number | null, locale: Locale): string {
  if (minutesAgo === null) return locale === 'sk' ? 'nikdy' : 'never'

  const days = Math.floor(minutesAgo / (60 * 24))
  const hours = Math.floor(minutesAgo / 60)

  if (locale === 'sk') {
    if (days > 0) return `pred ${days} d`
    if (hours > 0) return `pred ${hours} h`
    return `pred ${minutesAgo} min`
  }

  if (days > 0) return `${days}d ago`
  if (hours > 0) return `${hours}h ago`
  return `${minutesAgo}m ago`
}
