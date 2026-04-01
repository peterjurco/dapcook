'use client'

import { useRouter } from 'next/navigation'
import { ChevronLeft, ChevronRight, CalendarDays } from 'lucide-react'
import { formatWeekLabel, nextWeekStart, prevWeekStart, toDateString, isCurrentWeek, isNextWeek } from '@/lib/utils/week'

interface WeekNavProps {
  weekStart: Date
}

export function WeekNav({ weekStart }: WeekNavProps) {
  const router = useRouter()

  function navigate(date: Date) {
    router.push(`/planner?week=${toDateString(date)}`)
  }

  const showPlanNextWeek = isCurrentWeek(weekStart)
  const isNext = isNextWeek(weekStart)

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-6">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => navigate(prevWeekStart(weekStart))}
          className="p-2 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
          aria-label="Previous week"
        >
          <ChevronLeft size={18} />
        </button>

        <div className="flex items-center gap-2">
          <CalendarDays size={16} className="text-gray-400" />
          <h2 className="text-base font-semibold text-gray-900">
            {formatWeekLabel(weekStart)}
          </h2>
          {isCurrentWeek(weekStart) && (
            <span className="text-xs font-medium px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full">
              This week
            </span>
          )}
          {isNext && (
            <span className="text-xs font-medium px-2 py-0.5 bg-green-100 text-green-700 rounded-full">
              Next week
            </span>
          )}
        </div>

        <button
          type="button"
          onClick={() => navigate(nextWeekStart(weekStart))}
          className="p-2 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
          aria-label="Next week"
        >
          <ChevronRight size={18} />
        </button>
      </div>

      {showPlanNextWeek && (
        <button
          type="button"
          onClick={() => navigate(nextWeekStart(weekStart))}
          className="flex items-center gap-1.5 px-4 py-2 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-700 transition-colors"
        >
          <CalendarDays size={14} />
          Plan next week
        </button>
      )}
    </div>
  )
}
