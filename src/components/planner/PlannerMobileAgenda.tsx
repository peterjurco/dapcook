'use client'

import Link from 'next/link'
import { buildMobileAgenda } from '@/lib/planner/layout'
import { formatDayLabel, toDateString } from '@/lib/utils/week'
import type { MealSlotWithRecipe } from '@/types/planner'

interface PlannerMobileAgendaProps {
  weekDays: Date[]
  today: Date
  slots: MealSlotWithRecipe[]
}

/** Mobile View: a read-only day-by-day agenda. Multi-day meals repeat on each covered day. */
export function PlannerMobileAgenda({ weekDays, today, slots }: PlannerMobileAgendaProps) {
  const days = buildMobileAgenda(slots)
  const todayStr = toDateString(today)

  return (
    <div className="space-y-5">
      {days.map((agendaDay) => {
        const date = weekDays[agendaDay.dayOfWeek - 1]
        const { weekday, day } = formatDayLabel(date)
        const isToday = toDateString(date) === todayStr
        return (
          <section key={agendaDay.dayOfWeek}>
            <p className={`text-xl font-bold mb-2 ${isToday ? 'text-blue-600' : 'text-gray-800'}`}>
              {weekday} {day}
            </p>

            {agendaDay.cards.length === 0 ? (
              <div className="min-h-[64px] rounded-xl border-2 border-dashed border-gray-200 flex items-center justify-center">
                <span className="text-sm text-gray-400">Nothing planned</span>
              </div>
            ) : (
              <div className="space-y-2">
                {agendaDay.cards.map(({ slot, dayIndex, span }) => (
                  <AgendaCardRow key={`${slot.id}-${agendaDay.dayOfWeek}`} slot={slot} dayIndex={dayIndex} span={span} />
                ))}
              </div>
            )}
          </section>
        )
      })}
    </div>
  )
}

function DayBadge({ dayIndex, span }: { dayIndex: number; span: number }) {
  if (span <= 1) return null
  return (
    <span className="ml-2 text-xs font-medium text-gray-400 whitespace-nowrap">
      day {dayIndex}/{span}
    </span>
  )
}

function AgendaCardRow({
  slot,
  dayIndex,
  span,
}: {
  slot: MealSlotWithRecipe
  dayIndex: number
  span: number
}) {
  const isContinuation = dayIndex > 1
  const continuationClass = isContinuation ? 'border-dashed bg-gray-50' : 'bg-white'

  if (slot.recipe_id) {
    return (
      <Link
        href={`/recipes/${slot.recipe_id}`}
        className={`flex items-center gap-3 rounded-xl border border-gray-200 p-2 ${continuationClass}`}
      >
        <div className="w-14 h-14 rounded-lg bg-gray-100 overflow-hidden flex-shrink-0">
          {slot.recipe?.image_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={slot.recipe.image_url} alt={slot.recipe.title} className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-xl">🍽️</div>
          )}
        </div>
        <div className="min-w-0 flex items-center flex-wrap">
          <span className={`text-base font-medium ${isContinuation ? 'text-gray-500' : 'text-gray-900'}`}>
            {slot.recipe?.title ?? 'Recipe'}
          </span>
          <DayBadge dayIndex={dayIndex} span={span} />
        </div>
      </Link>
    )
  }

  const label = slot.custom_label ?? 'Custom'
  return (
    <div className={`flex items-center rounded-xl border border-gray-200 p-3 ${continuationClass}`}>
      <span className={`text-base font-medium ${isContinuation ? 'text-gray-500' : 'text-gray-900'}`}>{label}</span>
      <DayBadge dayIndex={dayIndex} span={span} />
    </div>
  )
}
