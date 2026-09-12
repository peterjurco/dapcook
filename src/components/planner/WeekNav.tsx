'use client'

import { useRouter } from 'next/navigation'
import { useLocale, useTranslations } from 'next-intl'
import { ChevronLeft, ChevronRight, CalendarDays } from 'lucide-react'
import { formatWeekLabel, nextWeekStart, prevWeekStart, toDateString, isCurrentWeek, isNextWeek } from '@/lib/utils/week'

interface WeekNavProps {
  weekStart: Date
}

export function WeekNav({ weekStart }: WeekNavProps) {
  const router = useRouter()
  const locale = useLocale()
  const t = useTranslations('planner')

  function navigate(date: Date) {
    router.push(`/planner?week=${toDateString(date)}`)
  }

  const isNext = isNextWeek(weekStart)

  return (
    <div className="flex items-center gap-2 mb-6">
      <button
        type="button"
        onClick={() => navigate(prevWeekStart(weekStart))}
        className="p-2 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
        aria-label={t('weekNav.prevAria')}
      >
        <ChevronLeft size={18} />
      </button>

      <div className="flex min-w-0 items-center gap-2">
        <CalendarDays size={16} className="hidden shrink-0 text-gray-400 sm:block" />
        <h2 className="whitespace-nowrap text-sm font-semibold text-gray-900 sm:text-base">
          <span className="sm:hidden">{formatWeekLabel(weekStart, locale, true)}</span>
          <span className="hidden sm:inline">{formatWeekLabel(weekStart, locale)}</span>
        </h2>
        {isCurrentWeek(weekStart) && (
          <span className="whitespace-nowrap text-xs font-medium px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full">
            {t('weekNav.thisWeek')}
          </span>
        )}
        {isNext && (
          <span className="whitespace-nowrap text-xs font-medium px-2 py-0.5 bg-green-100 text-green-700 rounded-full">
            {t('weekNav.nextWeek')}
          </span>
        )}
      </div>

      <button
        type="button"
        onClick={() => navigate(nextWeekStart(weekStart))}
        className="p-2 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
        aria-label={t('weekNav.nextAria')}
      >
        <ChevronRight size={18} />
      </button>
    </div>
  )
}
